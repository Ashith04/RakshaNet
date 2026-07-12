use std::sync::atomic::{AtomicU64, Ordering};
use std::sync::Arc;

/// Lock-free engine metrics using atomic counters.
/// Shared via Arc across all workers and the dashboard server.
#[derive(Debug)]
pub struct EngineMetrics {
    pub messages_processed: AtomicU64,
    pub messages_per_second: AtomicU64,
    pub alerts_total: AtomicU64,
    pub alerts_last_minute: AtomicU64,
    pub active_vessels: AtomicU64,
    pub latency_sum_us: AtomicU64,
    pub latency_count: AtomicU64,
    pub source_live_count: AtomicU64,
    pub source_sim_count: AtomicU64,

    // Internal: used by the aggregator task
    last_snapshot_msgs: AtomicU64,
    alert_ring: std::sync::Mutex<std::collections::VecDeque<i64>>, // timestamps of recent alerts
    
    // Latency sampling for P95/P99
    latency_samples: std::sync::Mutex<Vec<u64>>,
    pub p50_latency_us: AtomicU64,
    pub p95_latency_us: AtomicU64,
    pub p99_latency_us: AtomicU64,
}

impl EngineMetrics {
    pub fn new() -> Arc<Self> {
        Arc::new(Self {
            messages_processed: AtomicU64::new(0),
            messages_per_second: AtomicU64::new(0),
            alerts_total: AtomicU64::new(0),
            alerts_last_minute: AtomicU64::new(0),
            active_vessels: AtomicU64::new(0),
            latency_sum_us: AtomicU64::new(0),
            latency_count: AtomicU64::new(0),
            source_live_count: AtomicU64::new(0),
            source_sim_count: AtomicU64::new(0),
            last_snapshot_msgs: AtomicU64::new(0),
            alert_ring: std::sync::Mutex::new(std::collections::VecDeque::with_capacity(1024)),
            latency_samples: std::sync::Mutex::new(Vec::with_capacity(1000)),
            p50_latency_us: AtomicU64::new(0),
            p95_latency_us: AtomicU64::new(0),
            p99_latency_us: AtomicU64::new(0),
        })
    }

    /// Record a processed message
    pub fn record_message(&self) {
        self.messages_processed.fetch_add(1, Ordering::Relaxed);
    }

    /// Record message latency in microseconds
    pub fn record_latency(&self, latency_us: u64) {
        self.latency_sum_us.fetch_add(latency_us, Ordering::Relaxed);
        let count = self.latency_count.fetch_add(1, Ordering::Relaxed);
        
        // Sample 1 out of every 100 messages to avoid lock contention at 50k TPS
        if count % 100 == 0 {
            if let Ok(mut samples) = self.latency_samples.try_lock() {
                if samples.len() < 1000 {
                    samples.push(latency_us);
                }
            }
        }
    }

    /// Record an alert
    pub fn record_alert(&self) {
        self.alerts_total.fetch_add(1, Ordering::Relaxed);
        let now = chrono::Utc::now().timestamp_millis();
        if let Ok(mut ring) = self.alert_ring.lock() {
            ring.push_back(now);
        }
    }

    /// Record message source
    pub fn record_source(&self, is_live: bool) {
        if is_live {
            self.source_live_count.fetch_add(1, Ordering::Relaxed);
        } else {
            self.source_sim_count.fetch_add(1, Ordering::Relaxed);
        }
    }

    /// Get average latency in microseconds
    pub fn avg_latency_us(&self) -> u64 {
        let count = self.latency_count.load(Ordering::Relaxed);
        if count == 0 {
            return 0;
        }
        self.latency_sum_us.load(Ordering::Relaxed) / count
    }

    /// Determine current data source
    pub fn current_source(&self) -> &'static str {
        let live = self.source_live_count.load(Ordering::Relaxed);
        let sim = self.source_sim_count.load(Ordering::Relaxed);
        match (live > 0, sim > 0) {
            (true, true) => "both",
            (true, false) => "live",
            (false, true) => "simulated",
            (false, false) => "none",
        }
    }

    /// Called every second by the metrics aggregator task
    pub fn tick(&self) {
        // Compute msgs/sec
        let current = self.messages_processed.load(Ordering::Relaxed);
        let last = self.last_snapshot_msgs.swap(current, Ordering::Relaxed);
        self.messages_per_second.store(current.saturating_sub(last), Ordering::Relaxed);

        // Compute alerts in last 60 seconds
        let cutoff = chrono::Utc::now().timestamp_millis() - 60_000;
        if let Ok(mut ring) = self.alert_ring.lock() {
            while ring.front().map_or(false, |&t| t < cutoff) {
                ring.pop_front();
            }
            self.alerts_last_minute.store(ring.len() as u64, Ordering::Relaxed);
        }

        // Compute P95 and P99
        if let Ok(mut samples) = self.latency_samples.lock() {
            if !samples.is_empty() {
                samples.sort_unstable();
                let p50_idx = (samples.len() as f64 * 0.50) as usize;
                let p95_idx = (samples.len() as f64 * 0.95) as usize;
                let p99_idx = (samples.len() as f64 * 0.99) as usize;
                
                self.p50_latency_us.store(samples[p50_idx.min(samples.len() - 1)], Ordering::Relaxed);
                self.p95_latency_us.store(samples[p95_idx.min(samples.len() - 1)], Ordering::Relaxed);
                self.p99_latency_us.store(samples[p99_idx.min(samples.len() - 1)], Ordering::Relaxed);
                
                samples.clear();
            } else {
                self.p50_latency_us.store(0, Ordering::Relaxed);
                self.p95_latency_us.store(0, Ordering::Relaxed);
                self.p99_latency_us.store(0, Ordering::Relaxed);
            }
        }

        // Reset per-second source counters
        self.source_live_count.store(0, Ordering::Relaxed);
        self.source_sim_count.store(0, Ordering::Relaxed);
    }
}

/// Spawn the background metrics aggregator (ticks every second)
pub fn spawn_metrics_aggregator(metrics: Arc<EngineMetrics>) -> tokio::task::JoinHandle<()> {
    tokio::spawn(async move {
        let mut interval = tokio::time::interval(std::time::Duration::from_secs(1));
        loop {
            interval.tick().await;
            metrics.tick();

            let mps = metrics.messages_per_second.load(Ordering::Relaxed);
            let lat = metrics.avg_latency_us();
            let p95 = metrics.p95_latency_us.load(Ordering::Relaxed);
            let p99 = metrics.p99_latency_us.load(Ordering::Relaxed);
            let vessels = metrics.active_vessels.load(Ordering::Relaxed);
            let alerts = metrics.alerts_last_minute.load(Ordering::Relaxed);

            if mps > 0 {
                tracing::info!(
                    "[STATS] msgs/sec: {} | lat(avg/p95/p99): {}/{}/{}μs | vessels: {} | alerts/min: {} | source: {}",
                    mps,
                    lat, p95, p99,
                    vessels,
                    alerts,
                    metrics.current_source()
                );
            }
        }
    })
}
