import React, { useState, useEffect } from 'react';
import { MapContainer, TileLayer, CircleMarker, Popup, Tooltip, Polygon, Polyline, Circle, Rectangle, useMap, GeoJSON } from 'react-leaflet';
import 'leaflet/dist/leaflet.css';

function MapController({ selectedMmsi, vessels }) {
  const map = useMap();
  useEffect(() => {
    if (selectedMmsi) {
      const v = vessels.find(v => String(v.mmsi) === String(selectedMmsi));
      if (v) {
        map.flyTo([v.lat, v.lon], 10, { animate: true });
      }
    }
  }, [selectedMmsi, vessels, map]);
  return null;
}

export default function MapView({ vessels, buckets = [], selectedMmsi, onSelectVessel }) {
  const [config, setConfig] = useState(null);
  const [indiaGeoJson, setIndiaGeoJson] = useState(null);

  const OCEAN_GRIDS = ["A01", "A02", "A03", "A04", "B01", "B02", "B03", "B04", "B05", "B15", "B16", "C01", "C02", "C03", "C04", "C05", "C06", "C07", "C14", "C15", "C16", "C17", "D01", "D02", "D03", "D04", "D05", "D06", "D07", "D12", "D13", "D14", "D15", "D16", "D17", "D18", "E01", "E02", "E03", "E04", "E05", "E06", "E07", "E11", "E12", "E13", "E14", "E15", "E16", "E17", "E18", "E19", "F01", "F02", "F03", "F04", "F05", "F06", "F07", "F08", "F11", "F12", "F13", "F14", "F15", "F16", "F17", "F18", "F19", "G01", "G02", "G03", "G04", "G05", "G06", "G07", "G08", "G11", "G12", "G13", "G14", "G15", "G16", "G17", "G18", "G19", "G20", "H01", "H02", "H03", "H04", "H05", "H06", "H07", "H08", "H09", "H10", "H11", "H12", "H13", "H14", "H15", "H16", "H17", "H18", "H19", "H20", "I01", "I02", "I03", "I04", "I05", "I06", "I07", "I08", "I09", "I10", "I11", "I12", "I13", "I14", "I15", "I16", "I17", "I18", "I19", "I20", "J01", "J02", "J03", "J04", "J05", "J06", "J07", "J08", "J09", "J10", "J11", "J12", "J13", "J14", "J15", "J16", "J17", "J18", "J19", "J20", "K01", "K02", "K03", "K04", "K05", "K06", "K07", "K08", "K09", "K10", "K11", "K12", "K13", "K14", "K15", "K16", "K17", "K18", "K19", "K20", "L01", "L02", "L03", "L04", "L05", "L06", "L07", "L08", "L09", "L10", "L11", "L12", "L13", "L14", "L15", "L16", "L17", "L18", "L19", "L20", "M01", "M02", "M03", "M04", "M05", "M06", "M07", "M08", "M09", "M10", "M11", "M12", "M13", "M14", "M15", "M16", "M17", "M18", "M19", "M20", "N01", "N02", "N03", "N04", "N05", "N06", "N07", "N08", "N09", "N10", "N11", "N12", "N13", "N14", "N15", "N16", "N17", "N18", "N19", "N20"];
  const [showBuckets, setShowBuckets] = useState(false);
  const selectedVessel = vessels.find(v => String(v.mmsi) === String(selectedMmsi));

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

  const getBucketColor = (score) => {
    if (score >= 80) return '#F03A2F'; // Red
    if (score >= 50) return '#FF5722'; // Orange
    if (score >= 20) return '#FFB703'; // Yellow
    return '#00C853'; // Green
  };

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
      <div style={{ position: 'absolute', top: 20, left: 60, zIndex: 1000 }}>
        <button 
          onClick={() => setShowBuckets(!showBuckets)}
          style={{
            background: '#000',
            color: '#FFF',
            border: '2px solid #FFF',
            padding: '8px 12px',
            fontFamily: 'var(--font-mono)',
            fontWeight: 'bold',
            cursor: 'pointer',
            boxShadow: '2px 2px 0px rgba(0,0,0,0.5)'
          }}
        >
          {showBuckets ? 'DISABLE THREAT BUCKETS' : 'ENABLE THREAT BUCKETS'}
        </button>
      </div>
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
        
        {showBuckets && OCEAN_GRIDS.map(grid_id => {
          const row_idx = grid_id.charCodeAt(0) - 65; // A -> 0
          const col_idx = parseInt(grid_id.substring(1), 10) - 1; // 01 -> 0
          const lat_max = 26.0 - row_idx * 2.0;
          const lat_min = 26.0 - (row_idx + 1) * 2.0;
          const lon_min = 60.0 + col_idx * 2.0;
          const lon_max = 60.0 + (col_idx + 1) * 2.0;
          
          const b = buckets.find(bucket => bucket.bucket_id === grid_id);
          const hasVessels = !!b;
          
          let color = hasVessels ? getBucketColor(b.threat_score) : '#2A82DA';
          const isStormy = b && b.weather_severe;
          if (isStormy) {
            color = '#8A2BE2'; // Storm purple
          }
          
          return (
            <Rectangle
              key={grid_id}
              bounds={[[lat_min, lon_min], [lat_max, lon_max]]}
              pathOptions={{ 
                color, 
                fillColor: color, 
                weight: hasVessels || isStormy ? 1.5 : 1, 
                fillOpacity: isStormy ? 0.3 : (hasVessels ? 0.15 : 0.02),
                dashArray: hasVessels || isStormy ? '' : '5 5'
              }}
            >
              <Tooltip permanent direction="center" className="grid-tooltip">
                <span style={{ fontSize: '0.65rem', fontWeight: 'bold', color: hasVessels || isStormy ? '#fff' : '#2A82DA', textShadow: hasVessels || isStormy ? '1px 1px 2px #000' : 'none' }}>
                  {grid_id}
                </span>
              </Tooltip>
              <Popup className="tactical-popup">
                <div className="popup-content">
                  <div className="popup-header" style={{backgroundColor: color}}>GRID {grid_id}</div>
                  {isStormy && <div className="popup-stat" style={{color: '#FF6347', fontWeight: 'bold'}}>⚠ SEVERE WEATHER ACTIVE</div>}
                  <div className="popup-stat"><span>LAT RANGE:</span> {lat_min.toFixed(2)}° to {lat_max.toFixed(2)}° N</div>
                  <div className="popup-stat"><span>LON RANGE:</span> {lon_min.toFixed(2)}° to {lon_max.toFixed(2)}° E</div>
                  <div className="popup-stat"><span>TOTAL VESSELS:</span> {hasVessels ? b.ships : 0}</div>
                  <div className="popup-stat"><span>HIGH RISK VESSELS:</span> {hasVessels ? (b.high_risk_vessels || 0) : 0}</div>
                  <div className="popup-stat"><span>CRITICAL ALERTS:</span> {hasVessels ? (b.critical_alerts || 0) : 0}</div>
                  <div className="popup-stat"><span>PROTECTED ZONES:</span> {hasVessels ? (b.intersecting_zones?.includes(1) || b.intersecting_zones?.includes(2) ? 'YES' : 'NONE') : 'NONE'}</div>
                  <div className="popup-stat"><span>BORDERS:</span> {hasVessels ? (b.intersecting_zones?.includes(3) || b.intersecting_zones?.includes(4) ? 'INTL BORDER' : 'NONE') : 'NONE'}</div>
                  <div className="popup-stat"><span>THREAT LEVEL:</span> <span style={{color, fontWeight: 'bold'}}>{!hasVessels ? 'CLEAR' : color === '#00FF00' ? 'NORMAL' : color === '#FFD700' ? 'SUSPICIOUS' : color === '#FF8C00' ? 'HIGH RISK' : color === '#8A2BE2' ? 'WEATHER REFUGE' : 'CRITICAL'}</span></div>
                  <div className="popup-stat"><span>MAX RISK SCORE:</span> <span style={{color, fontWeight: 'bold'}}>{hasVessels ? b.threat_score : 0}</span></div>
                </div>
              </Popup>
            </Rectangle>
          );
        })}
        
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
          
          // Render predicted path and crossing point for border or zone warning
          if ((v.threat_data?.type === 'border_warning' || v.threat_data?.type === 'zone_prediction') && v.threat_data.crossing_point) {
            const crossLat = v.threat_data.crossing_point[1];
            const crossLon = v.threat_data.crossing_point[0];
            elements.push(
              <Polyline
                key={`path-${v.mmsi}`}
                positions={[[v.lat, v.lon], [crossLat, crossLon]]}
                pathOptions={{
                  color: v.threat_data.type === 'border_warning' ? '#F03A2F' : '#FFB703',
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
                  fillColor: v.threat_data.type === 'border_warning' ? '#F03A2F' : '#FFB703',
                  fillOpacity: 1.0,
                  weight: 1.5
                }}
              >
                <Popup>
                  <div style={{fontFamily: 'monospace', fontSize: '0.75rem', padding: '0.25rem'}}>
                    <strong style={{color: v.threat_data.type === 'border_warning' ? '#F03A2F' : '#FFB703'}}>
                      {v.threat_data.type === 'border_warning' ? 'BORDER CROSSING WARNING' : 'ZONE INTRUSION PREDICTED'}
                    </strong><br/>
                    <strong>VESSEL:</strong> {v.ship_name}<br/>
                    <strong>CROSSING IN:</strong> {v.threat_data.remaining_time.toFixed(0)} seconds
                  </div>
                </Popup>
              </CircleMarker>
            );
          }
          
          // Main vessel dot
          if (String(v.mmsi) === String(selectedMmsi)) {
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
