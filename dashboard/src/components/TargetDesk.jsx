import React, { useState } from 'react';
import MapView from './MapView';

export default function TargetDesk({ vessels, alerts, selectedMmsi, setSelectedMmsi }) {
  const [searchQuery, setSearchQuery] = useState('');
  
  // Find highest risk vessel or search match
  const targetVessel = vessels.find(v => v.mmsi === selectedMmsi) || vessels.find(v => v.mmsi.toString().includes(searchQuery)) || vessels.find(v => v.status === 'critical' || v.status === 'warning') || vessels[0];

  // Dummy NMEA stream for visuals
  const nmeaStream = [
    "[08:42:15] !AIVDM,1,1,,A,13MDI200000004@007Dp...",
    "// Raksha Net AIS Terminal Core initialized...",
    `L MMSI: ${targetVessel?.mmsi || '419012345'} - Lat ${targetVessel?.lat?.toFixed(4)}, Lon ${targetVessel?.lon?.toFixed(4)}, Speed ${(targetVessel?.sog || 0).toFixed(1)} kts, Heading ${targetVessel?.cog?.toFixed(0)}`,
    "[08:42:30] !AIVDM,1,1,,A,133sVf0P00PD>GBH?vj...",
    "L MMSI: 419445566 (Dhow Al-Yusr) - Lat 13.22, Lon 80.53, Speed 1.1 kts, Heading 270"
  ];

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
            {nmeaStream.map((line, i) => (
              <div key={i} className={line.startsWith('L') ? 'nmea-highlight' : 'nmea-dim'}>
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
                  <div className="target-flag">FLAG: INDIA IN &bull; TYPE: VESSEL</div>
                </div>
                <div className="target-risk">
                  <div className="risk-label">RISK INDEX</div>
                  <div className="risk-score">
                    {targetVessel.status === 'critical' ? '92%' : targetVessel.status === 'warning' ? '78%' : '14%'}
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
                  <div className="metric-label">TARGET STATUS</div>
                  <div className="metric-val text-black font-black uppercase">{targetVessel.status}</div>
                </div>
                <div className="metric-box">
                  <div className="metric-label">ANOMALY CONFIDENCE</div>
                  <div className="metric-val text-blue">High (85%)</div>
                </div>
              </div>
              
              <div className="target-triggers">
                <div className="trigger-header">FLAGGED ANOMALY TRIGGERS</div>
                {targetVessel.status === 'critical' && (
                  <div className="trigger-row critical">&#9888; Protected Sanctuary Breach</div>
                )}
                {targetVessel.status === 'warning' && (
                  <div className="trigger-row warning">&#9888; Loitering / Speed Anomaly</div>
                )}
                {targetVessel.status === 'normal' && (
                  <div className="trigger-row normal">&#10003; No Anomalies Detected</div>
                )}
              </div>
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
          min-height: 0; /* Important for scrollable children */
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
        
        .text-blue { color: #0066CC; }
        
        .trigger-header {
          font-weight: 900;
          padding: 0.75rem 1rem;
          border-bottom: var(--border-thick);
        }
        
        .trigger-row {
          padding: 0.5rem 1rem;
          font-family: var(--font-sans);
          font-size: 0.85rem;
          font-weight: 600;
          border-bottom: 1px solid #CCC;
        }
        
        .trigger-row.critical { background: #FFE0E0; color: #CC0000; }
        .trigger-row.warning { background: #FFF5E0; color: #CC7700; }
        .trigger-row.normal { background: #E0FFE0; color: #008800; }
      `}</style>
    </div>
  );
}
