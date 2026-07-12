use serde::{Deserialize, Serialize};
use std::collections::HashMap;
use std::sync::{Arc, RwLock};
use tokio::time::{sleep, Duration};
use crate::types::GridConfig;
use crate::weather_service::WeatherCache;

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct RouteWaypoint {
    pub lat: f64,
    pub lon: f64,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct PreDepartureReport {
    pub mmsi: u32,
    pub ship_name: String,
    pub vessel_type: String,
    pub departure_port: String,
    pub destination_port: String,
    pub eta_hours: u32,
    pub planned_route: Vec<RouteWaypoint>,
    pub weather_risk: String, // Low, Medium, High
    pub protected_zone_risk: String,
    pub border_risk: String,
    pub deviation_probability: u32,
    pub historical_behaviour: String,
    pub overall_voyage_risk: u32,
    pub recommended_monitoring: String,
    pub recommended_route: String,
    pub last_updated: i64,
}

pub type PreDepartureCache = Arc<RwLock<HashMap<u32, PreDepartureReport>>>;

pub async fn run_analyzer(
    cache: PreDepartureCache,
    vessels: Arc<RwLock<HashMap<u32, crate::types::VesselSnapshot>>>,
    weather_cache: WeatherCache,
    grid: GridConfig,
) {
    loop {
        tracing::info!("Running Pre-Departure Analyzer...");
        let mut new_reports = HashMap::new();
        
        // Grab a snapshot of vessels
        let active_vessels: Vec<_> = {
            let v_map = vessels.read().unwrap();
            v_map.values().cloned().collect()
        };

        // For demonstration, we'll pick up to 50 vessels and generate synthetic planned routes
        for (i, v) in active_vessels.into_iter().enumerate().take(50) {
            let ship_name = v.ship_name.clone().unwrap_or_else(|| format!("VESSEL {}", v.mmsi));
            
            // Generate synthetic route points projecting forward based on current COG
            let mut planned_route = Vec::new();
            let mut current_lat = v.lat;
            let mut current_lon = v.lon;
            
            // Add current pos
            planned_route.push(RouteWaypoint { lat: current_lat, lon: current_lon });
            
            // Convert COG to radians
            let cog_rad = (v.cog as f64).to_radians();
            let step_size = 0.5; // About 30 miles per step
            
            let mut max_wind_speed = 0.0;
            let mut encounters_storm = false;

            for _ in 0..10 {
                // Approximate progression
                current_lat += (cog_rad.cos()) * step_size;
                current_lon += (cog_rad.sin()) * step_size;
                planned_route.push(RouteWaypoint { lat: current_lat, lon: current_lon });
                
                // Check weather at this waypoint
                let cell_id = grid.cell_id(current_lat, current_lon);
                let w_map = weather_cache.read().unwrap();
                if let Some(w) = w_map.get(&cell_id) {
                    if w.wind_speed_kmh > max_wind_speed {
                        max_wind_speed = w.wind_speed_kmh;
                    }
                    if w.is_storm {
                        encounters_storm = true;
                    }
                }
            }

            // Calculate risks
            let weather_risk = if encounters_storm {
                "High"
            } else if max_wind_speed > 40.0 {
                "Medium"
            } else {
                "Low"
            };

            let deviation_probability = if encounters_storm { 75 } else if max_wind_speed > 40.0 { 35 } else { 5 };
            
            // Randomize some attributes for realism in demo
            let protected_zone_risk = if i % 7 == 0 { "High" } else if i % 4 == 0 { "Medium" } else { "Low" };
            let border_risk = if i % 9 == 0 { "High" } else { "Low" };
            let historical_behaviour = if i % 11 == 0 { "Suspicious Route Deviations" } else { "Normal" };
            
            let mut overall = deviation_probability;
            if protected_zone_risk == "High" { overall += 30; }
            if border_risk == "High" { overall += 20; }
            
            let overall_voyage_risk = overall.min(99);
            
            let recommended_monitoring = if overall_voyage_risk > 60 {
                "Enhanced"
            } else {
                "Standard"
            };

            let report = PreDepartureReport {
                mmsi: v.mmsi,
                ship_name,
                vessel_type: "Cargo".to_string(), // Simplified
                departure_port: "Kochi".to_string(), // Mock
                destination_port: "Dubai".to_string(), // Mock
                eta_hours: 18 + (i as u32 % 24),
                planned_route,
                weather_risk: weather_risk.to_string(),
                protected_zone_risk: protected_zone_risk.to_string(),
                border_risk: border_risk.to_string(),
                deviation_probability,
                historical_behaviour: historical_behaviour.to_string(),
                overall_voyage_risk,
                recommended_monitoring: recommended_monitoring.to_string(),
                recommended_route: if encounters_storm { "Route B (Avoidance)".to_string() } else { "Route A (Direct)".to_string() },
                last_updated: chrono::Utc::now().timestamp_millis(),
            };
            
            new_reports.insert(v.mmsi, report);
        }

        {
            let mut c = cache.write().unwrap();
            *c = new_reports;
        }

        tracing::info!("Pre-Departure Analyzer cycle complete.");
        sleep(Duration::from_secs(300)).await; // Run every 5 minutes
    }
}
