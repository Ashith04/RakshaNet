import React, { useEffect, useState } from 'react';

export default function StatsBar({ vessels = [] }) {
  const [stats, setStats] = useState({ active_vessels: 0 });

  useEffect(() => {
    const fetchStats = async () => {
      try {
        const res = await fetch('http://localhost:8080/api/stats');
        const data = await res.json();
        setStats(data);
      } catch (err) {
        // Silent catch
      }
    };
    
    fetchStats();
    const timer = setInterval(fetchStats, 1000);
    return () => clearInterval(timer);
  }, []);

  const abnormalCount = vessels.filter(v => v.status && v.status !== 'normal').length;

  return (
    <div className="stats-grid">
      <div className="stat-col">
        <div className="stat-title">ACTIVE VOYAGE REGISTRY</div>
        <div className="stat-value">{vessels.length || stats.active_vessels} Vessels</div>
        <div className="stat-subtitle">Synced from 4 database sources</div>
      </div>
      
      <div className="stat-col">
        <div className="stat-title">ACTIVE SEARCH OPS <span className="stat-light">(ACTIVE/PENDING)</span></div>
        <div className="stat-value">1 Mission</div>
        <div className="stat-subtitle">Human validation gateway confirmation</div>
      </div>
      
      <div className="stat-col">
        <div className="stat-title">ACTIVE ANOMALY THREATS</div>
        <div className="stat-value">{abnormalCount} Targets</div>
        <div className="stat-subtitle">Geofence, loitering, gap & rendezvous alerts</div>
      </div>
      
      <div className="stat-col no-border-right">
        <div className="stat-title">RESPONSE FLEET STANDBY</div>
        <div className="stat-value">6 Volunteers</div>
        <div className="stat-subtitle">Voluntary crafts calibrated by RPI score</div>
      </div>

      <style>{`
        .stats-grid {
          display: flex;
          background: var(--bg-white);
          border-bottom: var(--border-thick);
          height: 90px;
        }
        
        .stat-col {
          flex: 1;
          display: flex;
          flex-direction: column;
          justify-content: center;
          padding: 0 1.5rem;
          border-right: var(--border-thin);
        }
        
        .stat-col.no-border-right {
          border-right: none;
        }
        
        .stat-title {
          font-size: 0.6rem;
          font-weight: 900;
          letter-spacing: 0.1em;
          color: #888;
          margin-bottom: 0.25rem;
        }
        
        .stat-light {
          font-weight: 600;
          color: #AAA;
        }
        
        .stat-value {
          font-size: 1.5rem;
          font-weight: 900;
          color: var(--text-black);
          letter-spacing: -0.02em;
          margin-bottom: 0.25rem;
        }
        
        .stat-subtitle {
          font-size: 0.6rem;
          font-weight: 600;
          color: #666;
        }
      `}</style>
    </div>
  );
}
