use std::collections::HashMap;

use crate::types::{AisMessage, AlertType, PositionRecord, VesselState, VesselStatus};

const MAX_HISTORY: usize = 10;

impl VesselState {
    /// Update vessel with a new AIS message. Returns the previous position if available.
    pub fn update(&mut self, msg: &AisMessage) -> Option<PositionRecord> {
        let prev = self.history.back().cloned();

        self.history.push_back(PositionRecord {
            lat: msg.latitude,
            lon: msg.longitude,
            sog: msg.sog,
            cog: msg.cog,
            timestamp: msg.timestamp,
        });

        if self.history.len() > MAX_HISTORY {
            self.history.pop_front();
        }

        self.last_seen = msg.timestamp;
        if msg.ship_name.is_some() {
            self.ship_name = msg.ship_name.clone();
        }
        self.cell_id = 0; // will be set by worker

        prev
    }

    /// Average speed (SOG) across recent history
    pub fn avg_speed(&self) -> f32 {
        if self.history.is_empty() {
            return 0.0;
        }
        let sum: f32 = self.history.iter().map(|p| p.sog).sum();
        sum / self.history.len() as f32
    }

    /// Displacement from oldest to newest point in history (nautical miles)
    pub fn displacement_nm(&self) -> f64 {
        if self.history.len() < 2 {
            return 0.0;
        }
        let oldest = self.history.front().unwrap();
        let newest = self.history.back().unwrap();
        crate::spatial_index::haversine_nm(oldest.lat, oldest.lon, newest.lat, newest.lon)
    }

    /// Time span from oldest to newest point in seconds
    pub fn time_span_secs(&self) -> i64 {
        if self.history.len() < 2 {
            return 0;
        }
        let oldest = self.history.front().unwrap();
        let newest = self.history.back().unwrap();
        (newest.timestamp - oldest.timestamp) / 1000 // millis → secs
    }

    /// Check cooldown: returns true if alert can fire (cooldown expired)
    pub fn check_cooldown(&self, alert_type: AlertType, now: i64, cooldown_ms: i64) -> bool {
        match self.alert_cooldowns.get(&alert_type) {
            Some(&last_alert) => (now - last_alert) > cooldown_ms,
            None => true,
        }
    }

    /// Record that an alert was fired
    pub fn set_cooldown(&mut self, alert_type: AlertType, now: i64) {
        self.alert_cooldowns.insert(alert_type, now);
    }

    /// Update vessel status (for dashboard coloring)
    pub fn set_status(&mut self, status: VesselStatus) {
        self.status = status;
    }

    /// Get the latest position record
    pub fn latest(&self) -> Option<&PositionRecord> {
        self.history.back()
    }

    /// Distance from the latest position to another point (nautical miles)
    pub fn distance_to_nm(&self, lat: f64, lon: f64) -> f64 {
        match self.latest() {
            Some(p) => crate::spatial_index::haversine_nm(p.lat, p.lon, lat, lon),
            None => f64::MAX,
        }
    }
}
