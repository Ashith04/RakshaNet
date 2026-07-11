import React, { useState, useEffect } from 'react';
import { AlertTriangle } from 'lucide-react';

export default function AlertToast({ latestAlert, onClick }) {
  const [visible, setVisible] = useState(false);
  const [alertData, setAlertData] = useState(null);

  useEffect(() => {
    if (latestAlert) {
      setAlertData(latestAlert);
      setVisible(true);
      const timer = setTimeout(() => {
        setVisible(false);
      }, 5000);
      return () => clearTimeout(timer);
    }
  }, [latestAlert]);

  if (!alertData || !visible) return null;

  return (
    <div 
      className="alert-toast" 
      onClick={() => onClick(alertData)}
    >
      <div className="alert-toast-content">
        <div style={{ display: 'flex', alignItems: 'center', gap: '8px', color: 'red' }}>
          <AlertTriangle size={20} />
          <strong style={{ fontSize: '1.1rem' }}>NEW ALERT: {alertData.alert_type.toUpperCase().replace('_', ' ')}</strong>
        </div>
        <div style={{ fontSize: '0.9rem', marginTop: '8px', color: '#333' }}>
          {alertData.description}
        </div>
      </div>
      <style>{`
        .alert-toast {
          position: fixed;
          top: 80px;
          right: 20px;
          background: #FFF;
          border: 2px solid #000;
          border-left: 6px solid red;
          padding: 16px 20px;
          color: #000;
          z-index: 9999;
          cursor: pointer;
          min-width: 320px;
          max-width: 400px;
          box-shadow: 4px 4px 0px rgba(0,0,0,1);
          animation: slideIn 0.3s ease-out;
          font-family: var(--font-mono);
          transition: transform 0.1s;
        }
        .alert-toast:hover {
          transform: translateY(-2px);
          box-shadow: 6px 6px 0px rgba(0,0,0,1);
        }
        @keyframes slideIn {
          from { transform: translateX(100%); opacity: 0; }
          to { transform: translateX(0); opacity: 1; }
        }
      `}</style>
    </div>
  );
}
