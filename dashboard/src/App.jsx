import React, { useState, useEffect } from 'react';
import Header from './components/Header';
import StatsBar from './components/StatsBar';
import SplashScreen from './components/SplashScreen';
import TargetDesk from './components/TargetDesk';
import MapView from './components/MapView';
import DataView from './components/DataView';
import AlertToast from './components/AlertToast';
import SimultaneousAlerts from './components/SimultaneousAlerts';
import FleetScoring from './components/FleetScoring';
import GridAnalytics from './components/GridAnalytics';
import PreDepartureView from './components/PreDepartureView';
import './App.css';

export default function App() {
  const [vessels, setVessels] = useState([]);
  const [alerts, setAlerts] = useState([]);
  const [buckets, setBuckets] = useState([]);
  const [weatherData, setWeatherData] = useState({});
  const [preDepartureData, setPreDepartureData] = useState({});
  const [showWeatherLayer, setShowWeatherLayer] = useState(true);
  const [isBooting, setIsBooting] = useState(true);
  const [viewMode, setViewMode] = useState('threat');
  const [selectedMmsi, setSelectedMmsi] = useState(null);

  const [latestToastAlert, setLatestToastAlert] = useState(null);

  // Weather polling
  useEffect(() => {
    if (isBooting) return;
    const fetchWeather = async () => {
      try {
        const res = await fetch('http://localhost:8080/api/weather');
        if (res.ok) setWeatherData(await res.json());
      } catch (err) { console.error(err); }
      
      try {
        const res2 = await fetch('http://localhost:8080/api/pre-departure');
        if (res2.ok) setPreDepartureData(await res2.json());
      } catch (err) { console.error(err); }
    };
    fetchWeather();
    const interval = setInterval(fetchWeather, 120000); // 2 minutes
    return () => clearInterval(interval);
  }, [isBooting]);

  useEffect(() => {
    // Only connect websockets after boot sequence
    if (isBooting) return;

    const wsVessels = new WebSocket('ws://localhost:8080/ws/vessels');
    wsVessels.onmessage = (event) => {
      const data = JSON.parse(event.data);
      setVessels(data);
    };

    const wsAlerts = new WebSocket('ws://localhost:8080/ws/alerts');
    wsAlerts.onmessage = (event) => {
      const newAlert = JSON.parse(event.data);
      if (newAlert.severity === 'critical' || newAlert.severity === 'warning') {
        setLatestToastAlert(newAlert);
      }
      setAlerts(prev => {
        const updated = [newAlert, ...prev];
        if (updated.length > 100) updated.length = 100;
        return updated;
      });
    };

    const wsBuckets = new WebSocket('ws://localhost:8080/ws/buckets');
    wsBuckets.onmessage = (event) => {
      const data = JSON.parse(event.data);
      setBuckets(data);
    };

    return () => {
      wsVessels.close();
      wsAlerts.close();
      wsBuckets.close();
    };
  }, [isBooting]);

  if (isBooting) {
    return <SplashScreen onComplete={() => setIsBooting(false)} />;
  }

  const augmentedVessels = vessels.map(v => {
    // Check if there is a recent critical alert for this vessel (within last 30 seconds)
    const recentAlert = alerts.find(a => a.mmsi === v.mmsi && (Date.now() - a.timestamp) < 30000);
    if (recentAlert) {
      return { ...v, status: recentAlert.severity === 'critical' ? 'critical' : 'warning' };
    }
    return v;
  });

  return (
    <div className="app-container">
      <AlertToast 
        latestAlert={latestToastAlert} 
        onClick={(alert) => {
          setSelectedMmsi(alert.mmsi);
          setViewMode('map');
        }}
      />
      <Header viewMode={viewMode} setViewMode={setViewMode} />
      <StatsBar vessels={vessels} />
      
      <div className="main-content">
        <div className="browser-window">
          <div className="browser-header">
            <div className="browser-dots">
              <div className="dot red"></div>
              <div className="dot yellow"></div>
              <div className="dot green"></div>
            </div>
            <div className="browser-url">https://rakshanet.in/operator-deck/ais</div>
            <div className="browser-status">
              <span className="dot green" style={{width: 8, height: 8}}></span> CONTROL ROOM FEED LIVE
            </div>
          </div>
          
          <div className="browser-body">
            <div className="sidebar">
              <div className="sidebar-nav">
                <div className={`nav-item ${viewMode === 'map' ? 'active' : ''}`} onClick={() => setViewMode('map')}>OPERATORS DECK</div>
                <div className={`nav-item ${viewMode === 'data' ? 'active' : ''}`} onClick={() => setViewMode('data')}>VESSEL DATABASE</div>
                <div className={`nav-item ${viewMode === 'scoring' ? 'active' : ''}`} onClick={() => setViewMode('scoring')}>FLEET SCORING</div>
                <div className={`nav-item ${viewMode === 'simultaneous' ? 'active' : ''}`} onClick={() => setViewMode('simultaneous')}>SIMULTANEOUS ALERTS</div>
                <div className={`nav-item ${viewMode === 'threat' ? 'active' : ''}`} onClick={() => setViewMode('threat')}>AIS THREAT MONITOR</div>
                <div className={`nav-item ${viewMode === 'pre_departure' ? 'active' : ''}`} onClick={() => setViewMode('pre_departure')} style={{ color: '#00E5FF', borderLeft: viewMode==='pre_departure' ? '3px solid #00E5FF' : 'none' }}>PRE-DEPARTURE INTELLIGENCE</div>
                
                <div style={{ marginTop: '20px', padding: '0 20px' }}>
                  <button 
                    className={`weather-toggle ${showWeatherLayer ? 'active' : ''}`} 
                    onClick={() => setShowWeatherLayer(!showWeatherLayer)}
                    style={{ 
                      width: '100%', 
                      padding: '10px', 
                      backgroundColor: showWeatherLayer ? '#8A2BE2' : '#333',
                      color: 'white',
                      border: 'none',
                      borderRadius: '4px',
                      cursor: 'pointer',
                      fontWeight: 'bold',
                      transition: 'all 0.3s'
                    }}
                  >
                    WEATHER: {showWeatherLayer ? 'ON' : 'OFF'}
                  </button>
                </div>
              </div>
              
              <div className="sidebar-footer">
                <div className="footer-title">TELEMETRY FEED STATUS</div>
                <div className="footer-status">
                  <div>DAT Beacon Network OK</div>
                  <div>Coastguard VHF Repeater OK</div>
                  <div>Swell Warning Delta 9</div>
                </div>
              </div>
            </div>
            
            <div className="content-area">
              {viewMode === 'threat' && (
                <TargetDesk 
                  vessels={augmentedVessels} 
                  alerts={alerts} 
                  weatherData={weatherData}
                  preDepartureData={preDepartureData}
                  selectedMmsi={selectedMmsi} 
                  setSelectedMmsi={setSelectedMmsi} 
                />
              )}
              {viewMode === 'map' && (
                <>
                  <GridAnalytics buckets={buckets} />
                  <MapView 
                    vessels={augmentedVessels} 
                    buckets={buckets}
                    weatherData={weatherData}
                    showWeatherLayer={showWeatherLayer}
                    selectedMmsi={selectedMmsi}
                    onSelectVessel={(mmsi) => {
                      setSelectedMmsi(mmsi);
                      setViewMode('threat');
                    }} 
                  />
                </>
              )}
              {viewMode === 'data' && (
                <DataView 
                  vessels={augmentedVessels} 
                  onSelectVessel={(mmsi) => {
                    setSelectedMmsi(mmsi);
                    setViewMode('map');
                  }} 
                />
              )}
              {viewMode === 'simultaneous' && (
                <SimultaneousAlerts 
                  vessels={augmentedVessels} 
                  alerts={alerts}
                  onSelectAlert={(mmsi) => {
                    setSelectedMmsi(mmsi);
                    setViewMode('map');
                  }}
                />
              )}
              {viewMode === 'scoring' && (
                <FleetScoring 
                  vessels={vessels} 
                  onSelectVessel={(mmsi) => {
                    setSelectedMmsi(mmsi);
                    setViewMode('map');
                  }}
                />
              )}
              {viewMode === 'pre_departure' && (
                <PreDepartureView 
                  vessels={augmentedVessels} 
                  preDepartureData={preDepartureData}
                  weatherData={weatherData}
                />
              )}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
