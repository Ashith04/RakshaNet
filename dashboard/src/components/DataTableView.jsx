import './DataTableView.css';
import { useMemo } from 'react';

function getStatusColor(status) {
  const STATUS_COLORS = {
    normal: '#00ff88',
    loitering: '#ffaa00',
    ais_gap: '#ffaa00',
    geofence_violation: '#ff3366',
    rendezvous: '#aa55ff',
  };
  const key = (status || '').toLowerCase().replace(/\s+/g, '_');
  return STATUS_COLORS[key] || STATUS_COLORS.normal;
}

function DataTableView({ vessels }) {
  const vesselList = useMemo(() => {
    return Object.values(vessels || {}).sort((a, b) => {
      // Sort alerts to the top
      const aAlert = a.status && a.status !== 'normal' ? 1 : 0;
      const bAlert = b.status && b.status !== 'normal' ? 1 : 0;
      if (aAlert !== bAlert) return bAlert - aAlert;
      // Then sort by MMSI
      return b.mmsi - a.mmsi;
    });
  }, [vessels]);

  return (
    <div className="data-table-container">
      <div className="data-table-header">
        <h2>Real-Time Vessel Data Stream</h2>
        <span className="count-badge">{vesselList.length} total</span>
      </div>
      
      <div className="table-wrapper">
        <table className="vessel-table">
          <thead>
            <tr>
              <th>Status</th>
              <th>MMSI</th>
              <th>Ship Name</th>
              <th>Speed (kn)</th>
              <th>Heading</th>
              <th>Latitude</th>
              <th>Longitude</th>
            </tr>
          </thead>
          <tbody>
            {vesselList.map(v => (
              <tr key={v.mmsi} className={v.status && v.status !== 'normal' ? 'alert-row' : ''}>
                <td>
                  <div className="status-cell">
                    <span className="status-dot" style={{ backgroundColor: getStatusColor(v.status) }}></span>
                    <span style={{ color: getStatusColor(v.status), textTransform: 'capitalize' }}>
                      {v.status ? v.status.replace(/_/g, ' ') : 'Normal'}
                    </span>
                  </div>
                </td>
                <td className="mono">{v.mmsi}</td>
                <td>{v.ship_name || 'Unknown'}</td>
                <td>{v.sog != null ? v.sog.toFixed(1) : '—'}</td>
                <td>{v.cog != null ? v.cog.toFixed(1) + '°' : '—'}</td>
                <td className="mono">{v.lat != null ? v.lat.toFixed(4) : '—'}</td>
                <td className="mono">{v.lon != null ? v.lon.toFixed(4) : '—'}</td>
              </tr>
            ))}
          </tbody>
        </table>
        {vesselList.length === 0 && (
          <div className="empty-state">No vessel data received yet...</div>
        )}
      </div>
    </div>
  );
}

export default DataTableView;
