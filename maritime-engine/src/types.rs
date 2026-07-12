use serde::{Deserialize, Serialize};
use std::collections::HashMap;
use std::collections::VecDeque;
use uuid::Uuid;

// ─── Source tagging ─────────────────────────────────────────────
#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "lowercase")]
pub enum DataSource {
    Live,
    Simulated,
}

// ─── Core AIS message (parsed from both aisstream + simulator) ─
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct AisMessage {
    pub mmsi: u32,
    pub latitude: f64,
    pub longitude: f64,
    pub sog: f32,
    pub cog: f32,
    pub timestamp: i64, // unix epoch millis
    pub ship_name: Option<String>,
    pub source: DataSource,
    #[serde(skip, default = "std::time::Instant::now")]
    pub ingest_time: std::time::Instant,
}

// ─── aisstream.io JSON structures ───────────────────────────────
#[derive(Debug, Deserialize)]
pub struct AisstreamEnvelope {
    #[serde(rename = "MessageType")]
    pub message_type: String,
    #[serde(rename = "MetaData")]
    pub meta_data: AisstreamMetaData,
    #[serde(rename = "Message")]
    pub message: AisstreamMessage,
}

#[derive(Debug, Deserialize)]
pub struct AisstreamMetaData {
    #[serde(rename = "MMSI")]
    pub mmsi: u32,
    #[serde(rename = "MMSI_String")]
    pub mmsi_string: Option<String>,
    #[serde(rename = "ShipName")]
    pub ship_name: Option<String>,
    pub latitude: f64,
    pub longitude: f64,
    pub time_utc: Option<String>,
}

#[derive(Debug, Deserialize)]
pub struct AisstreamMessage {
    #[serde(rename = "PositionReport")]
    pub position_report: Option<PositionReportData>,
}

#[derive(Debug, Deserialize)]
pub struct PositionReportData {
    #[serde(rename = "Sog")]
    pub sog: f32,
    #[serde(rename = "Cog")]
    pub cog: f32,
    #[serde(rename = "Latitude")]
    pub latitude: f64,
    #[serde(rename = "Longitude")]
    pub longitude: f64,
    #[serde(rename = "TrueHeading")]
    pub true_heading: Option<i32>,
    #[serde(rename = "Timestamp")]
    pub timestamp: Option<i32>,
    #[serde(rename = "NavigationalStatus")]
    pub navigational_status: Option<i32>,
    #[serde(rename = "Ais")]
    pub ais: Option<AisIdentifier>,
}

#[derive(Debug, Deserialize)]
pub struct AisIdentifier {
    #[serde(rename = "UserID")]
    pub user_id: Option<u32>,
    #[serde(rename = "MessageID")]
    pub message_id: Option<i32>,
    #[serde(rename = "Valid")]
    pub valid: Option<bool>,
}

impl AisstreamEnvelope {
    pub fn into_ais_message(self, source: DataSource, ingest_time: std::time::Instant) -> Option<AisMessage> {
        if self.message_type != "PositionReport" {
            return None;
        }
        let pr = self.message.position_report?;
        let mmsi = self.meta_data.mmsi;

        let timestamp = if let Some(ref time_str) = self.meta_data.time_utc {
            // Try to parse the Go-style timestamp from aisstream
            chrono::NaiveDateTime::parse_from_str(
                time_str.split('.').next().unwrap_or(time_str),
                "%Y-%m-%d %H:%M:%S",
            )
            .map(|dt| dt.and_utc().timestamp_millis())
            .unwrap_or_else(|_| chrono::Utc::now().timestamp_millis())
        } else {
            chrono::Utc::now().timestamp_millis()
        };

        Some(AisMessage {
            mmsi,
            latitude: pr.latitude,
            longitude: pr.longitude,
            sog: pr.sog,
            cog: pr.cog,
            timestamp,
            ship_name: self.meta_data.ship_name,
            source,
            ingest_time,
        })
    }
}

// ─── Position record in vessel history ──────────────────────────
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct PositionRecord {
    pub lat: f64,
    pub lon: f64,
    pub sog: f32,
    pub cog: f32,
    pub timestamp: i64,
}

// ─── Alert types and severities ─────────────────────────────────
#[derive(Debug, Clone, Copy, PartialEq, Eq, Hash, Serialize, Deserialize)]
#[serde(rename_all = "snake_case")]
pub enum AlertType {
    GeofenceViolation,
    Loitering,
    AisGap,
    Rendezvous,
    SpeedAnomaly,
    Spoofing,
}

impl std::fmt::Display for AlertType {
    fn fmt(&self, f: &mut std::fmt::Formatter<'_>) -> std::fmt::Result {
        match self {
            AlertType::GeofenceViolation => write!(f, "Geofence Violation"),
            AlertType::Loitering => write!(f, "Loitering"),
            AlertType::AisGap => write!(f, "AIS Gap"),
            AlertType::Rendezvous => write!(f, "Rendezvous"),
            AlertType::SpeedAnomaly => write!(f, "Speed Anomaly"),
            AlertType::Spoofing => write!(f, "Spoofing Detection"),
        }
    }
}

// ─── Spoofing Types ─────────────────────────────────────────────
#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "snake_case")]
pub enum SpoofingClassification {
    Normal,
    Suspicious,
    HighRisk,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct SpoofingDetails {
    pub classification: SpoofingClassification,
    pub anomalies: Vec<String>,
    pub risk_score: f64,
    pub calculated_speed_knots: Option<f64>,
    pub prev_location: Option<(f64, f64, i64)>, // lat, lon, timestamp
    pub curr_location: (f64, f64, i64),
    pub recommendation: String,
}

#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "lowercase")]
pub enum Severity {
    Low,
    Medium,
    High,
    Critical,
}

// ─── Weather Context ────────────────────────────────────────────
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct WeatherContext {
    pub wind_speed: f64,
    pub wave_height: f64,
    pub visibility: String,
    pub storm: bool,
    pub weather_impact: String,
}

// ─── Alert ──────────────────────────────────────────────────────
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct Alert {
    pub id: String,
    pub alert_type: AlertType,
    pub mmsi: u32,
    pub mmsi2: Option<u32>,
    pub latitude: f64,
    pub longitude: f64,
    pub severity: Severity,
    pub description: String,
    pub timestamp: i64,
    pub zone_name: Option<String>,
    pub spoofing_details: Option<SpoofingDetails>,
    pub weather_context: Option<WeatherContext>,
    pub priority: u8,
    pub risk_score: f64,
    pub confidence: f64,
    pub processing_latency_ms: f64,
    pub worker_id: usize,
}

impl Alert {
    pub fn new(
        alert_type: AlertType,
        mmsi: u32,
        lat: f64,
        lon: f64,
        severity: Severity,
        description: String,
    ) -> Self {
        Self {
            id: Uuid::new_v4().to_string(),
            alert_type,
            mmsi,
            mmsi2: None,
            latitude: lat,
            longitude: lon,
            severity,
            description,
            timestamp: chrono::Utc::now().timestamp_millis(),
            zone_name: None,
            spoofing_details: None,
            weather_context: None,
            priority: match alert_type {
                AlertType::GeofenceViolation => 1,
                AlertType::Rendezvous => 4,
                AlertType::AisGap => 3,
                AlertType::Loitering => 6,
                _ => 10,
            },
            risk_score: 50.0,
            confidence: 50.0,
            processing_latency_ms: 0.0,
            worker_id: 0,
        }
    }
}

// ─── Vessel status for dashboard ────────────────────────────────
#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "lowercase")]
pub enum VesselStatus {
    Normal,
    Warning,
    Violation,
    Rendezvous,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct VesselSnapshot {
    pub mmsi: u32,
    pub lat: f64,
    pub lon: f64,
    pub sog: f32,
    pub cog: f32,
    pub ship_name: Option<String>,
    pub status: VesselStatus,
}

// ─── Vessel state (per-worker, NOT shared) ──────────────────────
#[derive(Debug, Clone)]
pub struct VesselState {
    pub mmsi: u32,
    pub ship_name: Option<String>,
    pub history: VecDeque<PositionRecord>,
    pub last_seen: i64,
    pub alert_cooldowns: HashMap<AlertType, i64>,
    pub status: VesselStatus,
    pub cell_id: u32,
}

impl VesselState {
    pub fn new(mmsi: u32, cell_id: u32) -> Self {
        Self {
            mmsi,
            ship_name: None,
            history: VecDeque::with_capacity(12),
            last_seen: 0,
            alert_cooldowns: HashMap::new(),
            status: VesselStatus::Normal,
            cell_id,
        }
    }
}

// ─── Grid configuration (computed at startup) ───────────────────
#[derive(Debug, Clone)]
pub struct GridConfig {
    pub lat_min: f64,
    pub lat_max: f64,
    pub lon_min: f64,
    pub lon_max: f64,
    pub lat_step: f64,
    pub lon_step: f64,
    pub lat_divs: u32,
    pub lon_divs: u32,
}

impl GridConfig {
    pub fn new(lat_min: f64, lon_min: f64, lat_max: f64, lon_max: f64, lat_divs: u32, lon_divs: u32) -> Self {
        Self {
            lat_min,
            lat_max,
            lon_min,
            lon_max,
            lat_step: (lat_max - lat_min) / lat_divs as f64,
            lon_step: (lon_max - lon_min) / lon_divs as f64,
            lat_divs,
            lon_divs,
        }
    }

    /// O(1) cell ID computation — two arithmetic ops, zero allocation
    pub fn cell_id(&self, lat: f64, lon: f64) -> u32 {
        let lat_bucket = ((lat - self.lat_min) / self.lat_step) as u32;
        let lon_bucket = ((lon - self.lon_min) / self.lon_step) as u32;
        let lat_b = lat_bucket.min(self.lat_divs - 1);
        let lon_b = lon_bucket.min(self.lon_divs - 1);
        lat_b * self.lon_divs + lon_b
    }

    pub fn total_cells(&self) -> u32 {
        self.lat_divs * self.lon_divs
    }

    pub fn worker_for_cell(&self, cell: u32, num_workers: usize) -> usize {
        cell as usize % num_workers
    }
}
