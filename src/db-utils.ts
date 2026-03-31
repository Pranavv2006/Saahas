// IndexedDB utilities for PWA
export interface Breadcrumb {
  id?: number;
  walkId: string;
  lat: number;
  lng: number;
  accuracy?: number;
  time: string;
  source: 'gps-worker' | 'gps-main';
}

export interface ActiveWalk {
  id: string;
  walkId: string;
  userId: string;
  startTime: string;
  duration: number;
  isActive: boolean;
  pin: string;
  stepCount?: number;
}

let db: IDBDatabase | null = null;

export async function initDB(): Promise<IDBDatabase> {
  if (db) return db;

  return new Promise((resolve, reject) => {
    const request = indexedDB.open('SaahasDB', 1);
    
    request.onerror = () => {
      console.error('IndexedDB error:', request.error);
      reject(request.error);
    };
    
    request.onsuccess = () => {
      db = request.result;
      console.log('✅ IndexedDB initialized');
      resolve(db);
    };
    
    request.onupgradeneeded = (event) => {
      const database = (event.target as IDBOpenDBRequest).result;
      
      // Breadcrumbs store
      if (!database.objectStoreNames.contains('breadcrumbs')) {
        const breadcrumbStore = database.createObjectStore('breadcrumbs', { keyPath: 'id', autoIncrement: true });
        breadcrumbStore.createIndex('walkId', 'walkId', { unique: false });
        breadcrumbStore.createIndex('time', 'time', { unique: false });
        console.log('📍 Breadcrumbs store created');
      }
      
      // Active walk store
      if (!database.objectStoreNames.contains('activeWalk')) {
        database.createObjectStore('activeWalk', { keyPath: 'id' });
        console.log('🚶 Active walk store created');
      }
      
      // Pending syncs store (for offline data)
      if (!database.objectStoreNames.contains('pendingSyncs')) {
        const syncStore = database.createObjectStore('pendingSyncs', { keyPath: 'id', autoIncrement: true });
        syncStore.createIndex('walkId', 'walkId', { unique: false });
        syncStore.createIndex('synced', 'synced', { unique: false });
        console.log('⏳ Pending syncs store created');
      }
    };
  });
}

export async function saveBreadcrumb(breadcrumb: Breadcrumb): Promise<number> {
  const database = await initDB();
  
  return new Promise((resolve, reject) => {
    const transaction = database.transaction('breadcrumbs', 'readwrite');
    const store = transaction.objectStore('breadcrumbs');
    const request = store.add(breadcrumb);
    
    request.onerror = () => reject(request.error);
    request.onsuccess = () => {
      console.log('💾 Breadcrumb saved:', breadcrumb);
      resolve(request.result as number);
    };
  });
}

export async function getBreadcrumbs(walkId: string): Promise<Breadcrumb[]> {
  const database = await initDB();
  
  return new Promise((resolve, reject) => {
    const transaction = database.transaction('breadcrumbs', 'readonly');
    const store = transaction.objectStore('breadcrumbs');
    const index = store.index('walkId');
    const request = index.getAll(walkId);
    
    request.onerror = () => reject(request.error);
    request.onsuccess = () => {
      const breadcrumbs = request.result as Breadcrumb[];
      console.log(`📍 Retrieved ${breadcrumbs.length} breadcrumbs for walk ${walkId}`);
      resolve(breadcrumbs);
    };
  });
}

export async function startActiveWalk(walk: ActiveWalk): Promise<void> {
  const database = await initDB();
  
  return new Promise((resolve, reject) => {
    const transaction = database.transaction('activeWalk', 'readwrite');
    const store = transaction.objectStore('activeWalk');
    const request = store.put(walk);
    
    request.onerror = () => reject(request.error);
    request.onsuccess = () => {
      console.log('🚶 Active walk started:', walk.walkId);
      resolve();
    };
  });
}

export async function getActiveWalk(): Promise<ActiveWalk | null> {
  const database = await initDB();
  
  return new Promise((resolve, reject) => {
    const transaction = database.transaction('activeWalk', 'readonly');
    const store = transaction.objectStore('activeWalk');
    const request = store.get('current');
    
    request.onerror = () => reject(request.error);
    request.onsuccess = () => {
      resolve(request.result ?? null);
    };
  });
}

export async function endActiveWalk(): Promise<void> {
  const database = await initDB();
  
  return new Promise((resolve, reject) => {
    const transaction = database.transaction('activeWalk', 'readwrite');
    const store = transaction.objectStore('activeWalk');
    const request = store.delete('current');
    
    request.onerror = () => reject(request.error);
    request.onsuccess = () => {
      console.log('✅ Active walk ended');
      resolve();
    };
  });
}

export async function savePendingSync(data: any): Promise<number> {
  const database = await initDB();
  
  return new Promise((resolve, reject) => {
    const transaction = database.transaction('pendingSyncs', 'readwrite');
    const store = transaction.objectStore('pendingSyncs');
    const request = store.add({
      ...data,
      synced: false,
      timestamp: new Date().toISOString()
    });
    
    request.onerror = () => reject(request.error);
    request.onsuccess = () => {
      console.log('⏳ Pending sync saved');
      resolve(request.result as number);
    };
  });
}

export async function getPendingSyncs(walkId: string): Promise<any[]> {
  const database = await initDB();
  
  return new Promise((resolve, reject) => {
    const transaction = database.transaction('pendingSyncs', 'readonly');
    const store = transaction.objectStore('pendingSyncs');
    const index = store.index('walkId');
    const request = index.getAll(walkId);
    
    request.onerror = () => reject(request.error);
    request.onsuccess = () => {
      resolve(request.result ?? []);
    };
  });
}

export async function markSynced(id: number): Promise<void> {
  const database = await initDB();
  
  return new Promise((resolve, reject) => {
    const transaction = database.transaction('pendingSyncs', 'readwrite');
    const store = transaction.objectStore('pendingSyncs');
    
    // Get the record
    const getRequest = store.get(id);
    getRequest.onsuccess = () => {
      const record = getRequest.result;
      if (record) {
        record.synced = true;
        const updateRequest = store.put(record);
        updateRequest.onerror = () => reject(updateRequest.error);
        updateRequest.onsuccess = () => resolve();
      }
    };
    getRequest.onerror = () => reject(getRequest.error);
  });
}
