/**
 * IDLR-PTS Service Worker v3
 * ===========================
 * Production-grade PWA service worker providing:
 *  - Offline-first caching with stale-while-revalidate strategy
 *  - Push notification handling with rich action buttons
 *  - Background sync for offline form submissions
 *  - Periodic background sync for parcel subscription updates
 *  - Cache versioning and automatic cleanup
 *  - Network-first for API calls, cache-first for static assets
 */

const CACHE_VERSION = 'v3';
const STATIC_CACHE = `idlr-static-${CACHE_VERSION}`;
const DYNAMIC_CACHE = `idlr-dynamic-${CACHE_VERSION}`;
const API_CACHE = `idlr-api-${CACHE_VERSION}`;

const PRECACHE_URLS = [
  '/',
  '/search',
  '/dashboard',
  '/unified-dashboard',
  '/field-surveyor',
  '/notification-inbox',
  '/parcel-subscriptions',
  '/notification-preferences',
  '/offline.html',
];

self.addEventListener('install', (event) => {
  console.log('[SW v3] Installing...');
  event.waitUntil(
    caches.open(STATIC_CACHE).then((cache) => {
      return cache.addAll(PRECACHE_URLS).catch((err) => {
        console.warn('[SW v3] Pre-cache partial failure:', err);
      });
    })
  );
  self.skipWaiting();
});

self.addEventListener('activate', (event) => {
  console.log('[SW v3] Activating...');
  event.waitUntil(
    caches.keys().then((cacheNames) =>
      Promise.all(
        cacheNames
          .filter((name) => name.startsWith('idlr-') && ![STATIC_CACHE, DYNAMIC_CACHE, API_CACHE].includes(name))
          .map((name) => caches.delete(name))
      )
    )
  );
  return self.clients.claim();
});

self.addEventListener('fetch', (event) => {
  const url = new URL(event.request.url);
  if (event.request.method !== 'GET' || url.protocol === 'chrome-extension:') return;

  if (url.pathname.startsWith('/api/') || url.pathname.startsWith('/trpc/')) {
    event.respondWith(networkFirstWithCache(event.request, API_CACHE));
    return;
  }
  if (url.pathname.match(/\.(js|css|png|jpg|jpeg|svg|ico|woff2?|ttf|eot)$/)) {
    event.respondWith(cacheFirstWithNetwork(event.request, STATIC_CACHE));
    return;
  }
  if (event.request.mode === 'navigate') {
    event.respondWith(
      fetch(event.request).catch(() =>
        caches.match('/offline.html').then((r) => r || new Response('Offline'))
      )
    );
    return;
  }
  event.respondWith(staleWhileRevalidate(event.request, DYNAMIC_CACHE));
});

async function networkFirstWithCache(request, cacheName) {
  try {
    const networkResponse = await fetch(request);
    if (networkResponse.ok) {
      const cache = await caches.open(cacheName);
      cache.put(request, networkResponse.clone());
    }
    return networkResponse;
  } catch {
    const cached = await caches.match(request);
    return cached || new Response(JSON.stringify({ error: 'Offline' }), {
      status: 503,
      headers: { 'Content-Type': 'application/json' },
    });
  }
}

async function cacheFirstWithNetwork(request, cacheName) {
  const cached = await caches.match(request);
  if (cached) return cached;
  try {
    const networkResponse = await fetch(request);
    if (networkResponse.ok) {
      const cache = await caches.open(cacheName);
      cache.put(request, networkResponse.clone());
    }
    return networkResponse;
  } catch {
    return new Response('Asset unavailable offline', { status: 503 });
  }
}

async function staleWhileRevalidate(request, cacheName) {
  const cache = await caches.open(cacheName);
  const cached = await cache.match(request);
  const networkFetch = fetch(request).then((response) => {
    if (response.ok) cache.put(request, response.clone());
    return response;
  });
  return cached || networkFetch;
}

self.addEventListener('push', (event) => {
  let payload = {
    title: 'IDLR-PTS Notification',
    body: 'You have a new notification.',
    icon: '/icon-192.png',
    badge: '/icon-192.png',
    tag: 'idlr-notification',
    data: { url: '/notification-inbox' },
    actions: [],
  };
  if (event.data) {
    try { payload = { ...payload, ...event.data.json() }; }
    catch { payload.body = event.data.text(); }
  }
  const type = payload.data && payload.data.type;
  if (type === 'transaction_update') {
    payload.actions = [{ action: 'view', title: 'View Transaction' }, { action: 'dismiss', title: 'Dismiss' }];
  } else if (type === 'dispute_filed') {
    payload.actions = [{ action: 'view', title: 'View Dispute' }, { action: 'respond', title: 'Respond' }];
  } else {
    payload.actions = [{ action: 'view', title: 'View' }, { action: 'dismiss', title: 'Dismiss' }];
  }
  event.waitUntil(
    self.registration.showNotification(payload.title, {
      body: payload.body,
      icon: payload.icon,
      badge: payload.badge,
      tag: payload.tag,
      data: payload.data,
      actions: payload.actions,
      requireInteraction: type === 'dispute_filed',
      vibrate: [200, 100, 200],
      timestamp: Date.now(),
    })
  );
});

self.addEventListener('notificationclick', (event) => {
  event.notification.close();
  const data = event.notification.data || {};
  const action = event.action;
  if (action === 'dismiss') return;
  let targetUrl = '/notification-inbox';
  if (action === 'respond' && data.disputeId) targetUrl = `/disputes?id=${data.disputeId}`;
  else if (data.url) targetUrl = data.url;
  else if (data.transactionId) targetUrl = `/transactions/${data.transactionId}`;
  else if (data.parcelId) targetUrl = `/parcels/${data.parcelId}`;
  event.waitUntil(
    clients.matchAll({ type: 'window', includeUncontrolled: true }).then((clientList) => {
      for (const client of clientList) {
        if (client.url.includes(self.location.origin) && 'focus' in client) {
          client.navigate(targetUrl);
          return client.focus();
        }
      }
      if (clients.openWindow) return clients.openWindow(targetUrl);
    })
  );
});

self.addEventListener('sync', (event) => {
  if (event.tag === 'sync-pending-transactions') event.waitUntil(syncPendingTransactions());
  else if (event.tag === 'sync-field-survey-data') event.waitUntil(syncFieldSurveyData());
});

async function syncPendingTransactions() {
  const cache = await caches.open('idlr-offline-queue');
  const requests = await cache.keys();
  for (const request of requests.filter((r) => r.url.includes('/api/transactions'))) {
    try {
      const cachedResponse = await cache.match(request);
      const body = await cachedResponse.text();
      await fetch(request.url, { method: 'POST', body, headers: { 'Content-Type': 'application/json' } });
      await cache.delete(request);
    } catch (err) {
      console.error('[SW v3] Failed to sync transaction:', err);
    }
  }
}

async function syncFieldSurveyData() {
  console.log('[SW v3] Syncing field survey data...');
}

self.addEventListener('periodicsync', (event) => {
  if (event.tag === 'refresh-subscriptions') event.waitUntil(refreshSubscriptionData());
});

async function refreshSubscriptionData() {
  try {
    const response = await fetch('/api/trpc/parcelSubscriptions.listMySubscriptions');
    if (response.ok) {
      const cache = await caches.open(API_CACHE);
      cache.put('/api/trpc/parcelSubscriptions.listMySubscriptions', response);
    }
  } catch (err) {
    console.warn('[SW v3] Periodic sync failed:', err);
  }
}

self.addEventListener('message', (event) => {
  if (event.data && event.data.type === 'SKIP_WAITING') self.skipWaiting();
  else if (event.data && event.data.type === 'GET_VERSION') event.ports[0] && event.ports[0].postMessage({ version: CACHE_VERSION });
  else if (event.data && event.data.type === 'CLEAR_CACHE') caches.keys().then((keys) => Promise.all(keys.map((k) => caches.delete(k))));
});

console.log('[SW v3] Service worker loaded successfully');
