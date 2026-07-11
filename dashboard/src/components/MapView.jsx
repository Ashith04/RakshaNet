import { useEffect, useMemo } from 'react';
import { MapContainer, TileLayer, CircleMarker, Popup, Polygon, useMap } from 'react-leaflet';

const STATUS_COLORS = {
  normal: '#00ff88',
  loitering: '#ffaa00',
  ais_gap: '#ffaa00',
  warning: '#ffaa00',
  geofence_violation: '#ff3366',
  danger: '#ff3366',
  rendezvous: '#aa55ff',
  flagged: '#aa55ff',
};

const STATUS_LABELS = {
  normal: 'Normal Transit',
  loitering: 'Loitering',
  ais_gap: 'AIS Gap',
  warning: 'Warning',
  geofence_violation: 'Geofence Violation',
  danger: 'Danger',
  rendezvous: 'Rendezvous Flagged',
  flagged: 'Flagged',
};

function getStatusColor(status) {
  if (!status) return STATUS_COLORS.normal;
  const key = status.toLowerCase().replace(/\s+/g, '_');
  return STATUS_COLORS[key] || STATUS_COLORS.normal;
}

function getStatusLabel(status) {
  if (!status) return 'Normal Transit';
  const key = status.toLowerCase().replace(/\s+/g, '_');
  return STATUS_LABELS[key] || status;
}

function formatCoord(val, isLat) {
  if (val == null) return '—';
  const dir = isLat ? (val >= 0 ? 'N' : 'S') : (val >= 0 ? 'E' : 'W');
  return `${Math.abs(val).toFixed(4)}° ${dir}`;
}

// Component to invalidate map size on mount
function MapResizer() {
  const map = useMap();
  useEffect(() => {
    setTimeout(() => map.invalidateSize(), 100);
  }, [map]);
  return null;
}

function VesselMarker({ vessel }) {
  const color = getStatusColor(vessel.status);
  const label = getStatusLabel(vessel.status);
  const isAlert = vessel.status && vessel.status !== 'normal';

  return (
    <CircleMarker
      center={[vessel.lat, vessel.lon]}
      radius={isAlert ? 7 : 5}
      pathOptions={{
        fillColor: color,
        fillOpacity: isAlert ? 0.9 : 0.7,
        color: color,
        weight: isAlert ? 2 : 1,
        opacity: isAlert ? 0.8 : 0.5,
      }}
    >
      <Popup>
        <div className="vessel-popup">
          <h3>
            <span className="status-dot" style={{ background: color }} />
            {vessel.ship_name || 'Unknown Vessel'}
          </h3>
          <div className="popup-grid">
            <span className="label">MMSI</span>
            <span className="value">{vessel.mmsi}</span>

            <span className="label">Status</span>
            <span className="value" style={{ color }}>{label}</span>

            <span className="label">Speed</span>
            <span className="value">{vessel.sog != null ? `${vessel.sog.toFixed(1)} kn` : '—'}</span>

            <span className="label">Heading</span>
            <span className="value">{vessel.cog != null ? `${vessel.cog.toFixed(1)}°` : '—'}</span>

            <span className="label">Lat</span>
            <span className="value">{formatCoord(vessel.lat, true)}</span>

            <span className="label">Lon</span>
            <span className="value">{formatCoord(vessel.lon, false)}</span>
          </div>
          {isAlert && (
            <div
              className="alert-badge"
              style={{
                background: `${color}18`,
                color: color,
                border: `1px solid ${color}40`,
              }}
            >
              ⚠ {label}
            </div>
          )}
        </div>
      </Popup>
    </CircleMarker>
  );
}

function GeofenceZone({ zone }) {
  // Config gives polygon as [[lon, lat], ...] — Leaflet needs [[lat, lon], ...]
  const positions = useMemo(() => {
    if (!zone.polygon || !Array.isArray(zone.polygon)) return [];
    return zone.polygon.map(([lon, lat]) => [lat, lon]);
  }, [zone.polygon]);

  if (positions.length < 3) return null;

  return (
    <Polygon
      positions={positions}
      pathOptions={{
        color: '#ff3366',
        fillColor: '#ff3366',
        fillOpacity: 0.08,
        weight: 1.5,
        opacity: 0.5,
        dashArray: '8 4',
      }}
    >
      <Popup>
        <div className="vessel-popup">
          <h3>
            <span className="status-dot" style={{ background: '#ff3366' }} />
            {zone.name || 'Restricted Zone'}
          </h3>
          <div className="popup-grid">
            <span className="label">Type</span>
            <span className="value">Geofence Zone</span>
            <span className="label">Vertices</span>
            <span className="value">{zone.polygon.length}</span>
          </div>
        </div>
      </Popup>
    </Polygon>
  );
}

function MapView({ vessels, config }) {
  const vesselList = useMemo(() => Object.values(vessels || {}), [vessels]);
  const zones = config?.zones || [];

  return (
    <div className="map-container">
      <MapContainer
        center={[15, 70]}
        zoom={5}
        zoomControl={false}
        attributionControl={false}
        style={{ width: '100%', height: '100%' }}
      >
        <MapResizer />
        <TileLayer
          url="https://{s}.basemaps.cartocdn.com/dark_all/{z}/{x}/{y}{r}.png"
          attribution='&copy; <a href="https://carto.com/">CARTO</a>'
          subdomains="abcd"
          maxZoom={19}
        />

        {/* Geofence zones */}
        {zones.map((zone, idx) => (
          <GeofenceZone key={zone.name || idx} zone={zone} />
        ))}

        {/* Vessels */}
        {vesselList.map((vessel) => (
          <VesselMarker key={vessel.mmsi} vessel={vessel} />
        ))}
      </MapContainer>
    </div>
  );
}

export default MapView;
