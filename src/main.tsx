import React from 'react';
import { createRoot } from 'react-dom/client';
import App from './App';
import './styles.css';
createRoot(document.getElementById('root')!).render(
  <React.StrictMode>
    <App />
  </React.StrictMode>,
);
// Offline support and "Install app" when served from the web (not the desktop or single-file editions).
if (import.meta.env.PROD && location.protocol === 'https:' && 'serviceWorker' in navigator)
  navigator.serviceWorker.register('./sw.js').catch(() => {});
