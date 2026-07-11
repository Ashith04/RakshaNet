import React, { useState, useEffect } from 'react';
import { MapContainer, TileLayer, CircleMarker, Popup, Polygon } from 'react-leaflet';
import 'leaflet/dist/leaflet.css';

export default function MapView({ vessels, onSelectVessel }) {
  const [config, setConfig] = useState(null);

  useEffect(() => {
    fetch('http://localhost:8080/api/config')
      .then(res => res.json())
      .then(data => setConfig(data))
      .catch(err => console.error("Config fetch error:", err));
  }, []);

  const getVesselColor = (status) => {
    switch (status) {
      case 'critical':
      case 'violation': return '#F03A2F'; // Red
      case 'warning':
      case 'loitering':
      case 'ais_gap': return '#FFB703'; // Yellow
      case 'rendezvous': return '#AA55FF'; // Purple
      default: return '#00C853'; // Green
    }
  };

  return (
    <div style={{ position: 'absolute', top: 0, left: 0, right: 0, bottom: 0, zIndex: 0 }}>
      <MapContainer 
        center={[15.0, 75.0]} 
        zoom={5} 
        style={{ width: '100%', height: '100%', background: '#FFF' }}
        zoomControl={false}
        attributionControl={false}
      >
        <TileLayer
          url="https://{s}.basemaps.cartocdn.com/light_all/{z}/{x}/{y}{r}.png"
          attribution='&copy; <a href="https://carto.com/">CARTO</a>'
        />
        
        {config?.zones?.map((zone, idx) => {
          // Leaflet uses [lat, lon], config polygon is [[lon, lat], ...]
          const positions = zone.polygon.map(coord => [coord[1], coord[0]]);
          return (
            <Polygon 
              key={idx} 
              positions={positions} 
              pathOptions={{ 
                color: '#F03A2F', 
                fillColor: '#F03A2F', 
                fillOpacity: 0.1,
                weight: 1.5,
                dashArray: '5 5'
              }} 
            />
          );
        })}

        {vessels.map(v => (
          <CircleMarker
            key={v.mmsi}
            center={[v.lat, v.lon]}
            radius={v.status !== 'normal' ? 6 : 4}
            pathOptions={{ 
              color: '#000000',
              fillColor: getVesselColor(v.status),
              fillOpacity: 1.0,
              weight: 1.5
            }}
            eventHandlers={{
              click: () => onSelectVessel && onSelectVessel(v.mmsi)
            }}
          >
            <Popup className="tactical-popup">
              <div className="popup-content">
                <div className="popup-header">{v.ship_name}</div>
                <div className="popup-stat"><span>MMSI:</span> {v.mmsi}</div>
                <div className="popup-stat"><span>SPEED:</span> {(v.sog || 0).toFixed(1)} kn</div>
                <div className="popup-stat"><span>HDG:</span> {(v.cog || 0).toFixed(0)}°</div>
                <div className="popup-stat"><span>STATUS:</span> <span style={{color: getVesselColor(v.status), fontWeight: 900}}>{v.status.toUpperCase()}</span></div>
                <div className="popup-stat"><span>SOURCE:</span> {(v.source || 'SIMULATED').toUpperCase()}</div>
              </div>
            </Popup>
          </CircleMarker>
        ))}
      </MapContainer>
      <style>{`
        .leaflet-popup-content-wrapper {
          background: #FFFFFF !important;
          border: var(--border-thick) !important;
          border-radius: 0px !important;
          color: #000000 !important;
          padding: 0 !important;
          box-shadow: none !important;
        }
        .leaflet-popup-tip {
          background: #FFFFFF !important;
          border: var(--border-thick) !important;
          box-shadow: none !important;
        }
        .tactical-popup .popup-content {
          font-family: var(--font-mono);
          font-size: 0.75rem;
          padding: 0.75rem;
        }
        .tactical-popup .popup-header {
          font-family: var(--font-sans);
          font-weight: 900;
          font-size: 0.85rem;
          margin-bottom: 0.5rem;
          border-bottom: var(--border-thin);
          padding-bottom: 0.25rem;
          text-transform: uppercase;
        }
        .tactical-popup .popup-stat {
          display: flex;
          justify-content: space-between;
          margin-bottom: 0.25rem;
          gap: 1.5rem;
        }
        .tactical-popup .popup-stat span:first-child {
          color: #666666;
          font-weight: 700;
        }
      `}</style>
    </div>
  );
}
