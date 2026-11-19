// Gráfico de líneas SVG con guía vertical y tooltip HTML.
import { h, s, f1, tip, clamp } from "../util.js";

/** series: [{label, color, valores:[n|null]}]; etiquetas: texto por punto (eje X / tooltip). */
export function lineChart({ series, etiquetas, formato = f1 }) {
  const W = 720, H = 240, m = { t: 14, r: 14, b: 26, l: 38 };
  const vals = series.flatMap((x) => x.valores).filter((v) => v != null);
  if (!vals.length) return h("div", { class: "vacio", text: "Sin datos" });
  let lo = Math.min(0, ...vals), hi = Math.max(...vals);
  if (hi === lo) hi = lo + 1;
  const paso = niceStep((hi - lo) / 4);
  lo = Math.floor(lo / paso) * paso; hi = Math.ceil(hi / paso) * paso;
  const n = etiquetas.length;
  const X = (i) => m.l + (n <= 1 ? (W - m.l - m.r) / 2 : (i * (W - m.l - m.r)) / (n - 1));
  const Y = (v) => m.t + (1 - (v - lo) / (hi - lo)) * (H - m.t - m.b);

  const svg = s("svg", { class: "linechart", viewBox: `0 0 ${W} ${H}`, role: "img" });
  for (let v = lo; v <= hi + 1e-9; v += paso) {
    svg.append(s("line", { class: "eje", x1: m.l, x2: W - m.r, y1: Y(v), y2: Y(v), "stroke-dasharray": v === 0 ? "" : "2 4" }), s("text", { x: m.l - 6, y: Y(v) + 4, "text-anchor": "end" }, String(Math.round(v * 10) / 10)));
  }
  const paso_x = Math.max(1, Math.ceil(n / 10));
  etiquetas.forEach((e, i) => { if (i % paso_x === 0) svg.append(s("text", { x: X(i), y: H - 8, "text-anchor": "middle" }, String(i + 1))); });
  for (const sr of series) {
    let d = "", pen = false;
    sr.valores.forEach((v, i) => { if (v == null) { pen = false; return; } d += `${pen ? "L" : "M"}${X(i)},${Y(v)}`; pen = true; });
    svg.append(s("path", { class: "serie", d, stroke: sr.color }));
    sr.valores.forEach((v, i) => { if (v != null) svg.append(s("circle", { cx: X(i), cy: Y(v), r: 3.2, fill: sr.color })); });
  }
  const guia = s("line", { class: "eje", y1: m.t, y2: H - m.b, visibility: "hidden", style: { stroke: "var(--suave)" } });
  svg.append(guia);
  const ver = (ev) => {
    const r = svg.getBoundingClientRect(), px = ((ev.clientX - r.left) / r.width) * W;
    const i = n <= 1 ? 0 : clamp(Math.round(((px - m.l) / (W - m.l - m.r)) * (n - 1)), 0, n - 1);
    guia.setAttribute("x1", X(i)); guia.setAttribute("x2", X(i)); guia.setAttribute("visibility", "visible");
    tip.show(h("div", null, h("b", { text: `J${i + 1} · ${etiquetas[i]}` }), series.map((sr) =>
      h("div", { class: "fila" }, h("span", { class: "m", text: sr.label }), h("span", { text: sr.valores[i] == null ? "—" : formato(sr.valores[i]) })))), ev);
  };
  svg.addEventListener("pointermove", ver);
  svg.addEventListener("click", ver);
  svg.style.touchAction = "pan-y";
  svg.addEventListener("pointerleave", (ev) => { if (ev.pointerType === "mouse") { tip.hide(); guia.setAttribute("visibility", "hidden"); } });
  return h("div", null, svg, h("div", { class: "leyenda-serie" }, series.map((x) => h("span", null, h("i", { style: { background: x.color } }), x.label))));
}
function niceStep(raw) {
  const p = Math.pow(10, Math.floor(Math.log10(raw || 1))), f = raw / p;
  return (f <= 1 ? 1 : f <= 2 ? 2 : f <= 5 ? 5 : 10) * p;
}
