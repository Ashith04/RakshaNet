use std::collections::HashMap;

use crate::config::DetectionConfig;
use crate::spatial_index::{haversine_nm, SpatialIndex};
use crate::types::*;
use std::sync::RwLock;
use crate::spoofing_detection;

/// Run all detection checks for a single incoming message.
/// Returns a list of alerts (may be empty).
pub fn run_detections(
    msg: &AisMessage,
    vessel: &mut VesselState,
    vessels: &HashMap<u32, VesselState>,
    spatial: &SpatialIndex,
    config: &DetectionConfig,
    rendezvous_tracker: &mut HashMap<(u32, u32), i64>,
    mmsi_tracker: &RwLock<HashMap<u32, (usize, i64, f64, f64)>>,
    worker_id: usize,
) -> Vec<Alert> {
    let mut alerts = Vec::new();
    let now = msg.timestamp;

    // ---------------------------------------------------------
    // STAGE 2: Lightweight Detection
    // ---------------------------------------------------------
    // If the vessel is moving super slowly and is far from any geofence, we don't need heavy PIP or R-tree checks
    let is_suspicious = msg.sog < 1.0 || msg.sog > 40.0;
    // Fast bounding-box check (no polygons):
    let near_zone = spatial.distance_to_nearest_zone_nm(msg.longitude, msg.latitude) < 20.0;

    // 2. Loitering (Lightweight)
    check_loitering(msg, vessel, config, now, &mut alerts);

    // 3. Spoofing Detection (Lightweight hashmap checks)
    if let Some(spoof_alert) = spoofing_detection::check_spoofing(msg, vessel, &config.spoofing, mmsi_tracker, worker_id) {
        alerts.push(spoof_alert);
    }

    let needs_heavy = is_suspicious || near_zone || !alerts.is_empty() || vessel.status == VesselStatus::Warning;

    // ---------------------------------------------------------
    // STAGE 3, 4, 5: Heavy Spatial Analysis & Context Engine
    // ---------------------------------------------------------
    if needs_heavy {
        // 1. Geofence is handled directly in worker.rs Fast Path (Stage 1)
        
        // 4. Rendezvous (R-Tree / loop over nearby vessels)
        check_rendezvous(msg, vessel, vessels, config, now, rendezvous_tracker, &mut alerts);
        
        // Stage 4 & 5 (Context Engine and Risk Scoring) are implicitly handled 
        // within the alert generation functions which query weather/history cache.
    }

    alerts
}

/// Check for AIS gap (called during periodic sweep, not per-message)
pub fn check_ais_gap(
    vessel: &VesselState,
    spatial: &SpatialIndex,
    config: &DetectionConfig,
    now: i64,
) -> Option<Alert> {
    let silence_ms = now - vessel.last_seen;
    let silence_secs = silence_ms / 1000;

    if silence_secs < config.ais_gap.max_silence_secs {
        return None;
    }

    let (lat, lon) = match vessel.latest() {
        Some(p) => (p.lat, p.lon),
        None => return None,
    };

    let severity = if config.ais_gap.near_zone_severity_boost {
        let dist = spatial.distance_to_nearest_zone_nm(lon, lat);
        if dist < config.ais_gap.near_zone_radius_nm {
            Severity::Critical
        } else {
            Severity::Medium
        }
    } else {
        Severity::Medium
    };

    let mut alert = Alert::new(
        AlertType::AisGap,
        vessel.mmsi,
        lat,
        lon,
        severity,
        format!(
            "Vessel {} went dark for {} seconds. Last seen at ({:.4}, {:.4})",
            vessel.mmsi, silence_secs, lat, lon
        ),
    );
    alert.timestamp = now;

    Some(alert)
}

// ─── Individual detection checks ────────────────────────────────


fn check_loitering(
    msg: &AisMessage,
    vessel: &mut VesselState,
    config: &DetectionConfig,
    now: i64,
    alerts: &mut Vec<Alert>,
) {
    let lc = &config.loitering;

    // Need enough history
    if vessel.history.len() < 3 {
        return;
    }

    let avg_speed = vessel.avg_speed();
    let displacement = vessel.displacement_nm();
    let time_span = vessel.time_span_secs();

    if avg_speed < lc.speed_threshold_knots
        && displacement < lc.radius_nm
        && time_span > lc.min_duration_secs
    {
        if !vessel.check_cooldown(AlertType::Loitering, now, lc.cooldown_secs * 1000) {
            return;
        }

        let alert = Alert::new(
            AlertType::Loitering,
            msg.mmsi,
            msg.latitude,
            msg.longitude,
            Severity::High,
            format!(
                "Vessel {} loitering: avg speed {:.1} kts, displacement {:.2} nm over {} seconds",
                msg.mmsi, avg_speed, displacement, time_span
            ),
        );

        vessel.set_cooldown(AlertType::Loitering, now);
        vessel.set_status(VesselStatus::Warning);
        alerts.push(alert);
    }
}



fn check_rendezvous(
    msg: &AisMessage,
    vessel: &VesselState,
    vessels: &HashMap<u32, VesselState>,
    config: &DetectionConfig,
    now: i64,
    rendezvous_tracker: &mut HashMap<(u32, u32), i64>,
    alerts: &mut Vec<Alert>,
) {
    let rc = &config.rendezvous;

    // Only check if this vessel has a current position
    let our_pos = match vessel.latest() {
        Some(p) => p.clone(),
        None => return,
    };

    // Check against other vessels in the same worker
    for (other_mmsi, other_vessel) in vessels.iter() {
        if *other_mmsi == msg.mmsi {
            continue;
        }

        let other_pos = match other_vessel.latest() {
            Some(p) => p,
            None => continue,
        };

        // Skip stale vessels
        let other_age_secs = (now - other_vessel.last_seen) / 1000;
        if other_age_secs > rc.min_duration_secs * 2 {
            continue;
        }

        // Distance check
        let dist = haversine_nm(our_pos.lat, our_pos.lon, other_pos.lat, other_pos.lon);
        if dist > rc.max_distance_nm * 3.0 {
            continue;
        }

        // Speed match check
        let speed_diff = (our_pos.sog - other_pos.sog).abs();
        if speed_diff > rc.speed_match_tolerance_knots {
            // Pair no longer matching — remove from tracker
            let pair = ordered_pair(msg.mmsi, *other_mmsi);
            rendezvous_tracker.remove(&pair);
            continue;
        }

        // Both within distance and matching speed
        if dist <= rc.max_distance_nm {
            let pair = ordered_pair(msg.mmsi, *other_mmsi);
            let first_seen = rendezvous_tracker.entry(pair).or_insert(now);
            let duration_secs = (now - *first_seen) / 1000;

            if duration_secs >= rc.min_duration_secs {
                // Fire alert (with cooldown via tracker — only alert once per pair)
                let mut alert = Alert::new(
                    AlertType::Rendezvous,
                    msg.mmsi,
                    msg.latitude,
                    msg.longitude,
                    Severity::High,
                    format!(
                        "Ship-to-ship rendezvous: vessels {} and {} within {:.2} nm for {} seconds, matching speed ~{:.1} kts",
                        msg.mmsi, other_mmsi, dist, duration_secs, our_pos.sog
                    ),
                );
                alert.mmsi2 = Some(*other_mmsi);
                alerts.push(alert);

                // Reset tracker so we don't spam
                rendezvous_tracker.remove(&pair);
            }
        }
    }
}

/// Ensure consistent pair ordering for rendezvous tracking
fn ordered_pair(a: u32, b: u32) -> (u32, u32) {
    if a <= b { (a, b) } else { (b, a) }
}
