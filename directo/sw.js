// Service worker: la app entera queda en caché para funcionar sin red en pista.
const VERSION = "fd-2026-11-21-4";
const ASSETS = [
  "./", "index.html", "manifest.webmanifest", "css/app.css",
  "vendor/sql-wasm.js", "vendor/sql-wasm.wasm",
  "js/app.js", "js/util.js", "js/schema-base.js", "js/schema.js", "js/sqlite.js", "js/idb.js",
  "js/grupo.js", "js/model.js", "js/court.js", "js/estado.js", "js/pizarra.js", "js/jugada-modelo.js",
  "js/views/inicio.js", "js/views/nuevo.js", "js/views/partido.js", "js/views/boxscore.js",
  "js/views/playbook.js", "js/views/notas.js", "js/views/ajustes.js",
  "icons/icon.svg", "icons/icon-192.png", "icons/icon-512.png", "icons/icon-maskable-512.png", "icons/apple-touch-icon.png",
];

self.addEventListener("install", (e) => {
  e.waitUntil(caches.open(VERSION).then((c) => c.addAll(ASSETS.map((a) => new URL(a, self.registration.scope).href))).then(() => self.skipWaiting()));
});

self.addEventListener("activate", (e) => {
  // Solo borra las cachés de ESTA app. En juliomsevilla.github.io/febstats convive con
  // la app principal (otro service worker en /febstats/): no se debe tocar su caché.
  e.waitUntil(caches.keys().then((ks) => Promise.all(
    ks.filter((k) => k.startsWith("fd-") && k !== VERSION).map((k) => caches.delete(k)),
  )).then(() => self.clients.claim()));
});

self.addEventListener("fetch", (e) => {
  const req = e.request;
  if (req.method !== "GET") return;
  const url = new URL(req.url);
  if (url.origin !== location.origin) return;
  const indice = () => caches.match(new URL("index.html", self.registration.scope).href).then((r) => r || caches.match(new URL("./", self.registration.scope).href));
  if (req.mode === "navigate") {
    // Sin red (o con un 502 del proxy) se sirve el índice cacheado.
    e.respondWith(fetch(req, { cache: "reload" }).then((r) => (r.ok ? r : indice())).catch(indice));
    return;
  }
  // Código y estilos: red primero (así una versión nueva se ve al abrir con Internet); sin red, caché.
  if (/\.(js|css|webmanifest)$/.test(url.pathname)) {
    e.respondWith(fetch(req, { cache: "reload" }).then((resp) => {
      if (resp.ok) { caches.open(VERSION).then((c) => c.put(req, resp.clone())); return resp; }
      return caches.match(req).then((c) => c || resp);
    }).catch(() => caches.match(req)));
    return;
  }
  // Imágenes, wasm y demás: caché primero.
  e.respondWith(caches.match(req).then((r) => r || fetch(req).then((resp) => {
    if (resp.ok) caches.open(VERSION).then((c) => c.put(req, resp.clone()));
    return resp;
  }).catch(() => r)));
});
