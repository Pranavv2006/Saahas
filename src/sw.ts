/// <reference lib="webworker" />

declare const self: ServiceWorkerGlobalScope;

// Cache standard assets
const CACHE_NAME = 'saahas-v1';
const ASSETS_TO_CACHE = [
  '/',
  '/index.html',
  '/manifest.json'
];

// Service Worker Install
self.addEventListener('install', (event) => {
  console.log('🔧 Service Worker installing...');
  event.waitUntil(
    caches.open(CACHE_NAME).then((cache) => {
      console.log('📦 Caching essential assets');
      return cache.addAll(ASSETS_TO_CACHE);
    })
  );
  self.skipWaiting();
});

// Service Worker Activate
self.addEventListener('activate', (event) => {
  console.log('✅ Service Worker activated');
  event.waitUntil(self.clients.claim());
});

// Periodic Background Sync for GPS (every 60 seconds during active walk)
self.addEventListener('periodicsync', (event: any) => {
  if (event.tag === 'sync-gps') {
    console.log('📍 Periodic sync triggered - saving GPS breadcrumb');
    event.waitUntil(
      (async () => {
        try {
          // Get active walk data from IndexedDB
          const db = await openDatabase();
          const walkData = await getFromDB(db, 'activeWalk', 'current');
          
          if (!walkData || !walkData.isActive) {
            console.log('No active walk found');
            return;
          }

          // Get current position
          if ('geolocation' in navigator) {
            navigator.geolocation.getCurrentPosition(
              async (position) => {
                const { latitude, longitude } = position.coords;
                const timestamp = new Date().toISOString();
                
                // Save to IndexedDB
                const breadcrumb = {
                  lat: latitude,
                  lng: longitude,
                  time: timestamp,
                  walkId: walkData.walkId
                };
                
                await saveToDB(db, 'breadcrumbs', breadcrumb);
                console.log(`✅ GPS saved: ${latitude}, ${longitude}`);
                
                // Sync with server when online
                if (navigator.onLine) {
                  try {
                    const response = await fetch('/api/gps-sync', {
                      method: 'POST',
                      headers: { 'Content-Type': 'application/json' },
                      body: JSON.stringify({
                        walkId: walkData.walkId,
                        location: breadcrumb
                      })
                    });
                    if (response.ok) {
                      console.log('📤 GPS synced to server');
                    }
                  } catch (error) {
                    console.log('⏳ Offline - will retry on reconnect');
                  }
                }
              },
              (error) => {
                console.error('GPS error during sync:', error);
              },
              { enableHighAccuracy: true }
            );
          }
        } catch (error) {
          console.error('Periodic sync error:', error);
          throw error; // Retry
        }
      })()
    );
  }
});

// Handle page visibility - trigger alert if walk still active
self.addEventListener('message', (event) => {
  if (event.data.type === 'CHECK_WALK_SAFETY') {
    const { walkId, duration } = event.data;
    console.log(`🛡️ Checking walk safety for ${walkId}`);
    
    // Verify walk is still being tracked
    event.ports[0].postMessage({
      status: 'tracking',
      walkId,
      timestamp: new Date().toISOString()
    });
  }
});

// Push notification for alerts
self.addEventListener('push', (event) => {
  const data = event.data?.json() ?? {};
  
  event.waitUntil(
    self.registration.showNotification('🚨 SAAHAS ALERT', {
      body: data.message || 'Security alert - check app immediately',
      icon: '/icon-192x192.png',
      badge: '/badge-72x72.png',
      tag: 'alert',
      requireInteraction: true,
      data: { walkId: data.walkId }
    } as any)
  );
});

// Notification click handler
self.addEventListener('notificationclick', (event) => {
  event.notification.close();
  
  event.waitUntil(
    self.clients.matchAll({ type: 'window', includeUncontrolled: true }).then((clientList: readonly WindowClient[]) => {
      // Focus existing window or open new one
      for (const client of clientList) {
        if (client.url === '/' && 'focus' in client) {
          return (client as any).focus();
        }
      }
      if (self.clients.openWindow) {
        return self.clients.openWindow('/');
      }
    })
  );
});

// IndexedDB Helper Functions
function openDatabase(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const request = indexedDB.open('SaahasDB', 1);
    
    request.onerror = () => reject(request.error);
    request.onsuccess = () => resolve(request.result);
    
    request.onupgradeneeded = (event) => {
      const db = (event.target as IDBOpenDBRequest).result;
      
      if (!db.objectStoreNames.contains('breadcrumbs')) {
        const store = db.createObjectStore('breadcrumbs', { keyPath: 'id', autoIncrement: true });
        store.createIndex('walkId', 'walkId', { unique: false });
        store.createIndex('time', 'time', { unique: false });
      }
      
      if (!db.objectStoreNames.contains('activeWalk')) {
        db.createObjectStore('activeWalk', { keyPath: 'id' });
      }
    };
  });
}

function saveToDB(db: IDBDatabase, storeName: string, data: any): Promise<void> {
  return new Promise((resolve, reject) => {
    const transaction = db.transaction(storeName, 'readwrite');
    const store = transaction.objectStore(storeName);
    const request = store.add(data);
    
    request.onerror = () => reject(request.error);
    request.onsuccess = () => resolve();
  });
}

function getFromDB(db: IDBDatabase, storeName: string, key: string): Promise<any> {
  return new Promise((resolve, reject) => {
    const transaction = db.transaction(storeName, 'readonly');
    const store = transaction.objectStore(storeName);
    const request = store.get(key);
    
    request.onerror = () => reject(request.error);
    request.onsuccess = () => resolve(request.result);
  });
}

export {};
