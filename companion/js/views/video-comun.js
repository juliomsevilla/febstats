// Piezas comunes de las vistas de vídeo (biblioteca, editor y listas de reproducción).
import { h } from "../util.js";
import { invoke, urlVideo } from "../api.js";
import { menciones, apunta, hashDeDoc, docsDeNotas, docsDeJugadas } from "../relaciones.js";

export const fmt = (t) => { t = Math.max(0, t || 0); const hh = Math.floor(t / 3600), m = Math.floor((t % 3600) / 60), s = String(Math.floor(t % 60)).padStart(2, "0"); return hh ? `${hh}:${String(m).padStart(2, "0")}:${s}` : `${m}:${s}`; };
export const fmtJuego = (c, s) => (c == null || s == null ? "" : `${c}T ${fmt(s)}`);

export const videoEl = (v, extra = {}) => h("video", { class: "vid", preload: "metadata", crossorigin: "anonymous", src: urlVideo(v), playsinline: true, ...extra });

/** Notas y jugadas, para abrir lo que se cite con [[ ]] en un texto. */
export async function cargarEnlazables() {
  const [ns, js] = await Promise.all([invoke("notas_listar").catch(() => []), invoke("listar_jugadas").catch(() => [])]);
  return [...docsDeNotas(ns), ...docsDeJugadas(js)];
}
export const pintarEnlaces = (caja, docs, txt) => caja.replaceChildren(...menciones(txt).map((m) => { const d = docs.find((x) => apunta(x, m));
  return d ? h("a", { class: "vid-enl", href: hashDeDoc(d), title: d.tipo === "jugada" ? "Abrir la jugada en el Playbook" : "Abrir la nota" }, `${d.tipo === "jugada" ? "🏀" : "📝"} ${d.titulo}`) : h("span", { class: "vid-enl rota", title: "Esa nota o jugada ya no existe" }, `⚠ ${m}`); }));

/** Atajos de teclado y limpieza de la vista activa: se retiran al cambiar de pantalla (main.js llama a __quitarAtajos). */
export function activarAtajos(teclas, vid) {
  if (window.__quitarAtajos) window.__quitarAtajos();
  const manejar = (ev) => {
    if (["TEXTAREA", "INPUT", "SELECT"].includes(ev.target.tagName) || ev.ctrlKey || ev.metaKey || ev.altKey || document.getElementById("dlg")?.open) return; // escribiendo
    teclas(ev);
  };
  document.addEventListener("keydown", manejar);
  window.__quitarAtajos = () => { document.removeEventListener("keydown", manejar); vid.pause(); window.__quitarAtajos = null; };
}
