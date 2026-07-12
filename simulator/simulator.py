#!/usr/bin/env python3
"""
Maritime AIS Position Report Simulator
=======================================
Sends UDP datagrams in aisstream.io's exact PositionReport JSON format
to a target host:port (default 127.0.0.1:9000).

Simulates realistic vessel movement within a bounding box (Arabian Sea /
Indian coast) and injects five anomaly scenarios that are always active:
  1. LOITERER          – orbits inside the Lakshadweep Protected Zone at < 1.5 kn
  2. ZONE VIOLATOR     – steers from outside into the Lakshadweep Protected Zone
  3. RENDEZVOUS PAIR   – two vessels converge to 0.1 nm, match speed for 5+ min
  4. AIS GAP           – goes silent for 12 min, reappears 20 nm away
  5. SPOOFING          – impossible 100 nm jumps every 30 s

Uses only Python stdlib: socket, json, time, random, math, argparse, datetime.
"""

import argparse
import json
import math
import random
import socket
import time
from datetime import datetime, timezone

# ---------------------------------------------------------------------------
# Constants
# ---------------------------------------------------------------------------

# Bounds for the whole simulation area
LAT_MIN_SIM, LAT_MAX_SIM = -80.0, 80.0
LON_MIN_SIM, LON_MAX_SIM = -180.0, 180.0

# Shipping lanes defined as line segments ((lat1, lon1), (lat2, lon2))
SHIPPING_LANES = [
    ((14.0, 58.0), (6.0, 80.0)),    # Arabian Sea to South of Sri Lanka
    ((6.0, 80.0), (6.0, 95.0)),     # South of Sri Lanka to Malacca Strait
    ((24.0, 60.0), (19.0, 71.0)),   # Persian Gulf to Mumbai
    ((19.0, 71.0), (9.0, 76.0)),    # Mumbai to Kerala (Coastal West)
    ((10.0, 80.0), (17.0, 84.0)),   # Chennai coastal (East)
    ((4.0, 58.0), (4.0, 95.0)),     # Deep south Indian ocean
    ((34.0, -74.0), (38.0, -67.0)), # North Atlantic
    ((50.0, -10.0), (55.0, 10.0)),  # North Atlantic / Europe
    ((35.0, 140.0), (40.0, 170.0)), # North Pacific
    ((-20.0, 120.0), (-10.0, 150.0)), # South Pacific
    ((-30.0, -40.0), (-10.0, -20.0)), # South Atlantic
    ((23.0, 115.0), (18.0, 130.0)), # South China Sea
]

# Nautical mile in degrees (approximate at mid-latitudes)
NM_TO_DEG_LAT = 1.0 / 60.0
NM_TO_DEG_LON_FACTOR = 1.0 / 60.0  # divided by cos(lat) at runtime

# Lakshadweep Protected Zone polygon (simple rectangle for point-in-polygon)
LAKSHADWEEP_ZONE = {
    "lon_min": 72.0, "lon_max": 74.0,
    "lat_min": 10.0, "lat_max": 12.0,
}

# Ship name prefixes for random vessel name generation
SHIP_PREFIXES = [
    "OCEAN", "SEA", "PACIFIC", "ATLANTIC", "CORAL", "NEPTUNE", "MARINA",
    "HORIZON", "POLAR", "GOLDEN", "SILVER", "EMERALD", "SAPPHIRE", "TITAN",
    "GLOBAL", "SWIFT", "STELLAR", "PIONEER", "LIBERTY", "FORTUNE",
]
SHIP_SUFFIXES = [
    "STAR", "WAVE", "SPIRIT", "VOYAGER", "TRADER", "CARRIER", "EXPRESS",
    "PHOENIX", "GUARDIAN", "VENTURE", "PRIDE", "GLORY", "DAWN", "CREST",
    "ARROW", "KING", "QUEEN", "PEARL", "EAGLE", "FALCON",
]

# ---------------------------------------------------------------------------
# Helpers
# ---------------------------------------------------------------------------


def clamp(value: float, lo: float, hi: float) -> float:
    """Clamp a value between lo and hi."""
    return max(lo, min(hi, value))


def nm_to_deg_lon(nm: float, lat_deg: float) -> float:
    """Convert nautical miles to degrees of longitude at a given latitude."""
    cos_lat = math.cos(math.radians(lat_deg))
    if cos_lat < 1e-6:
        cos_lat = 1e-6
    return nm * NM_TO_DEG_LON_FACTOR / cos_lat


def knots_to_deg_per_sec(knots: float, lat_deg: float) -> tuple:
    """Convert speed in knots to (deg_lat/s, deg_lon/s)."""
    # 1 knot = 1 nm/hour = 1/3600 nm/s
    nm_per_sec = knots / 3600.0
    dlat = nm_per_sec * NM_TO_DEG_LAT
    dlon = nm_per_sec * nm_to_deg_lon(1.0, lat_deg) / NM_TO_DEG_LAT  # reuse factor
    # Simpler: dlon per nm at this lat
    cos_lat = math.cos(math.radians(lat_deg))
    if cos_lat < 1e-6:
        cos_lat = 1e-6
    dlon = nm_per_sec * NM_TO_DEG_LON_FACTOR / cos_lat
    return dlat, dlon


def random_ship_name() -> str:
    """Generate a random vessel name."""
    return f"{random.choice(SHIP_PREFIXES)} {random.choice(SHIP_SUFFIXES)}"


def wrap_heading(heading: float) -> float:
    """Normalize heading to [0, 360)."""
    return heading % 360.0


from global_land_mask import globe

def is_on_land(lat: float, lon: float) -> bool:
    """Accurate global land masking to ensure vessels do not spawn on land."""
    return globe.is_land(lat, lon)

def is_in_restricted_zone(lat: float, lon: float) -> bool:
    """Check if the coordinate falls inside any configured geofence restricted zones."""
    # Lakshadweep Protected Zone
    if 10.0 <= lat <= 12.0 and 72.0 <= lon <= 74.0:
        return True
    # Gulf of Kutch Zone
    if 22.0 <= lat <= 23.0 and 68.0 <= lon <= 70.0:
        return True
    return False

def random_point_on_lanes():
    """Generate a random coordinate clustered along defined shipping lanes."""
    lane = random.choice(SHIPPING_LANES)
    (lat1, lon1), (lat2, lon2) = lane
    t = random.random()
    base_lat = lat1 + t * (lat2 - lat1)
    base_lon = lon1 + t * (lon2 - lon1)

    # Add gaussian noise to spread them out into realistic traffic corridors
    return random.gauss(base_lat, 2.5), random.gauss(base_lon, 3.0)


def make_position_report(mmsi: int, name: str, lat: float, lon: float,
                         sog: float, cog: float, heading: float,
                         nav_status: int = 0) -> dict:
    """
    Build a single PositionReport message in aisstream.io's exact JSON format.
    """
    now = datetime.now(timezone.utc)
    time_str = now.strftime("%Y-%m-%d %H:%M:%S")
    mmsi_str = str(mmsi)

    return {
        "MessageType": "PositionReport",
        "MetaData": {
            "MMSI": mmsi,
            "MMSI_String": mmsi_str,
            "ShipName": name,
            "latitude": round(lat, 6),
            "longitude": round(lon, 6),
            "time_utc": time_str,
        },
        "Message": {
            "PositionReport": {
                "Ais": {
                    "UserID": mmsi,
                    "MessageID": 1,
                    "Valid": True,
                },
                "Sog": round(sog, 1),
                "Cog": round(cog, 1),
                "Latitude": round(lat, 6),
                "Longitude": round(lon, 6),
                "TrueHeading": int(round(heading)) % 360,
                "Timestamp": now.second,
                "NavigationalStatus": nav_status,
            }
        }
    }


# ---------------------------------------------------------------------------
# Vessel classes
# ---------------------------------------------------------------------------


class NormalVessel:
    """
    A standard cargo vessel with random-walk movement.
    Speed varies smoothly (clamped 0-20 kn), heading drifts with noise.
    """

    def __init__(self, mmsi: int, name: str = None):
        self.mmsi = mmsi
        self.name = name or random_ship_name()
        
        # Spawn randomly along shipping lanes, rejecting land points
        while True:
            lat, lon = random_point_on_lanes()
            if not is_on_land(lat, lon) and LAT_MIN_SIM <= lat <= LAT_MAX_SIM and LON_MIN_SIM <= lon <= LON_MAX_SIM:
                self.lat = lat
                self.lon = lon
                break
            
        self.heading = random.uniform(0, 360)
        self.speed = random.uniform(5, 15)          # knots
        self.turning_rate = random.uniform(-5, 5)    # degrees per second
        self.nav_status = 0  # under way using engine

    def tick(self, dt: float):
        """Advance simulation by dt seconds."""
        # Heading: turning_rate drift + small noise
        self.turning_rate += random.gauss(0, 0.5) * dt
        self.turning_rate = clamp(self.turning_rate, -10, 10)
        self.heading += self.turning_rate * dt + random.gauss(0, 0.3)
        self.heading = wrap_heading(self.heading)

        # Speed: random walk clamped to [0, 20] knots
        self.speed += random.gauss(0, 0.2) * dt
        self.speed = clamp(self.speed, 0.0, 20.0)

        # Position update
        heading_rad = math.radians(self.heading)
        nm_per_sec = self.speed / 3600.0
        
        dlat = nm_per_sec * NM_TO_DEG_LAT * math.cos(heading_rad) * dt
        dlon = nm_per_sec * nm_to_deg_lon(1.0, self.lat) * math.sin(heading_rad) * dt
        
        new_lat = self.lat + dlat
        new_lon = self.lon + dlon

        # If movement hits land, map bounds, or restricted geofence zones, bounce back
        if is_on_land(new_lat, new_lon) or is_in_restricted_zone(new_lat, new_lon) or not (LAT_MIN_SIM <= new_lat <= LAT_MAX_SIM and LON_MIN_SIM <= new_lon <= LON_MAX_SIM):
            self.heading = wrap_heading(self.heading + 180.0 + random.uniform(-30, 30))
        else:
            self.lat = new_lat
            self.lon = new_lon

    def report(self) -> dict:
        """Generate an AIS position report."""
        return make_position_report(
            self.mmsi, self.name, self.lat, self.lon,
            self.speed, self.heading, self.heading, self.nav_status
        )


class LoiteringVessel:
    """
    SCENARIO 1: LOITERER (MMSI 999000001)
    Orbits around lat=11.0, lon=73.0 inside the Lakshadweep Protected Zone
    at < 1.5 knots.
    """

    def __init__(self, mmsi=999000001, name="SHADOW DRIFTER", lat=11.0, lon=73.0):
        self.mmsi = mmsi
        self.name = name
        self.center_lat = lat
        self.center_lon = lon
        self.orbit_radius_nm = 0.5  # small orbit
        self.angle = random.uniform(0, 2 * math.pi)
        self.speed = random.uniform(0.5, 1.4)  # always < 1.5 kn
        self.heading = 0.0

    def tick(self, dt: float):
        # Slowly orbit the center point
        angular_speed = (self.speed / 3600.0) / (self.orbit_radius_nm * NM_TO_DEG_LAT)
        self.angle += angular_speed * dt
        self.angle %= (2 * math.pi)

        self.lat = self.center_lat + self.orbit_radius_nm * NM_TO_DEG_LAT * math.cos(self.angle)
        dlon = self.orbit_radius_nm * nm_to_deg_lon(1.0, self.lat) * math.sin(self.angle)
        self.lon = self.center_lon + dlon

        # Heading tangent to the orbit
        self.heading = wrap_heading(math.degrees(self.angle) + 90)

        # Slight speed variation, always < 1.5
        self.speed += random.gauss(0, 0.05) * dt
        self.speed = clamp(self.speed, 0.3, 1.4)

    def report(self) -> dict:
        return make_position_report(
            self.mmsi, self.name, self.lat, self.lon,
            self.speed, self.heading, self.heading, nav_status=0
        )


class ZoneViolatorVessel:
    """
    SCENARIO 2: ZONE VIOLATOR (MMSI 999000002)
    Starts outside the Lakshadweep Protected Zone at lat=9.5, lon=71.5
    and steers toward and enters the zone.
    """

    def __init__(self, mmsi=999000002, name="DARK RUNNER", lat=9.5, lon=71.5, target_lat=11.0, target_lon=73.0):
        self.mmsi = mmsi
        self.name = name
        self.lat = lat
        self.lon = lon
        self.target_lat = target_lat
        self.target_lon = target_lon
        self.speed = 10.0  # knots
        self.heading = 0.0
        self._update_heading()

    def _update_heading(self):
        """Steer toward the target point inside the zone."""
        dlat = self.target_lat - self.lat
        dlon = self.target_lon - self.lon
        self.heading = wrap_heading(math.degrees(math.atan2(dlon, dlat)))

    def tick(self, dt: float):
        self._update_heading()

        # Add slight heading noise
        self.heading += random.gauss(0, 0.5)
        self.heading = wrap_heading(self.heading)

        heading_rad = math.radians(self.heading)
        nm_per_sec = self.speed / 3600.0
        dlat = nm_per_sec * NM_TO_DEG_LAT * math.cos(heading_rad) * dt
        dlon = nm_per_sec * nm_to_deg_lon(1.0, self.lat) * math.sin(heading_rad) * dt

        self.lat += dlat
        self.lon += dlon

        # Once deep inside the zone, slow down and orbit
        if (LAKSHADWEEP_ZONE["lat_min"] < self.lat < LAKSHADWEEP_ZONE["lat_max"] and
                LAKSHADWEEP_ZONE["lon_min"] < self.lon < LAKSHADWEEP_ZONE["lon_max"]):
            # Inside zone: slow drift
            self.speed = clamp(self.speed - 0.5 * dt, 2.0, 10.0)
            self.heading += 15.0 * dt  # gentle turn
            self.heading = wrap_heading(self.heading)
        else:
            # Outside: maintain course toward zone
            self.speed = clamp(self.speed + random.gauss(0, 0.1), 8.0, 12.0)

    def report(self) -> dict:
        return make_position_report(
            self.mmsi, self.name, self.lat, self.lon,
            self.speed, self.heading, self.heading, nav_status=0
        )


class RendezvousVesselA:
    """
    SCENARIO 3a: RENDEZVOUS PAIR – Vessel A (MMSI 999000003)
    Converges toward a meeting point, then matches speed with Vessel B.
    """

    def __init__(self, mmsi=999000003, name="PHANTOM ECHO", lat=15.0, lon=68.0, meeting_lat=14.0, meeting_lon=69.0):
        self.mmsi = mmsi
        self.name = name
        self.lat = lat
        self.lon = lon
        self.meeting_lat = meeting_lat
        self.meeting_lon = meeting_lon
        self.speed = 10.0
        self.heading = 0.0
        self.phase = "converge"  # "converge" -> "matched"
        self.matched_time = 0.0
        self._update_heading()

    def _update_heading(self):
        dlat = self.meeting_lat - self.lat
        dlon = self.meeting_lon - self.lon
        self.heading = wrap_heading(math.degrees(math.atan2(dlon, dlat)))

    def _distance_to_meeting_nm(self) -> float:
        dlat = (self.meeting_lat - self.lat) / NM_TO_DEG_LAT
        dlon_deg = self.meeting_lon - self.lon
        cos_lat = math.cos(math.radians(self.lat))
        dlon_nm = dlon_deg * 60.0 * cos_lat
        return math.sqrt(dlat ** 2 + dlon_nm ** 2)

    def tick(self, dt: float):
        dist = self._distance_to_meeting_nm()

        if self.phase == "converge":
            self._update_heading()
            self.heading += random.gauss(0, 0.3)
            self.heading = wrap_heading(self.heading)

            if dist < 0.15:
                self.phase = "matched"
                self.speed = 8.0
                self.heading = 90.0  # sail east together
                self.matched_time = 0.0
            else:
                # Slow down as we approach
                self.speed = clamp(min(10.0, dist * 5.0), 3.0, 12.0)
        else:
            # Matched phase: sail together at 8 kn, heading ~90°
            self.matched_time += dt
            self.speed = 8.0 + random.gauss(0, 0.05)
            self.speed = clamp(self.speed, 7.5, 8.5)
            self.heading = 90.0 + random.gauss(0, 0.2)
            self.heading = wrap_heading(self.heading)

        heading_rad = math.radians(self.heading)
        nm_per_sec = self.speed / 3600.0
        self.lat += nm_per_sec * NM_TO_DEG_LAT * math.cos(heading_rad) * dt
        self.lon += nm_per_sec * nm_to_deg_lon(1.0, self.lat) * math.sin(heading_rad) * dt

    def report(self) -> dict:
        return make_position_report(
            self.mmsi, self.name, self.lat, self.lon,
            self.speed, self.heading, self.heading, nav_status=0
        )


class RendezvousVesselB:
    """
    SCENARIO 3b: RENDEZVOUS PAIR – Vessel B (MMSI 999000004)
    Approaches from the opposite direction, converges with Vessel A.
    """

    def __init__(self, mmsi=999000004, name="GHOST WHISPER", lat=13.0, lon=70.0, meeting_lat=14.0, meeting_lon=69.0):
        self.mmsi = mmsi
        self.name = name
        self.lat = lat
        self.lon = lon
        self.meeting_lat = meeting_lat
        self.meeting_lon = meeting_lon
        self.speed = 10.0
        self.heading = 0.0
        self.phase = "converge"
        self.matched_time = 0.0
        self._update_heading()

    def _update_heading(self):
        dlat = self.meeting_lat - self.lat
        dlon = self.meeting_lon - self.lon
        self.heading = wrap_heading(math.degrees(math.atan2(dlon, dlat)))

    def _distance_to_meeting_nm(self) -> float:
        dlat = (self.meeting_lat - self.lat) / NM_TO_DEG_LAT
        dlon_deg = self.meeting_lon - self.lon
        cos_lat = math.cos(math.radians(self.lat))
        dlon_nm = dlon_deg * 60.0 * cos_lat
        return math.sqrt(dlat ** 2 + dlon_nm ** 2)

    def tick(self, dt: float):
        dist = self._distance_to_meeting_nm()

        if self.phase == "converge":
            self._update_heading()
            self.heading += random.gauss(0, 0.3)
            self.heading = wrap_heading(self.heading)

            if dist < 0.15:
                self.phase = "matched"
                self.speed = 8.0
                self.heading = 90.0  # sail east together with A
                self.matched_time = 0.0
            else:
                self.speed = clamp(min(10.0, dist * 5.0), 3.0, 12.0)
        else:
            self.matched_time += dt
            self.speed = 8.0 + random.gauss(0, 0.05)
            self.speed = clamp(self.speed, 7.5, 8.5)
            # Stay very close to vessel A's heading
            self.heading = 90.0 + random.gauss(0, 0.15)
            self.heading = wrap_heading(self.heading)

        heading_rad = math.radians(self.heading)
        nm_per_sec = self.speed / 3600.0
        self.lat += nm_per_sec * NM_TO_DEG_LAT * math.cos(heading_rad) * dt
        self.lon += nm_per_sec * nm_to_deg_lon(1.0, self.lat) * math.sin(heading_rad) * dt

    def report(self) -> dict:
        return make_position_report(
            self.mmsi, self.name, self.lat, self.lon,
            self.speed, self.heading, self.heading, nav_status=0
        )


class AISGapVessel:
    """
    SCENARIO 4: AIS GAP (MMSI 999000005)
    Near Gulf of Kutch zone (lat=22.5, lon=69.5).
    Stops transmitting for 12 minutes, then reappears 20 nm away.
    """

    GAP_START_SEC = 30.0     # Start gap 30s into simulation
    GAP_DURATION_SEC = 720.0  # 12 minutes of silence

    def __init__(self, mmsi=999000005, name="VANISHING ACE", lat=22.4, lon=68.6):
        self.mmsi = mmsi
        self.name = name
        self.lat = lat
        self.lon = lon
        self.speed = 8.0
        self.heading = random.uniform(0, 360)
        self.elapsed = 0.0
        self.silent = False
        self.jumped = False
        # Position saved at gap start
        self._pre_gap_lat = self.lat
        self._pre_gap_lon = self.lon

    def tick(self, dt: float):
        self.elapsed += dt

        # Determine if we are in the silent gap window
        if self.GAP_START_SEC <= self.elapsed < (self.GAP_START_SEC + self.GAP_DURATION_SEC):
            self.silent = True
            # Still "move" underwater (not transmitted)
            return
        elif self.elapsed >= (self.GAP_START_SEC + self.GAP_DURATION_SEC) and not self.jumped:
            # Reappear 20 nm away in a random direction
            self.silent = False
            self.jumped = True
            jump_heading = random.uniform(0, 360)
            jump_rad = math.radians(jump_heading)
            self.lat = self._pre_gap_lat + 20.0 * NM_TO_DEG_LAT * math.cos(jump_rad)
            self.lon = self._pre_gap_lon + 20.0 * nm_to_deg_lon(1.0, self.lat) * math.sin(jump_rad)
            self.lat = clamp(self.lat, LAT_MIN_SIM, LAT_MAX_SIM)
            self.lon = clamp(self.lon, LON_MIN_SIM, LON_MAX_SIM)
            self.heading = random.uniform(0, 360)
        else:
            self.silent = False

        # Normal movement when not silent
        heading_rad = math.radians(self.heading)
        nm_per_sec = self.speed / 3600.0
        self.lat += nm_per_sec * NM_TO_DEG_LAT * math.cos(heading_rad) * dt
        self.lon += nm_per_sec * nm_to_deg_lon(1.0, self.lat) * math.sin(heading_rad) * dt

        self.heading += random.gauss(0, 0.5)
        self.heading = wrap_heading(self.heading)
        self.speed = clamp(self.speed + random.gauss(0, 0.1), 6.0, 10.0)

        # Save pre-gap position
        if self.elapsed < self.GAP_START_SEC:
            self._pre_gap_lat = self.lat
            self._pre_gap_lon = self.lon

    def report(self):
        """Returns a report dict, or None if currently silent (AIS gap)."""
        if self.silent:
            return None
        return make_position_report(
            self.mmsi, self.name, self.lat, self.lon,
            self.speed, self.heading, self.heading, nav_status=0
        )


class SpoofingVessel:
    """
    SCENARIO 5: SPOOFING (MMSI 999000006)
    Reports impossible position jumps – 100 nm in 30 seconds.
    """

    JUMP_INTERVAL_SEC = 30.0

    def __init__(self, mmsi=999000006, name="MIRAGE GHOST", lat=None, lon=None):
        self.mmsi = mmsi
        self.name = name
        self.lat = lat if lat is not None else random.uniform(10, 20)
        self.lon = lon if lon is not None else random.uniform(65, 75)
        self.speed = 12.0
        self.heading = random.uniform(0, 360)
        self.time_since_jump = 0.0

    def tick(self, dt: float):
        self.time_since_jump += dt

        if self.time_since_jump >= self.JUMP_INTERVAL_SEC:
            # Impossible jump: 100 nm in a random direction
            self.time_since_jump = 0.0
            jump_heading = random.uniform(0, 360)
            jump_rad = math.radians(jump_heading)
            self.lat += 100.0 * NM_TO_DEG_LAT * math.cos(jump_rad)
            self.lon += 100.0 * nm_to_deg_lon(1.0, self.lat) * math.sin(jump_rad)
            # Clamp to bounding box
            self.lat = clamp(self.lat, LAT_MIN_SIM, LAT_MAX_SIM)
            self.lon = clamp(self.lon, LON_MIN_SIM, LON_MAX_SIM)
            self.heading = random.uniform(0, 360)
        else:
            # Normal slow movement between jumps
            heading_rad = math.radians(self.heading)
            nm_per_sec = self.speed / 3600.0
            self.lat += nm_per_sec * NM_TO_DEG_LAT * math.cos(heading_rad) * dt
            self.lon += nm_per_sec * nm_to_deg_lon(1.0, self.lat) * math.sin(heading_rad) * dt
            self.heading += random.gauss(0, 0.3)
            self.heading = wrap_heading(self.heading)

    def report(self) -> dict:
        return make_position_report(
            self.mmsi, self.name, self.lat, self.lon,
            self.speed, self.heading, self.heading, nav_status=0
        )


class BorderCrosserVessel:
    """
    SCENARIO 6: BORDER CROSSER (MMSI 999000018)
    Sails NW directly across the Pakistan-India maritime boundary.
    """
    def __init__(self):
        self.mmsi = 999000018
        self.name = "BORDER RUNNER"
        self.lat = 22.0
        self.lon = 67.6
        self.speed = 14.0 # knots
        self.heading = 315.0 # NW
        
    def tick(self, dt: float):
        heading_rad = math.radians(self.heading)
        nm_per_sec = self.speed / 3600.0
        self.lat += nm_per_sec * NM_TO_DEG_LAT * math.cos(heading_rad) * dt
        self.lon += nm_per_sec * nm_to_deg_lon(1.0, self.lat) * math.sin(heading_rad) * dt
        
        # Reset back to start once crossed to repeat prediction warning
        if self.lat > 24.5 or self.lon < 65.0:
            self.lat = 22.0
            self.lon = 67.6
            
    def report(self) -> dict:
        return make_position_report(
            self.mmsi, self.name, self.lat, self.lon,
            self.speed, self.heading, self.heading, nav_status=0
        )

class IdentitySpoofer:
    def __init__(self, mmsi=999000021, name="ORIGINAL_NAME", lat=20.0, lon=70.0):
        self.mmsi = mmsi
        self.name = name
        self.original_name = name
        self.lat = lat
        self.lon = lon
        self.speed = 10.0
        self.heading = 0.0
        self.time = 0.0
    def tick(self, dt: float):
        self.time += dt
        if self.time > 15.0:
            self.time = 0.0
            self.name = "SPOOFED_NAME" if self.name == self.original_name else self.original_name
        
        heading_rad = math.radians(self.heading)
        nm_per_sec = self.speed / 3600.0
        self.lat += nm_per_sec * NM_TO_DEG_LAT * math.cos(heading_rad) * dt
        self.lon += nm_per_sec * nm_to_deg_lon(1.0, self.lat) * math.sin(heading_rad) * dt
    def report(self):
        return make_position_report(self.mmsi, self.name, self.lat, self.lon, self.speed, self.heading, self.heading, 0)

class HeadingSpoofer:
    def __init__(self, mmsi=999000022, name="HEADING JUMPER", lat=15.0, lon=65.0):
        self.mmsi = mmsi
        self.name = name
        self.lat = lat
        self.lon = lon
        self.speed = 20.0 # Fast speed
        self.heading = 0.0
        self.time = 0.0
    def tick(self, dt: float):
        self.time += dt
        if self.time > 10.0:
            self.time = 0.0
            self.heading = (self.heading + 180.0) % 360.0 # Physically impossible at 20 knots
        
        heading_rad = math.radians(self.heading)
        nm_per_sec = self.speed / 3600.0
        self.lat += nm_per_sec * NM_TO_DEG_LAT * math.cos(heading_rad) * dt
        self.lon += nm_per_sec * nm_to_deg_lon(1.0, self.lat) * math.sin(heading_rad) * dt
    def report(self):
        return make_position_report(self.mmsi, self.name, self.lat, self.lon, self.speed, self.heading, self.heading, 0)

class DuplicateMMSISpoofer:
    def __init__(self, mmsi=999000023, name="CLONE VESSEL", lat1=10.0, lon1=60.0, lat2=25.0, lon2=90.0):
        self.mmsi = mmsi
        self.name = name
        self.lat1 = lat1
        self.lon1 = lon1
        self.lat2 = lat2
        self.lon2 = lon2
        self.speed = 10.0
        self.heading = 0.0
        self.toggle = False
    def tick(self, dt: float):
        self.toggle = not self.toggle
        heading_rad = math.radians(self.heading)
        nm_per_sec = self.speed / 3600.0
        dlat = nm_per_sec * NM_TO_DEG_LAT * math.cos(heading_rad) * dt
        self.lat1 += dlat
        self.lat2 += dlat
    def report(self):
        lat = self.lat1 if self.toggle else self.lat2
        lon = self.lon1 if self.toggle else self.lon2
        return make_position_report(self.mmsi, self.name, lat, lon, self.speed, self.heading, self.heading, 0)


# ---------------------------------------------------------------------------
# Main simulator
# ---------------------------------------------------------------------------


def build_vessels(vessel_count: int) -> list:
    """
    Build all vessels: injected scenario vessels + normal background vessels.
    Returns a list of vessel objects (each must have .tick(dt) and .report()).
    """
    vessels = []

    # --- Injected anomaly scenarios (2 of each family, scattered globally) ---
    vessels.append(LoiteringVessel(999000001, "LOITER GLOBAL A", 11.0, 73.0))
    vessels.append(LoiteringVessel(999000007, "LOITER GLOBAL B", 35.0, -40.0))

    vessels.append(ZoneViolatorVessel(999000002, "ZONE RUNNER A", 8.0, 71.0, 11.0, 73.0))
    vessels.append(ZoneViolatorVessel(999000009, "ZONE RUNNER B", 20.0, -40.0, 22.5, -35.0))

    vessels.append(RendezvousVesselA(999000003, "RENDEZVOUS A1", 15.0, 68.0, 14.0, 69.0))
    vessels.append(RendezvousVesselB(999000004, "RENDEZVOUS B1", 13.0, 70.0, 14.0, 69.0))
    vessels.append(RendezvousVesselA(999000011, "RENDEZVOUS A2", 35.0, -40.0, 33.0, -38.0))
    vessels.append(RendezvousVesselB(999000012, "RENDEZVOUS B2", 32.0, -36.0, 33.0, -38.0))

    vessels.append(AISGapVessel(999000005, "VANISH A", 22.4, 68.6))
    vessels.append(AISGapVessel(999000015, "VANISH B", 40.0, -20.0))

    vessels.append(SpoofingVessel(999000006, "MIRAGE A", 10.0, 70.0))
    vessels.append(SpoofingVessel(999000016, "MIRAGE B", 50.0, -20.0))

    vessels.append(IdentitySpoofer(999000021, "ORIGINAL_ALPHA", 20.0, 70.0))
    vessels.append(IdentitySpoofer(999000025, "ORIGINAL_BETA", 48.0, -15.0))
    vessels.append(HeadingSpoofer(999000022, "HEADING JUMPER A", 15.0, 65.0))
    vessels.append(HeadingSpoofer(999000026, "HEADING JUMPER B", 45.0, 150.0))
    vessels.append(DuplicateMMSISpoofer(999000023, "CLONE VESSEL A", 10.0, 60.0, 25.0, 90.0))
    vessels.append(DuplicateMMSISpoofer(999000027, "CLONE VESSEL B", -20.0, 130.0, -10.0, 150.0))

    injected_count = len(vessels)

    # --- Normal background vessels ---
    # Generate unique MMSIs starting from 200000001
    normal_count = max(0, vessel_count - injected_count)
    for i in range(normal_count):
        mmsi = 200000001 + i
        vessels.append(NormalVessel(mmsi))

    return vessels


def run_simulator(rate: int, target: str, vessel_count: int, duration: int):
    """
    Main simulation loop.

    Args:
        rate:          Target messages per second.
        target:        "host:port" string for the UDP destination.
        vessel_count:  Total number of vessels (including injected scenarios).
        duration:      Duration of the simulation in seconds.
    """
    # Parse target address
    host, port_str = target.rsplit(":", 1)
    port = int(port_str)
    addr = (host, port)

    print(f"╔══════════════════════════════════════════════════════════════╗")
    print(f"║         Maritime AIS Simulator – Starting                  ║")
    print(f"╠══════════════════════════════════════════════════════════════╣")
    print(f"║  Target:     {target:<47s}║")
    print(f"║  Vessels:    {vessel_count:<47d}║")
    print(f"║  Rate:       {rate:<47d}║")
    print(f"║  Duration:   {duration}s{' ' * (45 - len(str(duration)))}║")
    print(f"╠══════════════════════════════════════════════════════════════╣")
    print(f"║  Injected scenarios:                                       ║")
    print(f"║    1. LOITERER        (MMSI 999000001) – Lakshadweep orbit  ║")
    print(f"║    2. ZONE VIOLATOR   (MMSI 999000002) – Zone intrusion    ║")
    print(f"║    3. RENDEZVOUS A    (MMSI 999000003) – Ship-to-ship      ║")
    print(f"║    4. RENDEZVOUS B    (MMSI 999000004) – Ship-to-ship      ║")
    print(f"║    5. AIS GAP         (MMSI 999000005) – 12 min silence    ║")
    print(f"║    6. SPOOFING        (MMSI 999000006) – 100nm jumps       ║")
    print(f"╚══════════════════════════════════════════════════════════════╝")
    print()

    # Build vessels
    vessels = build_vessels(vessel_count)
    total_vessels = len(vessels)

    # Create UDP socket
    sock = socket.socket(socket.AF_INET, socket.SOCK_DGRAM)

    # Timing: we distribute messages evenly over each second
    # Each "batch" is one second; within it we send `rate` messages.
    # We round-robin through vessels.
    vessel_index = 0
    sim_elapsed = 0.0
    total_sent = 0

    # Simulation tick interval (physics update)
    # We tick all vessels once per second for simplicity
    tick_interval = 1.0

    try:
        sim_start = time.monotonic()

        while sim_elapsed < duration:
            batch_start = time.monotonic()
            batch_sent = 0

            # Tick all vessels for physics
            for v in vessels:
                v.tick(tick_interval)

            # Send `rate` messages this second, round-robin across vessels
            interval_per_msg = 1.0 / rate if rate > 0 else 1.0
            msg_start = time.monotonic()

            for i in range(rate):
                # Pick next vessel (round-robin)
                vessel = vessels[vessel_index % total_vessels]
                vessel_index += 1

                report = vessel.report()
                if report is None:
                    # AIS gap vessel is silent – skip but still count for pacing
                    continue

                payload = json.dumps(report, separators=(",", ":")).encode("utf-8")

                try:
                    sock.sendto(payload, addr)
                    batch_sent += 1
                except OSError:
                    # UDP send failed (e.g., buffer full) – skip silently
                    pass

                # Rate limiting: sleep to maintain target rate
                # Calculate expected time for this message
                expected_elapsed = (i + 1) * interval_per_msg
                actual_elapsed = time.monotonic() - msg_start
                if actual_elapsed < expected_elapsed:
                    time.sleep(expected_elapsed - actual_elapsed)

            batch_elapsed = time.monotonic() - batch_start
            total_sent += batch_sent
            sim_elapsed = time.monotonic() - sim_start

            # Print stats
            actual_rate = batch_sent / batch_elapsed if batch_elapsed > 0 else 0
            print(f"Sent {batch_sent} msgs in {batch_elapsed:.2f}s "
                  f"({actual_rate:.0f} msg/s) | "
                  f"Total: {total_sent} | "
                  f"Elapsed: {sim_elapsed:.1f}s / {duration}s")

    except KeyboardInterrupt:
        print("\n⚠ Simulator interrupted by user.")
    finally:
        sock.close()
        total_time = time.monotonic() - sim_start
        avg_rate = total_sent / total_time if total_time > 0 else 0
        print(f"\n{'=' * 60}")
        print(f"Simulation complete.")
        print(f"  Total messages sent: {total_sent:,}")
        print(f"  Total time:          {total_time:.2f}s")
        print(f"  Average rate:        {avg_rate:,.0f} msg/s")
        print(f"{'=' * 60}")


def main():
    parser = argparse.ArgumentParser(
        description="Maritime AIS Position Report Simulator – "
                    "sends UDP datagrams in aisstream.io PositionReport format.",
        formatter_class=argparse.RawDescriptionHelpFormatter,
        epilog="""
Examples:
  python simulator.py
  python simulator.py --rate 5000 --vessels 1000 --duration 120
  python simulator.py --target 192.168.1.10:9000 --rate 2000
        """,
    )
    parser.add_argument(
        "--rate", type=int, default=3000,
        help="Target messages per second (default: 3000)",
    )
    parser.add_argument(
        "--target", type=str, default="127.0.0.1:9000",
        help="UDP target as host:port (default: 127.0.0.1:9000)",
    )
    parser.add_argument(
        "--vessels", type=int, default=5000,
        help="Number of simulated vessels (default: 5000)",
    )
    parser.add_argument(
        "--duration", type=int, default=120,
        help="Simulation duration in seconds (default: 120)",
    )

    args = parser.parse_args()

    if args.rate <= 0:
        parser.error("--rate must be a positive integer")
    if args.vessels <= 0:
        parser.error("--vessels must be a positive integer")
    if args.duration <= 0:
        parser.error("--duration must be a positive integer")

    run_simulator(args.rate, args.target, args.vessels, args.duration)


if __name__ == "__main__":
    main()
