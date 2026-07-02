import React from 'react';
import ReactDOM from 'react-dom/client';
import { Capacitor } from '@capacitor/core';
import OwnerApp from './pages/OwnerApp';
import './index.css';

const native = Capacitor.isNativePlatform();

if ('serviceWorker' in navigator && !native) {
  window.addEventListener('load', () => {
    navigator.serviceWorker.register('/sw-owner.js').catch(() => {});
  });
}

ReactDOM.createRoot(document.getElementById('root')).render(
  <React.StrictMode>
    <OwnerApp standalone native={native} />
  </React.StrictMode>,
);
