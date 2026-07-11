import { useState, useEffect, useRef, useCallback } from 'react';
import MapView from './components/MapView';
import StatsBar from './components/StatsBar';
import AlertFeed from './components/AlertFeed';
import DataTableView from './components/DataTableView';

const WS_BASE = 'ws://localhost:8080/ws';
const API_BASE = 'http://localhost:8080/api';

function App() {
  const [vessels, setVessels] = useState({});
  const [alerts, setAlerts] = useState([]);
  const [stats, setStats] = useState(null);
  const [config, setConfig] = useState(null);
  const [wsStatus, setWsStatus] = useState({ vessels: false, alerts: false });
  const [viewMode, setViewMode] = useState('map');

  const vesselWsRef = useRef(null);
  const alertWsRef = useRef(null);
  const statsIntervalRef = useRef(null);
  const reconnectTimersRef = useRef({});

  // Fetch config (geofence zones)
  useEffect(() => {
    const fetchConfig = async () => {
      try {
        const res = await fetch(`${API_BASE}/config`);
        if (res.ok) {
          const data = await res.json();
          setConfig(data);
        }
      } catch (err) {
        console.warn('Config fetch failed, will retry in 5s:', err.message);
        setTimeout(fetchConfig, 5000);
      }
    };
    fetchConfig();
  }, []);

  // Poll stats
  useEffect(() => {
    const fetchStats = async () => {
      try {
        const res = await fetch(`${API_BASE}/stats`);
        if (res.ok) {
          const data = await res.json();
          setStats(data);
        }
      } catch {
        // Silently fail - stats are optional
      }
    };

    fetchStats();
    statsIntervalRef.current = setInterval(fetchStats, 1000);

    return () => {
      if (statsIntervalRef.current) clearInterval(statsIntervalRef.current);
    };
  }, []);

  // WebSocket connection with auto-reconnect
  const connectWebSocket = useCallback((path, onMessage, statusKey) => {
    const url = `${WS_BASE}/${path}`;
    let ws;

    const connect = () => {
      try {
        ws = new WebSocket(url);

        ws.onopen = () => {
          console.log(`[WS] Connected: ${path}`);
          setWsStatus(prev => ({ ...prev, [statusKey]: true }));
          if (reconnectTimersRef.current[path]) {
            clearTimeout(reconnectTimersRef.current[path]);
            reconnectTimersRef.current[path] = null;
          }
        };

        ws.onmessage = (event) => {
          try {
            const data = JSON.parse(event.data);
            onMessage(data);
          } catch (err) {
            console.warn(`[WS] Parse error on ${path}:`, err);
          }
        };

        ws.onclose = () => {
          console.log(`[WS] Disconnected: ${path}`);
          setWsStatus(prev => ({ ...prev, [statusKey]: false }));
          reconnectTimersRef.current[path] = setTimeout(connect, 3000);
        };

        ws.onerror = (err) => {
          console.warn(`[WS] Error on ${path}:`, err);
          ws.close();
        };
      } catch (err) {
        console.warn(`[WS] Connection failed for ${path}:`, err);
        reconnectTimersRef.current[path] = setTimeout(connect, 3000);
      }

      return ws;
    };

    return connect();
  }, []);

  // Vessel WebSocket
  useEffect(() => {
    vesselWsRef.current = connectWebSocket('vessels', (data) => {
      if (Array.isArray(data)) {
        setVessels(prev => {
          const next = { ...prev };
          data.forEach(v => {
            next[v.mmsi] = { ...v, lastUpdate: Date.now() };
          });
          return next;
        });
      }
    }, 'vessels');

    return () => {
      if (vesselWsRef.current) vesselWsRef.current.close();
      if (reconnectTimersRef.current['vessels']) {
        clearTimeout(reconnectTimersRef.current['vessels']);
      }
    };
  }, [connectWebSocket]);

  // Alert WebSocket
  useEffect(() => {
    alertWsRef.current = connectWebSocket('alerts', (data) => {
      setAlerts(prev => {
        const next = [data, ...prev];
        // Keep max 200 alerts in memory
        if (next.length > 200) next.length = 200;
        return next;
      });
    }, 'alerts');

    return () => {
      if (alertWsRef.current) alertWsRef.current.close();
      if (reconnectTimersRef.current['alerts']) {
        clearTimeout(reconnectTimersRef.current['alerts']);
      }
    };
  }, [connectWebSocket]);

  return (
    <div className="app-container">
      {viewMode === 'map' ? (
        <MapView
          vessels={vessels}
          config={config}
        />
      ) : (
        <DataTableView vessels={vessels} />
      )}
      
      <StatsBar
        stats={stats}
        wsStatus={wsStatus}
        viewMode={viewMode}
        onToggleView={() => setViewMode(v => v === 'map' ? 'data' : 'map')}
      />
      
      {viewMode === 'map' && (
        <AlertFeed
          alerts={alerts}
        />
      )}
    </div>
  );
}

export default App;
