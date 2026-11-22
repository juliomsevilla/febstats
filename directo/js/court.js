// Pista FIBA completa (28×15) en horizontal. Coordenadas canónicas plegadas: Xinv 0..14
// (aro en 1,575), Yinv 0..15. Cada tiro se dibuja en la mitad que ataca su equipo.
import { h, s } from "./util.js";

export const C = { L: 28, W: 15, HX: 1.575, HY: 7.5, R3: 6.75, ESQ: 0.9, KW: 4.9, KD: 5.8, FT: 1.8, RA: 1.25 };
export const M = 0.9;
export const VB = { w: C.L + 2 * M, h: C.W + 2 * M };
const KY0 = C.W / 2 - C.KW / 2, KY1 = C.W / 2 + C.KW / 2;
export const CORNER_X = C.HX + Math.sqrt(C.R3 ** 2 - (C.ESQ - C.HY) ** 2);
export const posView = (x, y) => [x + M, y + M];

const P = (x, y, espejo = false) => {
  const X = espejo ? C.L - x : x;
  const Y = espejo ? C.W - y : y;
  return `${(X + M).toFixed(3)},${(Y + M).toFixed(3)}`;
};
const linea = (pts, espejo = false) => "M" + pts.map(([x, y]) => P(x, y, espejo)).join("L");
function arco(cx, cy, r, a0, a1, n = 64) {
  const pts = [];
  for (let i = 0; i <= n; i++) { const a = a0 + ((a1 - a0) * i) / n; pts.push([cx + r * Math.cos(a), cy + r * Math.sin(a)]); }
  return pts;
}
const ARCO3 = (() => {
  const a0 = Math.atan2(C.ESQ - C.HY, CORNER_X - C.HX), a1 = Math.atan2(C.W - C.ESQ - C.HY, CORNER_X - C.HX);
  return arco(C.HX, C.HY, C.R3, a0, a1, 96);
})();
const DOS = [[0, C.ESQ], [CORNER_X, C.ESQ], ...ARCO3, [CORNER_X, C.W - C.ESQ], [0, C.W - C.ESQ]];
const SEMICANCHA = [[0, 0], [C.L / 2, 0], [C.L / 2, C.W], [0, C.W]];

function capaBase() {
  const exterior = `M${P(0, 0)}L${P(C.L, 0)}L${P(C.L, C.W)}L${P(0, C.W)}Z`;
  const triple = (espejo) => linea(SEMICANCHA, espejo) + "Z" + linea(DOS, espejo) + "Z";
  const pintura = (espejo) => linea([[0, KY0], [C.KD, KY0], [C.KD, KY1], [0, KY1]], espejo) + "Z";
  return s("svg", { class: "cancha-base", viewBox: `0 0 ${VB.w} ${VB.h}`, "aria-hidden": "true", preserveAspectRatio: "xMidYMid meet" },
    s("rect", { class: "c-suelo", x: 0, y: 0, width: VB.w, height: VB.h }),
    s("path", { class: "c-pista", d: exterior }),
    s("path", { class: "c-triple", d: triple(false), "fill-rule": "evenodd" }),
    s("path", { class: "c-triple", d: triple(true), "fill-rule": "evenodd" }),
    s("path", { class: "c-pintura", d: pintura(false) }),
    s("path", { class: "c-pintura", d: pintura(true) }));
}

function capaLinas() {
  const g = s("g", { class: "c-lineas" });
  const p = (d, cls) => g.append(s("path", { d, class: cls || "" }));
  p(`M${P(0, 0)}L${P(C.L, 0)}L${P(C.L, C.W)}L${P(0, C.W)}Z`, "c-borde");
  // Línea de medio campo y círculo central.
  p(linea([[C.L / 2, 0], [C.L / 2, C.W]]));
  p(linea(arco(C.L / 2, C.W / 2, C.FT, 0, 2 * Math.PI, 80)));
  for (const espejo of [false, true]) {
    p(linea([[0, KY0], [C.KD, KY0], [C.KD, KY1], [0, KY1]], espejo));
    p(linea(arco(C.KD, C.W / 2, C.FT, -Math.PI / 2, Math.PI / 2), espejo));
    p(linea(arco(C.KD, C.W / 2, C.FT, Math.PI / 2, (3 * Math.PI) / 2), espejo), "c-disc");
    p(linea([[0, C.ESQ], [CORNER_X, C.ESQ]], espejo));
    p(linea([[0, C.W - C.ESQ], [CORNER_X, C.W - C.ESQ]], espejo));
    p(linea(ARCO3, espejo));
    p(linea([[0, C.HY - C.RA], ...arco(C.HX, C.HY, C.RA, -Math.PI / 2, Math.PI / 2, 24), [0, C.HY + C.RA]], espejo));
    p(linea([[1.2, C.HY - 0.9], [1.2, C.HY + 0.9]], espejo), "c-tablero");
    g.append(s("circle", { class: "c-aro", cx: (espejo ? C.L - C.HX : C.HX) + M, cy: C.W / 2 + M, r: 0.225 }));
  }
  return g;
}

/** Pista completa con capa de tiros y marcador. `onTiro({x,y})` recibe coordenadas completas. */
export function crearCancha({ onTiro = null, interactiva = true } = {}) {
  const datos = s("g", { class: "c-datos" });
  const marca = s("g", { class: "c-marca", hidden: true });
  const over = s("svg", { class: "cancha-over", viewBox: `0 0 ${VB.w} ${VB.h}`, preserveAspectRatio: "xMidYMid meet" }, capaLinas(), datos, marca);
  const el = h("div", { class: "cancha" + (interactiva ? " interactiva" : ""), style: { aspectRatio: `${VB.w} / ${VB.h}` } }, capaBase(), over);

  const aCancha = (ev) => {
    const r = over.getBoundingClientRect();
    let px, py;
    try {
      const pt = over.createSVGPoint();
      pt.x = ev.clientX; pt.y = ev.clientY;
      const p = pt.matrixTransform(over.getScreenCTM().inverse());
      px = p.x; py = p.y;
    } catch {
      px = ((ev.clientX - r.left) / r.width) * VB.w;
      py = ((ev.clientY - r.top) / r.height) * VB.h;
    }
    return { x: Math.max(0, Math.min(C.L, px - M)), y: Math.max(0, Math.min(C.W, py - M)) };
  };

  if (interactiva) {
    const zona = s("rect", { class: "c-zona-toque", x: 0, y: 0, width: VB.w, height: VB.h, fill: "transparent" });
    over.append(zona);
    zona.addEventListener("pointerdown", (ev) => {
      ev.preventDefault();
      const p = aCancha(ev);
      if (onTiro) onTiro(p);
    });
  }

  return {
    el, over, datos,
    aCancha,
    marcar(x, y, { color = "", etiqueta = "", basket = "left" } = {}) {
      const X = basket === "right" ? C.L - x : x;
      const Y = basket === "right" ? C.W - y : y;
      marca.replaceChildren(
        s("circle", { cx: (X + M).toFixed(3), cy: (Y + M).toFixed(3), r: 0.42, class: "c-marca-punto", fill: color || "var(--acento)" }),
        etiqueta ? s("text", { x: (X + M).toFixed(3), y: ((Y + M) - 0.62).toFixed(3), class: "c-marca-txt", "text-anchor": "middle" }, etiqueta) : null);
      marca.removeAttribute("hidden");
    },
    limpiarMarca() { marca.replaceChildren(); marca.setAttribute("hidden", ""); },
    pintarTiros(tiros, { soloCuarto = null, basketPorTiro = null } = {}) {
      datos.replaceChildren();
      for (const t of tiros || []) {
        if (t.Xinv == null || t.Yinv == null) continue;
        if (soloCuarto != null && t.cuarto !== soloCuarto) continue;
        const basket = basketPorTiro ? basketPorTiro(t) : "left";
        const X = basket === "right" ? C.L - t.Xinv : t.Xinv;
        const Y = basket === "right" ? C.W - t.Yinv : t.Yinv;
        const acierto = t.resultado === "acierto";
        datos.append(s("circle", {
          cx: (X + M).toFixed(3), cy: (Y + M).toFixed(3), r: 0.22,
          class: "c-tiro " + (acierto ? "acierto" : "fallo") + (t.tl ? " tl" : ""),
        }));
      }
    },
  };
}

/** Puntos (2/3) según coordenadas plegadas. */
export function puntosDeTiro(xinv, yinv) {
  const esquina = (yinv <= C.ESQ || yinv >= C.W - C.ESQ) && xinv <= CORNER_X;
  return esquina || Math.hypot(xinv - C.HX, yinv - C.HY) >= C.R3 ? 3 : 2;
}
