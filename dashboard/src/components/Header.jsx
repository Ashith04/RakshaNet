import React, { useState, useEffect } from 'react';
import { ShieldAlert, Clock, Wifi } from 'lucide-react';

export default function Header() {
  const [time, setTime] = useState(new Date());

  useEffect(() => {
    const timer = setInterval(() => setTime(new Date()), 1000);
    return () => clearInterval(timer);
  }, []);

  const formatUTC = (date) => {
    return date.toISOString().replace('T', ' ').substring(0, 19) + ' UTC';
  };

  return (
    <header className="tactical-panel header-container">
      <div className="header-left">
        <ShieldAlert size={20} className="color-nominal" strokeWidth={2} />
        <div className="header-title">Raksha<span className="color-nominal">Net</span></div>
        <div className="header-badge">CLASSIFIED</div>
      </div>
      
      <div className="header-center">
        <div className="header-search">
          <input type="text" placeholder="Search MMSI or Vessel Name..." className="text-mono" />
        </div>
      </div>
      
      <div className="header-right">
        <div className="header-status-item text-mono">
          <Wifi size={14} className="color-nominal" />
          <span className="color-nominal">DATALINK SECURE</span>
        </div>
        <div className="header-status-item text-mono color-secondary">
          <Clock size={14} />
          <span>{formatUTC(time)}</span>
        </div>
      </div>

      <style>{`
        .header-container {
          height: 48px;
          display: flex;
          align-items: center;
          justify-content: space-between;
          padding: 0 1rem;
          border-left: none;
          border-right: none;
          border-top: none;
        }
        .header-left {
          display: flex;
          align-items: center;
          gap: 0.75rem;
        }
        .header-title {
          font-family: var(--font-sans);
          font-size: 1.25rem;
          font-weight: 700;
          letter-spacing: -0.05em;
        }
        .header-badge {
          background: rgba(255, 51, 102, 0.15);
          color: var(--color-critical);
          border: 1px solid rgba(255, 51, 102, 0.3);
          font-family: var(--font-mono);
          font-size: 0.65rem;
          padding: 2px 6px;
          font-weight: 700;
          letter-spacing: 0.05em;
          margin-left: 0.5rem;
        }
        .header-center {
          flex: 1;
          display: flex;
          justify-content: center;
        }
        .header-search input {
          background: var(--bg-void);
          border: 1px solid var(--border-tactical);
          color: var(--text-primary);
          padding: 0.25rem 0.75rem;
          width: 300px;
          font-size: 0.8rem;
          outline: none;
          transition: border-color 0.2s;
        }
        .header-search input:focus {
          border-color: var(--color-nominal);
        }
        .header-right {
          display: flex;
          align-items: center;
          gap: 1.5rem;
        }
        .header-status-item {
          display: flex;
          align-items: center;
          gap: 0.5rem;
          font-size: 0.75rem;
        }
      `}</style>
    </header>
  );
}
