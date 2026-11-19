// Geometría de la media pista FIBA y componente visual de cancha.
//
// Coordenadas de datos: X a lo largo de la pista (0 = línea de fondo, aro en X=1.575) e Y a lo
// ancho (0-15), tal como vienen en Xinv/Yinv. La cancha se dibuja con el aro ARRIBA: el eje
// horizontal de pantalla es Y y el vertical es X.
// asignarZona() debe mantenerse sincronizada con assign_zone() en feb_scraper/index.py.
import { h, s } from "./util.js";

export const C = { L: 14, W: 15, HX: 1.575, HY: 7.5, R3: 6.75, ESQ: 0.9, KW: 4.9, KD: 5.8, FT: 1.8, RA: 1.25 };
export const M = 0.9; // margen visual alrededor de la pista (m)
export const VB = { w: C.W + 2 * M, h: C.L + 2 * M };

const KY0 = C.W / 2 - C.KW / 2, KY1 = C.W / 2 + C.KW / 2;
const CORNER_X = C.HX + Math.sqrt(C.R3 ** 2 - (C.ESQ - C.HY) ** 2);

export const ZONAS = {
  pintura: { nombre: "Pintura", triple: false, pos: [7.5, 2.0] },
  media_centro: { nombre: "Media distancia · centro", triple: false, pos: [7.5, 6.3] },
  media_baja: { nombre: "Media distancia · ala izq.", triple: false, pos: [2.8, 3.4] },
  media_alta: { nombre: "Media distancia · ala der.", triple: false, pos: [12.2, 3.4] },
  corner3_baja: { nombre: "Triple · esquina izq.", triple: true, pos: [0.45, 1.5] },
  corner3_alta: { nombre: "Triple · esquina der.", triple: true, pos: [14.55, 1.5] },
  ala3_baja: { nombre: "Triple · ala izq.", triple: true, pos: [1.9, 9.2] },
  ala3_alta: { nombre: "Triple · ala der.", triple: true, pos: [13.1, 9.2] },
  top3: { nombre: "Triple · frontal", triple: true, pos: [7.5, 10.3] },
};
export const ZONA_IDS = Object.keys(ZONAS);

export function asignarZona(x, y) {
  if (x <= C.KD && y >= KY0 && y <= KY1) return "pintura";
  const dist = Math.hypot(x - C.HX, y - C.HY);
  const enEsquina = (y <= C.ESQ || y >= C.W - C.ESQ) && x <= CORNER_X;
  if (!(enEsquina || dist >= C.R3)) return y < KY0 ? "media_baja" : y > KY1 ? "media_alta" : "media_centro";
  if (enEsquina) return y <= C.ESQ ? "corner3_baja" : "corner3_alta";
  const ang = Math.atan2(y - C.HY, x - C.HX);
  if (Math.abs(ang) <= (15 * Math.PI) / 180) return "top3";
  return ang < 0 ? "ala3_baja" : "ala3_alta";
}
export const puntosDeTiro = (t) => (ZONAS[asignarZona(t.Xinv, t.Yinv)].triple ? 3 : 2);

// --- trazado SVG (pantalla: [Y, X]) ---
let FLIP = false; // true: dibuja el extremo opuesto (pista completa)
const P = (x, y) => `${(y + M).toFixed(3)},${((FLIP ? 2 * C.L - x : x) + M).toFixed(3)}`;
const linea = (pts) => "M" + pts.map(([x, y]) => P(x, y)).join("L");
function arco(cx, cy, r, a0, a1, n = 64) {
  const pts = [];
  for (let i = 0; i <= n; i++) { const a = a0 + ((a1 - a0) * i) / n; pts.push([cx + r * Math.cos(a), cy + r * Math.sin(a)]); }
  return pts;
}
const ARCO3 = (() => {
  const a0 = Math.atan2(C.ESQ - C.HY, CORNER_X - C.HX), a1 = Math.atan2(C.W - C.ESQ - C.HY, CORNER_X - C.HX);
  return arco(C.HX, C.HY, C.R3, a0, a1, 96);
})();

function capaBase() {
  const dos = [[0, C.ESQ], [CORNER_X, C.ESQ], ...ARCO3, [CORNER_X, C.W - C.ESQ], [0, C.W - C.ESQ]];
  const fuera = `M${P(0, 0)}L${P(C.L, 0)}L${P(C.L, C.W)}L${P(0, C.W)}Z`;
  return s("svg", { class: "cancha-base", viewBox: `0 0 ${VB.w} ${VB.h}`, "aria-hidden": "true", preserveAspectRatio: "xMidYMid meet" },
    s("rect", { class: "c-suelo", x: 0, y: 0, width: VB.w, height: VB.h }),
    s("path", { class: "c-pista", d: fuera }),
    s("path", { class: "c-triple", d: fuera + linea(dos) + "Z", "fill-rule": "evenodd" }),
    s("path", { class: "c-pintura", d: `M${P(0, KY0)}L${P(C.KD, KY0)}L${P(C.KD, KY1)}L${P(0, KY1)}Z` }));
}

function capaLineas() {
  const g = s("g", { class: "c-lineas" });
  const p = (d, cls) => g.append(s("path", { d, class: cls || "" }));
  p(`M${P(0, 0)}L${P(C.L, 0)}L${P(C.L, C.W)}L${P(0, C.W)}Z`, "c-borde");
  p(linea([[0, KY0], [C.KD, KY0], [C.KD, KY1], [0, KY1]]));
  p(linea(arco(C.KD, C.W / 2, C.FT, -Math.PI / 2, Math.PI / 2)));
  p(linea(arco(C.KD, C.W / 2, C.FT, Math.PI / 2, (3 * Math.PI) / 2)), "c-disc");
  p(linea([[0, C.ESQ], [CORNER_X, C.ESQ]]));
  p(linea([[0, C.W - C.ESQ], [CORNER_X, C.W - C.ESQ]]));
  p(linea(ARCO3));
  p(linea([[0, C.HY - C.RA], ...arco(C.HX, C.HY, C.RA, -Math.PI / 2, Math.PI / 2, 24), [0, C.HY + C.RA]]));
  p(linea(arco(C.L, C.W / 2, C.FT, Math.PI / 2, (3 * Math.PI) / 2)));
  p(linea([[1.2, C.HY - 0.9], [1.2, C.HY + 0.9]]), "c-tablero");
  g.append(s("circle", { class: "c-aro", cx: C.HY + M, cy: (FLIP ? 2 * C.L - C.HX : C.HX) + M, r: 0.225 }));
  return g;
}

/**
 * Cancha con tres capas: suelo (SVG) · mapa de calor (canvas) · líneas y datos (SVG).
 * Devuelve {el, canvas, datos, aCancha(ev)}; `datos` es un <g> donde pintar puntos/etiquetas.
 */
export function crearCancha({ res = 0.1 } = {}) {
  const canvas = h("canvas", { class: "cancha-heat", width: Math.round(C.W / res), height: Math.round(C.L / res) });
  Object.assign(canvas.style, { left: `${(M / VB.w) * 100}%`, top: `${(M / VB.h) * 100}%`, width: `${(C.W / VB.w) * 100}%`, height: `${(C.L / VB.h) * 100}%` });
  const datos = s("g", { class: "c-datos" });
  const over = s("svg", { class: "cancha-over", viewBox: `0 0 ${VB.w} ${VB.h}`, preserveAspectRatio: "xMidYMid meet" }, capaLineas(), datos);
  const el = h("div", { class: "cancha", style: { aspectRatio: `${VB.w} / ${VB.h}` } }, capaBase(), canvas, over);
  const aCancha = (ev) => {
    const r = canvas.getBoundingClientRect();
    return { x: ((ev.clientY - r.top) / r.height) * C.L, y: ((ev.clientX - r.left) / r.width) * C.W };
  };
  return { el, canvas, datos, over, aCancha, res };
}

/** Pista completa (28 × 15 m, datos X/Y sin plegar): solo suelo, líneas y capa de datos. */
export function crearCanchaCompleta() {
  const w = VB.w, hh = 2 * C.L + 2 * M;
  const fuera = (f) => { FLIP = f; return `M${P(0, 0)}L${P(C.L, 0)}L${P(C.L, C.W)}L${P(0, C.W)}Z`; };
  const base = s("svg", { class: "cancha-base", viewBox: `0 0 ${w} ${hh}`, "aria-hidden": "true" }, s("rect", { class: "c-suelo", x: 0, y: 0, width: w, height: hh }));
  const over = s("svg", { class: "cancha-over", viewBox: `0 0 ${w} ${hh}` });
  for (const f of [false, true]) {
    FLIP = f;
    const dos = [[0, C.ESQ], [CORNER_X, C.ESQ], ...ARCO3, [CORNER_X, C.W - C.ESQ], [0, C.W - C.ESQ]];
    const fu = fuera(f);
    FLIP = f;
    base.append(s("path", { class: "c-pista", d: fu }), s("path", { class: "c-triple", d: fu + linea(dos) + "Z", "fill-rule": "evenodd" }),
      s("path", { class: "c-pintura", d: `M${P(0, KY0)}L${P(C.KD, KY0)}L${P(C.KD, KY1)}L${P(0, KY1)}Z` }));
    over.append(capaLineas());
  }
  FLIP = false;
  const datos = s("g", { class: "c-datos" });
  over.append(datos);
  const el = h("div", { class: "cancha completa", style: { aspectRatio: `${w} / ${hh}` } }, base, over);
  return { el, datos, over };
}

export const posView = (x, y) => [y + M, x + M];

/** Líneas discontinuas que cierran las 9 zonas (el arco y el pasillo ya los dibuja la cancha). */
export function lineasZonas() {
  const g = s("g", { class: "c-zonas" });
  const l = (a, b) => g.append(s("path", { class: "c-zl", d: linea([a, b]) }));
  const dy = KY0 - C.HY, xArco = C.HX + Math.sqrt(C.R3 ** 2 - dy * dy);
  l([C.KD, KY0], [xArco, KY0]);
  l([C.KD, KY1], [xArco, KY1]);
  l([CORNER_X, 0], [CORNER_X, C.ESQ]);
  l([CORNER_X, C.W - C.ESQ], [CORNER_X, C.W]);
  for (const a of [-15, 15]) {
    const r = (a * Math.PI) / 180;
    l([C.HX + C.R3 * Math.cos(r), C.HY + C.R3 * Math.sin(r)], [C.L, C.HY + ((C.L - C.HX) / Math.cos(r)) * Math.sin(r)]);
  }
  return g;
}
