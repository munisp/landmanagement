/**
 * Service Worker for IDLR-PTS PWA
 * Provides offline support and caching
 */

const CACHE_NAME = 'idlr-pts-v1';
const urlsToCache = [
  '/',
  '/search',
  '/dashboard',
  '/unified-dashboard',
  '/field-surveyor',
  '/offline.html',
];

// Install event - cache essential resources
self.addEventListener('install', (event) => {
  event.waitUntil(
    caches.open(CACHE_NAME)
      .then((cache) => {
        console.log('[SW] Opened cache');
        return cache.addAll(urlsToCache);
      })
  );
  self.skipWaiting();
});

// Activate event - clean up old caches
self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches.keys().then((cacheNames) => {
      return Promise.all(
        cacheNames.map((cacheName) => {
          if (cacheName !== CACHE_NAME) {
            console.log('[SW] Deleting old cache:', cacheName);
            return caches.delete(cacheName);
          }
        })
      );
    })
  );
  self.clients.claim();
});

// Fetch event - serve from cache when offline
self.addEventListener('fetch', (event) => {
  event.respondWith(
    caches.match(event.request)
      .then((response) => {
        // Cache hit - return response
        if (response) {
          return response;
        }

        return fetch(event.request).then((response) => {
          // Check if valid response
          if (!response || response.status !== 200 || response.type !== 'basic') {
            return response;
          }

          // Clone the response
          const responseToCache = response.clone();

          caches.open(CACHE_NAME)
            .then((cache) => {
              cache.put(event.request, responseToCache);
            });

          return response;
        }).catch(() => {
          // Return offline page if fetch fails
          return caches.match('/offline.html');
        });
      })
  );
});

// Background sync for offline transactions and field data
self.addEventListener('sync', (event) => {
  if (event.tag === 'sync-transactions') {
    event.waitUntil(syncTransactions());
  }
  if (event.tag === 'sync-field-data') {
    event.waitUntil(syncFieldData());
  }
});

async function syncTransactions() {
  // Get pending transactions from IndexedDB and sync to server
  console.log('[SW] Syncing offline transactions');
  // Implementation would go here
}

async function syncFieldData() {
  try {
    const db = await openFieldDataDB();
    const pendingData = await getPendingFieldData(db);
    console.log('[SW] Syncing', pendingData.length, 'pending field records');

    for (const record of pendingData) {
      try {
        const response = await fetch('/api/trpc/fieldData.sync', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(record),
        });
        if (response.ok) {
          await markFieldDataAsSynced(db, record.id);
        }
      } catch (error) {
        console.error('[SW] Failed to sync field record:', record.id, error);
      }
    }
  } catch (error) {
    console.error('[SW] Field data sync failed:', error);
  }
}

function openFieldDataDB() {
  return new Promise((resolve, reject) => {
    const request = indexedDB.open('idlr-field-data', 1);
    request.onerror = () => reject(request.error);
    request.onsuccess = () => resolve(request.result);
    request.onupgradeneeded = (event) => {
      const db = event.target.result;
      if (!db.objectStoreNames.contains('pending')) {
        const store = db.createObjectStore('pending', { keyPath: 'id', autoIncrement: true });
        store.createIndex('synced', 'synced', { unique: false });
      }
    };
  });
}

function getPendingFieldData(db) {
  return new Promise((resolve, reject) => {
    const transaction = db.transaction(['pending'], 'readonly');
    const store = transaction.objectStore('pending');
    const index = store.index('synced');
    const request = index.getAll(false);
    request.onerror = () => reject(request.error);
    request.onsuccess = () => resolve(request.result);
  });
}

function markFieldDataAsSynced(db, id) {
  return new Promise((resolve, reject) => {
    const transaction = db.transaction(['pending'], 'readwrite');
    const store = transaction.objectStore('pending');
    const request = store.get(id);
    request.onerror = () => reject(request.error);
    request.onsuccess = () => {
      const record = request.result;
      record.synced = true;
      record.syncedAt = new Date().toISOString();
      const updateRequest = store.put(record);
      updateRequest.onerror = () => reject(updateRequest.error);
      updateRequest.onsuccess = () => resolve();
    };
  });
}

// Push notifications
self.addEventListener('push', (event) => {
  const data = event.data ? event.data.json() : {};
  const title = data.title || 'IDLR-PTS Notification';
  const options = {
    body: data.body || 'You have a new notification',
    icon: '/icon-192.png',
    badge: '/badge-72.png',
    data: data.url,
  };

  event.waitUntil(
    self.registration.showNotification(title, options)
  );
});

// Notification click
self.addEventListener('notificationclick', (event) => {
  event.notification.close();
  
  if (event.notification.data) {
    event.waitUntil(
      clients.openWindow(event.notification.data)
    );
  }
});
