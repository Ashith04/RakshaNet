import React, { useState } from 'react';
import MapView from './MapView';

export default function TargetDesk({ vessels, alerts, weatherData, preDepartureData, selectedMmsi, setSelectedMmsi }) {
  const [searchQuery, setSearchQuery] = useState('');
  
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
  
  // Find highest risk vessel or search match
  const targetVessel = vessels.find(v => v.mmsi === selectedMmsi) || 
                       vessels.find(v => v.mmsi.toString().includes(searchQuery)) || 
                       vessels.find(v => v.status === 'geofence_violation' || v.status === 'loitering' || v.status === 'ais_gap' || v.status === 'rendezvous') || 
                       vessels[0];

  const vesselWeather = targetVessel && weatherData ? weatherData[getCellId(targetVessel.lat, targetVessel.lon)] : null;
  const vesselPreDeparture = targetVessel && preDepartureData ? preDepartureData[targetVessel.mmsi] : null;

  const getRiskScore = (v) => {
    if (v.threat_data?.risk_score) {
      return v.threat_data.risk_score;
    }
    switch (v.status) {
      case 'geofence_violation': return 85;
      case 'loitering': return 65;
      case 'ais_gap': return 55;
      case 'rendezvous': return 75;
      default: return 12;
    }
  };

  const getRiskColor = (v) => {
    const score = getRiskScore(v);
    if (score >= 70) return '#F03A2F'; // Red
    if (score >= 40) return '#FFB703'; // Yellow
    return '#00C853'; // Green
  };

  const getLatencyBadge = (latency) => {
    if (latency == null || isNaN(latency)) return <span className="latency-badge" style={{color: '#999', fontWeight: 900}}>N/A</span>;
    if (latency < 5) return <span className="latency-badge" style={{color: '#00C853', fontWeight: 900}}>🟢 {latency.toFixed(2)} ms</span>;
    if (latency <= 10) return <span className="latency-badge" style={{color: '#FFB703', fontWeight: 900}}>🟡 {latency.toFixed(2)} ms</span>;
    return <span className="latency-badge" style={{color: '#F03A2F', fontWeight: 900}}>🔴 {latency.toFixed(2)} ms</span>;
  };

  const renderThreatCard = (v) => {
    const alert = alerts.find(a => a.mmsi === v.mmsi);
    const td = v.threat_data;

    // If no alert exists or vessel is completely normal
    if (!alert && !td) {
      return (
        <div className="threat-card-inner">
          <div className="target-metrics">
            <div className="metric-box">
              <div className="metric-label">BEHAVIOR STATUS</div>
              <div className="metric-val text-green" style={{color: '#00C853'}}>NORMAL TRANSIT</div>
            </div>
            <div className="metric-box">
              <div className="metric-label">THREAT LEVEL</div>
              <div className="metric-val text-green" style={{color: '#00C853'}}>NORMAL</div>
            </div>
          </div>
          <div className="target-triggers">
            <div className="trigger-header">DIAGNOSTIC CHECKS</div>
            <div className="trigger-row normal" style={{background: '#E0FFE0', color: '#008800', padding: '1rem', fontSize: '0.8rem', fontWeight: 600}}>
              &#10003; No active anomalies detected. Vessel is transiting in normal speed bands.
            </div>
          </div>
        </div>
      );
    }

    // Exact Format Required by User
    return (
      <div className="threat-card-inner alert-data-view" style={{ background: '#111', color: '#FFF', padding: '1.5rem', marginTop: '1rem', border: '2px solid #F03A2F' }}>
        <div style={{ color: '#F03A2F', fontSize: '1.2rem', fontWeight: 900, marginBottom: '1rem', display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
          <span className="pulse-dot" style={{width: '12px', height: '12px', background: '#F03A2F', borderRadius: '50%', display: 'inline-block'}}></span>
          HIGH PRIORITY ALERT
        </div>
        
        <div style={{ display: 'grid', gridTemplateColumns: '150px 1fr', gap: '0.5rem', fontFamily: 'monospace', fontSize: '0.85rem' }}>
          <div style={{ color: '#AAA' }}>MMSI</div>
          <div>: {v.mmsi}</div>
          
          <div style={{ color: '#AAA' }}>Type</div>
          <div>: {alert?.alert_type?.replace('_', ' ').toUpperCase() || td?.type?.toUpperCase()}</div>
          
          <div style={{ color: '#AAA' }}>Risk Score</div>
          <div style={{ color: getRiskColor(v) }}>: {alert?.risk_score || getRiskScore(v)}</div>
          
          <div style={{ color: '#AAA' }}>Confidence</div>
          <div>: {alert?.confidence ? alert.confidence + '%' : '98%'}</div>
          
          <div style={{ color: '#AAA' }}>Processing Latency</div>
          <div style={{ color: '#00FF00' }}>
            : {alert?.processing_latency_ms < 0.01 ? '< 0.01' : alert?.processing_latency_ms?.toFixed(2) || 'N/A'} ms
          </div>
          
          <div style={{ color: '#AAA' }}>Detected At</div>
          <div>: {alert ? new Date(alert.timestamp * 1000).toISOString().split('T')[1].replace('Z', '') + ' UTC' : new Date().toISOString().split('T')[1].replace('Z', '') + ' UTC'}</div>
          
          <div style={{ color: '#AAA' }}>Worker</div>
          <div>: W-{alert?.worker_id || 0}</div>
          
          <div style={{ color: '#AAA' }}>Grid</div>
          <div>: G-{v.cell_id || '145'}</div>
          
          <div style={{ color: '#AAA' }}>Speed</div>
          <div>: {(v.sog || 0).toFixed(1)} knots</div>
          
          <div style={{ color: '#AAA' }}>Heading</div>
          <div>: {(v.cog || 0).toFixed(0)}&deg;</div>
          
          <div style={{ color: '#AAA' }}>Status</div>
          <div style={{ color: '#F03A2F', fontWeight: 900 }}>: ACTIVE</div>
        </div>
        
        {alert?.weather_context && (
          <div style={{ marginTop: '1rem', padding: '1rem', background: '#1A1A1A', border: '1px solid #444', fontFamily: 'monospace', fontSize: '0.85rem' }}>
            <div style={{ color: '#00C853', fontWeight: 900, marginBottom: '0.5rem', fontSize: '1rem' }}>WEATHER CONTEXT</div>
            <div style={{ display: 'grid', gridTemplateColumns: '150px 1fr', gap: '0.5rem' }}>
              <div style={{ color: '#AAA' }}>Wind Speed</div>
              <div>: {alert.weather_context.wind_speed.toFixed(1)} km/h</div>
              <div style={{ color: '#AAA' }}>Wave Height</div>
              <div>: {alert.weather_context.wave_height.toFixed(1)} m</div>
              <div style={{ color: '#AAA' }}>Visibility</div>
              <div>: {alert.weather_context.visibility}</div>
              <div style={{ color: '#AAA' }}>Storm</div>
              <div style={{ color: alert.weather_context.storm ? '#F03A2F' : 'inherit' }}>: {alert.weather_context.storm ? 'Yes' : 'No'}</div>
              <div style={{ color: '#AAA', marginTop: '0.5rem' }}>Weather Impact</div>
              <div style={{ color: '#FFB703', fontWeight: 'bold', marginTop: '0.5rem' }}>: {alert.weather_context.weather_impact}</div>
            </div>
          </div>
        )}
      </div>
    );
  };

  const getNmeaStream = (v) => {
    if (!v) return ["// No active transponders selected..."];
    const nowStr = new Date().toLocaleTimeString();
    
    if (v.threat_data?.type === 'border_warning') {
      return [
        `[${nowStr}] !AIVDM,1,1,,A,13MDI200000004@007Dp...`,
        `[DEC] MMSI: ${v.mmsi} (${v.ship_name}) approaching international maritime boundary.`,
        `[TRG] Border warning generated. Distance: ${v.threat_data.distance_to_border?.toFixed(2)} NM. Crossing predicted in ${v.threat_data.remaining_time?.toFixed(0)}s.`,
        `[REC] ACTION: ${v.threat_data.recommendation}`
      ];
    } else if (v.threat_data?.type === 'ais_loss') {
      return [
        `[${nowStr}] [SIGNAL LOSS DETECTION LOG]`,
        `[TRG] MMSI: ${v.mmsi} (${v.ship_name}) transponder silent for ${v.threat_data.elapsed_time?.toFixed(0)}s.`,
        `[EST] Estimated Search Area Radius: ${v.threat_data.search_area_radius?.toFixed(3)} NM.`,
        `[REC] ACTION: ${v.threat_data.recommendation}`
      ];
    } else if (v.threat_data?.type === 'loitering') {
      return [
        `[${nowStr}] !AIVDM,1,1,,A,133sVf0P00PD>GBH?vj...`,
        `[TRG] MMSI: ${v.mmsi} (${v.ship_name}) loitering inside protected sector. Duration: ${v.threat_data.stationary_duration?.toFixed(0)}s.`,
        `[REC] ACTION: ${v.threat_data.recommendation}`
      ];
    } else if (v.threat_data?.type === 'cluster') {
      return [
        `[${nowStr}] [PERSISTENT VESSEL CLUSTER DETECTED]`,
        `[TRG] Involves: ${v.threat_data.ships_involved?.map(s => `${s.ship_name} (${s.mmsi})`).join(', ')}`,
        `[TRG] Cluster active for ${v.threat_data.cluster_duration?.toFixed(0)}s. Radius: 300m.`,
        `[REC] ACTION: ${v.threat_data.recommendation}`
      ];
    } else {
      return [
        `[${nowStr}] !AIVDM,1,1,,A,13MDI200000004@007Dp...`,
        `[DEC] MMSI: ${v.mmsi} (${v.ship_name}) transiting normally. Speed: ${v.sog?.toFixed(1)} kn, Course: ${v.cog?.toFixed(0)}°.`,
        `[TRG] No anomalies registered.`
      ];
    }
  };

  const getTargetStatusLabel = (status) => {
    switch (status) {
      case 'geofence_violation': return 'BORDER WARNING';
      case 'loitering': return 'LOITERING ALERT';
      case 'ais_gap': return 'AIS SIGNAL LOSS';
      case 'rendezvous': return 'PERSISTENT CLUSTER';
      default: return 'NORMAL TRANSIT';
    }
  };

  return (
    <div className="target-desk">
      <div className="desk-header">
        <div>
          <h1 className="desk-title">AIS ANOMALY & THREAT PRIORITIZER</h1>
          <div className="desk-subtitle">AUTOMATED SPATIAL PERIMETER CHECKS & REAL-TIME BEHAVIORAL DIAGNOSTICS ON INCOMING TRANSPONDER STRINGS.</div>
        </div>
        
        <div className="desk-actions">
          <input 
            type="text" 
            placeholder="Search Target MMSI..." 
            className="brutalist-input text-mono"
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
          />
          <button className="brutalist-button" onClick={() => { setSearchQuery(''); setSelectedMmsi(null); }}>RESET AIS STREAM</button>
          <button className="brutalist-button invert">CUSTOM AIS INGRESS</button>
        </div>
      </div>
      
      <div className="desk-grid">
        {/* NMEA Stream */}
        <div className="grid-panel">
          <div className="panel-header text-mono">
            <span>&gt;_ NMEA DECODER STREAM</span>
          </div>
          <div className="panel-content nmea-terminal text-mono">
            {getNmeaStream(targetVessel).map((line, i) => (
              <div key={i} className={line.startsWith('[TRG]') || line.startsWith('[SIGNAL') ? 'nmea-highlight' : 'nmea-dim'}>
                {line}
              </div>
            ))}
          </div>
        </div>

        {/* Tactical Map */}
        <div className="grid-panel map-panel">
          <div className="panel-header text-mono">
            <span>&#9650; SECTOR DELTA TACTICAL MAP PLOT</span>
          </div>
          <div className="panel-content p-0">
            <MapView 
              vessels={vessels.filter(v => !searchQuery || v.mmsi.toString().includes(searchQuery))} 
              onSelectVessel={setSelectedMmsi}
            />
            {vesselWeather && (
              <div className="telemetry-card alert-context" style={{padding: '1rem', background: '#f9f9f9', borderTop: '2px solid #000'}}>
                <div className="card-header" style={{ color: vesselWeather.is_storm ? '#8A2BE2' : '#FFB703', fontWeight: 'bold' }}>WEATHER INFORMATION</div>
                <div className="grid-2-col" style={{display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '0.5rem', marginTop: '0.5rem'}}>
                  <div className="stat-row"><span>Wind Speed:</span> {(vesselWeather.wind_speed_kmh).toFixed(1)} km/h</div>
                  <div className="stat-row"><span>Visibility:</span> {(vesselWeather.visibility_m / 1000).toFixed(1)} km</div>
                  <div className="stat-row"><span>Storm:</span> {vesselWeather.is_storm ? 'YES' : 'NO'}</div>
                  <div className="stat-row"><span>Sea State:</span> {vesselWeather.is_storm ? 'Rough' : vesselWeather.wind_speed_kmh > 40 ? 'Rough' : 'Moderate'}</div>
                </div>
                {vesselWeather.is_storm && (
                  <div style={{ marginTop: '10px', color: '#8A2BE2', fontWeight: 'bold' }}>
                    Weather Impact: Possible Weather Assisted Deviation
                  </div>
                )}
              </div>
            )}
            
            {vesselPreDeparture && (
              <div className="telemetry-card alert-context" style={{padding: '1rem', background: '#e3f2fd', borderTop: '2px solid #000', marginTop: '1rem'}}>
                <div className="card-header" style={{ color: '#0277bd', fontWeight: 'bold' }}>PRE-DEPARTURE INTELLIGENCE</div>
                <div className="grid-2-col" style={{display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '0.5rem', marginTop: '0.5rem'}}>
                  <div className="stat-row"><span>Planned Route:</span> {vesselPreDeparture.departure_port} &rarr; {vesselPreDeparture.destination_port}</div>
                  <div className="stat-row"><span>ETA:</span> {vesselPreDeparture.eta_hours} Hours</div>
                  <div className="stat-row"><span>Overall Voyage Risk:</span> {vesselPreDeparture.overall_voyage_risk}%</div>
                  <div className="stat-row"><span>Historical Behaviour:</span> {vesselPreDeparture.historical_behaviour}</div>
                </div>
                <div style={{ marginTop: '10px', color: '#01579b', fontWeight: 'bold' }}>
                  Recommendation: {vesselPreDeparture.recommended_monitoring} Monitoring
                </div>
              </div>
            )}
          </div>
        </div>

        {/* Target Desk */}
        <div className="grid-panel">
          <div className="panel-header text-mono">
            <span>&#9673; TARGET DIAGNOSTIC DESK</span>
            <span className="pull-right">TACTICAL CONTROL</span>
          </div>
          {targetVessel ? (
            <div className="panel-content target-details">
              <div className="target-header">
                <div>
                  <div className="target-name">{targetVessel.ship_name}</div>
                  <div className="target-flag">MMSI: {targetVessel.mmsi} &bull; SOURCE: {(targetVessel.source || 'SIMULATED').toUpperCase()}</div>
                </div>
                <div className="target-risk">
                  <div className="risk-label font-mono">RISK INDEX</div>
                  <div className="risk-score" style={{ color: getRiskColor(targetVessel) }}>
                    {getRiskScore(targetVessel)}%
                  </div>
                </div>
              </div>
              
              <div className="target-metrics">
                <div className="metric-box">
                  <div className="metric-label">POSITION (LAT/LON)</div>
                  <div className="metric-val">{targetVessel.lat.toFixed(4)}N, {targetVessel.lon.toFixed(4)}E</div>
                </div>
                <div className="metric-box">
                  <div className="metric-label">COURSE & SPEED</div>
                  <div className="metric-val">{(targetVessel.sog || 0).toFixed(1)} kts &bull; {(targetVessel.cog || 0).toFixed(0)}&deg;</div>
                </div>
              </div>
              
              <div className="target-metrics">
                <div className="metric-box">
                  <div className="metric-label">TARGET BEHAVIOR</div>
                  <div className="metric-val text-black font-black uppercase">{getTargetStatusLabel(targetVessel.status)}</div>
                </div>
                <div className="metric-box">
                  <div className="metric-label">ANOMALY CONFIDENCE</div>
                  <div className="metric-val" style={{ color: getRiskColor(targetVessel) }}>
                    {targetVessel.status !== 'normal' ? 'High (88%)' : 'None'}
                  </div>
                </div>
              </div>
              
              {renderThreatCard(targetVessel)}
              
            </div>
          ) : (
            <div className="panel-content empty-state text-mono">NO TARGET SELECTED</div>
          )}
        </div>
      </div>

      <style>{`
        .target-desk {
          display: flex;
          flex-direction: column;
          height: 100%;
          padding: 1rem;
          gap: 1rem;
        }
        
        .desk-header {
          display: flex;
          justify-content: space-between;
          align-items: flex-end;
          border-bottom: 3px solid #000;
          padding-bottom: 1rem;
        }
        
        .desk-title {
          font-size: 2.5rem;
          margin: 0;
          line-height: 1;
        }
        
        .desk-subtitle {
          font-family: var(--font-mono);
          color: #555;
          font-size: 0.75rem;
          margin-top: 0.5rem;
          letter-spacing: 0.05em;
        }
        
        .desk-actions {
          display: flex;
          gap: 0.5rem;
        }
        
        .brutalist-input {
          border: var(--border-thick);
          padding: 0.5rem 1rem;
          outline: none;
          width: 250px;
        }
        
        .brutalist-button.invert {
          background: var(--bg-white);
          color: var(--text-black);
          border: var(--border-thick);
        }
        .brutalist-button.invert:hover {
          background: var(--bg-gray);
        }
        
        .desk-grid {
          display: flex;
          flex: 1;
          gap: 1rem;
          min-height: 0;
        }
        
        .grid-panel {
          flex: 1;
          display: flex;
          flex-direction: column;
          border: var(--border-thick);
          background: var(--bg-white);
          overflow: hidden;
        }
        
        .grid-panel.map-panel {
          flex: 1.5;
        }
        
        .panel-header {
          background: #000;
          color: #FFF;
          padding: 0.25rem 0.75rem;
          font-size: 0.75rem;
          font-weight: 700;
          display: flex;
          justify-content: space-between;
        }
        
        .panel-content {
          flex: 1;
          overflow: auto;
          padding: 1rem;
        }
        
        .panel-content.p-0 {
          padding: 0;
        }
        
        .nmea-terminal {
          background: #1C1A17;
          padding: 1rem;
          font-size: 0.75rem;
          line-height: 1.5;
        }
        
        .nmea-highlight {
          color: #A3FF00;
          margin-bottom: 0.5rem;
        }
        
        .nmea-dim {
          color: #A3FF00;
          opacity: 0.6;
          margin-bottom: 0.5rem;
        }
        
        .target-details {
          display: flex;
          flex-direction: column;
          padding: 0;
        }
        
        .target-header {
          display: flex;
          justify-content: space-between;
          padding: 1rem;
          border-bottom: var(--border-thick);
        }
        
        .target-name {
          font-size: 1.75rem;
          font-weight: 900;
          letter-spacing: -0.02em;
        }
        
        .target-flag {
          font-family: var(--font-mono);
          font-size: 0.65rem;
          color: #666;
        }
        
        .target-risk {
          text-align: right;
        }
        
        .risk-label {
          font-family: var(--font-mono);
          font-size: 0.65rem;
        }
        
        .risk-score {
          font-size: 2rem;
          font-weight: 900;
          line-height: 1;
        }
        
        .target-metrics {
          display: flex;
          border-bottom: var(--border-thick);
        }
        
        .metric-box {
          flex: 1;
          padding: 0.75rem 1rem;
          border-right: var(--border-thick);
        }
        .metric-box:last-child {
          border-right: none;
        }
        
        .metric-label {
          font-family: var(--font-mono);
          font-size: 0.6rem;
          color: #666;
          margin-bottom: 0.25rem;
        }
        
        .metric-val {
          font-weight: 700;
          font-size: 0.9rem;
        }
        
        .threat-card-inner {
          display: flex;
          flex-direction: column;
        }
        
        .threat-reasons {
          border-bottom: var(--border-thick);
          padding-bottom: 0.75rem;
        }
        .reasons-header {
          font-weight: 900;
          padding: 0.75rem 1rem;
          background: #F5F5F5;
          border-bottom: var(--border-thin);
          font-size: 0.75rem;
        }
        .reasons-list {
          padding: 0.5rem 1rem;
        }
        .reason-item {
          font-size: 0.8rem;
          margin-bottom: 0.25rem;
          font-family: var(--font-sans);
          font-weight: 500;
        }
        .reason-bullet {
          color: #FF5722;
          margin-right: 0.5rem;
        }
        
        .threat-action {
          padding: 0;
        }
        .action-header {
          font-weight: 900;
          padding: 0.75rem 1rem;
          background: #F5F5F5;
          border-bottom: var(--border-thin);
          font-size: 0.75rem;
        }
        .action-content {
          padding: 0.75rem 1rem;
          font-size: 0.8rem;
          color: #CC0000;
          font-weight: 700;
        }
        
        .pulse-dot {
          animation: pulse 1s infinite;
        }
        @keyframes pulse {
          0% { box-shadow: 0 0 0 0 rgba(240, 58, 47, 0.4); }
          70% { box-shadow: 0 0 0 10px rgba(240, 58, 47, 0); }
          100% { box-shadow: 0 0 0 0 rgba(240, 58, 47, 0); }
        }
      `}</style>
    </div>
  );
}
