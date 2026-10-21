// Rigzea Progressive Web App Service Worker
//
// There is no version string to remember to bump: the cache is named after a hash of the
// precached files, so the name always matches what was stored. Fetches are network-first, so an
// online user always gets the latest files regardless of the cache.
const CACHE_PREFIX = 'rigzea-';
const STATIC_ASSETS = [
  '/app/',
  '/app/index.html',
  '/app/app.css',
  '/app/app.js',
  '/js/config.js',
  '/js/core.js',
  '/js/site-tools.js',
  '/js/site-tools.css',
  '/js/plans.js',
  '/js/supabase.js',
  '/favicon.svg',
  '/favicon-192x192.png',
  '/favicon-512x512.png',
  '/apple-touch-icon.png',
  '/manifest.webmanifest'
];

// Known to the install handler, read by activate (same worker instance).
let CACHE_NAME = '';

const toHex = (buf) => [...new Uint8Array(buf)].map((b) => b.toString(16).padStart(2, '0')).join('');

// Fetch every static asset, hash their contents and store them. A file that fails to load is
// skipped (with a warning) instead of aborting the whole install.
async function precache() {
  const entries = [];
  for (const url of STATIC_ASSETS) {
    try {
      const res = await fetch(url, { cache: 'no-cache' });
      if (!res.ok) { console.warn('SW pre-cache skip:', url, res.status); continue; }
      const bytes = await res.clone().arrayBuffer();
      entries.push({ url, bytes, res });
    } catch (err) {
      console.warn('SW pre-cache warning:', url, err);
    }
  }
  const joined = new Uint8Array(entries.reduce((n, e) => n + e.bytes.byteLength, 0));
  let at = 0;
  for (const e of entries) { joined.set(new Uint8Array(e.bytes), at); at += e.bytes.byteLength; }
  CACHE_NAME = entries.length ? CACHE_PREFIX + toHex(await crypto.subtle.digest('SHA-256', joined)).slice(0, 12) : CACHE_PREFIX + 'runtime';
  const cache = await caches.open(CACHE_NAME);
  await Promise.all(entries.map((e) => cache.put(e.url, e.res)));
}

self.addEventListener('install', (e) => {
  e.waitUntil(precache().catch((err) => console.warn('SW pre-cache failed:', err)));
  self.skipWaiting();
});

self.addEventListener('activate', (e) => {
  e.waitUntil(
    caches.keys().then((keys) => Promise.all(
      keys.filter((k) => k.startsWith(CACHE_PREFIX) && k !== CACHE_NAME).map((k) => caches.delete(k))
    ))
  );
  self.clients.claim();
});

self.addEventListener('fetch', (e) => {
  const url = new URL(e.request.url);

  // Skip supabase api, auth endpoints and vercel routes from SW caching
  if (url.origin !== location.origin || url.pathname.startsWith('/api/') || url.pathname.startsWith('/auth/')) {
    return;
  }

  // Public pages (/p/, /guide/, /approve/) are always live data: never cache them.
  const isApp = url.pathname.startsWith('/app/') || url.pathname.startsWith('/js/') || url.pathname.startsWith('/staff/');
  const isAsset = /\.(css|js|png|jpe?g|svg|webp|woff2?|ico|webmanifest)$/.test(url.pathname);
  if (!isApp && !isAsset) return;

  // Network-first with cache fallback for the app shell and static assets
  e.respondWith(
    fetch(e.request)
      .then((res) => {
        if (res.ok && e.request.method === 'GET' && CACHE_NAME) {
          const resClone = res.clone();
          caches.open(CACHE_NAME).then((cache) => {
            cache.put(e.request, resClone);
          });
        }
        return res;
      })
      .catch(() => {
        return caches.match(e.request).then((cached) => {
          if (cached) return cached;
          if (e.request.mode === 'navigate' && url.pathname.startsWith('/app/')) {
            return caches.match('/app/');
          }
          return new Response('Offline', { status: 503, statusText: 'Offline' });
        });
      })
  );
});
