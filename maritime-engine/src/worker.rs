use std::collections::HashMap;
use std::sync::atomic::Ordering;
use std::sync::{Arc, RwLock};
use std::time::Instant;

use tokio::sync::mpsc;

use crate::config::DetectionConfig;
use crate::detection;
use crate::metrics::EngineMetrics;
use crate::spatial_index::SpatialIndex;
use crate::types::*;

/// Worker: owns a geographic slice of the world.
/// Fully independent — no shared mutable state with other workers.
pub struct Worker {
    pub id: usize,
    rx: mpsc::Receiver<AisMessage>,
    alert_tx_high: mpsc::Sender<Alert>,
    alert_tx_low: mpsc::Sender<Alert>,
    spatial: Arc<SpatialIndex>,
    detection_config: DetectionConfig,
    metrics: Arc<EngineMetrics>,
    vessel_snapshots: Arc<RwLock<HashMap<u32, VesselSnapshot>>>,
    pub mmsi_tracker: Arc<RwLock<HashMap<u32, (usize, i64, f64, f64)>>>,
    pub weather_cache: crate::weather_service::WeatherCache,
    pub grid: crate::types::GridConfig,
    pub gap_scan_interval_secs: u64,
    vessel_ttl_secs: i64,

    // Worker-local state (NOT shared)
    vessels: HashMap<u32, VesselState>,
    rendezvous_tracker: HashMap<(u32, u32), i64>,
}

impl Worker {
    pub fn new(
        id: usize,
        rx: mpsc::Receiver<AisMessage>,
        alert_tx_high: mpsc::Sender<Alert>,
        alert_tx_low: mpsc::Sender<Alert>,
        spatial: Arc<SpatialIndex>,
        detection_config: DetectionConfig,
        metrics: Arc<EngineMetrics>,
        vessel_snapshots: Arc<RwLock<HashMap<u32, VesselSnapshot>>>,
        mmsi_tracker: Arc<RwLock<HashMap<u32, (usize, i64, f64, f64)>>>,
        weather_cache: crate::weather_service::WeatherCache,
        grid: crate::types::GridConfig,
        gap_scan_interval_secs: u64,
        vessel_ttl_secs: i64,
    ) -> Self {
        Self {
            id,
            rx,
            alert_tx_high,
            alert_tx_low,
            spatial,
            detection_config,
            metrics,
            vessel_snapshots,
            mmsi_tracker,
            weather_cache,
            grid,
            gap_scan_interval_secs,
            vessel_ttl_secs,
            vessels: HashMap::new(),
            rendezvous_tracker: HashMap::new(),
        }
    }

    /// Main worker event loop
    pub async fn run(mut self) {
        tracing::info!("Worker {} started", self.id);

        let mut gap_scan_interval = tokio::time::interval(
            std::time::Duration::from_secs(self.gap_scan_interval_secs),
        );
        // Don't run gap scan immediately on start
        gap_scan_interval.tick().await;

        loop {
            tokio::select! {
                msg = self.rx.recv() => {
                    match msg {
                        Some(msg) => self.process_message(msg).await,
                        None => break, // Channel closed
                    }
                }
                _ = gap_scan_interval.tick() => {
                    self.scan_for_ais_gaps().await;
                    self.evict_stale_vessels();
                }
            }
        }

        tracing::info!("Worker {} shutting down", self.id);
    }

    /// Process a single AIS message
    async fn process_message(&mut self, msg: AisMessage) {
        let start = Instant::now();
        let now = msg.timestamp;
        let mmsi = msg.mmsi;

        // Record source
        self.metrics.record_source(msg.source == DataSource::Live);

        // Get or create vessel state
        let cell_id = self.grid.cell_id(msg.latitude, msg.longitude);
        let vessel = self.vessels.entry(mmsi).or_insert_with(|| VesselState::new(mmsi, cell_id));

        // ---------------------------------------------------------
        // STAGE 1: State Update & Validation
        // ---------------------------------------------------------
        // Calculate deltas before update
        let (moved, sig_speed_change, sig_heading_change) = if let Some(last_pos) = vessel.latest() {
            let dist = crate::spatial_index::haversine_nm(last_pos.lat, last_pos.lon, msg.latitude, msg.longitude);
            let ds = (last_pos.sog - msg.sog).abs();
            let dh = (last_pos.cog - msg.cog).abs();
            (dist > 0.001, ds > 2.0, dh > 5.0) // tuning thresholds
        } else {
            (true, true, true)
        };

        // Update vessel state
        vessel.update(&msg);
        vessel.ship_name = msg.ship_name.clone().or_else(|| vessel.ship_name.clone());
        
        // ---------------------------------------------------------
        // FAST PATH: Restricted Area Geofence (High Priority)
        // ---------------------------------------------------------
        // Only run bounding box check if moved significantly or just initialized
        if moved || vessel.status == VesselStatus::Violation {
            let violated_zones = self.spatial.check_geofences(msg.longitude, msg.latitude);
            
            for zone_name in violated_zones {
                if vessel.check_cooldown(AlertType::GeofenceViolation, now, 60_000) {
                    let mut alert = Alert::new(
                        AlertType::GeofenceViolation,
                        msg.mmsi,
                        msg.latitude,
                        msg.longitude,
                        Severity::Critical,
                        format!(
                            "Vessel {} entered restricted zone '{}' at ({:.4}, {:.4}), SOG: {:.1} kts",
                            msg.mmsi, zone_name, msg.latitude, msg.longitude, msg.sog
                        ),
                    );
                    alert.zone_name = Some(zone_name.to_string());
                    alert.worker_id = self.id;
                    alert.risk_score = 99.0;
                    alert.confidence = 99.0;
                    
                    self.apply_weather_context(&mut alert, cell_id);
                    
                    alert.processing_latency_ms = msg.ingest_time.elapsed().as_secs_f64() * 1000.0;
                    
                    vessel.set_cooldown(AlertType::GeofenceViolation, now);
                    vessel.set_status(VesselStatus::Violation);
                    
                    self.metrics.record_alert();
                    if let Err(e) = self.alert_tx_high.try_send(alert) {
                        tracing::warn!("High-priority alert channel full: {}", e);
                    }
                }
            }
        }
        
        // If the vessel hasn't moved significantly, hasn't changed speed/heading much, 
        // and is not already in a Warning state, skip Heavy Detection
        let alerts = if !moved && !sig_speed_change && !sig_heading_change && vessel.status == VesselStatus::Normal {
            Vec::new() // Skip Stages 2-5
        } else {
            // STAGES 2-5: Run remaining detection pipeline
            detection::run_detections(
                &msg,
                vessel,
                &self.vessels,
                &self.spatial,
                &self.detection_config,
                &mut self.rendezvous_tracker,
                &self.mmsi_tracker,
                self.id,
            )
        };

        // Update shared MMSI tracker periodically
        if let Ok(mut tracker) = self.mmsi_tracker.try_write() {
            tracker.insert(mmsi, (self.id, now, msg.latitude, msg.longitude));
        }

        // Send low-priority alerts off the hot path
        for mut alert in alerts {
            alert.worker_id = self.id;
            self.apply_weather_context(&mut alert, cell_id);
            alert.processing_latency_ms = msg.ingest_time.elapsed().as_secs_f64() * 1000.0;
            self.metrics.record_alert();
            if let Err(e) = self.alert_tx_low.try_send(alert) {
                tracing::warn!("Low-priority alert channel full: {}", e);
            }
        }

        // Update vessel snapshot for dashboard
        let vessel = self.vessels.get(&mmsi).unwrap();
        let snapshot = VesselSnapshot {
            mmsi,
            lat: msg.latitude,
            lon: msg.longitude,
            sog: msg.sog,
            cog: msg.cog,
            ship_name: vessel.ship_name.clone(),
            status: vessel.status,
        };

        if let Ok(mut snapshots) = self.vessel_snapshots.write() {
            snapshots.insert(mmsi, snapshot);
        }

        // Record metrics
        self.metrics.record_message();
        let elapsed_us = start.elapsed().as_micros() as u64;
        self.metrics.record_latency(elapsed_us);
    }

    /// Periodic sweep: check for AIS gaps and fire alerts
    async fn scan_for_ais_gaps(&mut self) {
        let now = chrono::Utc::now().timestamp_millis();
        let mut gap_alerts = Vec::new();

        for vessel in self.vessels.values() {
            if let Some(alert) = detection::check_ais_gap(
                vessel,
                &self.spatial,
                &self.detection_config,
                now,
            ) {
                gap_alerts.push(alert);
            }
        }

        for mut alert in gap_alerts {
            let cell_id = self.grid.cell_id(alert.latitude, alert.longitude);
            self.apply_weather_context(&mut alert, cell_id);
            
            // Update vessel status
            if let Some(vessel) = self.vessels.get_mut(&alert.mmsi) {
                vessel.set_status(VesselStatus::Warning);
                vessel.set_cooldown(AlertType::AisGap, now);

                // Update snapshot
                if let Some(p) = vessel.latest() {
                    let snapshot = VesselSnapshot {
                        mmsi: vessel.mmsi,
                        lat: p.lat,
                        lon: p.lon,
                        sog: p.sog,
                        cog: p.cog,
                        ship_name: vessel.ship_name.clone(),
                        status: VesselStatus::Warning,
                    };
                    if let Ok(mut snapshots) = self.vessel_snapshots.write() {
                        snapshots.insert(vessel.mmsi, snapshot);
                    }
                }
            }

            self.metrics.record_alert();
            if let Err(e) = self.alert_tx_low.try_send(alert) {
                tracing::warn!("Alert channel full: {}", e);
            }
        }
    }

    /// Evict vessels not seen for vessel_ttl_secs
    fn evict_stale_vessels(&mut self) {
        let now = chrono::Utc::now().timestamp_millis();
        let ttl_ms = self.vessel_ttl_secs * 1000;

        let stale: Vec<u32> = self
            .vessels
            .iter()
            .filter(|(_, v)| now - v.last_seen > ttl_ms)
            .map(|(mmsi, _)| *mmsi)
            .collect();

        let removed = stale.len();
        for mmsi in &stale {
            self.vessels.remove(mmsi);
            if let Ok(mut snapshots) = self.vessel_snapshots.write() {
                snapshots.remove(mmsi);
            }
        }

        if removed > 0 {
            tracing::info!("Worker {} evicted {} stale vessels", self.id, removed);
        }

        // Update active vessel count
        self.metrics
            .active_vessels
            .store(self.vessels.len() as u64, Ordering::Relaxed);
    }
    
    /// O(1) in-memory lookup to apply weather context to alerts
    fn apply_weather_context(&self, alert: &mut Alert, cell_id: u32) {
        if let Ok(cache) = self.weather_cache.read() {
            if let Some(weather) = cache.get(&cell_id) {
                let mut impact = "None".to_string();
                
                if weather.is_storm || weather.wind_speed_kmh > 40.0 {
                    match alert.alert_type {
                        AlertType::GeofenceViolation => {
                            impact = "Possible Weather Assisted Deviation".to_string();
                            alert.confidence *= 0.85; // Reduce confidence slightly
                        },
                        AlertType::AisGap => {
                            impact = "Possible Storm Signal Interference".to_string();
                            alert.confidence *= 0.70;
                        },
                        AlertType::Loitering => {
                            impact = "Possible Sheltering Behaviour".to_string();
                            alert.confidence *= 0.75;
                        },
                        AlertType::Rendezvous => {
                            impact = "Emergency Gathering Likely".to_string();
                            alert.confidence *= 0.60;
                        },
                        _ => {
                            impact = "Severe Weather Present".to_string();
                        }
                    }
                }
                
                alert.weather_context = Some(crate::types::WeatherContext {
                    wind_speed: weather.wind_speed_kmh,
                    wave_height: 0.0, // Open-Meteo forecast doesn't have marine waves in this endpoint, mock it or leave it 0
                    visibility: if weather.visibility_m < 2000.0 { "Low".to_string() } else { "Good".to_string() },
                    storm: weather.is_storm,
                    weather_impact: impact,
                });
            }
        }
    }
}
