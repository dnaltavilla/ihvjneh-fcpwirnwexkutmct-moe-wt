const CACHE_NAME = "straordinari-cache-v17";
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
    caches.open(CACHE_NAME).then((cache) =>
      // un file mancante non deve far fallire l'installazione
      Promise.all(FILES_TO_CACHE.map((f) => cache.add(f).catch(() => null)))
    )
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
  const req = evt.request;
  if(req.method !== "GET") return;
  if(req.url.includes("cdn.jsdelivr.net")) return;

  const isCoreFile = req.url.includes("index.html") ||
                     req.url.includes("app.js") ||
                     req.url.includes("sw.js") ||
                     req.mode === "navigate";

  if(isCoreFile){
    // sempre dalla rete (senza cache HTTP del browser); cache solo se offline
    evt.respondWith(
      fetch(new Request(req.url, { cache: "no-store" }))
        .then((networkResp) => {
          const clone = networkResp.clone();
          caches.open(CACHE_NAME).then((cache) => cache.put(req, clone));
          return networkResp;
        })
        .catch(() => caches.match(req).then((cached) => cached || caches.match("./index.html")))
    );
    return;
  }

  evt.respondWith(
    caches.match(req).then((cached) => cached || fetch(req))
  );
});
