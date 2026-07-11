import { useState, useEffect } from 'react';

function formatNumber(val) {
  if (val == null) return '—';
  if (val >= 1000000) return `${(val / 1000000).toFixed(1)}M`;
  if (val >= 1000) return `${(val / 1000).toFixed(1)}K`;
  return typeof val === 'number' ? val.toLocaleString() : val;
}

function formatLatency(us) {
  if (us == null) return '—';
  if (us >= 1000) return `${(us / 1000).toFixed(1)}ms`;
  return `${Math.round(us)}µs`;
}

function StatsBar({ stats, wsStatus }) {
  const [prevStats, setPrevStats] = useState(null);

  useEffect(() => {
    if (stats) setPrevStats(stats);
  }, [stats]);

  const displayStats = stats || prevStats;

  const source = displayStats?.source?.toUpperCase() || 'OFFLINE';
  const sourceClass = source === 'LIVE'
    ? 'live'
    : source === 'SIMULATED'
      ? 'simulated'
      : source === 'BOTH'
        ? 'both'
        : 'simulated';

  return (
    <div className="stats-bar" id="stats-bar">
      <div className="logo-section">
        <div className="logo-icon">🛰</div>
        <span className="logo-text">MARITIME SURVEILLANCE</span>
      </div>

      <div className="stat-item msgs" id="stat-msgs">
        <span className="stat-value">
          {displayStats ? formatNumber(displayStats.messages_per_second) : '—'}
        </span>
        <span className="stat-label">msgs/sec</span>
      </div>

      <div className="stat-item latency" id="stat-latency">
        <span className="stat-value">
          {displayStats ? formatLatency(displayStats.avg_latency_us) : '—'}
        </span>
        <span className="stat-label">avg latency</span>
      </div>

      <div className="stat-item vessels" id="stat-vessels">
        <span className="stat-value">
          {displayStats ? formatNumber(displayStats.active_vessels) : '—'}
        </span>
        <span className="stat-label">active vessels</span>
      </div>

      <div className="stat-item alerts" id="stat-alerts">
        <span className="stat-value">
          {displayStats ? formatNumber(displayStats.alerts_last_minute) : '—'}
        </span>
        <span className="stat-label">alerts/min</span>
      </div>

      <div className={`source-badge ${sourceClass}`} id="source-badge">
        <span className="pulse-dot" />
        {source}
      </div>
    </div>
  );
}

export default StatsBar;
