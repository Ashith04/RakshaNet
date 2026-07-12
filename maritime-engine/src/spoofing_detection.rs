use std::sync::RwLock;
use std::collections::HashMap;
use crate::types::*;
use crate::config::SpoofingConfig;
use crate::spatial_index::haversine_nm;

pub fn check_spoofing(
    msg: &AisMessage,
    vessel: &mut VesselState,
    config: &SpoofingConfig,
    mmsi_tracker: &RwLock<HashMap<u32, (usize, i64, f64, f64)>>,
    worker_id: usize,
) -> Option<Alert> {
    let mut risk_score = 0.0;
    let mut anomalies = Vec::new();
    let mut calculated_speed = None;
    let mut prev_location = None;
    
    let now = msg.timestamp;

    // We need at least one previous position to do most math
    if let Some(prev) = vessel.history.iter().rev().nth(1) {
        prev_location = Some((prev.lat, prev.lon, prev.timestamp));
        
        let dt_secs = (msg.timestamp - prev.timestamp) as f64 / 1000.0;
        if dt_secs > 0.0 {
            let dist_nm = haversine_nm(prev.lat, prev.lon, msg.latitude, msg.longitude);
            let dist_km = dist_nm * 1.852;
            let speed_knots = dist_nm / (dt_secs / 3600.0);
            calculated_speed = Some(speed_knots);

            // 1. IMPOSSIBLE SPEED
            if speed_knots > config.max_realistic_speed_knots {
                anomalies.push(format!("Impossible speed: {:.1} knots calculated", speed_knots));
                risk_score += config.weight_impossible_speed;
            }

            // 2. SUDDEN LONG-DISTANCE JUMP
            if dist_km > config.max_jump_distance_km {
                anomalies.push(format!("Sudden long-distance jump: {:.1} km in {:.0}s", dist_km, dt_secs));
                risk_score += config.weight_long_jump;
            }

            // 4. UNREALISTIC HEADING CHANGES
            let heading_change = (msg.cog - prev.cog).abs();
            // Handle wrap-around for degrees
            let heading_change = if heading_change > 180.0 { 360.0 - heading_change } else { heading_change };
            let rate_of_turn = heading_change as f64 / dt_secs;
            
            // High speed + high rate of turn = implausible physically
            if rate_of_turn > config.max_heading_change_deg_per_sec && msg.sog > 15.0 {
                anomalies.push(format!("Unrealistic heading change: {:.1} deg/sec at {:.1} knots", rate_of_turn, msg.sog));
                risk_score += config.weight_heading_change;
            }
        }
    }

    // 5. IMPOSSIBLE GRID/BUCKET TRANSITIONS
    // Grid transitions are evaluated via the cell_id. If a vessel jumps cells without hitting adjacent ones,
    // it's highly suspicious. But since we don't have grid math easily accessible here without `GridConfig`,
    // we use a simplified distance proxy or rely on the previous check #2 which is functionally equivalent
    // to checking impossible cell distances. For this exercise, we'll increment if both #1 and #2 fired.
    if anomalies.iter().any(|a| a.contains("Impossible speed")) && anomalies.iter().any(|a| a.contains("Sudden long-distance jump")) {
        // Corroborated jump
        risk_score += config.weight_impossible_grid;
    }

    // 6. IDENTITY INCONSISTENCIES
    if let Some(prev) = vessel.history.iter().rev().nth(1) {
        if let (Some(prev_name), Some(curr_name)) = (&vessel.ship_name, &msg.ship_name) {
            if prev_name != curr_name && prev_name != "Unknown" && curr_name != "Unknown" {
                anomalies.push(format!("Identity inconsistency: ShipName changed from '{}' to '{}'", prev_name, curr_name));
                risk_score += config.weight_identity_change;
            }
        }
    }

    // 3. DUPLICATE MMSI IN DIFFERENT LOCATIONS
    // Read from the shared tracker (debounce read)
    if let Ok(tracker) = mmsi_tracker.try_read() {
        if let Some(&(other_worker, other_time, other_lat, other_lon)) = tracker.get(&msg.mmsi) {
            if other_worker != worker_id {
                let dt_secs = (msg.timestamp - other_time).abs() as f64 / 1000.0;
                // If the other worker saw it recently and it's far away
                if dt_secs < 60.0 {
                    let dist_nm = haversine_nm(other_lat, other_lon, msg.latitude, msg.longitude);
                    let dist_km = dist_nm * 1.852;
                    if dist_km > 50.0 {
                        anomalies.push(format!("Duplicate MMSI: Seen by worker {} at ({:.4}, {:.4}) {:.0}s ago", other_worker, other_lat, other_lon, dt_secs));
                        risk_score += config.weight_duplicate_mmsi;
                    }
                }
            }
        }
    }

    // Evaluate risk
    if risk_score > 0.0 && vessel.check_cooldown(AlertType::Spoofing, now, 60_000) {
        vessel.set_cooldown(AlertType::Spoofing, now);

        let classification = if risk_score >= 70.0 {
            SpoofingClassification::HighRisk
        } else {
            SpoofingClassification::Suspicious
        };

        let severity = if risk_score >= 70.0 { Severity::Critical } else { Severity::High };

        let recommendation = match classification {
            SpoofingClassification::HighRisk => "Flag for immediate manual review — inconsistent identity/telemetry data.",
            SpoofingClassification::Suspicious => "Verify via secondary source (radar/patrol) before acting.",
            SpoofingClassification::Normal => "No action required.",
        };

        let details = SpoofingDetails {
            classification,
            anomalies,
            risk_score,
            calculated_speed_knots: calculated_speed,
            prev_location,
            curr_location: (msg.latitude, msg.longitude, msg.timestamp),
            recommendation: recommendation.to_string(),
        };

        let mut alert = Alert::new(
            AlertType::Spoofing,
            msg.mmsi,
            msg.latitude,
            msg.longitude,
            severity,
            format!("[{:?}] AIS Spoofing Detected. Score: {:.0}", classification, risk_score),
        );
        alert.spoofing_details = Some(details);
        
        return Some(alert);
    }

    None
}
