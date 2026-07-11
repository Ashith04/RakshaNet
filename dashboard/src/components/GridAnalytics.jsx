import React from 'react';
import { LayoutGrid, AlertTriangle, Ship, Activity } from 'lucide-react';

export default function GridAnalytics({ buckets = [] }) {
  const totalOceanGrids = 176;
  const activeGrids = buckets.length;
  const highRiskGrids = buckets.filter(b => b.threat_score >= 70).length;
  const totalShips = buckets.reduce((acc, b) => acc + b.ships, 0);
  const avgShips = totalOceanGrids > 0 ? (totalShips / totalOceanGrids).toFixed(1) : 0;
  
  return (
    <div className="grid-analytics-panel tactical-panel">
      <div className="panel-header">
        <LayoutGrid size={14} className="color-primary" />
        <h2 className="text-sans font-bold color-primary">GLOBAL GRID ANALYTICS</h2>
      </div>
      
      <div className="grid-stats-grid">
        <div className="stat-box">
          <span className="stat-label text-mono color-muted">TOTAL GRIDS</span>
          <span className="stat-value text-sans font-bold">{totalOceanGrids}</span>
        </div>

        <div className="stat-box">
          <span className="stat-label text-mono color-muted">ACTIVE GRIDS</span>
          <span className="stat-value text-sans font-bold color-safe">{activeGrids}</span>
        </div>
        
        <div className="stat-box">
          <span className="stat-label text-mono color-muted" style={{color: 'var(--color-critical)'}}>HIGH RISK GRIDS</span>
          <span className="stat-value text-sans font-bold" style={{color: 'var(--color-critical)'}}>
            {highRiskGrids} <AlertTriangle size={14} />
          </span>
        </div>
        
        <div className="stat-box">
          <span className="stat-label text-mono color-muted">AVG SHIPS/GRID</span>
          <span className="stat-value text-sans font-bold">
            {avgShips} <Ship size={14} className="color-muted" />
          </span>
        </div>
        
        <div className="stat-box">
          <span className="stat-label text-mono color-muted">GRID EFFICIENCY</span>
          <span className="stat-value text-sans font-bold color-advisory">
            99.8% <Activity size={14} />
          </span>
        </div>
      </div>

      <style>{`
        .grid-analytics-panel {
          position: absolute;
          left: 320px;
          top: 0;
          width: calc(100% - 640px); /* Between TargetDesk and AlertFeed */
          height: 60px;
          display: flex;
          align-items: center;
          padding: 0 1rem;
          background: rgba(6, 11, 18, 0.85);
          border-bottom: 1px solid var(--border-tactical);
          border-top: none;
          border-left: none;
          border-right: none;
          z-index: 1000;
        }
        .panel-header {
          display: flex;
          align-items: center;
          gap: 0.5rem;
          min-width: 200px;
          border-right: 1px solid var(--border-tactical);
          padding-right: 1rem;
        }
        .panel-header h2 {
          font-size: 0.75rem;
          letter-spacing: 0.1em;
          margin: 0;
        }
        .grid-stats-grid {
          display: flex;
          flex: 1;
          justify-content: space-around;
          align-items: center;
        }
        .stat-box {
          display: flex;
          flex-direction: column;
          align-items: center;
          gap: 0.25rem;
        }
        .stat-label {
          font-size: 0.6rem;
          letter-spacing: 0.05em;
        }
        .stat-value {
          font-size: 1.1rem;
          display: flex;
          align-items: center;
          gap: 0.35rem;
        }
      `}</style>
    </div>
  );
}
