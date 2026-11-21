// Media pista FIBA interactiva. Coordenadas canónicas plegadas: Xinv 0..14 (aro en 1,575),
// Yinv 0..15. En pantalla el aro queda arriba y el eje horizontal es Y.
import { h, s } from "./util.js";

export const C = { L: 14, W: 15, HX: 1.575, HY: 7.5, R3: 6.75, ESQ: 0.9, KW: 4.9, KD: 5.8, FT: 1.8, RA: 1.25 };
export const M = 0.9;
export const VB = { w: C.W + 2 * M, h: C.L + 2 * M };
const KY0 = C.W / 2 - C.KW / 2, KY1 = C.W / 2 + C.KW / 2;
export const CORNER_X = C.HX + Math.sqrt(C.R3 ** 2 - (C.ESQ - C.HY) ** 2);
export const posView = (x, y) => [y + M, x + M];

const P = (x, y) => `${(y + M).toFixed(3)},${(x + M).toFixed(3)}`;
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
  const fuera = `M${P(0, 0)}L${P(C.L, 0)}L${P(C.L, C.W)}L${P(0, C.W)}Z`;
  const dos = [[0, C.ESQ], [CORNER_X, C.ESQ], ...ARCO3, [CORNER_X, C.W - C.ESQ], [0, C.W - C.ESQ]];
  return s("svg", { class: "cancha-base", viewBox: `0 0 ${VB.w} ${VB.h}`, "aria-hidden": "true", preserveAspectRatio: "xMidYMid meet" },
    s("rect", { class: "c-suelo", x: 0, y: 0, width: VB.w, height: VB.h }),
    s("path", { class: "c-pista", d: fuera }),
    s("path", { class: "c-triple", d: fuera + linea(dos) + "Z", "fill-rule": "evenodd" }),
    s("path", { class: "c-pintura", d: `M${P(0, KY0)}L${P(C.KD, KY0)}L${P(C.KD, KY1)}L${P(0, KY1)}Z` }));
}

function capaLinas() {
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
  g.append(s("circle", { class: "c-aro", cx: C.HY + M, cy: C.HX + M, r: 0.225 }));
  return g;
}

/** Pista con capa de tiros y marcador. `onTiro({x,y})` recibe coordenadas plegadas. */
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
    return { x: Math.max(0, Math.min(C.L, py - M)), y: Math.max(0, Math.min(C.W, px - M)) };
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
    marcar(x, y, { color = "", etiqueta = "" } = {}) {
      marca.replaceChildren(
        s("circle", { cx: (y + M).toFixed(3), cy: (x + M).toFixed(3), r: 0.42, class: "c-marca-punto", fill: color || "var(--acento)" }),
        etiqueta ? s("text", { x: (y + M).toFixed(3), y: ((x + M) - 0.62).toFixed(3), class: "c-marca-txt", "text-anchor": "middle" }, etiqueta) : null);
      marca.removeAttribute("hidden");
    },
    limpiarMarca() { marca.replaceChildren(); marca.setAttribute("hidden", ""); },
    pintarTiros(tiros, { soloCuarto = null } = {}) {
      datos.replaceChildren();
      for (const t of tiros || []) {
        if (t.Xinv == null || t.Yinv == null) continue;
        if (soloCuarto != null && t.cuarto !== soloCuarto) continue;
        const acierto = t.resultado === "acierto";
        datos.append(s("circle", {
          cx: (t.Yinv + M).toFixed(3), cy: (t.Xinv + M).toFixed(3), r: 0.22,
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
