import sys
import os
import math
import random
import time
import asyncio
import socket
import logging
import json
from datetime import datetime, timezone
import orjson
from shapely.geometry import shape, Point
from shapely.strtree import STRtree

# Windows uvloop fallback to winloop or default proactor
if os.name == 'nt':
    try:
        import winloop
        asyncio.set_event_loop_policy(winloop.EventLoopPolicy())
    except ImportError:
        pass # use default ProactorEventLoop
else:
    try:
        import uvloop
        asyncio.set_event_loop_policy(uvloop.EventLoopPolicy())
    except ImportError:
        pass

SCRIPT_DIR = os.path.dirname(os.path.abspath(__file__))

# ---------------------------------------------------------------------------
# Configuration
# ---------------------------------------------------------------------------
UDP_IP = "127.0.0.1"
UDP_PORT = 9000
NUM_VESSELS = 2000
TARGET_TPS = 50000
QUEUE_MAXSIZE = 100000

logging.basicConfig(level=logging.INFO, format='%(asctime)s - %(message)s')

# ---------------------------------------------------------------------------
# Landmass Index
# ---------------------------------------------------------------------------
logging.info("Loading Natural Earth land polygons...")
with open(os.path.join(SCRIPT_DIR, "ne_110m_land.json"), "r") as f:
    land_data = json.load(f)

polygons = [shape(feature['geometry']) for feature in land_data['features']]
land_tree = STRtree(polygons)

def is_land(lat, lon):
    pt = Point(lon, lat)
    indices = land_tree.query(pt)
    for idx in indices:
        if polygons[idx].contains(pt):
            return True
    return False

def nm_to_deg_lon(nm, lat):
    cos_lat = math.cos(math.radians(lat))
    if abs(cos_lat) < 1e-6:
        return 0.0
    return nm / (60.0 * cos_lat)

# ---------------------------------------------------------------------------
# Waypoints & Routing
# ---------------------------------------------------------------------------
ROUTES = {
    "Cargo": [
        (18.9, 72.8),   # Mumbai
        (15.4, 73.8),   # Goa
        (12.9, 74.8),   # Mangalore
        (9.9, 76.2),    # Kochi
        (6.9, 79.8),    # Colombo
        (5.5, 85.0),    # Deep sea route
        (10.0, 90.0),   # Andaman Sea
    ],
    "Fishing": [
        (19.0, 72.5),   # Off Mumbai
        (18.0, 72.0),   # Fishing ground 1
        (17.5, 71.5),   # Fishing ground 2
        (19.5, 71.0),   # Fishing ground 3
    ],
    "Patrol": [
        (22.0, 68.0),   # Gulf of Kutch
        (21.0, 69.0),   # Saurashtra coast
        (19.0, 72.0),   # Mumbai offshore
        (15.0, 73.0),   # Goa offshore
    ],
    "Tanker": [
        (24.0, 62.0),   # Middle east inbound
        (20.0, 68.0),   # Deep sea approach
        (18.9, 72.8),   # Mumbai Port
    ],
    "Passenger": [
        (13.1, 80.3),   # Chennai
        (11.9, 79.8),   # Puducherry
        (8.8, 78.2),    # Tuticorin
        (6.9, 79.8),    # Colombo
    ]
}

def get_heading(lat1, lon1, lat2, lon2):
    # simple planar bearing for short distances
    dlon = lon2 - lon1
    dlat = lat2 - lat1
    angle = math.degrees(math.atan2(dlon * math.cos(math.radians(lat1)), dlat))
    return (angle + 360) % 360

def interpolate_position(lat1, lon1, lat2, lon2, fraction):
    return (lat1 + (lat2 - lat1) * fraction, lon1 + (lon2 - lon1) * fraction)

# ---------------------------------------------------------------------------
# Vessel Digital Twin
# ---------------------------------------------------------------------------
class VesselTwin:
    __slots__ = [
        'mmsi', 'vtype', 'lat', 'lon', 'speed', 'heading', 'course',
        'waypoints', 'current_wp_idx', 'status', 'behavior', 'last_update', 'next_update',
        'cached_ais_template'
    ]
    
    def __init__(self, mmsi):
        self.mmsi = mmsi
        self.vtype = random.choice(["Cargo", "Fishing", "Patrol", "Tanker", "Passenger"])
        
        base_route = ROUTES.get(self.vtype, ROUTES["Cargo"])
        self.waypoints = base_route.copy()
        
        # 50% chance to run the route in reverse
        if random.random() > 0.5:
            self.waypoints.reverse()
            
        # Spread vessels out into wide lanes instead of mathematical lines
        lat_offset = random.gauss(0, 1.5)
        lon_offset = random.gauss(0, 1.5)
        self.waypoints = [(wp[0] + lat_offset, wp[1] + lon_offset) for wp in self.waypoints]
            
        # Randomize initial progress (0 - 100% of total route length)
        # 1. Calculate segment lengths
        segments = []
        total_dist = 0.0
        for i in range(len(self.waypoints) - 1):
            p1 = self.waypoints[i]
            p2 = self.waypoints[i+1]
            dist = math.hypot(p2[0]-p1[0], p2[1]-p1[1])
            segments.append(dist)
            total_dist += dist
            
        # 2. Pick a random distance along the route
        target_dist = random.uniform(0, total_dist)
        
        # 3. Find which segment this distance falls into
        accum = 0.0
        base_lat, base_lon = self.waypoints[0]
        
        for i, seg_len in enumerate(segments):
            if accum + seg_len >= target_dist:
                self.current_wp_idx = i
                fraction = (target_dist - accum) / seg_len if seg_len > 0 else 0.0
                p1 = self.waypoints[i]
                p2 = self.waypoints[i+1]
                base_lat, base_lon = interpolate_position(p1[0], p1[1], p2[0], p2[1], fraction)
                break
            accum += seg_len
        else:
            self.current_wp_idx = 0
            
        # 4. Scatter them massively so they form an ocean of traffic converging on lanes
        while True:
            # Gaussian noise of ~2.5 degrees (~150nm spread)
            self.lat = random.gauss(base_lat, 2.5)
            self.lon = random.gauss(base_lon, 3.0)
            
            # Ensure it is bounded roughly near India for the demo, and not on land
            if 0.0 <= self.lat <= 30.0 and 50.0 <= self.lon <= 100.0:
                if not is_land(self.lat, self.lon):
                    # Hard-exclude the Gujarat peninsula landmass (approx) so they don't visually overlap land
                    if 21.0 <= self.lat <= 24.5 and 69.5 <= self.lon <= 73.0:
                        continue
                    break
        
        self.speed = 15.0 if self.vtype in ["Cargo", "Passenger"] else 10.0
        if self.vtype == "Fishing":
            self.speed = 6.0
            
        target_wp = self.waypoints[self.current_wp_idx + 1]
        self.heading = get_heading(self.lat, self.lon, target_wp[0], target_wp[1])
        self.course = self.heading
        self.status = "Underway"
        self.behavior = "Normal Transit"
        self.last_update = time.time()
        self.cached_ais_template = self._generate_ais_template()

    def update_physics(self, now):
        dt = now - self.last_update
        self.last_update = now
        
        if dt <= 0: return

        # Behavior Overrides
        if self.behavior == "Loitering":
            self.speed = 1.0
            self.heading = (self.heading + 5.0 * dt) % 360.0
            self.course = self.heading
            
        elif self.behavior == "Normal Transit":
            # Target next waypoint
            try:
                target_lat, target_lon = self.waypoints[self.current_wp_idx + 1]
            except IndexError:
                logging.error(f"IndexError for MMSI {self.mmsi}: wp_idx={self.current_wp_idx}, len={len(self.waypoints)}, waypoints={self.waypoints}")
                self.current_wp_idx = 0
                target_lat, target_lon = self.waypoints[1]
                
            target_heading = get_heading(self.lat, self.lon, target_lat, target_lon)
            
            # Smooth turning
            diff = (target_heading - self.heading + 180) % 360 - 180
            turn_rate = 5.0 * dt # max 5 deg per sec
            if abs(diff) < turn_rate:
                self.heading = target_heading
            else:
                self.heading = (self.heading + math.copysign(turn_rate, diff)) % 360
            self.course = self.heading

            # Check waypoint arrival
            dist = math.hypot(target_lat - self.lat, target_lon - self.lon)
            if dist < 0.1: # approx 6 nm
                self.current_wp_idx += 1
                if self.current_wp_idx >= len(self.waypoints) - 1:
                    self.waypoints.reverse()
                    self.current_wp_idx = 0

        # Speed in knots -> degrees per second (very rough approx for visualization)
        # 1 knot = 1 nm / hour = 1/60 degree / hour = 1/3600 degree / second
        # Multiply by 500 for the demo so they visually crawl across the map!
        speed_deg_per_sec = (self.speed / 60.0) / 3600.0 * 500
        
        dlat = math.cos(math.radians(self.heading)) * speed_deg_per_sec * dt
        dlon = nm_to_deg_lon(1.0, self.lat) * math.sin(math.radians(self.heading)) * speed_deg_per_sec * dt
        
        new_lat = self.lat + dlat
        new_lon = self.lon + dlon
        if not is_land(new_lat, new_lon):
            self.lat = new_lat
            self.lon = new_lon
        
        self.cached_ais_template = self._generate_ais_template()

    def _generate_ais_template(self):
        payload = f'{{"MessageType":"PositionReport","MetaData":{{"MMSI":{self.mmsi},"MMSI_String":"{self.mmsi}","ShipName":"{self.vtype}-{self.mmsi}","latitude":{self.lat:.6f},"longitude":{self.lon:.6f},"time_utc":"<TIME>"}},"Message":{{"PositionReport":{{"Ais":{{"UserID":{self.mmsi},"MessageID":1,"Valid":true}},"Sog":{self.speed:.1f},"Cog":{self.course:.1f},"Latitude":{self.lat:.6f},"Longitude":{self.lon:.6f},"TrueHeading":{int(self.heading)%360},"Timestamp":<TS>,"NavigationalStatus":0}}}}}}'.encode('utf-8')
        p1 = payload.split(b"<TIME>")
        p2 = p1[1].split(b"<TS>")
        return (p1[0], p2[0], p2[1])

# ---------------------------------------------------------------------------
# Asynchronous Schedulers and Sender
# ---------------------------------------------------------------------------
async def udp_sender(queue: asyncio.Queue, sock, addr):
    """Pulls serialized bytes from the queue and blasts them over UDP."""
    msg_count = 0
    start_time = time.time()
    
    while True:
        # Get batch of messages to reduce await overhead
        batch = []
        try:
            for _ in range(100):
                msg = queue.get_nowait()
                batch.append(msg)
        except asyncio.QueueEmpty:
            if not batch:
                msg = await queue.get()
                batch.append(msg)
                
        for msg in batch:
            sock.sendto(msg, addr)
            msg_count += 1
            queue.task_done()
            
        elapsed = time.time() - start_time
        if elapsed >= 1.0:
            logging.info(f"UDP Sent {msg_count} msgs in {elapsed:.2f}s | Queue size: {queue.qsize()}")
            msg_count = 0
            start_time = time.time()

async def movement_engine(vessels):
    """
    Updates physics for all vessels exactly once per second.
    Completely isolated from the network scheduling overhead.
    """
    logging.info(f"Movement Engine started (Update Rate: 1 Hz)")
    while True:
        loop_start = time.time()
        for v in vessels:
            v.update_physics(loop_start)
            
        elapsed = time.time() - loop_start
        sleep_time = max(0.0, 1.0 - elapsed)
        await asyncio.sleep(sleep_time)

async def vessel_scheduler(vessels, queue: asyncio.Queue):
    """
    Ultra-fast scheduler that generates fresh timestamps using byte chunking.
    Uses time-based catchup to bypass Windows 15ms sleep jitter.
    """
    msgs_per_sec_per_vessel = TARGET_TPS / NUM_VESSELS
    sleep_interval = 1.0 / msgs_per_sec_per_vessel
    
    logging.info(f"AIS Scheduler started: {TARGET_TPS} TPS across {NUM_VESSELS} vessels (dt={sleep_interval:.4f}s)")
    
    now = time.time()
    for v in vessels:
        v.next_update = now + random.uniform(0, sleep_interval)
        
    last_sec = 0
    time_b = b""
    ts_b = b""
        
    while True:
        loop_start = time.time()
        
        current_sec = int(loop_start)
        if current_sec != last_sec:
            now_dt = datetime.fromtimestamp(loop_start, tz=timezone.utc)
            time_b = f"{now_dt.year}-{now_dt.month:02d}-{now_dt.day:02d} {now_dt.hour:02d}:{now_dt.minute:02d}:{now_dt.second:02d}".encode('utf-8')
            ts_b = str(now_dt.second).encode('utf-8')
            last_sec = current_sec
            
        for v in vessels:
            if loop_start >= getattr(v, 'next_update', loop_start):
                p1, p2, p3 = v.cached_ais_template
                payload = p1 + time_b + p2 + ts_b + p3
                try:
                    queue.put_nowait(payload)
                except asyncio.QueueFull:
                    pass
                # The crucial fix to avoid drift: advance by sleep_interval relative to itself
                v.next_update += sleep_interval
                
        # Extremely small yield to keep queue feeding smooth without CPU pinning
        await asyncio.sleep(0.0001)

# ---------------------------------------------------------------------------
# Main
# ---------------------------------------------------------------------------
async def main():
    logging.info(f"Creating {NUM_VESSELS} persistent Digital Twin vessels...")
    vessels = []
    for i in range(NUM_VESSELS):
        v = VesselTwin(100000000 + i)
        vessels.append(v)
        
    # Script some anomalies
    for i in range(10):
        vessels[i].behavior = "Loitering"
        
    for i in range(10, 15):
        # Force into Lakshadweep Protected Zone [73.0, 11.0] to trigger Critical Geofence alerts
        vessels[i].lat = 11.0
        vessels[i].lon = 73.0
        vessels[i].waypoints = [[11.0, 73.0], [11.1, 73.1]]
        vessels[i].current_wp_idx = 0
        vessels[i].speed = 15.0
        
    for i in range(15, 20):
        # Force into Gulf of Kutch Restricted Zone [69.5, 22.5] (Water) to trigger Critical alerts
        vessels[i].lat = 22.5
        vessels[i].lon = 69.5
        vessels[i].waypoints = [[22.5, 69.5], [22.6, 69.6]]
        vessels[i].current_wp_idx = 0
        vessels[i].speed = 15.0

    print("Starting UDP AIS simulation broadcast on 127.0.0.1:4000...")
    sock = socket.socket(socket.AF_INET, socket.SOCK_DGRAM)
    sock.setsockopt(socket.SOL_SOCKET, socket.SO_SNDBUF, 8388608)
    
    # Bounded Queue for backpressure
    queue = asyncio.Queue(maxsize=QUEUE_MAXSIZE)
    
    logging.info("Starting Asynchronous Pipeline...")
    
    # Launch tasks
    sender_task = asyncio.create_task(udp_sender(queue, sock, (UDP_IP, UDP_PORT)))
    movement_task = asyncio.create_task(movement_engine(vessels))
    scheduler_task = asyncio.create_task(vessel_scheduler(vessels, queue))
    
    await asyncio.gather(sender_task, movement_task, scheduler_task)

if __name__ == "__main__":
    try:
        asyncio.run(main())
    except KeyboardInterrupt:
        logging.info("Shutting down Digital Twin...")
