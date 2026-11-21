// Render de solo lectura de una jugada del Playbook importado (fichas, trazos, pasos).
import { h, s } from "./util.js";
import { C, M } from "./court.js";
import { estadoEn, normalizar, muestras, bezier, dist, MUEVEN } from "./jugada-modelo.js";

const COL = { suelo: "#fbf9f4", linea: "#7b7364", pintura: "#efe7d4", of: "#2a5fd0", df: "#c2332b", balon: "#f4571d", trazo: "#23232a", texto: "#23232a" };
const KY0 = C.W / 2 - C.KW / 2, KY1 = C.W / 2 + C.KW / 2;
let seq = 0;

const pv = (p) => [p[1] + M, p[0] + M];
const r3 = (n) => Math.round(n * 1000) / 1000;
const ruta = (pts) => "M" + pts.map((p) => pv(p).map(r3).join(",")).join("L");
function arco(cx, cy, r, a0, a1, n = 40) { const o = []; for (let i = 0; i <= n; i++) { const a = a0 + ((a1 - a0) * i) / n; o.push([cx + r * Math.cos(a), cy + r * Math.sin(a)]); } return o; }
const CORNER_X = C.HX + Math.sqrt(C.R3 ** 2 - (C.ESQ - C.HY) ** 2);

function lineasMedia(mirror) {
  const f = (pts) => (mirror ? pts.map(([x, y]) => [2 * C.L - x, y]) : pts);
  const a0 = Math.atan2(C.ESQ - C.HY, CORNER_X - C.HX), a1 = Math.atan2(C.W - C.ESQ - C.HY, CORNER_X - C.HX);
  return {
    pintura: f([[0, KY0], [C.KD, KY0], [C.KD, KY1], [0, KY1]]),
    lineas: [
      f([[0, KY0], [C.KD, KY0], [C.KD, KY1], [0, KY1]]),
      f(arco(C.KD, C.W / 2, C.FT, -Math.PI / 2, Math.PI / 2)),
      f([[0, C.ESQ], [CORNER_X, C.ESQ]]), f([[0, C.W - C.ESQ], [CORNER_X, C.W - C.ESQ]]),
      f(arco(C.HX, C.HY, C.R3, a0, a1, 90)),
      f([[0, C.HY - C.RA], ...arco(C.HX, C.HY, C.RA, -Math.PI / 2, Math.PI / 2, 24), [0, C.HY + C.RA]]),
      f(arco(C.L, C.W / 2, C.FT, Math.PI / 2, (3 * Math.PI) / 2)),
      f([[1.2, C.HY - 0.9], [1.2, C.HY + 0.9]]),
    ],
    punteada: f(arco(C.KD, C.W / 2, C.FT, Math.PI / 2, (3 * Math.PI) / 2)),
    aro: f([[C.HX, C.HY]])[0],
  };
}

export function pistaGrupo(completa) {
  const alto = (completa ? 2 * C.L : C.L) + 2 * M, ancho = C.W + 2 * M;
  const g = s("g", { class: "pz-pista" });
  g.append(s("rect", { x: 0, y: 0, width: ancho, height: alto, fill: COL.suelo }));
  g.append(s("rect", { x: M, y: M, width: C.W, height: alto - 2 * M, fill: "none", stroke: COL.linea, "stroke-width": 0.1 }));
  for (const mirror of completa ? [false, true] : [false]) {
    const l = lineasMedia(mirror);
    g.append(s("path", { d: ruta(l.pintura) + "Z", fill: COL.pintura, stroke: "none" }));
    for (const p of l.lineas) g.append(s("path", { d: ruta(p), fill: "none", stroke: COL.linea, "stroke-width": 0.07, "stroke-linejoin": "round" }));
    g.append(s("path", { d: ruta(l.punteada), fill: "none", stroke: COL.linea, "stroke-width": 0.07, "stroke-dasharray": "0.3 0.25" }));
    const [cx, cy] = pv(l.aro); g.append(s("circle", { cx, cy, r: 0.225, fill: "none", stroke: COL.balon, "stroke-width": 0.09 }));
  }
  if (completa) g.append(s("path", { d: ruta([[C.L, 0], [C.L, C.W]]), fill: "none", stroke: COL.linea, "stroke-width": 0.07 }));
  return { g, vb: [ancho, alto] };
}

function zigzag(t) {
  const m = muestras(t, 44), out = [];
  for (let i = 0; i < m.length; i++) {
    const a = m[Math.max(0, i - 1)], b = m[Math.min(m.length - 1, i + 1)];
    let dx = b[0] - a[0], dy = b[1] - a[1]; const n = Math.hypot(dx, dy) || 1;
    const k = i === 0 || i === m.length - 1 ? 0 : (i % 2 ? 1 : -1) * 0.17;
    out.push([m[i][0] - (dy / n) * k, m[i][1] + (dx / n) * k]);
  }
  return out;
}
function acortado(t, r = 0.78) {
  const hacia = dist(t.c, t.p1) > 0.01 ? t.c : t.p0, d = dist(hacia, t.p1);
  if (d < 1.4 || dist(t.p0, t.p1) < 1.4) return t;
  const k = r / d;
  return { ...t, p1: [t.p1[0] + (hacia[0] - t.p1[0]) * k, t.p1[1] + (hacia[1] - t.p1[1]) * k] };
}
function trazo(t, ids) {
  const g = s("g", { class: "pz-trazo" });
  if (t.tipo === "zona") {
    const a = pv(t.p0), b = pv(t.p1);
    g.append(s("ellipse", { cx: (a[0] + b[0]) / 2, cy: (a[1] + b[1]) / 2, rx: Math.max(0.3, Math.abs(a[0] - b[0]) / 2), ry: Math.max(0.3, Math.abs(a[1] - b[1]) / 2), fill: "rgba(244,163,29,.2)", stroke: "#f4a31d", "stroke-width": 0.1, "stroke-dasharray": "0.35 0.25" }));
    if (t.texto) g.append(s("text", { x: (a[0] + b[0]) / 2, y: (a[1] + b[1]) / 2, "text-anchor": "middle", "dominant-baseline": "middle", "font-size": 0.7, fill: COL.texto, "font-family": "system-ui,sans-serif" }, t.texto));
    return g;
  }
  if (t.tipo === "texto") {
    const [x, y] = pv(t.p0);
    g.append(s("text", { x, y, "font-size": 0.8, "font-weight": 600, fill: COL.texto, stroke: COL.suelo, "stroke-width": 0.18, "paint-order": "stroke", "font-family": "system-ui,sans-serif" }, t.texto || "Texto"));
    return g;
  }
  const a = acortado(t);
  const q = `M${pv(a.p0).map(r3)}Q${pv(a.c).map(r3)} ${pv(a.p1).map(r3)}`;
  const base = { fill: "none", stroke: COL.trazo, "stroke-linecap": "round", "stroke-linejoin": "round" };
  if (t.tipo === "corte") g.append(s("path", { ...base, d: q, "stroke-width": 0.13, "marker-end": `url(#${ids.flecha})` }));
  else if (t.tipo === "bote") g.append(s("path", { ...base, d: ruta(zigzag(t)), "stroke-width": 0.1, "marker-end": `url(#${ids.flecha})` }));
  else if (t.tipo === "pase") g.append(s("path", { ...base, d: q, "stroke-width": 0.12, "stroke-dasharray": "0.4 0.3", "marker-end": `url(#${ids.flecha})` }));
  else if (t.tipo === "entrega") g.append(s("path", { ...base, d: q, "stroke-width": 0.14, "stroke-dasharray": "0.02 0.3", "marker-end": `url(#${ids.flecha})` }));
  else if (t.tipo === "tiro") g.append(s("path", { ...base, stroke: COL.balon, d: q, "stroke-width": 0.14, "stroke-dasharray": "0.15 0.25", "marker-end": `url(#${ids.flechaBalon})` }));
  else if (t.tipo === "bloqueo") {
    g.append(s("path", { ...base, d: q, "stroke-width": 0.13 }));
    const b = bezier(t.p0, t.c, t.p1, 0.96), e = t.p1;
    let dx = e[0] - b[0], dy = e[1] - b[1]; const n = Math.hypot(dx, dy) || 1; dx /= n; dy /= n;
    g.append(s("path", { ...base, d: ruta([[e[0] + dy * 0.75, e[1] - dx * 0.75], [e[0] - dy * 0.75, e[1] + dx * 0.75]]), "stroke-width": 0.16 }));
  }
  return g;
}
function ficha(f, nombre) {
  const [x, y] = pv([f.x, f.y]);
  const of = f.tipo === "of", col = of ? COL.of : COL.df;
  const g = s("g", { transform: `translate(${r3(x)},${r3(y)})` });
  g.append(s("circle", { r: 0.68, fill: of ? col : "#fff", stroke: col, "stroke-width": 0.14 }));
  g.append(s("text", { "text-anchor": "middle", "dominant-baseline": "central", "font-size": f.etiqueta.length > 1 ? 0.56 : 0.78, "font-weight": 700, fill: of ? "#fff" : col, "font-family": "system-ui,sans-serif" }, f.etiqueta));
  if (nombre) g.append(s("text", { y: 1.25, "text-anchor": "middle", "font-size": 0.5, fill: COL.texto, stroke: COL.suelo, "stroke-width": 0.14, "paint-order": "stroke", "font-family": "system-ui,sans-serif" }, nombre));
  return g;
}

/** SVG de un estado de la jugada. `k` paso, `u` 0..1 transición. */
export function svgJugada(datos, { k = 0, u = 1, mini = false } = {}) {
  const d = normalizar(datos);
  const completa = d.pista === "completa";
  const { g: pista, vb } = pistaGrupo(completa);
  const id = `pz${++seq}`;
  const defs = s("defs", null,
    s("marker", { id: `${id}flecha`, viewBox: "0 0 10 10", refX: 7, refY: 5, markerWidth: 3.6, markerHeight: 3.6, orient: "auto" }, s("path", { d: "M0,0L10,5L0,10z", fill: COL.trazo })),
    s("marker", { id: `${id}flechaBalon`, viewBox: "0 0 10 10", refX: 7, refY: 5, markerWidth: 3.6, markerHeight: 3.6, orient: "auto" }, s("path", { d: "M0,0L10,5L0,10z", fill: COL.balon })));
  const svg = s("svg", { class: "pz-svg" + (mini ? " mini" : ""), viewBox: `0 0 ${vb[0]} ${vb[1]}`, role: "img", "aria-label": "Jugada del playbook" }, defs, pista);
  const ids = { flecha: `${id}flecha`, flechaBalon: `${id}flechaBalon` };
  const paso = d.pasos[Math.max(0, Math.min(d.pasos.length - 1, k))];
  if (u >= 1) for (const t of paso.trazos) svg.append(trazo(t, ids));
  const st = estadoEn(d, Math.max(0, Math.min(d.pasos.length - 1, k)), u);
  for (const f of st.fichas) svg.append(ficha(f));
  if (st.balon) {
    const [x, y] = pv([st.balon.x + 0.55, st.balon.y + 0.55]);
    svg.append(s("g", { transform: `translate(${r3(x)},${r3(y)})` },
      s("circle", { r: 0.3, fill: COL.balon, stroke: "#7a2a08", "stroke-width": 0.07 }),
      s("path", { d: "M-.3,0H.3M0,-.3V.3", stroke: "#7a2a08", "stroke-width": 0.045 })));
  }
  return svg;
}

/** Reproductor: SVG + pasos + play. */
export function reproductor(datos, { mini = false, auto = false } = {}) {
  const d = normalizar(datos);
  let k = 0, u = 1, timer = 0, reproduciendo = false;
  const cont = h("div", { class: "pz-lienzo" + (mini ? " mini" : "") });
  const pintar = () => cont.replaceChildren(svgJugada(d, { k, u, mini }));
  const etiqueta = h("span", { class: "pz-paso-txt" });
  const sync = () => {
    etiqueta.textContent = `${k + 1}/${d.pasos.length} · ${d.pasos[k].nombre}`;
    pintar();
  };
  const ir = (n) => { k = Math.max(0, Math.min(d.pasos.length - 1, n)); u = 1; sync(); };
  const animar = () => {
    if (!reproduciendo) return;
    if (k >= d.pasos.length - 1) { reproduciendo = false; sync(); return; }
    const t0 = performance.now();
    const paso = () => {
      const t = Math.min(1, (performance.now() - t0) / 1500);
      u = t; pintar();
      if (t < 1) timer = setTimeout(paso, 33);
      else { k += 1; u = 1; sync(); animar(); }
    };
    timer = setTimeout(paso, 33);
  };
  const boton = (txt, fn, clase = "btn") => {
    const b = document.createElement("button");
    b.type = "button"; b.className = clase; b.textContent = txt; b.onclick = fn;
    return b;
  };
  const barra = mini ? null : h("div", { class: "pz-barra" });
  if (barra) {
    barra.append(
      boton("‹", () => { parar(); ir(k - 1); }, "btn fantasma"), etiqueta,
      boton("›", () => { parar(); ir(k + 1); }, "btn fantasma"),
      boton("▶ Reproducir", () => { if (reproduciendo) { parar(); } else { if (k >= d.pasos.length - 1) ir(0); reproduciendo = true; animar(); } }, "btn primario"),
    );
  }
  const parar = () => { reproduciendo = false; clearTimeout(timer); };
  const el = h("div", { class: "pz" + (mini ? " pz-mini" : "") }, cont, barra);
  sync();
  if (auto) { reproduciendo = true; animar(); }
  return { el, ir, parar, pasos: d.pasos };
}
