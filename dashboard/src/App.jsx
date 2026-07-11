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
import './App.css';

export default function App() {
  const [vessels, setVessels] = useState([]);
  const [alerts, setAlerts] = useState([]);
  const [buckets, setBuckets] = useState([]);
  const [isBooting, setIsBooting] = useState(true);
  const [viewMode, setViewMode] = useState('threat');
  const [selectedMmsi, setSelectedMmsi] = useState(null);

  const [latestCriticalAlert, setLatestCriticalAlert] = useState(null);

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
      if (newAlert.severity === 'critical') {
        setLatestCriticalAlert(newAlert);
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

  return (
    <div className="app-container">
      <AlertToast 
        latestAlert={latestCriticalAlert} 
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
                <div className="nav-item">RPI TRIAGE MATRIX</div>
                <div className="nav-item">DRIFT GRID MAP</div>
                <div className={`nav-item ${viewMode === 'threat' ? 'active' : ''}`} onClick={() => setViewMode('threat')}>AIS THREAT MONITOR</div>
                <div className="nav-item">SHARE FAMILY LINK</div>
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
                  vessels={vessels} 
                  alerts={alerts} 
                  selectedMmsi={selectedMmsi} 
                  setSelectedMmsi={setSelectedMmsi} 
                />
              )}
              {viewMode === 'map' && (
                <MapView 
                  vessels={vessels} 
                  buckets={buckets}
                  selectedMmsi={selectedMmsi}
                  onSelectVessel={(mmsi) => {
                    setSelectedMmsi(mmsi);
                    setViewMode('threat');
                  }} 
                />
              )}
              {viewMode === 'data' && (
                <DataView 
                  vessels={vessels} 
                  onSelectVessel={(mmsi) => {
                    setSelectedMmsi(mmsi);
                    setViewMode('map');
                  }} 
                />
              )}
              {viewMode === 'simultaneous' && (
                <SimultaneousAlerts 
                  vessels={vessels} 
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
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
