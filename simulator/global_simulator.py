import sys
import os
import math
import random
import time
import socket
import json
import logging
from datetime import datetime, timezone
import orjson
from shapely.geometry import shape, Point
from shapely.strtree import STRtree

SCRIPT_DIR = os.path.dirname(os.path.abspath(__file__))

# ---------------------------------------------------------------------------
# Configuration
# ---------------------------------------------------------------------------
UDP_IP = "127.0.0.1"
UDP_PORT = 9000
NUM_VESSELS = 10000
UPDATE_INTERVAL = 1.0  # seconds between simulated ticks

LAT_MIN = -80.0
LAT_MAX = 80.0
LON_MIN = -180.0
LON_MAX = 180.0

NM_TO_DEG_LAT = 1.0 / 60.0

logging.basicConfig(level=logging.INFO, format='%(asctime)s - %(message)s')

# ---------------------------------------------------------------------------
# Landmass Index (Natural Earth)
# ---------------------------------------------------------------------------
logging.info("Loading Natural Earth land polygons...")
try:
    with open(os.path.join(SCRIPT_DIR, "ne_110m_land.json"), "r") as f:
        land_data = json.load(f)
except FileNotFoundError:
    logging.error("ne_110m_land.json not found! Please download it first.")
    sys.exit(1)

polygons = [shape(feature['geometry']) for feature in land_data['features']]
land_tree = STRtree(polygons)

def is_land(lat, lon):
    """Fast offline check using STRtree."""
    pt = Point(lon, lat)
    # STRtree.query returns indices of overlapping bounding boxes
    indices = land_tree.query(pt)
    for idx in indices:
        if polygons[idx].contains(pt):
            return True
    return False

def nm_to_deg_lon(nm, lat):
    # approximate longitude degrees per nautical mile at a given latitude
    cos_lat = math.cos(math.radians(lat))
    if abs(cos_lat) < 1e-6:
        return 0.0
    return nm / (60.0 * cos_lat)

# ---------------------------------------------------------------------------
# Fast AIS JSON Template Builder
# ---------------------------------------------------------------------------
# Using raw f-string serialization for maximum throughput in Python

def make_position_report_bytes(mmsi, lat, lon, sog, heading):
    now = datetime.now(timezone.utc)
    # The Go-style time format Aisstream uses
    time_str = f"{now.year}-{now.month:02d}-{now.day:02d} {now.hour:02d}:{now.minute:02d}:{now.second:02d}"
    
    # Bypassing dict allocation and json.dumps entirely
    return f'{{"MessageType":"PositionReport","MetaData":{{"MMSI":{mmsi},"MMSI_String":"{mmsi}","ShipName":"VESSEL-{mmsi}","latitude":{lat:.6f},"longitude":{lon:.6f},"time_utc":"{time_str}"}},"Message":{{"PositionReport":{{"Ais":{{"UserID":{mmsi},"MessageID":1,"Valid":true}},"Sog":{sog:.1f},"Cog":{heading:.1f},"Latitude":{lat:.6f},"Longitude":{lon:.6f},"TrueHeading":{int(heading)%360},"Timestamp":{now.second},"NavigationalStatus":0}}}}}}'.encode('utf-8')

# ---------------------------------------------------------------------------
# Global Normal Vessel Logic
# ---------------------------------------------------------------------------
class GlobalVessel:
    __slots__ = ['mmsi', 'lat', 'lon', 'heading', 'speed', 'turning_rate']
    
    def __init__(self, mmsi):
        self.mmsi = mmsi
        # Spawn randomly, avoiding land
        while True:
            lat = random.uniform(LAT_MIN, LAT_MAX)
            lon = random.uniform(LON_MIN, LON_MAX)
            if not is_land(lat, lon):
                self.lat = lat
                self.lon = lon
                break
        
        self.heading = random.uniform(0, 360)
        self.speed = random.uniform(10, 20)
        self.turning_rate = random.uniform(-1, 1)

    def tick(self, dt):
        self.turning_rate += random.gauss(0, 0.1) * dt
        self.turning_rate = max(min(self.turning_rate, 2), -2)
        self.heading = (self.heading + self.turning_rate * dt) % 360.0
        
        # small speed noise
        self.speed += random.gauss(0, 0.1) * dt
        self.speed = max(min(self.speed, 25.0), 5.0)

        heading_rad = math.radians(self.heading)
        nm_per_sec = self.speed / 3600.0
        
        dlat = nm_per_sec * NM_TO_DEG_LAT * math.cos(heading_rad) * dt
        dlon = nm_per_sec * nm_to_deg_lon(1.0, self.lat) * math.sin(heading_rad) * dt
        
        new_lat = self.lat + dlat
        new_lon = self.lon + dlon
        
        # Reflect if hit land or bounds
        if new_lat < LAT_MIN or new_lat > LAT_MAX or new_lon < LON_MIN or new_lon > LON_MAX or is_land(new_lat, new_lon):
            self.heading = (self.heading + 180 + random.uniform(-20, 20)) % 360
        else:
            self.lat = new_lat
            self.lon = new_lon

# ---------------------------------------------------------------------------
# Scripted Anomalies
# ---------------------------------------------------------------------------
class GeofenceViolator:
    # Starts outside Lakshadweep Protected Zone (approx lon 72 to 74, lat 10 to 12)
    # Aims directly at it.
    __slots__ = ['mmsi', 'lat', 'lon', 'heading', 'speed']
    def __init__(self, mmsi, start_lat, start_lon, heading):
        self.mmsi = mmsi
        self.lat = start_lat
        self.lon = start_lon
        self.heading = heading
        self.speed = 20.0

    def tick(self, dt):
        heading_rad = math.radians(self.heading)
        nm_per_sec = self.speed / 3600.0
        dlat = nm_per_sec * NM_TO_DEG_LAT * math.cos(heading_rad) * dt
        dlon = nm_per_sec * nm_to_deg_lon(1.0, self.lat) * math.sin(heading_rad) * dt
        self.lat += dlat
        self.lon += dlon

class LoitererVessel:
    # Moves normally for first 30 seconds, then drops speed to 1 knot and spins.
    # We will spawn them in Gulf of Kutch Restricted (approx lon 68.5 to 70.5, lat 22.0 to 23.5)
    __slots__ = ['mmsi', 'lat', 'lon', 'heading', 'speed', 'is_loitering', 'start_time']
    def __init__(self, mmsi, start_lat, start_lon):
        self.mmsi = mmsi
        self.lat = start_lat
        self.lon = start_lon
        self.heading = 90.0
        self.speed = 15.0
        self.is_loitering = False
        self.start_time = time.time()

    def tick(self, dt):
        elapsed = time.time() - self.start_time
        if elapsed > 30.0 and not self.is_loitering:
            self.is_loitering = True
            self.speed = 1.0 # drop speed
        
        if self.is_loitering:
            self.heading = (self.heading + 10.0 * dt) % 360.0 # tight circles
            
        heading_rad = math.radians(self.heading)
        nm_per_sec = self.speed / 3600.0
        dlat = nm_per_sec * NM_TO_DEG_LAT * math.cos(heading_rad) * dt
        dlon = nm_per_sec * nm_to_deg_lon(1.0, self.lat) * math.sin(heading_rad) * dt
        self.lat += dlat
        self.lon += dlon

# ---------------------------------------------------------------------------
# Main Loop
# ---------------------------------------------------------------------------
def main():
    logging.info(f"Initializing {NUM_VESSELS} normal vessels (this may take 5-10 seconds)...")
    vessels = []
    # Instantiate bulk normal vessels
    for i in range(1, NUM_VESSELS - 7):
        vessels.append(GlobalVessel(100000000 + i))

    logging.info("Initializing scripted anomaly vessels...")
    
    # 4 Geofence Violators heading into Lakshadweep
    vessels.append(GeofenceViolator(900000001, 9.8, 73.0, 0.0))  # Heads North into it
    vessels.append(GeofenceViolator(900000002, 12.2, 73.0, 180.0)) # Heads South into it
    vessels.append(GeofenceViolator(900000003, 11.0, 71.8, 90.0)) # Heads East into it
    vessels.append(GeofenceViolator(900000004, 11.0, 74.2, 270.0)) # Heads West into it
    
    # 4 Loitering vessels inside Gulf of Kutch
    vessels.append(LoitererVessel(900000005, 22.5, 69.0))
    vessels.append(LoitererVessel(900000006, 22.8, 69.5))
    vessels.append(LoitererVessel(900000007, 23.2, 70.0))
    vessels.append(LoitererVessel(900000008, 22.2, 70.2))

    sock = socket.socket(socket.AF_INET, socket.SOCK_DGRAM)
    # Increase socket send buffer size for high throughput
    sock.setsockopt(socket.SOL_SOCKET, socket.SO_SNDBUF, 8388608)
    
    logging.info("Starting 50k+ TPS simulation loop...")
    
    msg_count = 0
    start_time = time.time()
    last_print = start_time
    
    # Simulation loop
    while True:
        loop_start = time.time()
        
        # Batch sending phase
        for v in vessels:
            v.tick(UPDATE_INTERVAL)
            msg_bytes = make_position_report_bytes(v.mmsi, v.lat, v.lon, v.speed, v.heading)
            sock.sendto(msg_bytes, (UDP_IP, UDP_PORT))
            msg_count += 1
            
        loop_end = time.time()
        elapsed = loop_end - last_print
        
        if elapsed >= 1.0:
            rate = msg_count / elapsed
            logging.info(f"Sent {msg_count} msgs in {elapsed:.2f}s | Rate: {rate:.0f} msg/s")
            msg_count = 0
            last_print = loop_end
            
        # Optional: sleep to maintain strictly 1 update per second if processing is faster.
        # But if the user wants max throughput scale test, we can just run unthrottled.
        # Given they want 50k/sec, and we have 50k vessels, doing 1 tick per second yields exactly 50k/s.
        process_time = loop_end - loop_start
        sleep_time = UPDATE_INTERVAL - process_time
        if sleep_time > 0:
            time.sleep(sleep_time)

if __name__ == "__main__":
    main()
