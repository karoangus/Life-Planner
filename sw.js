/* ============================================================
   Life Planner — service worker (v21.0)

   Why this file was rewritten:
   The old worker served *everything* cache-first. After a new
   release the browser kept the previous core.js / app.css, so
   the app looked like "the deploy never happened" on a phone
   until the user manually cleared the site data.

   Now:
   • every local CSS/JS file is requested with ?v=<VERSION>, so a
     new release always produces a URL the old cache cannot answer;
   • HTML, app-version.json, CSS and JS are network-first: online
     users always get the fresh build, offline users still get the
     cached copy;
   • only static media (icons, audio) is cache-first;
   • the install step fetches with {cache:'reload'} so GitHub Pages'
     10-minute HTTP cache can never freeze an old file into the
     offline cache;
   • a new worker takes over immediately (skipWaiting + claim).
   ============================================================ */

const VERSION = '21.0';
const CACHE_NAME = 'life-planner-cache-v81';
const OFFLINE_URL = './index.html';

self.addEventListener('message', e => {
  if (e.data && e.data.type === 'SKIP_WAITING') self.skipWaiting();
});

const SHELL = [
  OFFLINE_URL,
  './manifest.json',
  './icon-192.png',
  './icon-512.png',
  './app-version.json',
  `./css/app.css?v=${VERSION}`,
  `./css/design-system.css?v=${VERSION}`,
  `./css/v20.css?v=${VERSION}`,
  `./js/core.js?v=${VERSION}`,
  `./js/enhancements.js?v=${VERSION}`,
  `./js/sw-register.js?v=${VERSION}`,
  `./js/pomodoro.js?v=${VERSION}`,
  `./js/lang.js?v=${VERSION}`,
  `./js/v16.js?v=${VERSION}`,
  `./js/v162.js?v=${VERSION}`,
  `./js/v21.js?v=${VERSION}`,
  './audio/city_day.ogg',
  './audio/city_night.ogg',
  './audio/city_rain.ogg',
  './audio/rain.mp3',
  './audio/forest.mp3',
  './audio/cafe.mp3',
  './audio/fire.mp3'
];

/* Install: prime the cache with the *current* bytes, not whatever the
   browser's HTTP cache happens to hold. A failed asset never blocks the
   install — the app must keep working even if one file is missing. */
self.addEventListener('install', e => {
  e.waitUntil((async () => {
    const cache = await caches.open(CACHE_NAME);
    await Promise.all(SHELL.map(async url => {
      try {
        const res = await fetch(new Request(url, { cache: 'reload' }));
        if (res && res.ok) await cache.put(url, res);
      } catch (_) { /* offline install: keep whatever we already have */ }
    }));
    await self.skipWaiting();
  })());
});

self.addEventListener('activate', e => {
  e.waitUntil((async () => {
    const keys = await caches.keys();
    await Promise.all(keys.filter(k => k !== CACHE_NAME).map(k => caches.delete(k)));
    await self.clients.claim();
  })());
});

const isHtml = req => req.mode === 'navigate' ||
  /\/(?:index\.html)?$/.test(new URL(req.url).pathname);

const isFreshFirst = req => {
  const p = new URL(req.url).pathname;
  return isHtml(req) || /\.(?:js|css|json)$/i.test(p);
};

self.addEventListener('fetch', e => {
  const req = e.request;
  if (req.method !== 'GET') return;

  const url = new URL(req.url);
  if (url.origin !== self.location.origin) return;   // never touch third-party traffic

  /* Network-first: source files and the version file.
     Online → always the newest build. Offline → the cached copy. */
  if (isFreshFirst(req)) {
    e.respondWith((async () => {
      try {
        const fresh = await fetch(req, { cache: 'no-store' });
        if (fresh && fresh.ok) {
          /* Cache under a plain GET request: the original may carry
             cache:'no-store', which Cache.put() rejects. */
          try {
            const cache = await caches.open(CACHE_NAME);
            await cache.put(new Request(req.url, { method: 'GET' }), fresh.clone());
          } catch (_) { /* caching is a bonus, never a requirement */ }
        }
        return fresh;
      } catch (_) {
        const cached = await caches.match(req);
        if (cached) return cached;
        if (isHtml(req)) {
          return (await caches.match(OFFLINE_URL)) || Response.error();
        }
        return Response.error();
      }
    })());
    return;
  }

  /* Cache-first: icons, audio and other static media. */
  e.respondWith((async () => {
    const cached = await caches.match(req);
    if (cached) return cached;
    const res = await fetch(req);
    if (res && res.ok) {
      try {
        const cache = await caches.open(CACHE_NAME);
        await cache.put(req, res.clone());
      } catch (_) { /* ignore */ }
    }
    return res;
  })());
});

self.addEventListener('notificationclick', e => {
  e.notification.close();
  e.waitUntil(self.clients.matchAll({ type: 'window', includeUncontrolled: true }).then(cs => {
    for (const c of cs) { if ('focus' in c) return c.focus(); }
    return self.clients.openWindow('./');
  }));
});
