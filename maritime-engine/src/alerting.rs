use std::collections::VecDeque;
use std::sync::Arc;

use tokio::sync::{broadcast, mpsc};

use crate::metrics::EngineMetrics;
use crate::types::Alert;

const MAX_ALERT_HISTORY: usize = 100;

/// Alerting subsystem: receives alerts from workers, logs them, and broadcasts
/// to all connected dashboard WebSocket clients.
pub struct Alerter {
    rx: mpsc::Receiver<Alert>,
    broadcast_tx: broadcast::Sender<Alert>,
    metrics: Arc<EngineMetrics>,
    history: VecDeque<Alert>,
}

impl Alerter {
    pub fn new(
        rx: mpsc::Receiver<Alert>,
        broadcast_tx: broadcast::Sender<Alert>,
        metrics: Arc<EngineMetrics>,
    ) -> Self {
        Self {
            rx,
            broadcast_tx,
            metrics,
            history: VecDeque::with_capacity(MAX_ALERT_HISTORY + 1),
        }
    }

    pub async fn run(mut self) {
        tracing::info!("Alerter started");

        while let Some(alert) = self.rx.recv().await {
            // Log the alert
            tracing::warn!(
                "[ALERT] {} | MMSI: {} | {} | Severity: {:?} | {}",
                alert.alert_type,
                alert.mmsi,
                alert.zone_name.as_deref().unwrap_or("N/A"),
                alert.severity,
                alert.description,
            );

            // Store in history
            self.history.push_back(alert.clone());
            if self.history.len() > MAX_ALERT_HISTORY {
                self.history.pop_front();
            }

            // Broadcast to dashboard clients (don't block if no receivers)
            let _ = self.broadcast_tx.send(alert);
        }

        tracing::info!("Alerter shutting down");
    }

    /// Get recent alert history (for new dashboard connections)
    pub fn get_history(&self) -> &VecDeque<Alert> {
        &self.history
    }
}

/// Shared alert history for new WebSocket connections
#[derive(Clone)]
pub struct AlertHistory {
    inner: Arc<tokio::sync::RwLock<VecDeque<Alert>>>,
}

impl AlertHistory {
    pub fn new() -> Self {
        Self {
            inner: Arc::new(tokio::sync::RwLock::new(VecDeque::with_capacity(MAX_ALERT_HISTORY + 1))),
        }
    }

    pub async fn push(&self, alert: Alert) {
        let mut history = self.inner.write().await;
        history.push_back(alert);
        if history.len() > MAX_ALERT_HISTORY {
            history.pop_front();
        }
    }

    pub async fn get_recent(&self) -> Vec<Alert> {
        self.inner.read().await.iter().cloned().collect()
    }
}

/// Run the alerter with priority queueing
pub async fn run_alerter(
    mut high_rx: mpsc::Receiver<Alert>,
    mut low_rx: mpsc::Receiver<Alert>,
    broadcast_tx: broadcast::Sender<Alert>,
    history: AlertHistory,
    metrics: Arc<EngineMetrics>,
) {
    tracing::info!("Alerter started");

    loop {
        // Priority loop: drain high priority completely before touching low priority
        let mut processed_high = true;
        while processed_high {
            processed_high = false;
            while let Ok(alert) = high_rx.try_recv() {
                process_alert(alert, &history, &broadcast_tx).await;
                processed_high = true;
            }
        }

        tokio::select! {
            Some(alert) = high_rx.recv() => {
                process_alert(alert, &history, &broadcast_tx).await;
            }
            Some(alert) = low_rx.recv() => {
                process_alert(alert, &history, &broadcast_tx).await;
            }
            else => break, // Both channels closed
        }
    }

    tracing::info!("Alerter shutting down");
}

async fn process_alert(alert: Alert, history: &AlertHistory, broadcast_tx: &broadcast::Sender<Alert>) {
        tracing::warn!(
            "[ALERT] {} | MMSI: {} | {} | {:?} | {}",
            alert.alert_type,
            alert.mmsi,
            alert.zone_name.as_deref().unwrap_or("N/A"),
            alert.severity,
            alert.description,
        );

        // Store in history
        history.push(alert.clone()).await;

        // Broadcast to dashboard clients
        let _ = broadcast_tx.send(alert);
}
