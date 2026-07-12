use std::collections::HashMap;
use std::sync::atomic::Ordering;
use std::sync::{Arc, RwLock};

use axum::{
    extract::State,
    extract::ws::{Message, WebSocket, WebSocketUpgrade},
    response::{IntoResponse, Json},
    routing::get,
    Router,
};
use futures_util::{SinkExt, StreamExt};
use tokio::sync::broadcast;
use tower_http::cors::{Any, CorsLayer};

use crate::alerting::AlertHistory;
use crate::metrics::EngineMetrics;
use crate::spatial_index::SpatialIndex;
use crate::types::{Alert, VesselSnapshot};

/// Shared state for the dashboard server
#[derive(Clone)]
pub struct DashboardState {
    pub metrics: Arc<EngineMetrics>,
    pub spatial: Arc<SpatialIndex>,
    pub vessel_snapshots: Arc<RwLock<HashMap<u32, VesselSnapshot>>>,
    pub alert_broadcast: broadcast::Sender<Alert>,
    pub alert_history: AlertHistory,
    pub bounding_box: BoundingBox,
    pub weather_cache: crate::weather_service::WeatherCache,
    pub pre_departure_cache: crate::pre_departure::PreDepartureCache,
}

#[derive(Debug, Clone, serde::Serialize)]
pub struct BoundingBox {
    pub lat_min: f64,
    pub lon_min: f64,
    pub lat_max: f64,
    pub lon_max: f64,
}

/// Start the dashboard HTTP + WebSocket server
pub async fn run(state: DashboardState, listen_addr: String) {
    let cors = CorsLayer::new()
        .allow_origin(Any)
        .allow_methods(Any)
        .allow_headers(Any);

    let app = Router::new()
        .route("/ws/alerts", get(ws_alerts_handler))
        .route("/ws/vessels", get(ws_vessels_handler))
        .route("/api/stats", get(stats_handler))
        .route("/api/config", get(config_handler))
        .route("/api/weather", get(weather_handler))
        .route("/api/pre-departure", get(pre_departure_handler))
        .layer(cors)
        .with_state(state);

    let listener = match tokio::net::TcpListener::bind(&listen_addr).await {
        Ok(l) => {
            tracing::info!("Dashboard server listening on {}", listen_addr);
            l
        }
        Err(e) => {
            tracing::error!("Failed to bind dashboard server to {}: {}", listen_addr, e);
            return;
        }
    };

    if let Err(e) = axum::serve(listener, app).await {
        tracing::error!("Dashboard server error: {}", e);
    }
}

// ─── WebSocket: Alert stream ────────────────────────────────────

async fn ws_alerts_handler(
    ws: WebSocketUpgrade,
    State(state): State<DashboardState>,
) -> impl IntoResponse {
    ws.on_upgrade(move |socket| handle_alert_socket(socket, state))
}

async fn handle_alert_socket(socket: WebSocket, state: DashboardState) {
    let (mut sender, mut _receiver) = socket.split();

    // Send recent history first
    let history = state.alert_history.get_recent().await;
    for alert in history {
        if let Ok(json) = serde_json::to_string(&alert) {
            if sender.send(Message::Text(json.into())).await.is_err() {
                return;
            }
        }
    }

    // Subscribe to live alerts
    let mut rx = state.alert_broadcast.subscribe();

    loop {
        match rx.recv().await {
            Ok(alert) => {
                if let Ok(json) = serde_json::to_string(&alert) {
                    if sender.send(Message::Text(json.into())).await.is_err() {
                        break;
                    }
                }
            }
            Err(broadcast::error::RecvError::Lagged(n)) => {
                tracing::warn!("Alert WebSocket client lagged {} messages", n);
            }
            Err(broadcast::error::RecvError::Closed) => break,
        }
    }
}

// ─── WebSocket: Vessel position stream ──────────────────────────

async fn ws_vessels_handler(
    ws: WebSocketUpgrade,
    State(state): State<DashboardState>,
) -> impl IntoResponse {
    ws.on_upgrade(move |socket| handle_vessel_socket(socket, state))
}

async fn handle_vessel_socket(socket: WebSocket, state: DashboardState) {
    let (mut sender, mut _receiver) = socket.split();

    let mut interval = tokio::time::interval(std::time::Duration::from_millis(500));

    loop {
        interval.tick().await;

        let vessels: Vec<VesselSnapshot> = {
            match state.vessel_snapshots.read() {
                Ok(snapshots) => snapshots.values().cloned().collect(),
                Err(_) => continue,
            }
        };

        if let Ok(json) = serde_json::to_string(&vessels) {
            if sender.send(Message::Text(json.into())).await.is_err() {
                break;
            }
        }
    }
}

// ─── REST: Stats ────────────────────────────────────────────────

#[derive(serde::Serialize)]
struct StatsResponse {
    messages_per_second: u64,
    avg_latency_us: u64,
    p50_latency_us: u64,
    p95_latency_us: u64,
    p99_latency_us: u64,
    alerts_total: u64,
    active_vessels: u64,
    alerts_last_minute: u64,
    source: String,
}

async fn stats_handler(State(state): State<DashboardState>) -> Json<StatsResponse> {
    let m = &state.metrics;
    Json(StatsResponse {
        messages_per_second: m.messages_per_second.load(Ordering::Relaxed),
        avg_latency_us: m.avg_latency_us(),
        p50_latency_us: m.p50_latency_us.load(Ordering::Relaxed),
        p95_latency_us: m.p95_latency_us.load(Ordering::Relaxed),
        p99_latency_us: m.p99_latency_us.load(Ordering::Relaxed),
        alerts_total: m.alerts_total.load(Ordering::Relaxed),
        active_vessels: m.active_vessels.load(Ordering::Relaxed),
        alerts_last_minute: m.alerts_last_minute.load(Ordering::Relaxed),
        source: m.current_source().to_string(),
    })
}

// ─── REST: Config (geofence zones for dashboard) ────────────────

#[derive(serde::Serialize)]
struct ConfigResponse {
    zones: Vec<crate::spatial_index::ZoneInfo>,
    bounding_box: BoundingBox,
}

async fn config_handler(State(state): State<DashboardState>) -> Json<ConfigResponse> {
    Json(ConfigResponse {
        zones: state.spatial.get_zones(),
        bounding_box: state.bounding_box.clone(),
    })
}

// ─── REST: Weather Cache ───────────────────────────────────────────
async fn weather_handler(State(state): State<DashboardState>) -> Json<std::collections::HashMap<u32, crate::weather_service::WeatherData>> {
    let cache = state.weather_cache.read().unwrap();
    Json(cache.clone())
}

// ─── REST: Pre-Departure Cache ─────────────────────────────────────
async fn pre_departure_handler(State(state): State<DashboardState>) -> Json<std::collections::HashMap<u32, crate::pre_departure::PreDepartureReport>> {
    let cache = state.pre_departure_cache.read().unwrap();
    Json(cache.clone())
}
