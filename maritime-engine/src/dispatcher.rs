use tokio::sync::mpsc;
use std::collections::{HashMap, HashSet};
use crate::types::{AisMessage, GridConfig};

/// Dispatcher: receives AIS messages from all sources, routes to the correct worker
/// based on geographic geohash prefix cell.
pub struct Dispatcher {
    grid: GridConfig,
    worker_txs: Vec<mpsc::Sender<AisMessage>>,
    num_workers: usize,
    geohash_map: HashMap<String, usize>,
    geohash_precision: usize,
}

impl Dispatcher {
    pub fn new(grid: GridConfig, worker_txs: Vec<mpsc::Sender<AisMessage>>, geohash_precision: usize) -> Self {
        let num_workers = worker_txs.len();
        
        let mut unique_hashes = HashSet::new();
        let step = 0.02; // Approx 2.2km step to ensure we capture all precision 5 geohashes
        let mut lat = grid.lat_min;
        while lat <= grid.lat_max {
            let mut lon = grid.lon_min;
            while lon <= grid.lon_max {
                let coord = geohash::Coord { x: lon, y: lat };
                if let Ok(gh) = geohash::encode(coord, geohash_precision) {
                    unique_hashes.insert(gh);
                }
                lon += step;
            }
            lat += step;
        }

        let mut geohash_map = HashMap::new();
        let mut i = 0;
        for gh in unique_hashes {
            geohash_map.insert(gh, i % num_workers);
            i += 1;
        }

        Self {
            grid,
            worker_txs,
            num_workers,
            geohash_map,
            geohash_precision,
        }
    }

    /// Run the dispatcher loop: receive messages and route to workers
    pub async fn run(self, mut rx: mpsc::Receiver<AisMessage>) {
        tracing::info!(
            "Dispatcher started: geohash precision {} → {} unique prefixes across {} workers",
            self.geohash_precision,
            self.geohash_map.len(),
            self.num_workers,
        );

        while let Some(msg) = rx.recv().await {
            let coord = geohash::Coord { x: msg.longitude, y: msg.latitude };
            let worker_idx = match geohash::encode(coord, self.geohash_precision) {
                Ok(gh) => {
                    if let Some(&idx) = self.geohash_map.get(&gh) {
                        idx
                    } else {
                        // Fallback if out of bounding box bounds
                        (msg.mmsi as usize) % self.num_workers
                    }
                }
                Err(_) => (msg.mmsi as usize) % self.num_workers,
            };

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
