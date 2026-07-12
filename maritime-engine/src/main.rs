mod aisstream_client;
mod alerting;
mod config;
mod dashboard_server;
mod detection;
mod dispatcher;
mod metrics;
mod pre_departure;
mod simulator_listener;
mod spoofing_detection;
mod spatial_index;
mod types;
mod vessel_state;
mod weather_service;
mod worker;

use std::collections::HashMap;
use std::sync::{Arc, RwLock};

use tokio::sync::{broadcast, mpsc};

use crate::alerting::AlertHistory;
use crate::config::AppConfig;
use crate::dashboard_server::{BoundingBox, DashboardState};
use crate::dispatcher::Dispatcher;
use crate::metrics::EngineMetrics;
use crate::spatial_index::SpatialIndex;
use crate::types::VesselSnapshot;
use crate::worker::Worker;

const DISPATCHER_CHANNEL_SIZE: usize = 100_000;
const WORKER_CHANNEL_SIZE: usize = 50_000;
const ALERT_CHANNEL_SIZE: usize = 10_000;
const ALERT_BROADCAST_SIZE: usize = 1_000;

#[tokio::main]
async fn main() -> Result<(), Box<dyn std::error::Error>> {
    // Initialize tracing
    tracing_subscriber::fmt()
        .with_env_filter(
            tracing_subscriber::EnvFilter::try_from_default_env()
                .unwrap_or_else(|_| tracing_subscriber::EnvFilter::new("info")),
        )
        .init();

    tracing::info!("═══════════════════════════════════════════════════");
    tracing::info!("  Maritime Surveillance Engine v0.1.0");
    tracing::info!("═══════════════════════════════════════════════════");

    // Load configuration
    let config = AppConfig::load("config.toml")
        .or_else(|_| AppConfig::load("maritime-engine/config.toml"))
        .map_err(|e| {
            tracing::error!("Failed to load config.toml: {}", e);
            e
        })?;

    tracing::info!("Config loaded: {} geofence zones", config.detection.geofence.zones.len());

    // Read API key from environment (optional — engine works without it)
    let api_key = std::env::var("AISSTREAM_API_KEY").ok();
    if api_key.is_some() {
        tracing::info!("aisstream.io API key found — live feed enabled");
    } else {
        tracing::warn!("AISSTREAM_API_KEY not set — running in simulator-only mode");
    }

    // Determine number of workers
    let num_workers = if config.engine.num_workers > 0 {
        config.engine.num_workers
    } else {
        std::thread::available_parallelism()
            .map(|p| p.get())
            .unwrap_or(4)
    };
    tracing::info!("Spawning {} workers", num_workers);

    // Compute bounding box and grid config
    let (lat_min, lon_min, lat_max, lon_max) = config.bounding_box_extents();
    let grid = types::GridConfig::new(
        lat_min,
        lon_min,
        lat_max,
        lon_max,
        config.engine.grid_lat_divisions,
        config.engine.grid_lon_divisions,
    );
    tracing::info!(
        "Grid: {:.1}°-{:.1}° lat × {:.1}°-{:.1}° lon, {}×{} = {} cells",
        lat_min, lat_max, lon_min, lon_max,
        grid.lat_divs, grid.lon_divs, grid.total_cells()
    );

    // Build spatial index
    let spatial = Arc::new(SpatialIndex::build(&config.detection.geofence.zones));

    // Create shared metrics
    let metrics = EngineMetrics::new();

    // Create shared vessel snapshots (for dashboard)
    let vessel_snapshots: Arc<RwLock<HashMap<u32, VesselSnapshot>>> =
        Arc::new(RwLock::new(HashMap::new()));
        
    // Create shared MMSI tracker for spoofing detection
    let mmsi_tracker: Arc<RwLock<HashMap<u32, (usize, i64, f64, f64)>>> = 
        Arc::new(RwLock::new(HashMap::new()));
        
    // Create shared Weather cache
    let weather_cache: weather_service::WeatherCache = Arc::new(RwLock::new(HashMap::new()));
    
    // Spawn weather updater task
    let wc_clone = weather_cache.clone();
    let grid_clone = grid.clone();
    tokio::spawn(async move {
        weather_service::run_weather_updater(wc_clone, grid_clone).await;
    });

    // Create shared Pre-Departure cache
    let pre_departure_cache: pre_departure::PreDepartureCache = Arc::new(RwLock::new(HashMap::new()));
    
    // Spawn Pre-Departure analyzer
    let pd_cache_clone = pre_departure_cache.clone();
    let pd_vessels_clone = vessel_snapshots.clone();
    let pd_wc_clone = weather_cache.clone();
    let pd_grid_clone = grid.clone();
    tokio::spawn(async move {
        pre_departure::run_analyzer(pd_cache_clone, pd_vessels_clone, pd_wc_clone, pd_grid_clone).await;
    });

    // Create channels
    let (ingestion_tx, ingestion_rx) = mpsc::channel::<types::AisMessage>(DISPATCHER_CHANNEL_SIZE);
    let (alert_tx_high, alert_rx_high) = mpsc::channel::<types::Alert>(ALERT_CHANNEL_SIZE);
    let (alert_tx_low, alert_rx_low) = mpsc::channel::<types::Alert>(ALERT_CHANNEL_SIZE);
    let (alert_broadcast_tx, _) = broadcast::channel::<types::Alert>(ALERT_BROADCAST_SIZE);
    let alert_history = AlertHistory::new();

    // Create worker channels and workers
    let mut worker_txs = Vec::with_capacity(num_workers);
    let mut worker_handles = Vec::with_capacity(num_workers);

    for i in 0..num_workers {
        let (wtx, wrx) = mpsc::channel::<types::AisMessage>(WORKER_CHANNEL_SIZE);
        worker_txs.push(wtx);

        let worker = Worker::new(
            i,
            wrx,
            alert_tx_high.clone(),
            alert_tx_low.clone(),
            spatial.clone(),
            config.detection.clone(),
            metrics.clone(),
            vessel_snapshots.clone(),
            mmsi_tracker.clone(),
            weather_cache.clone(),
            grid.clone(),
            config.engine.gap_scan_interval_secs,
            config.engine.vessel_ttl_secs,
        );

        worker_handles.push(tokio::spawn(worker.run()));
    }

    // Spawn dispatcher
    let dispatcher = Dispatcher::new(grid, worker_txs, config.geohash_precision);
    let dispatcher_handle = tokio::spawn(dispatcher.run(ingestion_rx));

    // Spawn aisstream client (if API key available)
    if let Some(key) = api_key {
        let ais_tx = ingestion_tx.clone();
        let ais_config = config.aisstream.clone();
        tokio::spawn(async move {
            aisstream_client::run(key, ais_config, ais_tx).await;
        });
    }

    // Spawn simulator UDP listener
    let sim_tx = ingestion_tx.clone();
    let sim_addr = config.engine.udp_listen_addr.clone();
    tokio::spawn(async move {
        simulator_listener::run(sim_addr, sim_tx).await;
    });

    // Spawn alerter
    let alerter_handle = tokio::spawn(alerting::run_alerter(
        alert_rx_high,
        alert_rx_low,
        alert_broadcast_tx.clone(),
        alert_history.clone(),
        metrics.clone(),
    ));

    // Spawn metrics aggregator
    metrics::spawn_metrics_aggregator(metrics.clone());

    // Spawn dashboard server
    let dashboard_state = DashboardState {
        metrics: metrics.clone(),
        spatial: spatial.clone(),
        vessel_snapshots: vessel_snapshots.clone(),
        alert_broadcast: alert_broadcast_tx,
        alert_history,
        bounding_box: BoundingBox {
            lat_min,
            lon_min,
            lat_max,
            lon_max,
        },
        weather_cache: weather_cache.clone(),
        pre_departure_cache: pre_departure_cache.clone(),
    };
    let dashboard_addr = config.engine.dashboard_addr.clone();
    tokio::spawn(async move {
        dashboard_server::run(dashboard_state, dashboard_addr).await;
    });

    tracing::info!("═══════════════════════════════════════════════════");
    tracing::info!("  All subsystems started. Press Ctrl+C to stop.");
    tracing::info!("═══════════════════════════════════════════════════");
    tracing::info!("  Dashboard: http://localhost:8080");
    tracing::info!("  Simulator UDP: {}", config.engine.udp_listen_addr);
    tracing::info!("═══════════════════════════════════════════════════");

    // Wait for shutdown signal
    tokio::signal::ctrl_c().await?;
    tracing::info!("Shutdown signal received, stopping...");

    // Drop the ingestion sender to close the pipeline
    drop(ingestion_tx);

    Ok(())
}
