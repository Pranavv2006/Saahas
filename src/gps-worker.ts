/// <reference lib="webworker" />

let trackingInterval: number | null = null;
let db: IDBDatabase | null = null;

// Web Worker for background GPS tracking
self.onmessage = async (event) => {
  const { type, data } = event.data;

  if (type === 'START_GPS_TRACKING') {
    console.log('🚀 GPS Worker: Starting background tracking');
    startGpsTracking(data.walkId);
  } else if (type === 'STOP_GPS_TRACKING') {
    console.log('🛑 GPS Worker: Stopping background tracking');
    stopGpsTracking();
  } else if (type === 'GET_BREADCRUMBS') {
    const breadcrumbs = await getBreadcrumbs(data.walkId);
    self.postMessage({ type: 'BREADCRUMBS', data: breadcrumbs });
  }
};

async function startGpsTracking(walkId: string) {
  db = await initDatabase();
  
  // Get initial position
  getPosition(walkId);
  
  // Set up periodic tracking every 60 seconds during walk
  trackingInterval = setInterval(() => {
    getPosition(walkId);
  }, 60000) as unknown as number;
}

function stopGpsTracking() {
  if (trackingInterval) {
    clearInterval(trackingInterval);
    trackingInterval = null;
   self.postMessage({ type: 'TRACKING_STOPPED' });
  }
}

async function getPosition(walkId: string) {
  if ('geolocation' in navigator) {
    navigator.geolocation.getCurrentPosition(
      async (position) => {
        const { latitude, longitude, accuracy } = position.coords;
        const timestamp = new Date().toISOString();
        
        const breadcrumb = {
          walkId,
          lat: latitude,
          lng: longitude,
          accuracy,
          time: timestamp,
          source: 'gps-worker'
        };
        
        // Save to IndexedDB
        if (db) {
          await saveBreadcrumb(db, breadcrumb);
        }
        
        // Send back to main thread
        self.postMessage({
          type: 'GPS_UPDATE',
          data: breadcrumb
        });
        
        console.log(`📍 GPS saved by worker: ${latitude}, ${longitude}`);
      },
      (error) => {
        console.error('GPS Worker error:', error);
        self.postMessage({ type: 'GPS_ERROR', error: error.message });
      },
      { enableHighAccuracy: true }
    );
  }
}

async function initDatabase(): Promise<IDBDatabase> {
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
    };
  });
}

async function saveBreadcrumb(db: IDBDatabase, breadcrumb: any): Promise<void> {
  return new Promise((resolve, reject) => {
    const transaction = db.transaction('breadcrumbs', 'readwrite');
    const store = transaction.objectStore('breadcrumbs');
    const request = store.add(breadcrumb);
    
    request.onerror = () => reject(request.error);
    request.onsuccess = () => resolve();
  });
}

async function getBreadcrumbs(walkId: string): Promise<any[]> {
  return new Promise((resolve, reject) => {
    if (!db) {
      resolve([]);
      return;
    }

    const transaction = db.transaction('breadcrumbs', 'readonly');
    const store = transaction.objectStore('breadcrumbs');
    const index = store.index('walkId');
    const request = index.getAll(walkId);
    
    request.onerror = () => reject(request.error);
    request.onsuccess = () => resolve(request.result);
  });
}

export {};
