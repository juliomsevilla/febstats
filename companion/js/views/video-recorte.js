// Barra de recorte: ampliación del tramo de la jugada (nueva o guardada) con dos tiradores para mover inicio y final.
import { h } from "../util.js";
import { fmt } from "./video-comun.js";

const MARGEN = 15, MINIMO = 0.5;
const fino = (t) => `${fmt(t)}.${Math.floor((Math.max(0, t) % 1) * 10)}`;

/** `api`: objetivo() → {nueva, ini, fin|null, nombre} | null; mover(ini, fin); soltar(); inicio(); fin(); descartar(); cerrar(); reproducir(ini, fin); guardarSinEtiqueta(). */
export function recortador(vid, api) {
  const el = h("div", { class: "vrec" });
  let ventana = null, pista = null, aguja = null, arrastrando = false;
  const duracion = () => vid.duration || Infinity;
  const limitar = (t) => Math.min(duracion(), Math.max(0, t));
  const pct = (t) => ((t - ventana.a) / (ventana.b - ventana.a)) * 100;

  const cursor = () => { if (!aguja || !ventana) return; const p = pct(vid.currentTime); aguja.hidden = p < 0 || p > 100; aguja.style.left = `${p}%`; };

  /** Mueve un extremo ("ini" o "fin") sin que se crucen. */
  const ajustar = (cual, t) => {
    const o = api.objetivo(); if (!o) return;
    let { ini, fin } = o;
    if (cual === "ini") ini = Math.min(limitar(t), (fin ?? duracion()) - MINIMO); else fin = Math.max(limitar(t), ini + MINIMO);
    api.mover(ini, fin); vid.currentTime = cual === "ini" ? ini : fin;
  };

  function pintar() {
    const o = api.objetivo();
    const b = (texto, accion, extra = {}) => h("button", { type: "button", class: "btn peq", onclick: accion, ...extra }, texto);
    if (!o) {
      ventana = pista = aguja = null;
      el.replaceChildren(h("div", { class: "vrec-fila" }, b("[ Marcar inicio (I)", api.inicio, { class: "btn peq primario" }), b("Marcar fin (O) ]", api.fin),
        h("span", { class: "vid-ayuda", text: "Marca dónde empieza y acaba la jugada, o pulsa un botón para guardar con su «antes/después»." })));
      return;
    }
    if (!arrastrando) ventana = { a: Math.max(0, o.ini - MARGEN), b: Math.min(duracion(), (o.fin ?? Math.max(o.ini, vid.currentTime)) + MARGEN) };
    const fin = o.fin;
    pista = h("div", { class: "vrec-pista" });
    aguja = h("span", { class: "vrec-aguja" });
    const tramo = fin == null ? null : h("span", { class: "vrec-tramo" });
    const tirador = (cual, t) => h("button", { type: "button", class: `vrec-tir ${cual}`, "aria-label": cual === "ini" ? "Inicio de la jugada" : "Final de la jugada", title: "Arrastra para ajustar (con el foco, flechas: ±0,2 s)" });
    const tIni = tirador("ini"), tFin = fin == null ? null : tirador("fin");
    const colocar = () => { const x = api.objetivo(); if (!x) return; tIni.style.left = `${pct(x.ini)}%`; if (tFin) { tFin.style.left = `${pct(x.fin)}%`; tramo.style.left = `${pct(x.ini)}%`; tramo.style.width = `${pct(x.fin) - pct(x.ini)}%`; }
      etiqueta.textContent = x.fin == null ? `Inicio ${fino(x.ini)} · marca el fin (O) o pulsa un botón` : `${fino(x.ini)} – ${fino(x.fin)} · ${(x.fin - x.ini).toFixed(1)} s`; cursor(); };
    const tiempoEn = (x) => { const r = pista.getBoundingClientRect(); return ventana.a + Math.min(1, Math.max(0, (x - r.left) / r.width)) * (ventana.b - ventana.a); };
    for (const [boton, cual] of [[tIni, "ini"], [tFin, "fin"]]) {
      if (!boton) continue;
      boton.addEventListener("pointerdown", (ev) => { ev.preventDefault(); ev.stopPropagation(); vid.pause(); arrastrando = true; boton.setPointerCapture(ev.pointerId); });
      boton.addEventListener("pointermove", (ev) => { if (!arrastrando || !boton.hasPointerCapture(ev.pointerId)) return; ajustar(cual, tiempoEn(ev.clientX)); colocar(); });
      const soltar = async () => { if (!arrastrando) return; arrastrando = false; await api.soltar(); pintar(); };
      boton.addEventListener("pointerup", soltar); boton.addEventListener("pointercancel", soltar);
      boton.addEventListener("keydown", async (ev) => {
        if (ev.key !== "ArrowLeft" && ev.key !== "ArrowRight") return;
        ev.preventDefault(); ev.stopPropagation(); ajustar(cual, api.objetivo()[cual] + (ev.key === "ArrowLeft" ? -0.2 : 0.2)); await api.soltar(); pintar(); el.querySelector(`.vrec-tir.${cual}`)?.focus();
      });
    }
    pista.addEventListener("pointerdown", (ev) => { vid.currentTime = tiempoEn(ev.clientX); });
    pista.append(...[tramo, aguja, tIni, tFin].filter(Boolean));
    const etiqueta = h("b", { class: "vrec-et" });
    const paso = async (cual, d) => { ajustar(cual, api.objetivo()[cual] + d); await api.soltar(); pintar(); };
    const aqui = async (cual) => { const t = vid.currentTime; ajustar(cual, t); await api.soltar(); pintar(); };
    const extremo = (cual, nombre) => h("span", { class: "vrec-ext" }, h("small", { text: nombre }), b("−0,5", () => paso(cual, -0.5)), b("+0,5", () => paso(cual, 0.5)),
      b("Aquí", () => aqui(cual), { title: `${nombre} = posición actual del vídeo` }));
    el.replaceChildren(
      h("div", { class: "vrec-fila" }, h("span", { class: "vrec-tit", text: o.nueva ? "Jugada nueva" : `Editando: ${o.nombre}` }), etiqueta),
      pista,
      h("div", { class: "vrec-fila" }, extremo("ini", "Inicio"),
        fin == null ? b("Marcar fin (O) ]", api.fin, { class: "btn peq primario" }) : extremo("fin", "Fin"),
        fin == null ? null : b("▶ Ver jugada", () => { const x = api.objetivo(); api.reproducir(x.ini, x.fin); }),
        o.nueva && fin != null ? b("Guardar sin etiqueta", api.guardarSinEtiqueta) : null,
        o.nueva ? b("Descartar (Esc)", api.descartar) : b("Cerrar", api.cerrar)),
      o.nueva && fin != null ? h("p", { class: "vid-ayuda", text: "Pulsa un botón de la derecha (o su atajo) para guardar la jugada con esa etiqueta." }) : "");
    colocar();
  }
  return { el, pintar, cursor };
}
