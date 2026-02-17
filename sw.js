/**
 * Basic service worker for offline caching.
 */

const CACHE_VERSION = 'radgir-static-v19-20260217-share-icon-update';
const PRECACHE_URLS = [
  '/',
  '/index.html',
  '/manifest.json',
  '/styles.css',
  '/pwa.js',
  '/script.js',
  '/analytics.js',
  '/auth.js',
  '/navigation.js',
  '/theme.js',
  '/i18n.js',
  '/translations.js',
  '/icons/icon-192x192.png',
  '/icons/icon-512x512.png',
  '/map-listings.js',
  '/views.js',
  '/router.js',
  '/login.html',
  '/register.html',
  '/dashboard.html',
  '/about-contact.html',
  '/create-person.html',
  '/almighty-portal.html',
  '/almighty-portal.js',
  '/forgot-password.html',
  '/reset-password.html',
  '/verify-email.html'
];

self.addEventListener('install', (event) => {
  console.log('[ServiceWorker] Install event fired - Pre-caching static assets');
  event.waitUntil(
    caches.open(CACHE_VERSION).then((cache) => cache.addAll(PRECACHE_URLS))
  );
  self.skipWaiting();
});

self.addEventListener('activate', (event) => {
  console.log('[ServiceWorker] Activate event fired');
  event.waitUntil(
    caches.keys().then((keys) =>
      Promise.all(
        keys
          .filter((key) => key !== CACHE_VERSION)
          .map((key) => caches.delete(key))
      )
    )
  );
  self.clients.claim();
  console.log('[ServiceWorker] Activation complete - Claiming clients');
});

self.addEventListener('fetch', (event) => {
  const { request } = event;
  if (request.method !== 'GET') {
    return;
  }

  const url = new URL(request.url);
  const isSameOrigin = url.origin === self.location.origin;

  if (!isSameOrigin || url.pathname.startsWith('/api/')) {
    return;
  }

  const isCoreAsset = /\.(html|js|css)$/i.test(url.pathname);

  if (request.mode === 'navigate') {
    event.respondWith(
      fetch(request)
        .then((response) => {
          const cacheControl = (response.headers.get('cache-control') || '').toLowerCase();
          const shouldSkipCache = cacheControl.includes('no-store');
          if (!shouldSkipCache) {
            const responseClone = response.clone();
            caches.open(CACHE_VERSION).then((cache) => cache.put(request, responseClone));
          }
          return response;
        })
        .catch(async () => {
          const cached = await caches.match(request);
          if (cached) return cached;
          return caches.match('/index.html');
        })
    );
    return;
  }

  if (isCoreAsset) {
    event.respondWith(
      fetch(request)
        .then((response) => {
          const cacheControl = (response.headers.get('cache-control') || '').toLowerCase();
          const shouldSkipCache = cacheControl.includes('no-store');
          if (!shouldSkipCache) {
            const responseClone = response.clone();
            caches.open(CACHE_VERSION).then((cache) => cache.put(request, responseClone));
          }
          return response;
        })
        .catch(async () => {
          const cached = await caches.match(request);
          if (cached) return cached;
          return new Response('', { status: 503, statusText: 'Offline' });
        })
    );
    return;
  }

  event.respondWith(
    caches.match(request).then((cached) => {
      if (cached) {
        return cached;
      }
      return fetch(request).then((response) => {
        const responseClone = response.clone();
        caches.open(CACHE_VERSION).then((cache) => cache.put(request, responseClone));
        return response;
      });
    })
  );
});
