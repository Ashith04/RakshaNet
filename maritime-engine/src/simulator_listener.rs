use tokio::net::UdpSocket;
use tokio::sync::mpsc;

use crate::types::{AisMessage, AisstreamEnvelope, DataSource};

/// UDP listener for the Python simulator.
/// Receives datagrams in aisstream.io JSON format, parses, and forwards to dispatcher.
pub async fn run(
    listen_addr: String,
    tx: mpsc::Sender<AisMessage>,
) {
    let socket = match UdpSocket::bind(&listen_addr).await {
        Ok(s) => {
            tracing::info!("Simulator UDP listener bound to {}", listen_addr);
            s
        }
        Err(e) => {
            tracing::error!("Failed to bind UDP socket on {}: {}", listen_addr, e);
            return;
        }
    };

    let mut buf = vec![0u8; 65535]; // max UDP datagram size
    let mut msg_count: u64 = 0;
    let mut err_count: u64 = 0;

    loop {
        // Batch draining: process multiple packets per wake
        match socket.recv_from(&mut buf).await {
            Ok((len, _addr)) => {
                let data = &buf[..len];

                // Parse JSON
                match serde_json::from_slice::<AisstreamEnvelope>(data) {
                    Ok(envelope) => {
                        if let Some(ais_msg) = envelope.into_ais_message(DataSource::Simulated) {
                            if let Err(_) = tx.try_send(ais_msg) {
                                // Back-pressure: dispatcher is full
                            }
                            msg_count += 1;
                            if msg_count % 10000 == 0 {
                                tracing::debug!(
                                    "Simulator: received {} messages ({} parse errors)",
                                    msg_count,
                                    err_count,
                                );
                            }
                        }
                    }
                    Err(e) => {
                        err_count += 1;
                        if err_count <= 10 || err_count % 1000 == 0 {
                            tracing::warn!(
                                "Failed to parse simulator message ({} bytes): {}",
                                len,
                                e
                            );
                        }
                    }
                }

                // Try to drain more packets without yielding (batch processing)
                loop {
                    match socket.try_recv_from(&mut buf) {
                        Ok((len, _addr)) => {
                            let data = &buf[..len];
                            if let Ok(envelope) = serde_json::from_slice::<AisstreamEnvelope>(data) {
                                if let Some(ais_msg) = envelope.into_ais_message(DataSource::Simulated) {
                                    let _ = tx.try_send(ais_msg);
                                    msg_count += 1;
                                }
                            }
                        }
                        Err(_) => break, // No more packets ready
                    }
                }
            }
            Err(e) => {
                tracing::error!("UDP recv error: {}", e);
                tokio::time::sleep(std::time::Duration::from_millis(100)).await;
            }
        }
    }
}
