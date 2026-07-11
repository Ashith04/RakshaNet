import React, { useEffect, useState } from 'react';
import { ShieldAlert, Activity } from 'lucide-react';

export default function SplashScreen({ onComplete }) {
  const [loadingText, setLoadingText] = useState("INITIALIZING SECURE UPLINK...");
  const [progress, setProgress] = useState(0);

  useEffect(() => {
    const sequences = [
      { time: 0, text: "INITIALIZING SECURE UPLINK...", progress: 10 },
      { time: 500, text: "HANDSHAKING WITH AISSTREAM.IO...", progress: 35 },
      { time: 1000, text: "LOADING GEOFENCE POLYGONS...", progress: 60 },
      { time: 1500, text: "CALIBRATING THREAT MODELS...", progress: 85 },
      { time: 2000, text: "COMMAND CENTER READY.", progress: 100 }
    ];

    sequences.forEach(seq => {
      setTimeout(() => {
        setLoadingText(seq.text);
        setProgress(seq.progress);
      }, seq.time);
    });

    const timer = setTimeout(() => {
      onComplete();
    }, 2500);

    return () => clearTimeout(timer);
  }, [onComplete]);

  return (
    <div className="splash-screen">
      <div className="splash-content">
        <div className="splash-logo">
          <ShieldAlert size={64} className="color-nominal" strokeWidth={1.5} />
          <h1 className="splash-title">Raksha<span className="color-nominal">Net</span></h1>
        </div>
        <p className="splash-tagline">Observe. Predict. Protect.</p>
        
        <div className="splash-loader-container">
          <div className="splash-progress-bar" style={{ width: `${progress}%` }}></div>
        </div>
        
        <div className="splash-status text-mono">
          <Activity size={14} className="color-nominal" style={{ animation: 'pulse 1s infinite' }} />
          <span>{loadingText}</span>
        </div>
      </div>
      <style>{`
        .splash-screen {
          position: fixed;
          top: 0; left: 0; right: 0; bottom: 0;
          background-color: var(--bg-void);
          display: flex;
          align-items: center;
          justify-content: center;
          z-index: 9999;
        }
        .splash-content {
          display: flex;
          flex-direction: column;
          align-items: center;
          width: 400px;
        }
        .splash-logo {
          display: flex;
          align-items: center;
          gap: 1rem;
          margin-bottom: 0.5rem;
        }
        .splash-title {
          font-family: var(--font-sans);
          font-size: 3rem;
          font-weight: 700;
          letter-spacing: -0.05em;
          color: var(--text-primary);
        }
        .splash-tagline {
          font-family: var(--font-mono);
          font-size: 0.8rem;
          color: var(--text-secondary);
          letter-spacing: 0.1em;
          text-transform: uppercase;
          margin-bottom: 3rem;
        }
        .splash-loader-container {
          width: 100%;
          height: 2px;
          background-color: var(--border-tactical);
          margin-bottom: 1rem;
          position: relative;
          overflow: hidden;
        }
        .splash-progress-bar {
          height: 100%;
          background-color: var(--color-nominal);
          box-shadow: 0 0 10px var(--color-nominal);
          transition: width 0.2s cubic-bezier(0.2, 0.8, 0.2, 1);
        }
        .splash-status {
          display: flex;
          align-items: center;
          gap: 0.5rem;
          font-size: 0.75rem;
          color: var(--text-muted);
          width: 100%;
        }
        @keyframes pulse {
          0% { opacity: 0.3; }
          50% { opacity: 1; }
          100% { opacity: 0.3; }
        }
      `}</style>
    </div>
  );
}
