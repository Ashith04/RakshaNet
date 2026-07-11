use tokio::sync::mpsc;
use crate::types::{AisMessage, GridConfig};

/// Dispatcher: receives AIS messages from all sources, routes to the correct worker
/// based on geographic grid cell.
///
/// This is the ONLY work the dispatcher does per message:
/// 1. Compute cell_id from lat/lon (two integer arithmetic ops)
/// 2. Map cell_id → worker index (one modulo op)
/// 3. Send to worker channel (pointer move, no copy)
pub struct Dispatcher {
    grid: GridConfig,
    worker_txs: Vec<mpsc::Sender<AisMessage>>,
    num_workers: usize,
}

impl Dispatcher {
    pub fn new(grid: GridConfig, worker_txs: Vec<mpsc::Sender<AisMessage>>) -> Self {
        let num_workers = worker_txs.len();
        Self {
            grid,
            worker_txs,
            num_workers,
        }
    }

    /// Run the dispatcher loop: receive messages and route to workers
    pub async fn run(self, mut rx: mpsc::Receiver<AisMessage>) {
        tracing::info!(
            "Dispatcher started: grid {}×{} = {} cells → {} workers",
            self.grid.lat_divs,
            self.grid.lon_divs,
            self.grid.total_cells(),
            self.num_workers,
        );

        while let Some(msg) = rx.recv().await {
            let cell = self.grid.cell_id(msg.latitude, msg.longitude);
            let worker_idx = self.grid.worker_for_cell(cell, self.num_workers);

            // Non-blocking send: if worker is full, log and drop (back-pressure)
            if let Err(e) = self.worker_txs[worker_idx].try_send(msg) {
                match e {
                    mpsc::error::TrySendError::Full(_) => {
                        // Worker is overloaded — drop message rather than blocking dispatcher
                        tracing::warn!("Worker {} channel full, dropping message", worker_idx);
                    }
                    mpsc::error::TrySendError::Closed(_) => {
                        tracing::error!("Worker {} channel closed", worker_idx);
                    }
                }
            }
        }

        tracing::info!("Dispatcher shutting down");
    }
}
