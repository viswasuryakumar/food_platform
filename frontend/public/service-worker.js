const CACHE_NAME = "campuscrave-shell-v2";
const APP_SHELL = [
  "/",
  "/index.html",
  "/manifest.webmanifest",
  "/campuscrave-hero.jpg",
  "/icons/icon-192.png",
  "/icons/icon-512.png",
];

async function precacheApp() {
  const cache = await caches.open(CACHE_NAME);
  await cache.addAll(APP_SHELL);

  // Vite fingerprints production assets. Discover those generated filenames
  // from the built HTML so the complete app shell works on the first offline
  // launch rather than only after a second visit.
  const response = await fetch("/index.html", { cache: "no-store" });
  const html = await response.text();
  const localAssets = [...html.matchAll(/(?:src|href)="(\/[^"#?]+)"/g)].map((match) => match[1]);
  await cache.addAll([...new Set(localAssets)]);
}

self.addEventListener("install", (event) => {
  event.waitUntil(precacheApp());
  self.skipWaiting();
});

self.addEventListener("activate", (event) => {
  event.waitUntil(
    caches
      .keys()
      .then((keys) => Promise.all(keys.filter((key) => key !== CACHE_NAME).map((key) => caches.delete(key))))
      .then(() => self.clients.claim())
  );
});

self.addEventListener("fetch", (event) => {
  const request = event.request;
  if (request.method !== "GET") return;

  const url = new URL(request.url);
  if (url.origin !== self.location.origin || url.pathname.startsWith("/api/")) return;

  if (request.mode === "navigate") {
    event.respondWith(
      fetch(request)
        .then((response) => {
          const copy = response.clone();
          caches.open(CACHE_NAME).then((cache) => cache.put("/index.html", copy));
          return response;
        })
        .catch(() => caches.match("/index.html"))
    );
    return;
  }

  event.respondWith(
    caches.match(request).then(
      (cached) =>
        cached ||
        fetch(request).then((response) => {
          if (response.ok) {
            const copy = response.clone();
            caches.open(CACHE_NAME).then((cache) => cache.put(request, copy));
          }
          return response;
        })
    )
  );
});
