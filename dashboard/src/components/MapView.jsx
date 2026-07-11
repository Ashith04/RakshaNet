import React, { useState, useEffect } from 'react';
import { MapContainer, TileLayer, CircleMarker, Popup, Polygon, Polyline, Circle, useMap, GeoJSON } from 'react-leaflet';
import 'leaflet/dist/leaflet.css';

function MapController({ selectedMmsi, vessels }) {
  const map = useMap();
  useEffect(() => {
    if (selectedMmsi) {
      const v = vessels.find(v => v.mmsi === selectedMmsi);
      if (v) {
        map.flyTo([v.lat, v.lon], 10, { animate: true });
      }
    }
  }, [selectedMmsi, vessels, map]);
  return null;
}

export default function MapView({ vessels, selectedMmsi, onSelectVessel }) {
  const [config, setConfig] = useState(null);
  const [indiaGeoJson, setIndiaGeoJson] = useState(null);
  const selectedVessel = vessels.find(v => v.mmsi === selectedMmsi);

  useEffect(() => {
    fetch('http://localhost:8080/api/config')
      .then(res => res.json())
      .then(data => setConfig(data))
      .catch(err => console.error("Config fetch error:", err));
      
    fetch('/india.geojson')
      .then(res => res.json())
      .then(data => setIndiaGeoJson(data))
      .catch(err => console.log("India GeoJSON not available yet"));
  }, []);

  const getVesselColor = (status) => {
    switch (status) {
      case 'critical':
      case 'geofence_violation':
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
          url="https://{s}.basemaps.cartocdn.com/light_nolabels/{z}/{x}/{y}{r}.png"
          attribution='&copy; <a href="https://carto.com/">CARTO</a>'
        />
        <MapController selectedMmsi={selectedMmsi} vessels={vessels} />
        
        {indiaGeoJson && (
          <GeoJSON 
            data={indiaGeoJson} 
            style={{ color: '#000', weight: 1.5, fillOpacity: 0, opacity: 0.5 }} 
          />
        )}
        
        {config?.zones?.map((zone, idx) => {
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

        {config?.border?.map((segment, idx) => {
          const positions = segment.map(coord => [coord[1], coord[0]]);
          return (
            <Polyline
              key={`border-${idx}`}
              positions={positions}
              pathOptions={{
                color: '#FF5722',
                weight: 3,
                dashArray: '8 8'
              }}
            />
          );
        })}

        {vessels.flatMap(v => {
          const elements = [];
          
          // Render search area for lost AIS vessels
          if (v.threat_data?.type === 'ais_loss') {
            elements.push(
              <Circle
                key={`loss-area-${v.mmsi}`}
                center={[v.lat, v.lon]}
                radius={v.threat_data.search_area_radius * 1852}
                pathOptions={{
                  color: '#FFB703',
                  fillColor: '#FFB703',
                  fillOpacity: 0.08,
                  weight: 1.5,
                  dashArray: '5 5'
                }}
              />
            );
          }
          
          // Render cluster circle
          if (v.threat_data?.type === 'cluster') {
            elements.push(
              <Circle
                key={`cluster-area-${v.mmsi}`}
                center={[v.lat, v.lon]}
                radius={v.threat_data.cluster_radius}
                pathOptions={{
                  color: '#AA55FF',
                  fillColor: '#AA55FF',
                  fillOpacity: 0.12,
                  weight: 1.5
                }}
              />
            );
          }
          
          // Render predicted path and crossing point for border warning
          if (v.threat_data?.type === 'border_warning' && v.threat_data.crossing_point) {
            const crossLat = v.threat_data.crossing_point[1];
            const crossLon = v.threat_data.crossing_point[0];
            elements.push(
              <Polyline
                key={`path-${v.mmsi}`}
                positions={[[v.lat, v.lon], [crossLat, crossLon]]}
                pathOptions={{
                  color: '#F03A2F',
                  weight: 2,
                  dashArray: '4 4'
                }}
              />
            );
            elements.push(
              <CircleMarker
                key={`cross-pt-${v.mmsi}`}
                center={[crossLat, crossLon]}
                radius={5}
                pathOptions={{
                  color: '#000000',
                  fillColor: '#F03A2F',
                  fillOpacity: 1.0,
                  weight: 1.5
                }}
              >
                <Popup>
                  <div style={{fontFamily: 'monospace', fontSize: '0.75rem', padding: '0.25rem'}}>
                    <strong style={{color: '#F03A2F'}}>BORDER CROSSING WARNING</strong><br/>
                    <strong>VESSEL:</strong> {v.ship_name}<br/>
                    <strong>CROSSING IN:</strong> {v.threat_data.remaining_time.toFixed(0)} seconds
                  </div>
                </Popup>
              </CircleMarker>
            );
          }
          
          // Main vessel dot
          if (v.mmsi === selectedMmsi) {
            elements.push(
              <CircleMarker
                key={`highlight-${v.mmsi}`}
                center={[v.lat, v.lon]}
                radius={20}
                pathOptions={{
                  color: '#FF0000',
                  fillColor: 'transparent',
                  weight: 2,
                  dashArray: '4 4'
                }}
                className="target-ring"
              />
            );
          }
          
          elements.push(
            <CircleMarker
              key={`marker-${v.mmsi}`}
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
          );
          
          return elements;
        })}
      </MapContainer>
      
      {selectedVessel && (
        <div className="target-details-panel">
          <div className="panel-header">🎯 TARGET LOCKED</div>
          <div className="panel-body">
            <div className="detail-row"><span>SHIP NAME:</span> <strong>{selectedVessel.ship_name}</strong></div>
            <div className="detail-row"><span>MMSI:</span> <strong>{selectedVessel.mmsi}</strong></div>
            <div className="detail-row"><span>LATITUDE:</span> <strong>{selectedVessel.lat.toFixed(5)}° N</strong></div>
            <div className="detail-row"><span>LONGITUDE:</span> <strong>{selectedVessel.lon.toFixed(5)}° E</strong></div>
            <div className="detail-row"><span>SPEED:</span> <strong>{(selectedVessel.sog || 0).toFixed(1)} kn</strong></div>
            <div className="detail-row"><span>HEADING:</span> <strong>{(selectedVessel.cog || 0).toFixed(0)}°</strong></div>
            <div className="detail-row">
              <span>STATUS:</span> 
              <strong style={{ color: getVesselColor(selectedVessel.status) }}>
                {selectedVessel.status.toUpperCase().replace('_', ' ')}
              </strong>
            </div>
          </div>
        </div>
      )}
      
      <style>{`
        .target-details-panel {
          position: absolute;
          top: 20px;
          right: 20px;
          width: 300px;
          background: rgba(255, 255, 255, 0.95);
          border: 2px solid #000;
          box-shadow: 4px 4px 0px rgba(0,0,0,1);
          z-index: 1000;
          font-family: var(--font-mono);
          animation: slideInRight 0.3s ease-out;
        }
        .panel-header {
          background: #000;
          color: #FFF;
          padding: 10px;
          font-weight: 900;
          font-family: var(--font-sans);
          letter-spacing: 0.05em;
        }
        .panel-body {
          padding: 15px;
        }
        .detail-row {
          display: flex;
          justify-content: space-between;
          margin-bottom: 8px;
          font-size: 0.85rem;
          border-bottom: 1px dotted #ccc;
          padding-bottom: 4px;
        }
        .detail-row span {
          color: #555;
          font-weight: bold;
        }
        .target-ring {
          animation: pulseRing 1.5s infinite;
        }
        @keyframes pulseRing {
          0% { stroke-width: 2; opacity: 1; transform: scale(0.8); }
          100% { stroke-width: 0.5; opacity: 0; transform: scale(1.5); }
        }
        @keyframes slideInRight {
          from { transform: translateX(120%); }
          to { transform: translateX(0); }
        }
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
