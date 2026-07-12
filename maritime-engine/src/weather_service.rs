use std::collections::HashMap;
use std::sync::{Arc, RwLock};
use tokio::time::{sleep, Duration};
use serde::{Deserialize, Serialize};

use crate::types::GridConfig;

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct WeatherData {
    pub wind_speed_kmh: f64,
    pub weather_code: i32,
    pub visibility_m: f64,
    pub is_storm: bool,
    pub last_updated: i64,
}

pub type WeatherCache = Arc<RwLock<HashMap<u32, WeatherData>>>;

#[derive(Deserialize)]
struct OpenMeteoCurrent {
    wind_speed_10m: Option<f64>,
    weather_code: Option<i32>,
    visibility: Option<f64>,
}

#[derive(Deserialize)]
struct OpenMeteoResponse {
    #[allow(dead_code)]
    latitude: f64,
    #[allow(dead_code)]
    longitude: f64,
    current: Option<OpenMeteoCurrent>,
}

pub async fn run_weather_updater(cache: WeatherCache, grid: GridConfig) {
    loop {
        tracing::info!("Starting weather update cycle...");
        let total_cells = grid.total_cells();
        let batch_size = 100;
        let mut cells: Vec<u32> = (0..total_cells).collect();

        for chunk in cells.chunks(batch_size) {
            let mut lats = Vec::new();
            let mut lons = Vec::new();

            for &cell_id in chunk {
                let row = cell_id / grid.lon_divs;
                let col = cell_id % grid.lon_divs;
                let lat = grid.lat_min + (row as f64 + 0.5) * grid.lat_step;
                let lon = grid.lon_min + (col as f64 + 0.5) * grid.lon_step;
                lats.push(lat.to_string());
                lons.push(lon.to_string());
            }

            let lats_str = lats.join(",");
            let lons_str = lons.join(",");

            let url = format!(
                "http://api.open-meteo.com/v1/forecast?latitude={}&longitude={}&current=wind_speed_10m,weather_code,visibility",
                lats_str, lons_str
            );

            // Fetch synchronously using ureq inside spawn_blocking
            let url_clone = url.clone();
            let fetch_result = tokio::task::spawn_blocking(move || {
                ureq::get(&url_clone)
                    .timeout(std::time::Duration::from_secs(10))
                    .call()
                    .and_then(|resp| resp.into_json::<Vec<OpenMeteoResponse>>())
            })
            .await;

            match fetch_result {
                Ok(Ok(results)) => {
                    let mut c = cache.write().unwrap();
                    let now = chrono::Utc::now().timestamp_millis();
                    for (i, r) in results.into_iter().enumerate() {
                        let cell_id = chunk[i];
                        if let Some(curr) = r.current {
                            let w_code = curr.weather_code.unwrap_or(0);
                            let is_storm = w_code >= 65 || curr.wind_speed_10m.unwrap_or(0.0) > 60.0;
                            
                            c.insert(cell_id, WeatherData {
                                wind_speed_kmh: curr.wind_speed_10m.unwrap_or(0.0),
                                weather_code: w_code,
                                visibility_m: curr.visibility.unwrap_or(10000.0),
                                is_storm,
                                last_updated: now,
                            });
                        }
                    }
                }
                Ok(Err(e)) => {
                    tracing::error!("Weather API ureq error: {}", e);
                }
                Err(e) => {
                    tracing::error!("Tokio spawn_blocking error: {}", e);
                }
            }

            // Sleep 1 second between batches to avoid rate limit bursts
            sleep(Duration::from_secs(1)).await;
        }

        tracing::info!("Weather update cycle completed. Sleeping for 10 minutes.");
        sleep(Duration::from_secs(600)).await;
    }
}
