// Rigzea service worker: the CRM opens from the device, then quietly checks for a newer version.
//
//  * App shell (/app/ and every /app/<area>/): served from the cache at once, refreshed in the
//    background. All areas share one shell (routing is done by app.js), so one cached page serves them all.
//  * Hashed files (/app/*.js|css and /js/* with ?v=, fonts): the URL changes when the file does, so the
//    cached copy is always right. Cache first.
//  * Data (Supabase, /api/) and public pages (/p/, /guide/, /approve/): never touched here.
//  * When the refreshed shell differs from the one on screen, open tabs get an "update" message and
//    offer a reload; nothing reloads by itself.
const SHELL = '/app/';
const CACHE = 'rigzea-app-v3';
const ASSET_RE = /^\/(app|js)\/[^/]+\.(js|css)$/;
const STATIC_RE = /\.(png|jpe?g|svg|webp|ico|webmanifest|woff2?)$/;

// Every asset URL the shell page names, with its ?v= hash.
function assetsIn(html) {
  const urls = new Set();
  for (const m of html.matchAll(/(?:src|href)="(\/(?:app|js)\/[^"]+\.(?:js|css)\?v=[a-z0-9]+)"/g)) urls.add(m[1]);
  const chunks = /__RIGZEA_ASSET_VERSIONS=(\{.*?\})/.exec(html);
  if (chunks) { try { for (const [path, v] of Object.entries(JSON.parse(chunks[1]))) urls.add(`${path}?v=${v}`); } catch (e) { /* the page still works without the chunks cached */ } }
  return [...urls];
}

async function precache() {
  const cache = await caches.open(CACHE);
  const res = await fetch(SHELL, { cache: 'reload' });
  if (!res.ok) return;
  const html = await res.clone().text();
  await cache.put(SHELL, res);
  await Promise.all([
    ...assetsIn(html), '/fonts/FiraGO-Regular-sub.woff2', '/fonts/FiraGO-SemiBold-sub.woff2', '/manifest.webmanifest', '/favicon.svg?v=6',
  ].map(u => cache.add(u).catch(() => {})));
}

self.addEventListener('install', (e) => {
  e.waitUntil(precache().catch(() => {}));
  self.skipWaiting();
});

self.addEventListener('activate', (e) => {
  e.waitUntil((async () => {
    for (const k of await caches.keys()) if (k.startsWith('rigzea-') && k !== CACHE) await caches.delete(k);
    if (self.registration.navigationPreload) await self.registration.navigationPreload.enable().catch(() => {});
    await self.clients.claim();
  })());
});

// Fetch the shell again; if it changed, store it, drop assets it no longer names, and tell the open tabs.
async function refreshShell(preloaded) {
  const cache = await caches.open(CACHE);
  const old = await cache.match(SHELL);
  const res = (await preloaded) || await fetch(SHELL, { cache: 'no-cache' });
  if (!res || !res.ok) return;
  const [oldHtml, html] = await Promise.all([old ? old.text() : '', res.clone().text()]);
  if (oldHtml === html) return;
  await cache.put(SHELL, res);
  const keep = new Set(assetsIn(html));
  for (const req of await cache.keys()) {
    const u = new URL(req.url);
    if (ASSET_RE.test(u.pathname) && u.search && !keep.has(u.pathname + u.search)) await cache.delete(req);
  }
  Promise.all(assetsIn(html).map(u => cache.match(u).then(hit => hit || cache.add(u)).catch(() => {})));
  if (oldHtml) for (const c of await self.clients.matchAll()) c.postMessage({ type: 'rigzea-update' });
}

self.addEventListener('message', (e) => { if (e.data === 'skip-waiting') self.skipWaiting(); });

self.addEventListener('fetch', (e) => {
  const req = e.request;
  const url = new URL(req.url);
  if (req.method !== 'GET' || url.origin !== location.origin) return;
  const path = url.pathname;
  if (path.startsWith('/api/') || path.startsWith('/auth/')) return;

  // The CRM shell.
  if (req.mode === 'navigate' && path.startsWith('/app/')) {
    e.respondWith((async () => {
      const cached = await (await caches.open(CACHE)).match(SHELL);
      const preload = e.preloadResponse;
      if (cached) { e.waitUntil(refreshShell(preload).catch(() => {})); return cached; }
      try {
        const res = (await preload) || await fetch(req);
        if (res.ok) { const copy = res.clone(); e.waitUntil(caches.open(CACHE).then(c => c.put(SHELL, copy))); }
        return res;
      } catch (err) {
        return new Response('Offline', { status: 503, statusText: 'Offline', headers: { 'Content-Type': 'text/plain; charset=utf-8' } });
      }
    })());
    return;
  }

  // Hashed code and styles: the URL carries the version, so the stored copy is always current.
  if (ASSET_RE.test(path) && url.search.startsWith('?v=')) {
    e.respondWith((async () => {
      const cache = await caches.open(CACHE);
      const hit = await cache.match(req);
      if (hit) return hit;
      const res = await fetch(req);
      if (res.ok) cache.put(req, res.clone());
      return res;
    })());
    return;
  }

  // Fonts, icons, the manifest and other un-hashed files: show the stored copy, refresh it for next time.
  if (STATIC_RE.test(path) || ASSET_RE.test(path)) { // un-hashed files such as /js/i18n.js come here too
    e.respondWith((async () => {
      const cache = await caches.open(CACHE);
      const hit = await cache.match(req);
      const fresh = fetch(req).then(res => { if (res.ok) cache.put(req, res.clone()); return res; }).catch(() => null);
      return hit || (await fresh) || new Response('', { status: 504 });
    })());
  }
});
