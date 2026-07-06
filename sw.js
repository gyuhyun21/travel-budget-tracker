// Bump this (e.g. to 'cmb-cache-v2') whenever any file listed in ASSETS changes,
// otherwise the service worker will keep serving stale cached files indefinitely.
const CACHE_NAME = 'cmb-cache-v15';
const ASSETS = [
  './',
  './index.html',
  './css/style.css',
  './js/firebase-init.js',
  './js/sync.js',
  './js/storage.js',
  './js/currency.js',
  './js/trip.js',
  './js/category.js',
  './js/ocr.js',
  './js/icons.js',
  './js/datepicker.js',
  './js/meal.js',
  './js/kakao-map.js',
  './js/render.js',
  './js/app.js',
  './manifest.json',
  './icons/icon.svg'
];

self.addEventListener('install', (event) => {
  event.waitUntil(
    caches.open(CACHE_NAME).then(cache => cache.addAll(ASSETS))
  );
  self.skipWaiting();
});

self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches.keys().then(keys =>
      Promise.all(keys.filter(k => k !== CACHE_NAME).map(k => caches.delete(k)))
    )
  );
  self.clients.claim();
});

self.addEventListener('fetch', (event) => {
  event.respondWith(
    caches.match(event.request).then(cached => cached || fetch(event.request))
  );
});
