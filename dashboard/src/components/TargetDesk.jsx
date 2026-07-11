import React, { useState } from 'react';
import MapView from './MapView';

export default function TargetDesk({ vessels, alerts, selectedMmsi, setSelectedMmsi }) {
  const [searchQuery, setSearchQuery] = useState('');
  
  // Find highest risk vessel or search match
  const targetVessel = vessels.find(v => v.mmsi === selectedMmsi) || 
                       vessels.find(v => v.mmsi.toString().includes(searchQuery)) || 
                       vessels.find(v => v.status === 'geofence_violation' || v.status === 'loitering' || v.status === 'ais_gap' || v.status === 'rendezvous') || 
                       vessels[0];

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

  const renderThreatCard = (v) => {
    const td = v.threat_data;
    if (!td) {
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

    return (
      <div className="threat-card-inner">
        {/* Specific Metrics depending on Threat Type */}
        {td.type === 'border_warning' && (
          <div className="target-metrics">
            <div className="metric-box">
              <div className="metric-label">DISTANCE TO BORDER</div>
              <div className="metric-val">{td.distance_to_border ? `${td.distance_to_border.toFixed(2)} NM` : 'Calculating...'}</div>
            </div>
            <div className="metric-box">
              <div className="metric-label">CROSSING IN</div>
              <div className="metric-val">{td.remaining_time ? `${td.remaining_time.toFixed(0)} seconds` : 'Immediate'}</div>
            </div>
          </div>
        )}

        {td.type === 'ais_loss' && (
          <div className="target-metrics">
            <div className="metric-box">
              <div className="metric-label">TIME SILENT</div>
              <div className="metric-val">{td.elapsed_time ? `${td.elapsed_time.toFixed(0)}s` : 'Unknown'}</div>
            </div>
            <div className="metric-box">
              <div className="metric-label">ESTIMATED SEARCH AREA</div>
              <div className="metric-val">{td.search_area_radius ? `Radius: ${td.search_area_radius.toFixed(3)} NM` : '0 NM'}</div>
            </div>
          </div>
        )}

        {td.type === 'loitering' && (
          <div className="target-metrics">
            <div className="metric-box">
              <div className="metric-label">STATIONARY DURATION</div>
              <div className="metric-val">{td.stationary_duration ? `${td.stationary_duration.toFixed(0)}s` : '0s'}</div>
            </div>
            <div className="metric-box">
              <div className="metric-label">LOITER THRESHOLD</div>
              <div className="metric-val">&lt; 2.0 knots</div>
            </div>
          </div>
        )}

        {td.type === 'cluster' && (
          <div className="target-metrics">
            <div className="metric-box">
              <div className="metric-label">CLUSTER RADIUS / TIME</div>
              <div className="metric-val">{td.cluster_radius}m / {td.cluster_duration ? `${td.cluster_duration.toFixed(0)}s` : '0s'}</div>
            </div>
            <div className="metric-box">
              <div className="metric-label font-mono">SHIPS INVOLVED</div>
              <div className="metric-val" style={{ fontSize: '0.75rem', lineHeight: 1.2 }}>
                {td.ships_involved?.map(s => s.ship_name).join(' + ')}
              </div>
            </div>
          </div>
        )}

        {td.type === 'zone_warning' && (
          <div className="target-metrics">
            <div className="metric-box">
              <div className="metric-label">BREACHED ZONE</div>
              <div className="metric-val" style={{color: '#F03A2F'}}>{td.zone_name}</div>
            </div>
            <div className="metric-box">
              <div className="metric-label">CONSEQUENCE</div>
              <div className="metric-val" style={{color: '#F03A2F'}}>Restricted Area Violation</div>
            </div>
          </div>
        )}

        {/* Explainable Reasons */}
        <div className="threat-reasons">
          <div className="reasons-header">ALERT EXPLANATION & CONTEXT</div>
          <div className="reasons-list">
            {td.reasons?.map((reason, i) => (
              <div key={i} className="reason-item">
                <span className="reason-bullet">&#9642;</span> {reason}
              </div>
            ))}
          </div>
        </div>

        {/* Recommended Action */}
        <div className="threat-action">
          <div className="action-header">RECOMMENDED INTERVENTION PROCEDURES</div>
          <div className="action-content text-mono">{td.recommendation || 'Maintain standard radar telemetry monitoring.'}</div>
        </div>
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
      `}</style>
    </div>
  );
}
