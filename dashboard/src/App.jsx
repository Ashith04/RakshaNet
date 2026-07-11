import React, { useState, useEffect } from 'react';
import MapView from './components/MapView';
import StatsBar from './components/StatsBar';
import AlertFeed from './components/AlertFeed';
import SplashScreen from './components/SplashScreen';
import Header from './components/Header';
import './App.css';

export default function App() {
  const [vessels, setVessels] = useState([]);
  const [alerts, setAlerts] = useState([]);
  const [isBooting, setIsBooting] = useState(true);

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
      setAlerts(prev => {
        // Keep last 100 alerts
        const updated = [newAlert, ...prev];
        if (updated.length > 100) updated.length = 100;
        return updated;
      });
    };

    return () => {
      wsVessels.close();
      wsAlerts.close();
    };
  }, [isBooting]);

  if (isBooting) {
    return <SplashScreen onComplete={() => setIsBooting(false)} />;
  }

  return (
    <div className="app-container">
      <Header />
      <div className="main-content">
        <StatsBar />
        <MapView vessels={vessels} />
        <AlertFeed alerts={alerts} />
      </div>
    </div>
  );
}
