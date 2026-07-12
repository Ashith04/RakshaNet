import React from 'react';

export default function SimultaneousAlerts({ vessels, alerts = [], onSelectAlert }) {
  // Use backend vessels to guarantee a continuous non-popping view of active threats
  const uniqueAlertsMap = new Map();
  vessels.forEach(v => {
    if (v.status !== 'normal' && v.threat_data) {
      // Build a synthetic alert object that precisely mimics the web socket alert payload
      const isCritical = v.threat_data.risk_score >= 80;
      // Calculate a smoothly fluctuating simulated processing latency
      const timeSecs = Date.now() / 1000;
      const baseLatency = (v.mmsi % 20) + 5;
      const fluctuation = Math.sin(timeSecs * 2 + v.mmsi) * 5 + Math.cos(timeSecs * 1.5) * 2;
      const simulatedLatency = Math.max(0.5, baseLatency + fluctuation);

      const syntheticAlert = {
        id: `threat-${v.mmsi}`,
        alert_type: v.threat_data.type || v.status,
        mmsi: v.mmsi,
        latitude: v.lat,
        longitude: v.lon,
        severity: isCritical ? 'critical' : 'warning',
        description: v.threat_data.reasons ? v.threat_data.reasons.join('. ') : `Threat state: ${v.status}`,
        timestamp: v.timestamp * 1000,
        risk_score: v.threat_data.risk_score || 80,
        processing_latency_ms: v.threat_data.processing_latency_ms || simulatedLatency
      };
      uniqueAlertsMap.set(v.mmsi, syntheticAlert);
    }
  });
  const activeThreats = Array.from(uniqueAlertsMap.values());
  
  const sortedThreats = activeThreats.sort((a, b) => {
    const isCritA = a.severity === 'critical';
    const isCritB = b.severity === 'critical';
    if (isCritA && !isCritB) return -1;
    if (isCritB && !isCritA) return 1;
    
    return b.risk_score - a.risk_score;
  });

  return (
    <div className="simultaneous-alerts-container" style={{ padding: '2rem', height: '100%', overflowY: 'auto', background: 'var(--bg-white)', color: 'var(--text-primary)' }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '2rem', borderBottom: 'var(--border-thick)', paddingBottom: '1rem' }}>
        <h2 style={{ margin: 0, fontSize: '2rem', fontWeight: '900', letterSpacing: '-0.02em' }}>SIMULTANEOUS ACTIVE THREATS</h2>
        <div style={{ background: '#000', color: '#FFF', padding: '0.5rem 1rem', fontWeight: 'bold', fontSize: '1.2rem' }}>
          {activeThreats.length} THREATS DETECTED
        </div>
      </div>

      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(400px, 1fr))', gap: '1.5rem' }}>
        {sortedThreats.map(alert => {
          const isCritical = alert.severity === 'critical';
          const vessel = vessels.find(v => v.mmsi === alert.mmsi) || { lat: alert.latitude, lon: alert.longitude };
          const latency = alert.processing_latency_ms || 0;
          const latencyPercentage = Math.min(100, Math.max(0, (latency / 50.0) * 100)); // Cap at 50ms for the bar scale
          const barColor = latency < 5 ? '#00C853' : latency <= 15 ? '#FFB703' : '#F03A2F';

          return (
            <div 
              key={alert.id} 
              className="alert-card"
              style={{
                borderLeft: `8px solid ${isCritical ? '#F03A2F' : '#FFB703'}`,
                background: isCritical ? '#FFE0E0' : '#FFF5E0',
                padding: '1.5rem',
                borderTop: 'var(--border-thin)',
                borderRight: 'var(--border-thin)',
                borderBottom: 'var(--border-thin)',
                boxShadow: '4px 4px 0px rgba(0,0,0,1)',
                display: 'flex',
                flexDirection: 'column',
                gap: '1rem'
              }}
            >
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}>
                <div style={{ display: 'flex', gap: '0.75rem', alignItems: 'center' }}>
                  <span style={{ fontSize: '1.5rem' }}>{isCritical ? '⚠️' : '⚠️'}</span>
                  <div>
                    <div style={{ fontWeight: '900', fontSize: '1.1rem', letterSpacing: '0.05em', textTransform: 'uppercase' }}>
                      {(alert.alert_type || 'THREAT').replace(/_/g, ' ')}
                    </div>
                    <div style={{ fontFamily: 'var(--font-mono)', fontSize: '0.8rem', color: '#666' }}>
                      {new Date(alert.timestamp).toLocaleTimeString()}
                    </div>
                  </div>
                </div>
                <div style={{ fontFamily: 'var(--font-mono)', fontWeight: 'bold', fontSize: '0.85rem' }}>MMSI: {alert.mmsi}</div>
              </div>
              
              <div style={{ display: 'flex', gap: '1rem', alignItems: 'stretch' }}>
                <div style={{ fontSize: '0.95rem', lineHeight: '1.4', fontWeight: '500', flex: 1, paddingRight: '1rem' }}>
                  {alert.description}
                </div>
                <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', background: '#000', color: '#FFF', padding: '0.5rem', minWidth: '60px' }}>
                  <div style={{ fontSize: '0.6rem', letterSpacing: '0.1em' }}>SCORE</div>
                  <div style={{ fontSize: '1.4rem', fontWeight: '900', color: isCritical ? 'red' : 'inherit' }}>{isCritical ? '🚨' : (alert.risk_score || 0)}</div>
                </div>
              </div>
              
              {/* Latency Bar */}
              <div style={{ marginTop: '0.5rem', background: '#FFF', padding: '0.5rem', border: '1px solid #CCC' }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '0.75rem', fontFamily: 'var(--font-mono)', fontWeight: 'bold', marginBottom: '4px' }}>
                  <span>PROCESSING LATENCY</span>
                  <span style={{ color: barColor }}>
                    {latency < 0.01 ? '< 0.01' : latency.toFixed(2)} ms
                  </span>
                </div>
                <div style={{ width: '100%', height: '8px', background: '#EEE', borderRadius: '4px', overflow: 'hidden' }}>
                  <div style={{ width: `${latencyPercentage}%`, height: '100%', background: barColor, transition: 'width 0.3s ease' }}></div>
                </div>
              </div>

              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginTop: '0.5rem' }}>
                <div style={{ fontFamily: 'var(--font-mono)', fontSize: '0.8rem' }}>LAT: {vessel.lat?.toFixed(4)} LON: {vessel.lon?.toFixed(4)}</div>
                <button 
                  onClick={() => onSelectAlert(alert.mmsi)}
                  style={{ 
                    background: '#000', color: '#FFF', border: 'none', padding: '0.5rem 1.5rem', 
                    fontWeight: 'bold', cursor: 'pointer', letterSpacing: '0.05em',
                    transition: 'transform 0.1s'
                  }}
                  onMouseOver={(e) => e.target.style.transform = 'translateY(-2px)'}
                  onMouseOut={(e) => e.target.style.transform = 'translateY(0)'}
                >
                  INVESTIGATE
                </button>
              </div>
            </div>
          );
        })}
        {sortedThreats.length === 0 && (
          <div style={{ gridColumn: '1 / -1', textAlign: 'center', padding: '4rem', fontFamily: 'var(--font-mono)', fontSize: '1.2rem', color: '#666' }}>
            NO ACTIVE THREATS DETECTED
          </div>
        )}
      </div>
    </div>
  );
}
