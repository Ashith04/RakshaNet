import { useEffect, useRef } from 'react';

const SEVERITY_ICONS = {
  critical: '🔴',
  high: '🔴',
  medium: '🟡',
  low: '🔵',
};

const ALERT_TYPE_ICONS = {
  geofence_violation: '🚧',
  loitering: '🔄',
  ais_gap: '📡',
  rendezvous: '🤝',
  speed_anomaly: '⚡',
  dark_vessel: '👻',
};

function getAlertIcon(alertType) {
  if (!alertType) return '⚠️';
  const key = alertType.toLowerCase().replace(/\s+/g, '_');
  return ALERT_TYPE_ICONS[key] || '⚠️';
}

function getSeverityIcon(severity) {
  if (!severity) return '🔵';
  return SEVERITY_ICONS[severity.toLowerCase()] || '🔵';
}

function formatTimestamp(ts) {
  if (!ts) return '—';
  try {
    const d = new Date(ts);
    if (isNaN(d.getTime())) return ts;
    return d.toLocaleTimeString('en-US', {
      hour: '2-digit',
      minute: '2-digit',
      second: '2-digit',
      hour12: false,
    });
  } catch {
    return ts;
  }
}

function formatAlertType(type) {
  if (!type) return 'Unknown';
  return type
    .replace(/_/g, ' ')
    .replace(/\b\w/g, c => c.toUpperCase());
}

function AlertCard({ alert }) {
  const severity = (alert.severity || 'low').toLowerCase();
  const severityClass = `severity-${severity}`;

  return (
    <div className={`alert-card ${severityClass}`} id={`alert-${alert.id}`}>
      <div className="severity-bar" />
      <div className="alert-header">
        <span className="alert-type">
          {getAlertIcon(alert.alert_type)}
          {formatAlertType(alert.alert_type)}
        </span>
        <span className="alert-severity-badge">
          {getSeverityIcon(severity)} {severity}
        </span>
      </div>
      <div className="alert-mmsi">
        MMSI: {alert.mmsi || '—'}
        {alert.mmsi2 && ` ↔ ${alert.mmsi2}`}
      </div>
      <div className="alert-description">
        {alert.description || 'No description available'}
      </div>
      <div className="alert-meta">
        <span className="alert-timestamp">
          🕐 {formatTimestamp(alert.timestamp)}
        </span>
        {alert.zone_name && (
          <span className="alert-zone">📍 {alert.zone_name}</span>
        )}
      </div>
    </div>
  );
}

function AlertFeed({ alerts }) {
  const listRef = useRef(null);

  // Auto-scroll to top (newest first)
  useEffect(() => {
    if (listRef.current) {
      listRef.current.scrollTop = 0;
    }
  }, [alerts.length]);

  return (
    <div className="alert-feed" id="alert-feed">
      <div className="alert-feed-header">
        <h2>
          <span className="alert-icon">🚨</span>
          THREAT FEED
        </h2>
        {alerts.length > 0 && (
          <span className="alert-count-badge">{alerts.length}</span>
        )}
      </div>

      <div className="alert-feed-list" ref={listRef}>
        {alerts.length === 0 ? (
          <div className="alert-feed-empty">
            <div className="empty-icon">🛡️</div>
            <p>
              No alerts detected.<br />
              Monitoring maritime traffic…
            </p>
          </div>
        ) : (
          alerts.map((alert, idx) => (
            <AlertCard key={alert.id || idx} alert={alert} />
          ))
        )}
      </div>
    </div>
  );
}

export default AlertFeed;
