use futures_util::{SinkExt, StreamExt};
use tokio::sync::mpsc;
use tokio_tungstenite::tungstenite::protocol::Message;

use crate::config::AisstreamConfig;
use crate::types::{AisMessage, AisstreamEnvelope, DataSource};

const AISSTREAM_URL: &str = "wss://stream.aisstream.io/v0/stream";
const MAX_RECONNECT_DELAY_SECS: u64 = 30;

/// AIS Stream WebSocket client
/// Connects to aisstream.io, subscribes to position reports,
/// and forwards parsed messages to the dispatcher.
pub async fn run(
    api_key: String,
    config: AisstreamConfig,
    tx: mpsc::Sender<AisMessage>,
) {
    let mut reconnect_delay = 1u64;

    loop {
        tracing::info!("Connecting to aisstream.io...");

        match connect_and_stream(&api_key, &config, &tx).await {
            Ok(_) => {
                tracing::warn!("aisstream.io connection closed normally");
                reconnect_delay = 1;
            }
            Err(e) => {
                tracing::error!("aisstream.io connection error: {}", e);
            }
        }

        tracing::info!("Reconnecting in {} seconds...", reconnect_delay);
        tokio::time::sleep(std::time::Duration::from_secs(reconnect_delay)).await;
        reconnect_delay = (reconnect_delay * 2).min(MAX_RECONNECT_DELAY_SECS);
    }
}

async fn connect_and_stream(
    api_key: &str,
    config: &AisstreamConfig,
    tx: &mpsc::Sender<AisMessage>,
) -> Result<(), Box<dyn std::error::Error + Send + Sync>> {
    let (ws_stream, _response) = tokio_tungstenite::connect_async(AISSTREAM_URL).await?;
    let (mut write, mut read) = ws_stream.split();

    tracing::info!("Connected to aisstream.io, sending subscription...");

    // Build subscription message
    let subscription = serde_json::json!({
        "APIKey": api_key,
        "BoundingBoxes": config.bounding_boxes,
        "FilterMessageTypes": ["PositionReport"]
    });

    write
        .send(Message::Text(subscription.to_string().into()))
        .await?;

    tracing::info!("Subscription sent, streaming position reports...");

    let mut msg_count: u64 = 0;

    while let Some(msg_result) = read.next().await {
        let msg = match msg_result {
            Ok(m) => m,
            Err(e) => {
                tracing::error!("WebSocket read error: {}", e);
                return Err(Box::new(e));
            }
        };

        let text = match msg {
            Message::Text(t) => t.to_string(),
            Message::Ping(data) => {
                // Respond to pings to keep connection alive
                let _ = write.send(Message::Pong(data)).await;
                continue;
            }
            Message::Close(_) => {
                tracing::info!("Server sent close frame");
                break;
            }
            _ => continue,
        };

        let ingest_time = std::time::Instant::now();

        // Parse the aisstream envelope
        match serde_json::from_str::<AisstreamEnvelope>(&text) {
            Ok(envelope) => {
                if let Some(ais_msg) = envelope.into_ais_message(DataSource::Live, ingest_time) {
                    if let Err(e) = tx.try_send(ais_msg) {
                        tracing::warn!("Dispatcher channel full, dropping live message: {}", e);
                    }
                    msg_count += 1;
                    if msg_count % 1000 == 0 {
                        tracing::debug!("Received {} live messages", msg_count);
                    }
                }
            }
            Err(e) => {
                tracing::trace!("Failed to parse aisstream message: {}", e);
            }
        }
    }

    Ok(())
}
