const CACHE_NAME = "straordinari-cache-v6";
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
    ).then(() => self.clients.claim())
  );
});

self.addEventListener("fetch", (evt) => {
  if(evt.request.url.includes("cdn.jsdelivr.net")){
    return;
  }

  const isCoreFile = evt.request.url.includes("index.html") ||
                      evt.request.url.includes("app.js") ||
                      evt.request.mode === "navigate";

  if(isCoreFile){
    evt.respondWith(
      fetch(evt.request)
        .then((networkResp) => {
          const clone = networkResp.clone();
          caches.open(CACHE_NAME).then((cache) => cache.put(evt.request, clone));
          return networkResp;
        })
        .catch(() => caches.match(evt.request).then((cached) => cached || caches.match("./index.html")))
    );
    return;
  }

  evt.respondWith(
    caches.match(evt.request).then((cached) => {
      return cached || fetch(evt.request);
    })
  );
});
