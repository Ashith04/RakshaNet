use serde::Deserialize;

#[derive(Debug, Clone, Deserialize)]
pub struct AppConfig {
    pub aisstream: AisstreamConfig,
    pub engine: EngineConfig,
    pub detection: DetectionConfig,
    #[serde(default = "default_geohash_precision")]
    pub geohash_precision: usize,
}

fn default_geohash_precision() -> usize {
    5
}

#[derive(Debug, Clone, Deserialize)]
pub struct AisstreamConfig {
    pub bounding_boxes: Vec<Vec<[f64; 2]>>,
}

#[derive(Debug, Clone, Deserialize)]
pub struct EngineConfig {
    pub num_workers: usize,
    pub grid_lat_divisions: u32,
    pub grid_lon_divisions: u32,
    pub udp_listen_addr: String,
    pub dashboard_addr: String,
    pub vessel_ttl_secs: i64,
    pub gap_scan_interval_secs: u64,
}

#[derive(Debug, Clone, Deserialize)]
pub struct DetectionConfig {
    pub geofence: GeofenceConfig,
    pub loitering: LoiteringConfig,
    pub ais_gap: AisGapConfig,
    pub rendezvous: RendezvousConfig,
    pub anomaly: AnomalyConfig,
    pub spoofing: SpoofingConfig,
}

#[derive(Debug, Clone, Deserialize)]
pub struct GeofenceConfig {
    pub zones: Vec<ZoneConfig>,
}

#[derive(Debug, Clone, Deserialize)]
pub struct ZoneConfig {
    pub name: String,
    pub polygon: Vec<[f64; 2]>, // [lon, lat] pairs
}

#[derive(Debug, Clone, Deserialize)]
pub struct LoiteringConfig {
    pub speed_threshold_knots: f32,
    pub radius_nm: f64,
    pub min_duration_secs: i64,
    pub cooldown_secs: i64,
}

#[derive(Debug, Clone, Deserialize)]
pub struct AisGapConfig {
    pub max_silence_secs: i64,
    pub near_zone_radius_nm: f64,
    pub near_zone_severity_boost: bool,
}

#[derive(Debug, Clone, Deserialize)]
pub struct RendezvousConfig {
    pub max_distance_nm: f64,
    pub speed_match_tolerance_knots: f32,
    pub min_duration_secs: i64,
    pub proximity_grid_cell_nm: f64,
}

#[derive(Debug, Clone, Deserialize)]
pub struct AnomalyConfig {
    pub max_speed_knots: f32,
    pub max_jump_nm: f64,
}

#[derive(Debug, Clone, Deserialize)]
pub struct SpoofingConfig {
    pub max_realistic_speed_knots: f64,
    pub max_jump_distance_km: f64,
    pub max_heading_change_deg_per_sec: f64,
    pub weight_impossible_speed: f64,
    pub weight_long_jump: f64,
    pub weight_duplicate_mmsi: f64,
    pub weight_heading_change: f64,
    pub weight_impossible_grid: f64,
    pub weight_identity_change: f64,
}

impl AppConfig {
    pub fn load(path: &str) -> Result<Self, Box<dyn std::error::Error>> {
        let content = std::fs::read_to_string(path)?;
        let config: AppConfig = toml::from_str(&content)?;
        Ok(config)
    }

    /// Extract bounding box extents from config
    pub fn bounding_box_extents(&self) -> (f64, f64, f64, f64) {
        let mut lat_min = 90.0_f64;
        let mut lat_max = -90.0_f64;
        let mut lon_min = 180.0_f64;
        let mut lon_max = -180.0_f64;

        for bbox in &self.aisstream.bounding_boxes {
            if bbox.len() >= 2 {
                lat_min = lat_min.min(bbox[0][0]);
                lon_min = lon_min.min(bbox[0][1]);
                lat_max = lat_max.max(bbox[1][0]);
                lon_max = lon_max.max(bbox[1][1]);
            }
        }

        (lat_min, lon_min, lat_max, lon_max)
    }
}
