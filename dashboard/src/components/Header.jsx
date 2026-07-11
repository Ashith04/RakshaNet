import React from 'react';

export default function Header({ viewMode, setViewMode }) {
  const handleRestart = async () => {
    try {
      await fetch('http://localhost:8080/api/restart', { method: 'POST' });
      window.location.reload();
    } catch (e) {
      console.error(e);
    }
  };

  return (
    <div className="global-header-wrapper">
      {/* Top Navigation Bar */}
      <header className="global-header">
        <div className="logo-box">
          <div className="logo-top">RAKSHA NET</div>
          <div className="logo-bottom">MARITIME TRIAGE CORE</div>
        </div>
        
        <nav className="header-nav">
          <div className={`nav-link ${viewMode === 'map' ? 'active' : ''}`} onClick={() => setViewMode('map')}>Operator<br/>Command Hub</div>
          <div className={`nav-link ${viewMode === 'data' ? 'active' : ''}`} onClick={() => setViewMode('data')}>Voyage<br/>Registers &<br/>Step 0</div>
          <div className={`nav-link ${viewMode === 'scoring' ? 'active' : ''}`} onClick={() => setViewMode('scoring')}>RPI<br/>Fleet<br/>Scoring</div>
          <div className="nav-link">Drift<br/>Grid<br/>Overlay</div>
          <div className={`nav-link ${viewMode === 'simultaneous' ? 'active' : ''}`} onClick={() => setViewMode('simultaneous')}>Simultaneous<br/>Alerts</div>
          <div className={`nav-link ${viewMode === 'threat' ? 'active' : ''}`} onClick={() => setViewMode('threat')}>AIS<br/>Threat<br/>Monitor</div>
          <div className="nav-link">Family<br/>Tracking<br/>Link</div>
        </nav>
        
        <div className="header-actions">
          <button className="brutalist-button restart-btn" onClick={handleRestart}>Restart Scenario</button>
        </div>
      </header>

      {/* Emergency Broadcast Ticker */}
      <div className="emergency-ticker">
        <div className="ticker-label">EMERGENCY BROADCAST</div>
        <div className="ticker-content">
          <span className="siren">🚨</span> Active Distress coordination in Sector Delta. Target vessel: M.V. Sagar Kanya (DAT Alert).
        </div>
        <div className="ticker-badge">1 INCIDENT ONLINE</div>
      </div>

      <style>{`
        .global-header-wrapper {
          display: flex;
          flex-direction: column;
          width: 100%;
        }
        
        .global-header {
          display: flex;
          height: 60px;
          background: var(--bg-white);
          border-bottom: var(--border-thick);
        }
        
        .logo-box {
          border-right: var(--border-thick);
          padding: 0.5rem 1rem;
          display: flex;
          flex-direction: column;
          justify-content: center;
          align-items: center;
          min-width: 250px;
        }
        .logo-top {
          font-weight: 900;
          font-size: 1.1rem;
          letter-spacing: 0.1em;
        }
        .logo-bottom {
          font-weight: 600;
          font-size: 0.65rem;
          letter-spacing: 0.15em;
          color: #555;
        }

        .header-nav {
          flex: 1;
          display: flex;
        }
        
        .nav-link {
          flex: 1;
          display: flex;
          align-items: center;
          justify-content: center;
          text-align: center;
          font-size: 0.7rem;
          font-weight: 800;
          line-height: 1.2;
          color: var(--text-black);
          text-transform: uppercase;
          cursor: pointer;
        }
        
        .nav-link:hover {
          background: var(--bg-gray);
        }
        
        .nav-link.active {
          border-bottom: 4px solid var(--text-black);
        }

        .header-actions {
          padding: 0 1rem;
          display: flex;
          align-items: center;
          justify-content: center;
        }
        
        .restart-btn {
          font-size: 0.8rem;
          padding: 0.5rem 1.5rem;
        }

        .emergency-ticker {
          display: flex;
          height: 30px;
          background: var(--bg-black);
          color: var(--text-white);
          font-family: var(--font-sans);
          font-size: 0.75rem;
          font-weight: 800;
        }
        
        .ticker-label {
          background: var(--bg-red);
          color: var(--text-white);
          padding: 0 1.5rem;
          display: flex;
          align-items: center;
          justify-content: center;
          letter-spacing: 0.05em;
        }
        
        .ticker-content {
          flex: 1;
          display: flex;
          align-items: center;
          padding: 0 1rem;
          gap: 0.5rem;
        }
        
        .siren {
          font-size: 1rem;
        }
        
        .ticker-badge {
          background: var(--bg-neon);
          color: var(--text-black);
          padding: 0 1rem;
          display: flex;
          align-items: center;
          justify-content: center;
          margin: 4px;
          border-radius: 2px;
        }
      `}</style>
    </div>
  );
}
