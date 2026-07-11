import React, { useRef, useEffect } from 'react';
import { AlertTriangle, AlertCircle, Crosshair } from 'lucide-react';

export default function AlertFeed({ alerts }) {
  const endRef = useRef(null);

  useEffect(() => {
    endRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [alerts]);

  const getSeverityStyles = (severity) => {
    switch (severity.toLowerCase()) {
      case 'critical': return { color: 'var(--color-critical)', border: 'var(--color-critical)' };
      case 'warning': return { color: 'var(--color-advisory)', border: 'var(--color-advisory)' };
      case 'intelligence': return { color: 'var(--color-intelligence)', border: 'var(--color-intelligence)' };
      default: return { color: 'var(--text-secondary)', border: 'var(--border-tactical)' };
    }
  };

  const getSeverityIcon = (severity) => {
    switch (severity.toLowerCase()) {
      case 'critical': return <AlertTriangle size={14} />;
      case 'warning': return <AlertCircle size={14} />;
      case 'intelligence': return <Crosshair size={14} />;
      default: return <AlertCircle size={14} />;
    }
  };

  return (
    <div className="alert-feed tactical-panel">
      <div className="alert-header">
        <h2 className="text-sans font-bold color-primary">THREAT INTELLIGENCE LOG</h2>
        <div className="pulse-indicator"></div>
      </div>
      
      <div className="alert-list">
        {alerts.length === 0 ? (
          <div className="empty-state text-mono color-muted">NO ACTIVE THREATS</div>
        ) : (
          alerts.map(alert => {
            const styles = getSeverityStyles(alert.severity);
            return (
              <div key={alert.id} className="alert-card" style={{ borderLeftColor: styles.border }}>
                <div className="alert-top text-mono">
                  <span className="alert-severity" style={{ color: styles.color }}>
                    {getSeverityIcon(alert.severity)} {alert.severity.toUpperCase()}
                  </span>
                  <span className="alert-time color-muted">{new Date(alert.timestamp * 1000).toLocaleTimeString()}</span>
                </div>
                
                <div className="alert-type text-sans font-semibold color-primary">
                  {alert.alert_type.replace('_', ' ').toUpperCase()}
                </div>
                
                <div className="alert-desc text-sans color-secondary">
                  {alert.description}
                </div>
                
                <div className="alert-meta text-mono color-muted">
                  MMSI: {alert.mmsi} {alert.mmsi2 ? `& ${alert.mmsi2}` : ''}
                </div>
                
                {alert.alert_type === 'spoofing' && (
                  <div className="alert-extended text-mono" style={{marginTop: '0.5rem', fontSize: '0.65rem', color: 'var(--color-critical)'}}>
                    <div>SPEED: {alert.calc_speed?.toFixed(1)} knots</div>
                    <div>FROM: [{alert.prev_location?.[0]?.toFixed(4)}, {alert.prev_location?.[1]?.toFixed(4)}]</div>
                    <div>TO: [{alert.curr_location?.[0]?.toFixed(4)}, {alert.curr_location?.[1]?.toFixed(4)}]</div>
                    <div>SCORE: {alert.risk_score} - {alert.recommendation}</div>
                  </div>
                )}
              </div>
            );
          })
        )}
        <div ref={endRef} />
      </div>

      <style>{`
        .alert-feed {
          position: absolute;
          right: 0;
          top: 0;
          bottom: 0;
          width: 320px;
          display: flex;
          flex-direction: column;
          border-top: none;
          border-right: none;
          border-bottom: none;
        }
        .alert-header {
          height: 50px;
          display: flex;
          align-items: center;
          justify-content: space-between;
          padding: 0 1rem;
          border-bottom: 1px solid var(--border-tactical);
          background: rgba(6, 11, 18, 0.5);
        }
        .alert-header h2 {
          font-size: 0.75rem;
          letter-spacing: 0.1em;
          margin: 0;
        }
        .pulse-indicator {
          width: 6px;
          height: 6px;
          background: var(--color-critical);
          border-radius: 50%;
          box-shadow: 0 0 8px var(--color-critical);
          animation: pulse 2s infinite;
        }
        .alert-list {
          flex: 1;
          overflow-y: auto;
          padding: 1rem;
          display: flex;
          flex-direction: column;
          gap: 0.75rem;
        }
        .empty-state {
          text-align: center;
          padding: 2rem 0;
          font-size: 0.8rem;
        }
        .alert-card {
          background: rgba(6, 11, 18, 0.8);
          border: 1px solid var(--border-tactical);
          border-left-width: 3px;
          padding: 0.75rem;
          transition: transform 0.2s;
        }
        .alert-card:hover {
          background: var(--bg-hover);
        }
        .alert-top {
          display: flex;
          justify-content: space-between;
          align-items: center;
          font-size: 0.7rem;
          margin-bottom: 0.5rem;
        }
        .alert-severity {
          display: flex;
          align-items: center;
          gap: 0.25rem;
          font-weight: 700;
        }
        .alert-type {
          font-size: 0.85rem;
          margin-bottom: 0.25rem;
        }
        .alert-desc {
          font-size: 0.8rem;
          line-height: 1.4;
          margin-bottom: 0.5rem;
        }
        .alert-meta {
          font-size: 0.7rem;
        }
      `}</style>
    </div>
  );
}
