import React, { useState } from 'react';
import { MapContainer, TileLayer, Polyline, Tooltip, Rectangle } from 'react-leaflet';

export default function PreDepartureView({ vessels, preDepartureData, weatherData }) {
  const [selectedMmsi, setSelectedMmsi] = useState(null);

  // Convert dictionary to array
  const reports = Object.values(preDepartureData || {});

  const selectedReport = reports.find(r => r.mmsi === selectedMmsi);

  // Helper to map lat/lon to grid cell ID exactly like backend
  const getCellId = (lat, lon) => {
    const lat_min = -2.0, lat_max = 26.0, lon_min = 60.0, lon_max = 100.0;
    const lat_divs = 14, lon_divs = 20;
    const lat_step = (lat_max - lat_min) / lat_divs;
    const lon_step = (lon_max - lon_min) / lon_divs;
    
    let lat_bucket = Math.floor((lat - lat_min) / lat_step);
    let lon_bucket = Math.floor((lon - lon_min) / lon_step);
    
    lat_bucket = Math.max(0, Math.min(lat_bucket, lat_divs - 1));
    lon_bucket = Math.max(0, Math.min(lon_bucket, lon_divs - 1));
    
    return lat_bucket * lon_divs + lon_bucket;
  };

  return (
    <div className="desk-grid">
      {/* Left panel: Table of Reports */}
      <div className="grid-panel" style={{ flex: 1 }}>
        <div className="panel-header text-mono">
          <span>&gt;_ PENDING DEPARTURES ({reports.length})</span>
        </div>
        <div className="panel-content p-0" style={{ overflowY: 'auto' }}>
          <table className="brutal-table" style={{ width: '100%', borderCollapse: 'collapse', textAlign: 'left', fontSize: '0.8rem' }}>
            <thead>
              <tr style={{ borderBottom: '2px solid #333' }}>
                <th style={{ padding: '0.5rem' }}>MMSI / NAME</th>
                <th style={{ padding: '0.5rem' }}>ROUTE</th>
                <th style={{ padding: '0.5rem' }}>RISK SCORE</th>
                <th style={{ padding: '0.5rem' }}>MONITORING</th>
              </tr>
            </thead>
            <tbody>
              {reports.map(r => (
                <tr 
                  key={r.mmsi} 
                  onClick={() => setSelectedMmsi(r.mmsi)}
                  style={{ 
                    cursor: 'pointer', 
                    background: selectedMmsi === r.mmsi ? '#333' : 'transparent',
                    borderBottom: '1px solid #222'
                  }}
                >
                  <td style={{ padding: '0.5rem' }}>
                    <strong>{r.mmsi}</strong><br/>
                    <span style={{color: '#888'}}>{r.ship_name}</span>
                  </td>
                  <td style={{ padding: '0.5rem' }}>
                    {r.departure_port} &rarr; {r.destination_port}
                  </td>
                  <td style={{ padding: '0.5rem' }}>
                    <div style={{
                      color: r.overall_voyage_risk > 60 ? '#FF5722' : '#00C853',
                      fontWeight: 'bold',
                      fontSize: '1rem'
                    }}>
                      {r.overall_voyage_risk}%
                    </div>
                  </td>
                  <td style={{ padding: '0.5rem' }}>
                    {r.recommended_monitoring}
                  </td>
                </tr>
              ))}
              {reports.length === 0 && (
                <tr>
                  <td colSpan="4" style={{ padding: '1rem', textAlign: 'center', color: '#555' }}>
                    Waiting for Pre-Departure Intelligence data...
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </div>

      {/* Right panel: Detail View & Map */}
      <div className="grid-panel map-panel" style={{ flex: 1.5, display: 'flex', flexDirection: 'column' }}>
        <div className="panel-header text-mono">
          <span>&#9650; VOYAGE PRE-DEPARTURE ANALYSIS</span>
        </div>
        <div className="panel-content p-0" style={{ flex: 1, display: 'flex', flexDirection: 'column' }}>
          {selectedReport ? (
            <>
              {/* Map Section */}
              <div style={{ flex: 1, position: 'relative', minHeight: '300px' }}>
                <MapContainer 
                  center={[selectedReport.planned_route[0]?.lat || 15.0, selectedReport.planned_route[0]?.lon || 75.0]} 
                  zoom={5} 
                  style={{ height: '100%', width: '100%', background: '#0a0a0a' }}
                  zoomControl={false}
                >
                  <TileLayer
                    url="https://{s}.basemaps.cartocdn.com/dark_nolabels/{z}/{x}/{y}{r}.png"
                    attribution='&copy; CARTO'
                  />
                  
                  {/* Weather Overlay for the specific route */}
                  {Object.entries(weatherData || {}).map(([cellId, weather]) => {
                    const id = parseInt(cellId);
                    const grid_lon_divs = 20;
                    const lat_min = -2.0;
                    const lon_min = 60.0;
                    const lat_step = 2.0;
                    const lon_step = 2.0;
          
                    const row = Math.floor(id / grid_lon_divs);
                    const col = id % grid_lon_divs;
                    
                    const cell_lat_min = lat_min + row * lat_step;
                    const cell_lat_max = cell_lat_min + lat_step;
                    const cell_lon_min = lon_min + col * lon_step;
                    const cell_lon_max = cell_lon_min + lon_step;
                    
                    let color = '#00C853'; 
                    let opacity = 0.05;
                    
                    if (weather.is_storm) {
                      color = '#8A2BE2';
                      opacity = 0.25;
                    } else if (weather.wind_speed_kmh > 40) {
                      color = '#FF5722';
                      opacity = 0.2;
                    } else if (weather.wind_speed_kmh > 20) {
                      color = '#FFB703';
                      opacity = 0.15;
                    } else {
                      return null;
                    }
          
                    return (
                      <Rectangle
                        key={`weather-${id}`}
                        bounds={[[cell_lat_min, cell_lon_min], [cell_lat_max, cell_lon_max]]}
                        pathOptions={{ color, fillColor: color, fillOpacity: opacity, weight: 0 }}
                      />
                    );
                  })}

                  {/* Planned Route Polyline */}
                  <Polyline 
                    positions={selectedReport.planned_route.map(wp => [wp.lat, wp.lon])} 
                    pathOptions={{ color: '#00E5FF', weight: 3, dashArray: '5, 10' }}
                  />
                </MapContainer>
              </div>

              {/* Analysis Report Section */}
              <div style={{ flex: 1, padding: '1rem', background: '#f4f4f4', overflowY: 'auto' }}>
                <h3 style={{ margin: '0 0 1rem 0', color: '#111' }}>PRE-DEPARTURE REPORT</h3>
                
                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '1rem', marginBottom: '1.5rem', color: '#333' }}>
                  <div><strong>MMSI:</strong> {selectedReport.mmsi}</div>
                  <div><strong>Destination:</strong> {selectedReport.destination_port}</div>
                  <div><strong>ETA:</strong> {selectedReport.eta_hours} Hours</div>
                  <div><strong>Historical Behaviour:</strong> {selectedReport.historical_behaviour}</div>
                </div>

                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '1rem', marginBottom: '1.5rem' }}>
                  <div className="telemetry-card" style={{ background: '#fff', padding: '1rem', border: '1px solid #ccc' }}>
                    <div style={{ fontWeight: 'bold', marginBottom: '0.5rem', color: '#555' }}>RISK FACTORS</div>
                    <div style={{ display: 'flex', justifyContent: 'space-between', borderBottom: '1px solid #eee', padding: '0.25rem 0' }}>
                      <span style={{ color: '#333' }}>Weather Risk</span>
                      <strong style={{ color: selectedReport.weather_risk === 'High' ? 'red' : 'green' }}>{selectedReport.weather_risk}</strong>
                    </div>
                    <div style={{ display: 'flex', justifyContent: 'space-between', borderBottom: '1px solid #eee', padding: '0.25rem 0' }}>
                      <span style={{ color: '#333' }}>Protected Zone Risk</span>
                      <strong style={{ color: selectedReport.protected_zone_risk === 'High' ? 'red' : 'green' }}>{selectedReport.protected_zone_risk}</strong>
                    </div>
                    <div style={{ display: 'flex', justifyContent: 'space-between', padding: '0.25rem 0' }}>
                      <span style={{ color: '#333' }}>Border Risk</span>
                      <strong style={{ color: selectedReport.border_risk === 'High' ? 'red' : 'green' }}>{selectedReport.border_risk}</strong>
                    </div>
                  </div>
                  
                  <div className="telemetry-card" style={{ background: '#fff', padding: '1rem', border: '1px solid #ccc' }}>
                    <div style={{ fontWeight: 'bold', marginBottom: '0.5rem', color: '#555' }}>DECISION SUPPORT</div>
                    <div style={{ marginBottom: '0.5rem', color: '#333' }}>
                      Deviation Probability: <strong>{selectedReport.deviation_probability}%</strong>
                    </div>
                    <div style={{ marginBottom: '0.5rem', color: '#333' }}>
                      Recommended Route: <strong>{selectedReport.recommended_route}</strong>
                    </div>
                    
                    {selectedReport.overall_voyage_risk > 60 && (
                      <div style={{ marginTop: '0.5rem', padding: '0.5rem', background: '#FFEBEE', color: '#D32F2F', fontWeight: 'bold', border: '1px solid #D32F2F' }}>
                        ACTION: INCREASE MONITORING PRIORITY
                      </div>
                    )}
                  </div>
                </div>

              </div>
            </>
          ) : (
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', height: '100%', color: '#555' }}>
              Select a vessel to view Pre-Departure Intelligence.
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
