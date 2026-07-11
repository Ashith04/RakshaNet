import React, { useState, useEffect } from 'react';

export default function StatsBar() {
  const [stats, setStats] = useState({
    messages_per_second: 0,
    avg_latency_us: 0,
    active_vessels: 0,
    alerts_last_minute: 0,
    source: 'WAITING'
  });

  useEffect(() => {
    const fetchStats = async () => {
      try {
        const res = await fetch('http://localhost:8080/api/stats');
        const data = await res.json();
        setStats(data);
      } catch (e) {
        console.error("Stats fetch error:", e);
      }
    };
    
    fetchStats();
    const interval = setInterval(fetchStats, 1000);
    return () => clearInterval(interval);
  }, []);

  return (
    <div className="stats-bar tactical-panel">
      <div className="stat-group">
        <div className="stat-label text-sans color-secondary">ACTIVE VESSELS</div>
        <div className="stat-value text-mono color-primary">{stats.active_vessels.toLocaleString()}</div>
      </div>
      
      <div className="stat-divider"></div>
      
      <div className="stat-group">
        <div className="stat-label text-sans color-secondary">THROUGHPUT</div>
        <div className="stat-value text-mono color-primary">{stats.messages_per_second.toLocaleString()} <span className="stat-unit color-muted">MSG/S</span></div>
      </div>
      
      <div className="stat-divider"></div>
      
      <div className="stat-group">
        <div className="stat-label text-sans color-secondary">ENGINE LATENCY</div>
        <div className="stat-value text-mono color-primary">{stats.avg_latency_us.toLocaleString()} <span className="stat-unit color-muted">µS</span></div>
      </div>
      
      <div className="stat-divider"></div>
      
      <div className="stat-group">
        <div className="stat-label text-sans color-secondary">THREATS DETECTED</div>
        <div className={`stat-value text-mono ${stats.alerts_last_minute > 0 ? 'color-critical' : 'color-nominal'}`}>
          {stats.alerts_last_minute} <span className="stat-unit color-muted">LAST 60S</span>
        </div>
      </div>
      
      <div style={{flex: 1}}></div>
      
      <div className="stat-source text-mono">
        FEED: <span className="color-nominal">{stats.source}</span>
      </div>

      <style>{`
        .stats-bar {
          position: absolute;
          top: 0;
          left: 0;
          right: 320px; /* Leave space for AlertFeed */
          height: 50px;
          display: flex;
          align-items: center;
          padding: 0 1.5rem;
          gap: 1.5rem;
          border-top: none;
          border-left: none;
        }
        .stat-group {
          display: flex;
          flex-direction: column;
        }
        .stat-label {
          font-size: 0.65rem;
          font-weight: 700;
          letter-spacing: 0.1em;
        }
        .stat-value {
          font-size: 1rem;
          font-weight: 500;
          line-height: 1.2;
        }
        .stat-unit {
          font-size: 0.7rem;
        }
        .stat-divider {
          height: 24px;
          width: 1px;
          background-color: var(--border-tactical);
        }
        .stat-source {
          font-size: 0.75rem;
          color: var(--text-secondary);
          border: 1px solid var(--border-tactical);
          padding: 4px 8px;
        }
      `}</style>
    </div>
  );
}
