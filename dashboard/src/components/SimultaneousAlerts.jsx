import React from 'react';

export default function SimultaneousAlerts({ vessels, onSelectAlert }) {
  const activeThreats = vessels.filter(v => v.threat_data);
  
  const sortedThreats = [...activeThreats].sort((a, b) => {
    const isCritA = a.threat_data.risk_score === 'HIGH ALERT' || a.threat_data.risk_score > 70;
    const isCritB = b.threat_data.risk_score === 'HIGH ALERT' || b.threat_data.risk_score > 70;
    if (isCritA && !isCritB) return -1;
    if (isCritB && !isCritA) return 1;
    
    const scoreA = a.threat_data.risk_score === 'HIGH ALERT' ? 1000 : (Number(a.threat_data.risk_score) || 0);
    const scoreB = b.threat_data.risk_score === 'HIGH ALERT' ? 1000 : (Number(b.threat_data.risk_score) || 0);
    return scoreB - scoreA;
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
        {sortedThreats.map(v => {
          const t = v.threat_data;
          const isCritical = t.risk_score === 'HIGH ALERT' || t.risk_score > 70;
          return (
            <div 
              key={v.mmsi} 
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
                      {t.type.replace('_', ' ')}
                    </div>
                    <div style={{ fontFamily: 'var(--font-mono)', fontSize: '0.8rem', color: '#666' }}>{new Date().toLocaleTimeString()}</div>
                  </div>
                </div>
                <div style={{ fontFamily: 'var(--font-mono)', fontWeight: 'bold', fontSize: '0.85rem' }}>MMSI: {v.mmsi}</div>
              </div>
              
              <div style={{ display: 'flex', gap: '1rem', alignItems: 'stretch' }}>
                <div style={{ fontSize: '0.95rem', lineHeight: '1.4', fontWeight: '500', flex: 1, paddingRight: '1rem' }}>
                  {t.reasons && t.reasons.length > 0 ? t.reasons[0] : 'Abnormal behavior detected'}
                </div>
                <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', background: '#000', color: '#FFF', padding: '0.5rem', minWidth: '60px' }}>
                  <div style={{ fontSize: '0.6rem', letterSpacing: '0.1em' }}>SCORE</div>
                  <div style={{ fontSize: '1.4rem', fontWeight: '900', color: isCritical ? 'red' : 'inherit' }}>{t.risk_score === 'HIGH ALERT' ? '🚨' : (t.risk_score || 0)}</div>
                </div>
              </div>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                <div style={{ fontFamily: 'var(--font-mono)', fontSize: '0.8rem' }}>LAT: {v.lat.toFixed(4)} LON: {v.lon.toFixed(4)}</div>
                <button 
                  onClick={() => onSelectAlert(v.mmsi)}
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
