use std::collections::HashMap;

use crate::config::DetectionConfig;
use crate::spatial_index::{haversine_nm, SpatialIndex};
use crate::types::*;

/// Run all detection checks for a single incoming message.
/// Returns a list of alerts (may be empty).
pub fn run_detections(
    msg: &AisMessage,
    vessel: &mut VesselState,
    vessels: &HashMap<u32, VesselState>,
    spatial: &SpatialIndex,
    config: &DetectionConfig,
    rendezvous_tracker: &mut HashMap<(u32, u32), i64>,
) -> Vec<Alert> {
    let mut alerts = Vec::new();
    let now = msg.timestamp;

    // 1. Geofence violation
    check_geofence(msg, vessel, spatial, config, now, &mut alerts);

    // 2. Loitering
    check_loitering(msg, vessel, config, now, &mut alerts);

    // 3. Speed anomaly
    check_speed_anomaly(msg, vessel, config, now, &mut alerts);

    // 4. Rendezvous (proximity check against nearby vessels)
    check_rendezvous(msg, vessel, vessels, config, now, rendezvous_tracker, &mut alerts);

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

fn check_geofence(
    msg: &AisMessage,
    vessel: &mut VesselState,
    spatial: &SpatialIndex,
    config: &DetectionConfig,
    now: i64,
    alerts: &mut Vec<Alert>,
) {
    let violated_zones = spatial.check_geofences(msg.longitude, msg.latitude);

    for zone_name in violated_zones {
        if !vessel.check_cooldown(AlertType::GeofenceViolation, now, 60_000) {
            continue;
        }

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

        vessel.set_cooldown(AlertType::GeofenceViolation, now);
        vessel.set_status(VesselStatus::Violation);
        alerts.push(alert);
    }
}

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

fn check_speed_anomaly(
    msg: &AisMessage,
    vessel: &mut VesselState,
    config: &DetectionConfig,
    now: i64,
    alerts: &mut Vec<Alert>,
) {
    let ac = &config.anomaly;

    // Check reported SOG
    if msg.sog > ac.max_speed_knots {
        if vessel.check_cooldown(AlertType::SpeedAnomaly, now, 60_000) {
            let alert = Alert::new(
                AlertType::SpeedAnomaly,
                msg.mmsi,
                msg.latitude,
                msg.longitude,
                Severity::High,
                format!(
                    "Vessel {} reported impossible SOG: {:.1} kts (max: {:.1})",
                    msg.mmsi, msg.sog, ac.max_speed_knots
                ),
            );
            vessel.set_cooldown(AlertType::SpeedAnomaly, now);
            alerts.push(alert);
        }
    }

    // Check implied speed from position jump
    if let Some(prev) = vessel.history.iter().rev().nth(1) {
        let dt_secs = (msg.timestamp - prev.timestamp) as f64 / 1000.0;
        if dt_secs > 0.0 {
            let dist_nm = haversine_nm(prev.lat, prev.lon, msg.latitude, msg.longitude);

            if dist_nm > ac.max_jump_nm {
                if vessel.check_cooldown(AlertType::SpeedAnomaly, now, 60_000) {
                    let implied_speed = dist_nm / (dt_secs / 3600.0);
                    let alert = Alert::new(
                        AlertType::SpeedAnomaly,
                        msg.mmsi,
                        msg.latitude,
                        msg.longitude,
                        Severity::Critical,
                        format!(
                            "Vessel {} position jump: {:.1} nm in {:.0}s (implied {:.0} kts) — possible spoofing",
                            msg.mmsi, dist_nm, dt_secs, implied_speed
                        ),
                    );
                    vessel.set_cooldown(AlertType::SpeedAnomaly, now);
                    alerts.push(alert);
                }
            }
        }
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
