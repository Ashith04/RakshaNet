import React, { useState, useEffect } from 'react';
import { MapContainer, TileLayer, CircleMarker, Popup, Polygon } from 'react-leaflet';
import 'leaflet/dist/leaflet.css';

export default function MapView({ vessels }) {
  const [config, setConfig] = useState(null);

  useEffect(() => {
    fetch('http://localhost:8080/api/config')
      .then(res => res.json())
      .then(data => setConfig(data))
      .catch(err => console.error("Config fetch error:", err));
  }, []);

  const getVesselColor = (status) => {
    switch (status) {
      case 'violation': return 'var(--color-critical)'; // #FF3366
      case 'loitering':
      case 'ais_gap': return 'var(--color-advisory)'; // #FFB300
      case 'rendezvous': return 'var(--color-intelligence)'; // #B366FF
      default: return 'var(--color-nominal)'; // #00E5FF
    }
  };

  return (
    <div style={{ position: 'absolute', top: 0, left: 0, right: 0, bottom: 0, zIndex: 0 }}>
      <MapContainer 
        center={[15.0, 75.0]} 
        zoom={5} 
        style={{ width: '100%', height: '100%', background: 'var(--bg-void)' }}
        zoomControl={false}
        attributionControl={false}
      >
        <TileLayer
          url="https://{s}.basemaps.cartocdn.com/dark_nolabels/{z}/{x}/{y}{r}.png"
        />
        
        {config?.zones?.map((zone, idx) => {
          // Leaflet uses [lat, lon], config polygon is [[lon, lat], ...]
          const positions = zone.polygon.map(coord => [coord[1], coord[0]]);
          return (
            <Polygon 
              key={idx} 
              positions={positions} 
              pathOptions={{ 
                color: 'var(--color-critical)', 
                fillColor: 'var(--color-critical)', 
                fillOpacity: 0.15,
                weight: 1,
                dashArray: '4 4' // Tactical dashed border
              }} 
            />
          );
        })}

        {vessels.map(v => (
          <CircleMarker
            key={v.mmsi}
            center={[v.lat, v.lon]}
            radius={v.status !== 'normal' ? 4 : 2}
            pathOptions={{ 
              color: getVesselColor(v.status),
              fillColor: getVesselColor(v.status),
              fillOpacity: v.status !== 'normal' ? 0.8 : 0.4,
              weight: v.status !== 'normal' ? 1.5 : 0
            }}
          >
            <Popup className="tactical-popup">
              <div className="popup-content">
                <div className="popup-header color-nominal">{v.ship_name}</div>
                <div className="popup-stat"><span>MMSI:</span> {v.mmsi}</div>
                <div className="popup-stat"><span>SPEED:</span> {(v.sog || 0).toFixed(1)} kn</div>
                <div className="popup-stat"><span>HDG:</span> {(v.cog || 0).toFixed(1)}°</div>
                <div className="popup-stat"><span>STATUS:</span> <span style={{color: getVesselColor(v.status)}}>{v.status.toUpperCase()}</span></div>
                <div className="popup-stat"><span>SOURCE:</span> {(v.source || 'SIMULATED').toUpperCase()}</div>
              </div>
            </Popup>
          </CircleMarker>
        ))}
      </MapContainer>
      <style>{`
        /* Override leaflet popup styles to match tactical design */
        .leaflet-popup-content-wrapper {
          background: var(--bg-panel);
          border: 1px solid var(--border-tactical);
          border-radius: 2px;
          color: var(--text-primary);
          padding: 0;
        }
        .leaflet-popup-tip {
          background: var(--bg-panel);
          border: 1px solid var(--border-tactical);
        }
        .tactical-popup .popup-content {
          font-family: var(--font-mono);
          font-size: 0.75rem;
          padding: 0.5rem;
        }
        .tactical-popup .popup-header {
          font-family: var(--font-sans);
          font-weight: 700;
          font-size: 0.85rem;
          margin-bottom: 0.5rem;
          border-bottom: 1px solid var(--border-tactical);
          padding-bottom: 0.25rem;
        }
        .tactical-popup .popup-stat {
          display: flex;
          justify-content: space-between;
          margin-bottom: 0.25rem;
          gap: 1rem;
        }
        .tactical-popup .popup-stat span:first-child {
          color: var(--text-secondary);
        }
      `}</style>
    </div>
  );
}
