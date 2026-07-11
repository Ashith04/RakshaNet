import React from 'react';

export default function FleetScoring({ vessels, onSelectVessel }) {
  const sortedVessels = [...vessels].sort((a, b) => {
    const rawA = a.threat_data?.risk_score;
    const rawB = b.threat_data?.risk_score;
    const scoreA = rawA === 'HIGH ALERT' ? 1000 : (Number(rawA) || 0);
    const scoreB = rawB === 'HIGH ALERT' ? 1000 : (Number(rawB) || 0);
    return scoreB - scoreA;
  });

  return (
    <div className="fleet-scoring-container" style={{ padding: '2rem', height: '100%', overflowY: 'auto', background: 'var(--bg-white)', color: 'var(--text-primary)' }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '2rem', borderBottom: 'var(--border-thick)', paddingBottom: '1rem' }}>
        <h2 style={{ fontSize: '2rem', margin: 0 }}>FLEET RISK SCORING</h2>
        <div className="text-mono" style={{ background: '#000', color: '#FFF', padding: '0.5rem 1rem' }}>HIGH RISK TARGETS: {sortedVessels.filter(v => (v.threat_data?.risk_score || 0) > 70).length}</div>
      </div>
      
      <div style={{ overflowX: 'auto', border: 'var(--border-thick)' }}>
        <table className="brutalist-table" style={{ width: '100%', borderCollapse: 'collapse', minWidth: '800px' }}>
          <thead>
            <tr>
              <th style={{ background: '#000', color: '#FFF', padding: '1rem', textAlign: 'left', position: 'sticky', top: 0 }}>RISK SCORE</th>
              <th style={{ background: '#000', color: '#FFF', padding: '1rem', textAlign: 'left', position: 'sticky', top: 0 }}>MMSI</th>
              <th style={{ background: '#000', color: '#FFF', padding: '1rem', textAlign: 'left', position: 'sticky', top: 0 }}>SHIP NAME</th>
              <th style={{ background: '#000', color: '#FFF', padding: '1rem', textAlign: 'left', position: 'sticky', top: 0 }}>STATUS</th>
              <th style={{ background: '#000', color: '#FFF', padding: '1rem', textAlign: 'left', position: 'sticky', top: 0 }}>THREAT LEVEL</th>
              <th style={{ background: '#000', color: '#FFF', padding: '1rem', textAlign: 'left', position: 'sticky', top: 0 }}>ACTION</th>
            </tr>
          </thead>
          <tbody>
            {sortedVessels.map(v => {
              const rawScore = v.threat_data?.risk_score || 0;
              const numericScore = rawScore === 'HIGH ALERT' ? 100 : Number(rawScore);
              const scoreDisplay = rawScore === 'HIGH ALERT' ? '🚨 HIGH ALERT' : rawScore;
              const isCritical = numericScore > 70 || rawScore === 'HIGH ALERT';
              const isWarning = numericScore > 30 && numericScore <= 70;
              
              let color = 'var(--bg-white)';
              if (isCritical) color = '#FFE0E0';
              else if (isWarning) color = '#FFF5E0';

              return (
                <tr key={v.mmsi} style={{ background: color, borderBottom: 'var(--border-thin)', transition: 'background 0.2s' }}>
                  <td style={{ padding: '1rem', fontWeight: '900', fontSize: '1.4rem', color: isCritical ? 'red' : 'inherit' }}>
                    {scoreDisplay}
                  </td>
                  <td className="text-mono" style={{ padding: '1rem', fontWeight: 'bold' }}>{v.mmsi}</td>
                  <td style={{ padding: '1rem', fontWeight: '500' }}>{v.ship_name}</td>
                  <td style={{ padding: '1rem', fontWeight: 'bold' }}>{v.status.toUpperCase().replace('_', ' ')}</td>
                  <td style={{ padding: '1rem', fontWeight: '900' }}>{isCritical ? 'CRITICAL' : isWarning ? 'WARNING' : 'LOW RISK'}</td>
                  <td style={{ padding: '1rem' }}>
                    <button 
                      onClick={() => onSelectVessel(v.mmsi)}
                      style={{ 
                        background: '#000', color: '#fff', border: '2px solid transparent', padding: '0.5rem 1rem', cursor: 'pointer', fontFamily: 'var(--font-mono)', fontWeight: 'bold'
                      }}
                      onMouseEnter={(e) => { e.currentTarget.style.background = 'transparent'; e.currentTarget.style.color = '#000'; e.currentTarget.style.borderColor = '#000'; }}
                      onMouseLeave={(e) => { e.currentTarget.style.background = '#000'; e.currentTarget.style.color = '#fff'; e.currentTarget.style.borderColor = 'transparent'; }}
                    >INVESTIGATE</button>
                  </td>
                </tr>
              );
            })}
            {sortedVessels.length === 0 && (
              <tr>
                <td colSpan="6" className="text-mono" style={{ padding: '3rem', textAlign: 'center' }}>NO VESSELS TRACKED IN CURRENT FLEET</td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}
