// Dispersión SVG (uso vs eficiencia): puntos con tooltip, líneas de referencia y cuadrantes.
import { h, s, tip } from "../util.js";

/** puntos: [{x, y, r, color, titulo, filas:[[k,v]], sel, tenue, etiqueta, onclick}]
 *  refX/refY: valores de las líneas de referencia; cuadrantes: [{x:"izq"|"der", y:"arr"|"aba", texto}] */
export function scatter({ puntos, ejeX, ejeY, refX, refY, cuadrantes = [] }) {
  const W = 720, H = 440, m = { t: 14, r: 16, b: 40, l: 46 };
  if (!puntos.length) return h("div", { class: "vacio", text: "Sin datos" });
  const xs = puntos.map((p) => p.x), ys = puntos.map((p) => p.y);
  const xmax = Math.ceil(Math.max(...xs, refX ?? 0) * 1.08 / 5) * 5, ymax = Math.ceil(Math.max(...ys, refY ?? 0) * 1.08 * 10) / 10;
  const X = (v) => m.l + (v / xmax) * (W - m.l - m.r), Y = (v) => m.t + (1 - v / ymax) * (H - m.t - m.b);
  const svg = s("svg", { class: "linechart scatter", viewBox: `0 0 ${W} ${H}`, role: "img" });
  for (let v = 0; v <= xmax; v += 5) svg.append(s("line", { class: "eje", x1: X(v), x2: X(v), y1: m.t, y2: H - m.b, "stroke-dasharray": v ? "2 4" : "" }), s("text", { x: X(v), y: H - m.b + 15, "text-anchor": "middle" }, String(v)));
  for (let v = 0; v <= ymax + 1e-9; v += 0.2) svg.append(s("line", { class: "eje", x1: m.l, x2: W - m.r, y1: Y(v), y2: Y(v), "stroke-dasharray": v ? "2 4" : "" }), s("text", { x: m.l - 6, y: Y(v) + 4, "text-anchor": "end" }, v.toFixed(1)));
  const ref = { style: { stroke: "var(--suave)" }, "stroke-width": 1.4, "stroke-dasharray": "6 4" };
  if (refX != null) svg.append(s("line", { x1: X(refX), x2: X(refX), y1: m.t, y2: H - m.b, ...ref }));
  if (refY != null) svg.append(s("line", { x1: m.l, x2: W - m.r, y1: Y(refY), y2: Y(refY), ...ref }));
  for (const c of cuadrantes) svg.append(s("text", { class: "cuadrante", x: c.x === "izq" ? m.l + 8 : W - m.r - 8, y: c.y === "arr" ? m.t + 16 : H - m.b - 8, "text-anchor": c.x === "izq" ? "start" : "end" }, c.texto));
  svg.append(s("text", { class: "eje-t", x: (m.l + W - m.r) / 2, y: H - 4, "text-anchor": "middle" }, ejeX), s("text", { class: "eje-t", transform: `translate(12 ${(m.t + H - m.b) / 2}) rotate(-90)`, "text-anchor": "middle" }, ejeY));
  // los puntos tenues van debajo y el seleccionado encima
  const orden = puntos.slice().sort((a, b) => (b.tenue ? 1 : 0) - (a.tenue ? 1 : 0) || (a.sel ? 1 : 0) - (b.sel ? 1 : 0));
  for (const p of orden) {
    const c = s("circle", { cx: X(p.x), cy: Y(p.y), r: p.r, style: { fill: p.color, "fill-opacity": p.tenue ? 0.22 : 0.78, stroke: p.sel ? "var(--texto)" : "var(--panel)", "stroke-width": p.sel ? 2.4 : 1, cursor: p.onclick ? "pointer" : "default" } });
    const ver = (ev) => tip.show(h("div", null, h("b", { text: p.titulo }), p.filas.map(([k, v]) => h("div", { class: "fila" }, h("span", { class: "m", text: k }), h("span", { text: v })))), ev);
    c.addEventListener("pointerenter", (ev) => { if (ev.pointerType === "mouse") ver(ev); });
    c.addEventListener("pointermove", (ev) => { if (ev.pointerType === "mouse") tip.move(ev); });
    c.addEventListener("pointerleave", (ev) => { if (ev.pointerType === "mouse") tip.hide(); });
    c.addEventListener("click", (ev) => { if (ev.pointerType !== "mouse" && matchMedia("(hover: none)").matches) { ver(ev); return; } p.onclick?.(); });
    svg.append(c);
    if (p.etiqueta) {
      const izq = X(p.x) > W * 0.88; // cerca del borde derecho la etiqueta se pone a la izquierda del punto
      svg.append(s("text", { class: "punto-et", x: X(p.x) + (izq ? -p.r - 3 : p.r + 3), y: Y(p.y) + 3, "text-anchor": izq ? "end" : "start" }, p.etiqueta));
    }
  }
  svg.__exp = { svg, csv: { cab: ["Punto", ejeX || "X", ejeY || "Y"], filas: puntos.map((p) => [p.etiqueta || p.titulo, p.x, p.y]) } };
  return svg;
}
