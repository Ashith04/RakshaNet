mod models;
mod engine;

use clap::Parser;
use std::sync::Arc;
use tokio::net::UdpSocket;
use tokio::time::{interval, Duration, Instant};
use engine::{Vessel, Behavior};
use std::sync::atomic::{AtomicUsize, Ordering};

#[derive(Parser, Debug)]
#[command(author, version, about, long_about = None)]
struct Args {
    /// Messages per millisecond (1, 5, 10, 25, 50)
    #[arg(short, long, default_value_t = 1)]
    rate: usize,

    /// Number of normal vessels
    #[arg(short, long, default_value_t = 1000)]
    vessels: usize,

    /// Target UDP address (e.g., 127.0.0.1:9000)
    #[arg(short, long, default_value = "127.0.0.1:9000")]
    target: String,
}

#[tokio::main]
async fn main() -> Result<(), Box<dyn std::error::Error>> {
    let args = Args::parse();
    
    println!("╔══════════════════════════════════════════════════════════════╗");
    println!("║         RUST AIS GENERATOR – Starting                        ║");
    println!("╠══════════════════════════════════════════════════════════════╣");
    println!("║  Target:     {:<47}║", args.target);
    println!("║  Vessels:    {:<47}║", args.vessels + 9);
    println!("║  Rate:       {} msgs/ms ({:<34} msgs/s)║", args.rate, args.rate * 1000);
    println!("╚══════════════════════════════════════════════════════════════╝\n");

    let socket = UdpSocket::bind("0.0.0.0:0").await?;
    let socket = Arc::new(socket);
    socket.connect(&args.target).await?; // Connect to target so we can use send()

    let mut vessels = Vec::new();
    
    // Add anomalies
    vessels.push(Vessel::new(999000001, Behavior::ApproachingBorder));
    vessels.push(Vessel::new(999000002, Behavior::BorderCrossing));
    vessels.push(Vessel::new(999000003, Behavior::GeofenceEntry));
    vessels.push(Vessel::new(999000004, Behavior::AisSignalLoss));
    vessels.push(Vessel::new(999000005, Behavior::Stationary));
    vessels.push(Vessel::new(999000006, Behavior::VesselClusterA));
    vessels.push(Vessel::new(999000007, Behavior::VesselClusterB));
    vessels.push(Vessel::new(999000008, Behavior::RouteDeviation));
    vessels.push(Vessel::new(999000009, Behavior::SpeedAnomaly));

    // Add normal vessels
    for i in 0..args.vessels {
        vessels.push(Vessel::new(200000000 + i as u32, Behavior::Normal));
    }

    let total_vessels = vessels.len();
    let mut vessel_idx = 0;

    let mut tick_interval = interval(Duration::from_millis(1));
    let mut stats_interval = interval(Duration::from_secs(1));

    let messages_sent = Arc::new(AtomicUsize::new(0));
    let dropped_messages = Arc::new(AtomicUsize::new(0));

    let sent_clone = messages_sent.clone();
    let dropped_clone = dropped_messages.clone();

    // Stats task
    tokio::spawn(async move {
        let mut last_total = 0;
        let mut start_time = Instant::now();
        loop {
            stats_interval.tick().await;
            let current_total = sent_clone.load(Ordering::Relaxed);
            let dropped = dropped_clone.load(Ordering::Relaxed);
            let rate = current_total - last_total;
            let elapsed = start_time.elapsed().as_secs_f64();
            
            println!("Rate: {:<6} msg/s | Total: {:<9} | Dropped: {:<5} | Elapsed: {:.1}s", 
                     rate, current_total, dropped, elapsed);
                     
            last_total = current_total;
        }
    });

    let rate = args.rate;
    
    // Main loop
    loop {
        tick_interval.tick().await;
        
        let mut sent_in_tick = 0;
        
        for _ in 0..rate {
            let v = &mut vessels[vessel_idx];
            // 1s physics tick for every message generated. This makes them move faster
            // since they move 1s per message. If they send 5 messages/sec, they move 5s.
            // This is perfectly fine for stress testing realistic movement.
            v.tick(1.0); 
            
            if let Some(msg) = v.to_message() {
                if let Ok(json) = serde_json::to_string(&msg) {
                    let bytes = json.as_bytes();
                    match socket.try_send(bytes) {
                        Ok(_) => { sent_in_tick += 1; }
                        Err(ref e) if e.kind() == std::io::ErrorKind::WouldBlock => {
                            dropped_messages.fetch_add(1, Ordering::Relaxed);
                        }
                        Err(_) => {
                            dropped_messages.fetch_add(1, Ordering::Relaxed);
                        }
                    }
                }
            }
            vessel_idx = (vessel_idx + 1) % total_vessels;
        }
        
        messages_sent.fetch_add(sent_in_tick, Ordering::Relaxed);
    }
}
