import {StrictMode} from 'react';
import {createRoot} from 'react-dom/client';
import App from './App.tsx';
import './index.css';

// Register Service Worker for PWA features
if ('serviceWorker' in navigator) {
  navigator.serviceWorker.register(new URL('/sw.js', import.meta.url), {
    scope: '/'
  }).then(registration => {
    console.log('✅ Service Worker registered:', registration);
    
    // Request Periodic Background Sync permission
    if ('periodicSync' in registration) {
      registration.periodicSync.register('sync-gps', {
        minInterval: 60 * 1000 // 60 seconds
      }).then(() => {
        console.log('🔄 Periodic GPS sync registered');
      }).catch(err => {
        console.log('⚠️ Periodic sync permission denied:', err);
      });
    }
  }).catch(error => {
    console.warn('Service Worker registration failed:', error);
  });
}

// Request Notification permission
if ('Notification' in window && Notification.permission === 'default') {
  Notification.requestPermission().then(permission => {
    if (permission === 'granted') {
      console.log('🔔 Notification permission granted');
    }
  });
}

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <App />
  </StrictMode>,
);
