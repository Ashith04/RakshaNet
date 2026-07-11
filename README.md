# Maritime Surveillance Engine

Real-time AIS-based vessel surveillance system that detects malicious/illegal maritime activity at 50,000+ messages/second on a single machine.

## Architecture

```
┌─────────────────┐    ┌──────────────────┐
│  aisstream.io   │    │  Python Simulator │
│  (live AIS)     │    │  (UDP stress test)│
└───────┬─────────┘    └────────┬──────────┘
        │ WSS                   │ UDP
        ▼                       ▼
┌───────────────────────────────────────────┐
│              DISPATCHER                    │
│   Grid hash → worker routing (O(1))        │
└───┬───────┬───────┬───────┬───────────────┘
    ▼       ▼       ▼       ▼
┌──────┐┌──────┐┌──────┐┌──────┐
│ W-0  ││ W-1  ││ W-2  ││ W-N  │  ← Independent workers
│R-Tree││R-Tree││R-Tree││R-Tree│     (one per CPU core)
│Vessel││Vessel││Vessel││Vessel│
│ Map  ││ Map  ││ Map  ││ Map  │
└──┬───┘└──┬───┘└──┬───┘└──┬───┘
   └───────┴───────┴───────┘
                │ Alerts
                ▼
        ┌───────────────┐
        │   ALERTER     │──→ WebSocket broadcast
        └───────────────┘
                │
                ▼
        ┌───────────────┐
        │  Dashboard    │  React + Leaflet.js
        │  (Browser)    │
        └───────────────┘
```

## Components

| Component | Directory | Technology |
|-----------|-----------|------------|
| Surveillance Engine | `maritime-engine/` | Rust (tokio, axum, rstar) |
| Stress Test Simulator | `simulator/` | Python (stdlib only) |
| Live Dashboard | `dashboard/` | React + Leaflet.js |

## Quick Start

### Prerequisites

- **Rust** (1.70+): https://rustup.rs
- **Python** (3.8+)
- **Node.js** (18+): for the dashboard

### 1. Start the Rust Engine

```bash
cd maritime-engine

# Without live AIS data (simulator only)
cargo run --release

# With live AIS data
AISSTREAM_API_KEY=your_key_here cargo run --release
```

The engine starts:
- Dashboard server on `http://localhost:8080`
- UDP listener for simulator on `0.0.0.0:9000`

### 2. Start the Python Simulator

```bash
cd simulator

# Low rate for testing
python simulator.py --rate 100 --duration 60

# Full stress test (50k msgs/sec)
python simulator.py --rate 50000 --duration 120

# Custom vessel count
python simulator.py --rate 10000 --vessels 2000 --duration 300
```

### 3. Start the Dashboard

```bash
cd dashboard
npm install
npm run dev
```

Open `http://localhost:5173` in your browser.

## Getting an aisstream.io API Key

1. Go to https://aisstream.io
2. Sign up with GitHub (free)
3. Copy your API key from the dashboard
4. Set it as an environment variable:

```bash
# Linux/Mac
export AISSTREAM_API_KEY=your_key_here

# Windows PowerShell
$env:AISSTREAM_API_KEY="your_key_here"

# Windows CMD
set AISSTREAM_API_KEY=your_key_here
```

## Switching Between Live and Simulated Feeds

The engine accepts **both simultaneously**. The dashboard shows which source is active:
- 🟢 **LIVE** — receiving from aisstream.io
- 🟠 **SIMULATED** — receiving from Python simulator
- 🔵 **BOTH** — receiving from both sources

To run simulator-only: don't set `AISSTREAM_API_KEY`.
To run live-only: set the API key and don't start the simulator.

## Scaling Workers

Workers scale linearly with CPU cores:

```bash
# Auto-detect (default) — uses all available cores
cargo run --release

# Manual override via config.toml
# Set num_workers = 4  (or 8, 16, etc.)
```

To demonstrate linear scaling:
1. Set `num_workers = 2` in config.toml, run simulator at 50k msg/s, note throughput
2. Set `num_workers = 4`, repeat — throughput should roughly double
3. Set `num_workers = 8`, repeat — throughput should roughly quadruple

## Configuration

All settings are in `maritime-engine/config.toml`:

| Section | Key Settings |
|---------|-------------|
| `[aisstream]` | Bounding box for live data subscription |
| `[engine]` | Worker count, grid divisions, UDP/HTTP ports |
| `[detection.geofence]` | Restricted zone polygons |
| `[detection.loitering]` | Speed threshold, radius, duration |
| `[detection.ais_gap]` | Silence timeout, near-zone severity boost |
| `[detection.rendezvous]` | Distance, speed match, duration |
| `[detection.anomaly]` | Max speed, max position jump |

## Detection Types

| Detection | Trigger | Severity |
|-----------|---------|----------|
| **Geofence Violation** | Vessel enters restricted zone | 🔴 Critical |
| **Loitering** | Low speed + small displacement over time | 🟠 High |
| **AIS Gap** | Vessel goes silent (periodic sweep) | 🟡 Medium / 🔴 Critical (near zone) |
| **Rendezvous** | Two vessels match speed at close range | 🟠 High |
| **Speed Anomaly** | Impossible position jump or SOG | 🔴 Critical (spoofing) |

## Benchmarking

The engine prints stats every second:
```
[STATS] msgs/sec: 52,341 | latency: 12μs | vessels: 487 | alerts/min: 14 | source: simulated
```

The dashboard also shows these metrics in real time via the stats bar.

## Project Structure

```
maritime-engine/src/
├── main.rs               # Entry point, startup orchestration
├── config.rs             # TOML config deserialization
├── types.rs              # Shared types (AisMessage, Alert, etc.)
├── aisstream_client.rs   # WebSocket client for live AIS data
├── simulator_listener.rs # UDP listener for Python simulator
├── dispatcher.rs         # Grid-hash message routing
├── worker.rs             # Per-core worker event loop
├── spatial_index.rs      # R-Tree geofence index
├── vessel_state.rs       # Per-vessel rolling state
├── detection.rs          # All 5 detection algorithms
├── metrics.rs            # Lock-free atomic counters
├── alerting.rs           # Alert broadcast system
└── dashboard_server.rs   # HTTP + WebSocket server
```
