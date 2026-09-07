const CACHE_NAME = "straordinari-cache-v2";
const FILES_TO_CACHE = [
  "./index.html",
  "./app.js",
  "./manifest.json",
  "./icon-192.png",
  "./icon-512.png"
];

self.addEventListener("install", (evt) => {
  self.skipWaiting();
  evt.waitUntil(
    caches.open(CACHE_NAME).then((cache) => cache.addAll(FILES_TO_CACHE))
  );
});

self.addEventListener("activate", (evt) => {
  evt.waitUntil(
    caches.keys().then((keys) =>
      Promise.all(keys.filter((k) => k !== CACHE_NAME).map((k) => caches.delete(k)))
    )
  );
  self.clients.claim();
});

self.addEventListener("fetch", (evt) => {
  if(evt.request.url.includes("cdn.jsdelivr.net")){
    return;
  }
  evt.respondWith(
    caches.match(evt.request).then((cached) => {
      return cached || fetch(evt.request).catch(() => caches.match("./index.html"));
    })
  );
});
