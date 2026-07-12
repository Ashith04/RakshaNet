use rand::Rng;
use chrono::Utc;
use std::f64::consts::PI;
use crate::models::{AisStreamMessage, MetaData, MessageWrapper, PositionReport, AisMessage};

const NM_TO_DEG_LAT: f64 = 1.0 / 60.0;

fn nm_to_deg_lon(nm: f64, lat: f64) -> f64 {
    let mut cos_lat = (lat * PI / 180.0).cos();
    if cos_lat < 1e-6 {
        cos_lat = 1e-6;
    }
    nm / 60.0 / cos_lat
}

#[derive(Debug, Clone, Copy, PartialEq)]
pub enum Behavior {
    Normal,
    ApproachingBorder,
    BorderCrossing,
    GeofenceEntry,
    AisSignalLoss,
    Stationary,
    VesselClusterA,
    VesselClusterB,
    RouteDeviation,
    SpeedAnomaly,
}

pub struct Vessel {
    pub mmsi: u32,
    pub name: String,
    pub lat: f64,
    pub lon: f64,
    pub speed: f64,
    pub heading: f64,
    pub behavior: Behavior,
    
    // Internal state
    pub state_timer: f64,
    pub target_lat: f64,
    pub target_lon: f64,
}

impl Vessel {
    pub fn new(mmsi: u32, behavior: Behavior) -> Self {
        let mut rng = rand::thread_rng();
        
        let mut v = Vessel {
            mmsi,
            name: format!("VESSEL_{}", mmsi),
            lat: rng.gen_range(5.0..25.0),
            lon: rng.gen_range(60.0..85.0),
            speed: rng.gen_range(5.0..15.0),
            heading: rng.gen_range(0.0..360.0),
            behavior,
            state_timer: 0.0,
            target_lat: 0.0,
            target_lon: 0.0,
        };

        // Custom spawns
        match behavior {
            Behavior::BorderCrossing | Behavior::ApproachingBorder => {
                v.lat = 22.0;
                v.lon = 67.5;
                v.heading = 315.0; // Heading NW towards Pak border
            },
            Behavior::GeofenceEntry => {
                v.lat = 10.0;
                v.lon = 72.0;
                v.heading = 45.0;
            },
            Behavior::Stationary => {
                v.speed = 0.0;
            },
            Behavior::VesselClusterA => {
                v.lat = 15.0;
                v.lon = 70.0;
                v.heading = 90.0;
            },
            Behavior::VesselClusterB => {
                v.lat = 15.005; // very close to A
                v.lon = 70.0;
                v.heading = 90.0;
            },
            _ => {}
        }
        v
    }

    pub fn tick(&mut self, dt: f64) {
        let mut rng = rand::thread_rng();
        self.state_timer += dt;

        match self.behavior {
            Behavior::Normal => {
                self.heading += rng.gen_range(-2.0..2.0) * dt;
                self.speed += rng.gen_range(-0.5..0.5) * dt;
                self.speed = self.speed.clamp(5.0, 20.0);
            },
            Behavior::ApproachingBorder => {
                // Keep heading NW
                self.heading = 315.0;
                self.speed = 12.0;
                if self.lat > 23.5 { 
                    self.lat = 22.0; // reset
                    self.lon = 67.5;
                }
            },
            Behavior::BorderCrossing => {
                // Crosses the border quickly
                self.heading = 315.0;
                self.speed = 25.0; // high speed
                if self.lat > 25.0 {
                    self.lat = 22.0;
                    self.lon = 67.5;
                }
            },
            Behavior::GeofenceEntry => {
                self.heading = 45.0;
                self.speed = 10.0;
                if self.lat > 13.0 {
                    self.lat = 10.0;
                    self.lon = 72.0;
                }
            },
            Behavior::AisSignalLoss => {
                self.heading += rng.gen_range(-1.0..1.0) * dt;
            },
            Behavior::Stationary => {
                self.speed = 0.0;
            },
            Behavior::VesselClusterA | Behavior::VesselClusterB => {
                self.heading = 90.0; // Move east together
                self.speed = 8.0;
            },
            Behavior::RouteDeviation => {
                if self.state_timer > 60.0 { // deviate every 60s
                    self.heading += 90.0; 
                    self.state_timer = 0.0;
                }
            },
            Behavior::SpeedAnomaly => {
                if self.state_timer > 30.0 {
                    self.speed = 45.0; // Impossible speed for cargo
                }
                if self.state_timer > 60.0 {
                    self.speed = 10.0;
                    self.state_timer = 0.0;
                }
            }
        }

        self.heading %= 360.0;
        if self.heading < 0.0 { self.heading += 360.0; }

        let heading_rad = self.heading * PI / 180.0;
        let nm_per_sec = self.speed / 3600.0;

        self.lat += nm_per_sec * NM_TO_DEG_LAT * heading_rad.cos() * dt;
        self.lon += nm_per_sec * nm_to_deg_lon(1.0, self.lat) * heading_rad.sin() * dt;

        // Bounce back if out of bounds (approx Arabian Sea)
        if self.lat < 2.0 || self.lat > 28.0 { self.heading = (self.heading + 180.0) % 360.0; }
        if self.lon < 55.0 || self.lon > 95.0 { self.heading = (self.heading + 180.0) % 360.0; }
    }

    pub fn to_message(&self) -> Option<AisStreamMessage> {
        // Handle AIS loss
        if self.behavior == Behavior::AisSignalLoss && (self.state_timer % 120.0) > 60.0 {
            return None; // Drop messages for 60s out of every 120s
        }

        let now = Utc::now();
        let time_str = now.format("%Y-%m-%d %H:%M:%S").to_string();

        Some(AisStreamMessage {
            MessageType: "PositionReport".to_string(),
            MetaData: MetaData {
                MMSI: self.mmsi,
                MMSI_String: self.mmsi.to_string(),
                ShipName: self.name.clone(),
                latitude: (self.lat * 1_000_000.0).round() / 1_000_000.0,
                longitude: (self.lon * 1_000_000.0).round() / 1_000_000.0,
                time_utc: time_str,
            },
            Message: MessageWrapper {
                PositionReport: PositionReport {
                    Ais: AisMessage {
                        UserID: self.mmsi,
                        MessageID: 1,
                        Valid: true,
                    },
                    Sog: (self.speed * 10.0).round() / 10.0,
                    Cog: (self.heading * 10.0).round() / 10.0,
                    Latitude: (self.lat * 1_000_000.0).round() / 1_000_000.0,
                    Longitude: (self.lon * 1_000_000.0).round() / 1_000_000.0,
                    TrueHeading: self.heading as u32,
                    Timestamp: now.timestamp_subsec_millis(),
                    NavigationalStatus: 0,
                }
            }
        })
    }
}
