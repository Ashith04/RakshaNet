use serde::{Serialize, Deserialize};

#[derive(Serialize, Deserialize, Debug, Clone)]
pub struct AisMessage {
    pub UserID: u32,
    pub MessageID: u32,
    pub Valid: bool,
}

#[derive(Serialize, Deserialize, Debug, Clone)]
pub struct PositionReport {
    pub Ais: AisMessage,
    pub Sog: f64,
    pub Cog: f64,
    pub Latitude: f64,
    pub Longitude: f64,
    pub TrueHeading: u32,
    pub Timestamp: u32,
    pub NavigationalStatus: u32,
}

#[derive(Serialize, Deserialize, Debug, Clone)]
pub struct MessageWrapper {
    pub PositionReport: PositionReport,
}

#[derive(Serialize, Deserialize, Debug, Clone)]
pub struct MetaData {
    pub MMSI: u32,
    pub MMSI_String: String,
    pub ShipName: String,
    pub latitude: f64,
    pub longitude: f64,
    pub time_utc: String,
}

#[derive(Serialize, Deserialize, Debug, Clone)]
pub struct AisStreamMessage {
    pub MessageType: String,
    pub MetaData: MetaData,
    pub Message: MessageWrapper,
}
