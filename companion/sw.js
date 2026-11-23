// Service worker: guarda la app en el dispositivo para usarla sin conexión (iPad en el pabellón).
// Estrategia: la interfaz se sirve de la caché y se actualiza en segundo plano; las llamadas a la IA o a la API nunca se cachean.
const VERSION = "feb-79bfcafc6e";
const NUCLEO = ["./", "css/app.css", "icons/icon-180.png", "icons/icon-192.png", "icons/icon-512.png", "index.html", "js/api.js", "js/ayuda-datos.js", "js/ayuda.js", "js/charts/line.js", "js/charts/radar.js", "js/charts/scatter.js", "js/court.js", "js/docx.js", "js/export.js", "js/exportar-auto.js", "js/graficos.js", "js/heat.js", "js/jugada-modelo.js", "js/local.js", "js/main.js", "js/md.js", "js/mdx.js", "js/pizarra.js", "js/reglas.js", "js/relaciones.js", "js/state.js", "js/util.js", "js/views/ajustes.js", "js/views/consulta.js", "js/views/datos.js", "js/views/equipo.js", "js/views/ia.js", "js/views/info.js", "js/views/jugadas.js", "js/views/jugadores.js", "js/views/notas.js", "js/views/partidos.js", "js/views/relacionado.js", "js/views/tiros.js", "js/views/video.js", "js/views/vinculo.js", "manifest.webmanifest"];

self.addEventListener("install", (e) => { e.waitUntil(caches.open(VERSION).then((c) => Promise.all(NUCLEO.map((u) => c.add(u).catch(() => {})))).then(() => self.skipWaiting())); });
self.addEventListener("activate", (e) => { e.waitUntil(caches.keys().then((ks) => Promise.all(ks.filter((k) => k !== VERSION).map((k) => caches.delete(k)))).then(() => self.clients.claim())); });

self.addEventListener("fetch", (e) => {
  const r = e.request; const u = new URL(r.url);
  if (r.method !== "GET" || u.origin !== location.origin || /^\/(rpc|api|video|eventos|login)\b/.test(u.pathname)) return; // IA y backends: directo a la red
  e.respondWith((async () => {
    const c = await caches.open(VERSION);
    const previa = await c.match(r, { ignoreSearch: true });
    const red = fetch(r).then((res) => { if (res.ok) c.put(r, res.clone()); return res; }).catch(() => null);
    if (previa) { e.waitUntil(red); return previa; }
    const res = await red; if (res) return res;
    if (r.mode === "navigate") return (await c.match("index.html")) || (await c.match("./")) || new Response("Sin conexión", { status: 503 });
    return new Response("", { status: 504 });
  })());
});
