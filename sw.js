/* ============================================================
   GUARDIAN — sw.js (Service Worker)
   ------------------------------------------------------------
   Purpose: make the entire app shell (HTML/CSS/JS/icons) work
   fully offline. This matters because two of the most
   safety-critical features — the Fake Call generator and the
   Silent SOS gesture detector — must never depend on network
   access. A phone with no signal is exactly when someone is
   most likely to lean on this app.

   Strategy: cache-first for the app shell, network-first (with
   no caching) for anything that legitimately needs to be live
   — Supabase realtime calls and the Leaflet/OpenStreetMap tiles
   used only by Live Location Sharing. Those are the ONE feature
   this app documents as requiring connectivity; everything else
   is designed to degrade gracefully to "compose an SMS" when
   offline.
   ============================================================ */

const CACHE_NAME = 'guardian-shell-v1';

// Everything needed to boot and use the core safety features offline.
const SHELL_FILES = [
  './',
  './index.html',
  './style.css',
  './script.js',
  './manifest.json',
  './icon-192.png',
  './icon-512.png'
];

// Hosts we deliberately never cache and never intercept — these are
// the "online-only" parts of the app (live map tiles + realtime sync).
const NETWORK_ONLY_HOSTS = [
  'supabase.co',
  'supabase.in',
  'tile.openstreetmap.org',
  'unpkg.com' // Leaflet library, loaded only when Live Share is opened
];

self.addEventListener('install', (event) => {
  event.waitUntil(
    caches.open(CACHE_NAME).then((cache) => cache.addAll(SHELL_FILES))
  );
  self.skipWaiting();
});

self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches.keys().then((names) =>
      Promise.all(
        names
          .filter((name) => name !== CACHE_NAME)
          .map((name) => caches.delete(name))
      )
    )
  );
  self.clients.claim();
});

self.addEventListener('fetch', (event) => {
  const url = new URL(event.request.url);

  // Let online-only hosts pass straight through to the network,
  // untouched — no caching, no offline fallback. If these fail,
  // the app's UI is responsible for showing "no connection".
  if (NETWORK_ONLY_HOSTS.some((host) => url.hostname.includes(host))) {
    return; // not calling event.respondWith() = default browser behavior
  }

  // Only handle same-origin GET requests for the shell; anything
  // else (e.g. cross-origin, POST) is left to the network as-is.
  if (event.request.method !== 'GET' || url.origin !== self.location.origin) {
    return;
  }

  event.respondWith(
    caches.match(event.request).then((cached) => {
      if (cached) return cached;
      return fetch(event.request)
        .then((response) => {
          // Opportunistically cache any new same-origin shell asset.
          const copy = response.clone();
          caches.open(CACHE_NAME).then((cache) => cache.put(event.request, copy));
          return response;
        })
        .catch(() => {
          // Final fallback: if a navigation request fails entirely
          // offline and isn't cached yet, serve the app shell so the
          // user always lands on a working screen, never a browser
          // error page.
          if (event.request.mode === 'navigate') {
            return caches.match('./index.html');
          }
        });
    })
  );
});
