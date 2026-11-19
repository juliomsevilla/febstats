// Gráficos reales para el asistente de IA. La IA no dibuja: pide un gráfico con una herramienta y la app lo pinta aquí
// con los datos. El gráfico viaja dentro del mensaje como un bloque ```feb-grafico {json} ```.
import { h, s, fpct } from "./util.js";
import { crearCancha, lineasZonas, ZONAS, ZONA_IDS, posView } from "./court.js";
import { estadisticasZonas, pintarZonas } from "./heat.js";
import { S } from "./state.js";

const COLORES = ["#f4571d", "#3a7ca5", "#2a9d8f", "#7c5cff", "#e69b00", "#d71a21"];
const num = (v) => (typeof v === "number" && Number.isFinite(v) ? v : null);

function mapaTiros(sp) {
  const tiros = (sp.tiros || []).map(([x, y, m]) => ({ Xinv: x, Yinv: y, resultado: m ? "acierto" : "fallo" }));
  const n = tiros.length, ac = tiros.filter((t) => t.resultado === "acierto").length;
  const st = estadisticasZonas(tiros);
  const pts = Object.entries(st).reduce((a, [, z]) => a + z.pts, 0);
  const centro = S.idx?.ppaLiga ?? 1.0;
  const puntos = () => {
    const c = crearCancha({ res: 0.1 });
    for (const t of tiros) {
      const [vx, vy] = posView(t.Xinv, t.Yinv);
      if (t.resultado === "acierto") c.datos.append(s("circle", { cx: vx, cy: vy, r: 0.2, fill: "#1a9d57", "fill-opacity": 0.85, stroke: "#fff", "stroke-width": 0.04 }));
      else c.datos.append(s("path", { d: `M${vx - 0.15},${vy - 0.15}L${vx + 0.15},${vy + 0.15}M${vx + 0.15},${vy - 0.15}L${vx - 0.15},${vy + 0.15}`, stroke: "#c0392b", "stroke-width": 0.08, "stroke-linecap": "round", fill: "none" }));
    }
    return c.el;
  };
  const zonas = () => {
    const c = crearCancha({ res: 0.1 });
    pintarZonas(c.canvas, st, { centro, invertido: false });
    c.datos.append(lineasZonas());
    for (const id of ZONA_IDS) {
      const z = st[id], [py, px] = ZONAS[id].pos, [vx, vy] = posView(px, py), esq = id.startsWith("corner");
      c.datos.append(s("text", { class: "z-pct", x: vx, y: vy + (esq ? 0.15 : 0), style: esq ? { fontSize: ".42px" } : null }, z.n ? `${Math.round((z.ac / z.n) * 100)}%` : "—"));
      if (!esq && z.n) c.datos.append(s("text", { class: "z-n", x: vx, y: vy + 0.6 }, `${z.ac}/${z.n}`));
    }
    return c.el;
  };
  const modo = sp.modo || "ambos";
  const mapas = h("div", { class: "graf-mapas" },
    modo !== "zonas" ? h("figure", null, puntos(), h("figcaption", { text: "Cada tiro (● acierto · ✕ fallo)" })) : null,
    modo !== "puntos" ? h("figure", null, zonas(), h("figcaption", { text: "% de acierto por zona (aciertos/tiros)" })) : null);
  return h("div", { class: "graf" }, h("div", { class: "graf-t", text: sp.titulo || "Mapa de tiros" }),
    sp.subtitulo ? h("div", { class: "graf-s", text: sp.subtitulo }) : null,
    h("div", { class: "graf-s", text: `${n} tiros · ${ac} aciertos (${fpct(n ? (ac / n) * 100 : 0)}) · ${(n ? pts / n : 0).toFixed(2).replace(".", ",")} pts/tiro` }), mapas);
}

function barras(sp) {
  const items = (sp.items || []).map((i) => ({ e: String(i.etiqueta ?? ""), v: num(i.valor) })).filter((i) => i.v != null).slice(0, 30);
  const max = Math.max(...items.map((i) => Math.abs(i.v)), 0.0001);
  const fmt = (v) => `${(Math.round(v * 10) / 10).toString().replace(".", ",")}${sp.unidad ? " " + sp.unidad : ""}`;
  return h("div", { class: "graf" }, h("div", { class: "graf-t", text: sp.titulo || "" }), sp.subtitulo ? h("div", { class: "graf-s", text: sp.subtitulo }) : null,
    h("div", { class: "graf-barras" }, items.map((i, k) => h("div", { class: "graf-fila" }, h("span", { class: "graf-e", text: i.e }),
      h("span", { class: "graf-b" }, h("span", { style: `width:${Math.max(2, (Math.abs(i.v) / max) * 100)}%;background:${COLORES[k % COLORES.length]}` })), h("span", { class: "graf-v", text: fmt(i.v) })))));
}

function lineas(sp) {
  const et = (sp.etiquetas || []).map(String); const series = (sp.series || []).slice(0, 6).map((x) => ({ n: String(x.nombre ?? ""), v: (x.valores || []).map(num) }));
  const todos = series.flatMap((x) => x.v).filter((v) => v != null); if (!todos.length) return h("div", { class: "graf", text: "Gráfico sin datos." });
  let [mn, mx] = [Math.min(...todos), Math.max(...todos)]; if (mn === mx) { mn -= 1; mx += 1; } const pad = (mx - mn) * 0.08; mn -= pad; mx += pad;
  const [W, H, L, B, T, R] = [420, 220, 40, 28, 12, 12]; const n = Math.max(et.length, ...series.map((x) => x.v.length), 2);
  const X = (i) => L + (i * (W - L - R)) / (n - 1), Y = (v) => T + ((mx - v) * (H - T - B)) / (mx - mn);
  const svg = s("svg", { viewBox: `0 0 ${W} ${H}`, class: "graf-svg", role: "img" });
  for (let k = 0; k <= 4; k++) { const v = mn + ((mx - mn) * k) / 4, y = Y(v); svg.append(s("line", { x1: L, x2: W - R, y1: y, y2: y, class: "graf-rej" }), s("text", { x: L - 6, y: y + 4, class: "graf-eje", "text-anchor": "end" }, String(Math.round(v * 10) / 10))); }
  et.forEach((e, i) => { if (n <= 10 || i % Math.ceil(n / 8) === 0) svg.append(s("text", { x: X(i), y: H - 8, class: "graf-eje", "text-anchor": "middle" }, e.slice(0, 8))); });
  series.forEach((x, k) => {
    const pts = x.v.map((v, i) => (v == null ? null : [X(i), Y(v)])).filter(Boolean); const col = COLORES[k % COLORES.length];
    svg.append(s("polyline", { points: pts.map((p) => p.join(",")).join(" "), fill: "none", stroke: col, "stroke-width": 2.2, "stroke-linejoin": "round" }), ...pts.map((p) => s("circle", { cx: p[0], cy: p[1], r: 3, fill: col })));
  });
  return h("div", { class: "graf" }, h("div", { class: "graf-t", text: sp.titulo || "" }), sp.subtitulo ? h("div", { class: "graf-s", text: sp.subtitulo }) : null, svg,
    h("div", { class: "graf-leyenda" }, series.map((x, k) => h("span", null, h("i", { style: `background:${COLORES[k % COLORES.length]}` }), x.n))));
}

function dispersion(sp) {
  const pts = (sp.puntos || []).map((p) => ({ e: String(p.etiqueta ?? ""), x: num(p.x), y: num(p.y) })).filter((p) => p.x != null && p.y != null).slice(0, 40);
  if (!pts.length) return h("div", { class: "graf", text: "Gráfico sin datos." });
  const rango = (vs) => { let [a, b] = [Math.min(...vs), Math.max(...vs)]; if (a === b) { a -= 1; b += 1; } const p = (b - a) * 0.1; return [a - p, b + p]; };
  const [x0, x1] = rango(pts.map((p) => p.x)), [y0, y1] = rango(pts.map((p) => p.y));
  const [W, H, L, B, T, R] = [440, 300, 44, 34, 12, 14];
  const X = (v) => L + ((v - x0) * (W - L - R)) / (x1 - x0), Y = (v) => T + ((y1 - v) * (H - T - B)) / (y1 - y0);
  const svg = s("svg", { viewBox: `0 0 ${W} ${H}`, class: "graf-svg", role: "img" });
  for (let k = 0; k <= 4; k++) {
    const vy = y0 + ((y1 - y0) * k) / 4, vx = x0 + ((x1 - x0) * k) / 4;
    svg.append(s("line", { x1: L, x2: W - R, y1: Y(vy), y2: Y(vy), class: "graf-rej" }), s("text", { x: L - 6, y: Y(vy) + 4, class: "graf-eje", "text-anchor": "end" }, String(Math.round(vy * 10) / 10)),
      s("text", { x: X(vx), y: H - 16, class: "graf-eje", "text-anchor": "middle" }, String(Math.round(vx * 10) / 10)));
  }
  pts.forEach((p, k) => svg.append(s("circle", { cx: X(p.x), cy: Y(p.y), r: 5, fill: COLORES[k % COLORES.length], "fill-opacity": 0.85 }), s("text", { x: X(p.x) + 7, y: Y(p.y) + 3, class: "graf-eje" }, p.e.slice(0, 16))));
  svg.append(s("text", { x: (L + W - R) / 2, y: H - 2, class: "graf-eje", "text-anchor": "middle" }, sp.eje_x || ""), s("text", { x: 10, y: T + 8, class: "graf-eje" }, sp.eje_y || ""));
  return h("div", { class: "graf" }, h("div", { class: "graf-t", text: sp.titulo || "" }), svg);
}

export function renderGrafico(sp) {
  try { return sp.tipo === "mapa_tiros" ? mapaTiros(sp) : sp.tipo === "barras" ? barras(sp) : sp.tipo === "lineas" ? lineas(sp) : sp.tipo === "dispersion" ? dispersion(sp) : h("div", { class: "graf", text: "Gráfico no reconocido." }); }
  catch { return h("div", { class: "graf", text: "No se pudo dibujar el gráfico." }); }
}
/** Sustituye los marcadores `.ia-graf` de un mensaje por su gráfico real. */
export function hidratar(raiz) {
  for (const el of raiz.querySelectorAll(".ia-graf")) { try { el.replaceChildren(renderGrafico(JSON.parse(el.dataset.spec))); } catch { el.textContent = "(gráfico no válido)"; } }
}
