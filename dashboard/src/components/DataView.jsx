import React from 'react';

export default function DataView({ vessels, onSelectVessel }) {
  const sortedVessels = [...vessels].sort((a, b) => {
    const priority = { 
      geofence_violation: 4, 
      rendezvous: 3, 
      loitering: 2, 
      ais_gap: 2, 
      normal: 1 
    };
    const pA = priority[a.status] || 1;
    const pB = priority[b.status] || 1;
    if (pB !== pA) {
      return pB - pA; // Highest priority first (abnormal statuses at the top)
    }
    return (a.ship_name || '').localeCompare(b.ship_name || '');
  });

  return (
    <div className="data-view-container">
      <div className="data-view-header">
        <h2 className="data-view-title">LIVE VESSEL TELEMETRY DATA</h2>
        <div className="text-mono">TOTAL ACTIVE TARGETS: {vessels.length}</div>
      </div>
      
      <div className="data-table-wrapper">
        <table className="brutalist-table">
          <thead>
            <tr>
              <th>MMSI</th>
              <th>SHIP NAME</th>
              <th>LATITUDE</th>
              <th>LONGITUDE</th>
              <th>SPEED (kn)</th>
              <th>HEADING (°)</th>
              <th>STATUS</th>
              <th>SOURCE</th>
            </tr>
          </thead>
          <tbody>
            {sortedVessels.map(v => (
              <tr 
                key={v.mmsi} 
                className={`${v.status} clickable-row`}
                onClick={() => onSelectVessel && onSelectVessel(v.mmsi)}
              >
                <td className="text-mono font-black">{v.mmsi}</td>
                <td>{v.ship_name}</td>
                <td className="text-mono">{v.lat.toFixed(4)}N</td>
                <td className="text-mono">{v.lon.toFixed(4)}E</td>
                <td className="text-mono">{(v.sog || 0).toFixed(1)}</td>
                <td className="text-mono">{(v.cog || 0).toFixed(0)}&deg;</td>
                <td className={`text-mono uppercase font-black status-${v.status}`}>{v.status}</td>
                <td className="text-mono">{(v.source || 'SIMULATED').toUpperCase()}</td>
              </tr>
            ))}
            {vessels.length === 0 && (
              <tr>
                <td colSpan="8" style={{textAlign: 'center', padding: '2rem'}} className="text-mono">
                  NO TELEMETRY DATA RECEIVED
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>

      <style>{`
        .data-view-container {
          display: flex;
          flex-direction: column;
          height: 100%;
          background: var(--bg-white);
          overflow: hidden;
        }
        .data-view-header {
          padding: 1.5rem;
          border-bottom: var(--border-thick);
          display: flex;
          justify-content: space-between;
          align-items: center;
          background: var(--bg-white);
        }
        .data-view-title {
          font-size: 1.5rem;
          margin: 0;
        }
        .data-table-wrapper {
          flex: 1;
          overflow: auto;
          padding: 1.5rem;
        }
        .brutalist-table {
          width: 100%;
          border-collapse: collapse;
          text-align: left;
          border: var(--border-thick);
        }
        .brutalist-table th {
          background: #000;
          color: #FFF;
          font-family: var(--font-sans);
          font-weight: 900;
          font-size: 0.75rem;
          letter-spacing: 0.05em;
          padding: 0.75rem 1rem;
          position: sticky;
          top: 0;
          z-index: 2;
        }
        .brutalist-table td {
          padding: 0.75rem 1rem;
          border-bottom: var(--border-thin);
          font-size: 0.85rem;
          background: var(--bg-white);
        }
        .brutalist-table tr:hover td {
          background: var(--bg-gray);
        }
        .brutalist-table tr.clickable-row {
          cursor: pointer;
        }
        .brutalist-table tr.geofence_violation td {
          background: #FFE0E0; /* Light red */
        }
        .brutalist-table tr.rendezvous td {
          background: #F3E5F5; /* Light purple */
        }
        .brutalist-table tr.loitering td,
        .brutalist-table tr.ais_gap td {
          background: #FFF5E0; /* Light yellow/orange */
        }
        .status-geofence_violation {
          color: var(--bg-red);
        }
        .status-rendezvous {
          color: #8E24AA;
        }
        .status-loitering {
          color: #FF8C00;
        }
        .status-ais_gap {
          color: #FBC02D;
        }
        .status-normal {
          color: #00C853;
        }
      `}</style>
    </div>
  );
}
