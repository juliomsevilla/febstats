// Pizarra del Playbook: pista FIBA (media o completa) en SVG, fichas arrastrables, trazos (corte, bote, pase, entrega, bloqueo, tiro, zona, texto),
// pasos con reproducción animada, deshacer/rehacer y exportación a PNG. El modelo y los cálculos puros están en jugada-modelo.js.
// Todo se dibuja con atributos explícitos (sin variables CSS) para que la misma imagen sirva en pantalla, en miniaturas, en PNG y al imprimir.
import { s } from "./util.js";
import { C, M } from "./court.js";
import { ARO, L, ANCHO, MUEVEN, TIPOS_TRAZO, estadoEn, normalizar, nuevoPaso, borrarPaso, espejo, conPista, etiquetaLibre, uid, bezier, muestras, dist } from "./jugada-modelo.js";

const COL = { suelo: "#fbf9f4", linea: "#7b7364", pintura: "#efe7d4", of: "#2a5fd0", df: "#c2332b", balon: "#f4571d", trazo: "#23232a", sel: "#f4a31d", zona: "#f4a31d", texto: "#23232a" };
const NS = "http://www.w3.org/2000/svg";
const KY0 = C.W / 2 - C.KW / 2, KY1 = C.W / 2 + C.KW / 2;
const CORNER_X = C.HX + Math.sqrt(C.R3 ** 2 - (C.ESQ - C.HY) ** 2);
let _id = 0;

const pv = (p) => [p[1] + M, p[0] + M];                       // metros de pista [x, y] → coordenadas del SVG [horizontal, vertical]
const num = (n) => Math.round(n * 1000) / 1000;
const ruta = (pts) => "M" + pts.map((p) => pv(p).map(num).join(",")).join("L");
function arco(cx, cy, r, a0, a1, n = 40) { const o = []; for (let i = 0; i <= n; i++) { const a = a0 + ((a1 - a0) * i) / n; o.push([cx + r * Math.cos(a), cy + r * Math.sin(a)]); } return o; }

/** Líneas de una media pista (extremo del aro arriba); `mirror` la dibuja en el extremo opuesto de una pista completa. */
function lineasMedia(mirror) {
  const f = (pts) => (mirror ? pts.map(([x, y]) => [2 * L.media - x, y]) : pts);
  const a0 = Math.atan2(C.ESQ - C.HY, CORNER_X - C.HX), a1 = Math.atan2(C.W - C.ESQ - C.HY, CORNER_X - C.HX);
  return {
    pintura: f([[0, KY0], [C.KD, KY0], [C.KD, KY1], [0, KY1]]),
    lineas: [
      f([[0, KY0], [C.KD, KY0], [C.KD, KY1], [0, KY1]]),
      f(arco(C.KD, C.W / 2, C.FT, -Math.PI / 2, Math.PI / 2)),
      f([[0, C.ESQ], [CORNER_X, C.ESQ]]), f([[0, C.W - C.ESQ], [CORNER_X, C.W - C.ESQ]]), f(arco(C.HX, C.HY, C.R3, a0, a1, 90)),
      f([[1.2, C.HY - C.RA], ...arco(C.HX, C.HY, C.RA, -Math.PI / 2, Math.PI / 2, 24), [1.2, C.HY + C.RA]]),
      f(arco(C.L, C.W / 2, C.FT, Math.PI / 2, (3 * Math.PI) / 2)),
      f([[1.2, C.HY - 0.9], [1.2, C.HY + 0.9]]),
    ],
    punteada: f(arco(C.KD, C.W / 2, C.FT, Math.PI / 2, (3 * Math.PI) / 2)),
    aro: f([[C.HX, C.HY]])[0],
  };
}

/** Pista como grupo SVG (sin interacción). Devuelve {g, vb:[ancho, alto]}. */
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
  if (completa) {
    g.append(s("path", { d: ruta([[C.L, 0], [C.L, C.W]]), fill: "none", stroke: COL.linea, "stroke-width": 0.07 }));
    g.append(s("path", { d: ruta(arco(C.L, C.W / 2, C.FT, 0, 2 * Math.PI, 48)), fill: "none", stroke: COL.linea, "stroke-width": 0.07 })); // círculo central r = 1,80 m
  }
  // líneas de saque (art. 2.5.6): 0,15 m, fuera de pista, a 8,325 m de cada línea de fondo
  for (const x of completa ? [8.325, 2 * C.L - 8.325] : [8.325]) for (const [y0, y1] of [[-0.15, 0], [C.W, C.W + 0.15]]) {
    g.append(s("path", { d: ruta([[x, y0], [x, y1]]), fill: "none", stroke: COL.linea, "stroke-width": 0.07 }));
  }
  return { g, vb: [ancho, alto] };
}

// ---------- dibujo de un paso ----------
function marcador(defs, id, color) {
  defs.append(s("marker", { id, viewBox: "0 0 10 10", refX: 7, refY: 5, markerWidth: 3.6, markerHeight: 3.6, orient: "auto" }, s("path", { d: "M0,0L10,5L0,10z", fill: color })));
}
function zigzag(t) {
  const m = muestras(t, 44), out = [];
  for (let i = 0; i < m.length; i++) {
    const a = m[Math.max(0, i - 1)], b = m[Math.min(m.length - 1, i + 1)]; let dx = b[0] - a[0], dy = b[1] - a[1]; const n = Math.hypot(dx, dy) || 1;
    const k = i === 0 || i === m.length - 1 ? 0 : (i % 2 ? 1 : -1) * 0.17; out.push([m[i][0] - (dy / n) * k, m[i][1] + (dx / n) * k]);
  }
  return out;
}
/** Elementos SVG de un trazo. `ids`: ids de los marcadores de flecha. */
/** El extremo de un trazo se queda justo en el borde de la ficha a la que llega, para que se vea la flecha (no queda tapada por la ficha). */
function acortado(t, r = 0.78) {
  const hacia = dist(t.c, t.p1) > 0.01 ? t.c : t.p0, d = dist(hacia, t.p1);
  if (d < 1.4 || dist(t.p0, t.p1) < 1.4) return t;
  const k = r / d; return { ...t, p1: [t.p1[0] + (hacia[0] - t.p1[0]) * k, t.p1[1] + (hacia[1] - t.p1[1]) * k] };
}
function dibujarTrazo(orig, ids, sel) {
  const t = ["zona", "texto"].includes(orig.tipo) ? orig : acortado(orig);
  const g = s("g", { class: "pz-trazo", "data-trazo": orig.id });
  const arrow = `url(#${ids.flecha})`;
  const base = { fill: "none", stroke: sel ? COL.sel : COL.trazo, "stroke-linecap": "round", "stroke-linejoin": "round" };
  const q = `M${pv(t.p0).map(num)}Q${pv(t.c).map(num)} ${pv(t.p1).map(num)}`;
  if (t.tipo === "zona") {
    const a = pv(t.p0), b = pv(t.p1);
    g.append(s("ellipse", { cx: (a[0] + b[0]) / 2, cy: (a[1] + b[1]) / 2, rx: Math.max(0.3, Math.abs(a[0] - b[0]) / 2), ry: Math.max(0.3, Math.abs(a[1] - b[1]) / 2), fill: "rgba(244,163,29,.2)", stroke: sel ? COL.sel : COL.zona, "stroke-width": 0.1, "stroke-dasharray": "0.35 0.25" }));
    if (t.texto) g.append(s("text", { x: (a[0] + b[0]) / 2, y: (a[1] + b[1]) / 2, "text-anchor": "middle", "dominant-baseline": "middle", "font-size": 0.7, fill: COL.texto, "font-family": "system-ui,sans-serif" }, t.texto));
    return g;
  }
  if (t.tipo === "texto") {
    const [x, y] = pv(t.p0);
    g.append(s("text", { x, y, "font-size": 0.8, "font-weight": 600, fill: sel ? COL.sel : COL.texto, stroke: COL.suelo, "stroke-width": 0.18, "paint-order": "stroke", "font-family": "system-ui,sans-serif" }, t.texto || "Texto"));
    return g;
  }
  if (t.tipo === "corte") g.append(s("path", { ...base, d: q, "stroke-width": 0.13, "marker-end": arrow }));
  else if (t.tipo === "bote") g.append(s("path", { ...base, d: ruta(zigzag(t)), "stroke-width": 0.1, "marker-end": arrow }));
  else if (t.tipo === "pase") g.append(s("path", { ...base, d: q, "stroke-width": 0.12, "stroke-dasharray": "0.4 0.3", "marker-end": arrow }));
  else if (t.tipo === "entrega") g.append(s("path", { ...base, d: q, "stroke-width": 0.14, "stroke-dasharray": "0.02 0.3", "marker-end": arrow }));
  else if (t.tipo === "tiro") g.append(s("path", { ...base, stroke: sel ? COL.sel : COL.balon, d: q, "stroke-width": 0.14, "stroke-dasharray": "0.15 0.25", "marker-end": `url(#${ids.flechaBalon})` }));
  else if (t.tipo === "bloqueo") {
    g.append(s("path", { ...base, d: q, "stroke-width": 0.13 }));
    const b = bezier(t.p0, t.c, t.p1, 0.96), e = t.p1; let dx = e[0] - b[0], dy = e[1] - b[1]; const n = Math.hypot(dx, dy) || 1; dx /= n; dy /= n;
    g.append(s("path", { ...base, d: ruta([[e[0] + dy * 0.75, e[1] - dx * 0.75], [e[0] - dy * 0.75, e[1] + dx * 0.75]]), "stroke-width": 0.16 }));
  }
  // zona de toque más ancha para poder seleccionarlo
  if (t.tipo !== "texto") g.append(s("path", { d: q, fill: "none", stroke: "transparent", "stroke-width": 0.9, "data-trazo": orig.id }));
  else g.append(s("circle", { cx: pv(t.p0)[0], cy: pv(t.p0)[1], r: 0.9, fill: "transparent", "data-trazo": orig.id }));
  return g;
}
function dibujarFicha(f, sel, nombreJugador) {
  const [x, y] = pv([f.x, f.y]);
  const g = s("g", { class: "pz-ficha", "data-ficha": f.id, transform: `translate(${num(x)},${num(y)})` });
  const of = f.tipo === "of", col = of ? COL.of : COL.df;
  g.append(s("circle", { r: 0.68, fill: of ? col : "#fff", stroke: sel ? COL.sel : col, "stroke-width": sel ? 0.2 : 0.14 }));
  g.append(s("text", { "text-anchor": "middle", "dominant-baseline": "central", "font-size": f.etiqueta.length > 1 ? 0.56 : 0.78, "font-weight": 700, fill: of ? "#fff" : col, "font-family": "system-ui,sans-serif", "pointer-events": "none" }, f.etiqueta));
  if (nombreJugador) g.append(s("text", { y: 1.25, "text-anchor": "middle", "font-size": 0.5, fill: COL.texto, stroke: COL.suelo, "stroke-width": 0.14, "paint-order": "stroke", "font-family": "system-ui,sans-serif", "pointer-events": "none" }, nombreJugador));
  return g;
}
function dibujarBalon(b) {
  const [x, y] = pv([b.x + 0.55, b.y + 0.55]);
  return s("g", { class: "pz-balon", transform: `translate(${num(x)},${num(y)})` }, s("circle", { r: 0.3, fill: COL.balon, stroke: "#7a2a08", "stroke-width": 0.07 }), s("path", { d: "M-.3,0H.3M0,-.3V.3", stroke: "#7a2a08", "stroke-width": 0.045 }));
}
/** Dibuja un paso (o un instante de la transición) dentro del grupo `g`. */
function dibujarPaso(g, defs, ids, d, k, st, { sel, trazos = true, jugadores = true } = {}) {
  g.replaceChildren();
  const p = d.pasos[k];
  if (trazos) for (const t of p.trazos) g.append(dibujarTrazo(t, ids, sel === t.id));
  const nom = (f) => (jugadores && f.jugador_txt ? f.jugador_txt.split(/[ ,]+/).slice(-1)[0] : "");
  for (const f of st.fichas) g.append(dibujarFicha(f, sel === f.id, nom(f)));
  if (st.balon) g.append(dibujarBalon(st.balon));
  if (sel) { const t = p.trazos.find((x) => x.id === sel); if (t && !["texto"].includes(t.tipo)) { const m = bezier(t.p0, t.c, t.p1, 0.5); const [x, y] = pv(m); g.append(s("circle", { cx: x, cy: y, r: 0.42, fill: COL.sel, stroke: "#fff", "stroke-width": 0.08, "data-asa": t.id, style: { cursor: "grab" } })); } }
}
function crearDefs() {
  const n = ++_id, defs = s("defs"), ids = { flecha: `pz-f${n}`, flechaBalon: `pz-b${n}` };
  marcador(defs, ids.flecha, COL.trazo); marcador(defs, ids.flechaBalon, COL.balon);
  return { defs, ids };
}

/** SVG estático de un paso (miniaturas, impresión y PNG). */
export function svgJugada(datos, k = 0, { ancho = 0, trazos = true, jugadores = true } = {}) {
  const d = normalizar(datos), idx = Math.min(Math.max(0, k), d.pasos.length - 1);
  const { g: pista, vb } = pistaGrupo(d.pista === "completa");
  const { defs, ids } = crearDefs();
  const cap = s("g");
  const svg = s("svg", { xmlns: NS, viewBox: `0 0 ${vb[0]} ${vb[1]}`, ...(ancho ? { width: ancho, height: Math.round((ancho * vb[1]) / vb[0]) } : {}), "data-pz": "1" }, defs, pista, cap);
  dibujarPaso(cap, defs, ids, d, idx, estadoEn(d, idx, 1), { trazos, jugadores });
  return svg;
}
/** PNG (dataURL) de un svg estático. */
export function aPng(svg, anchoPx = 1200) {
  const vb = svg.viewBox.baseVal, alto = Math.round((anchoPx * vb.height) / vb.width);
  const clon = svg.cloneNode(true); clon.setAttribute("width", anchoPx); clon.setAttribute("height", alto);
  const url = "data:image/svg+xml;charset=utf-8," + encodeURIComponent(new XMLSerializer().serializeToString(clon));
  return new Promise((ok, mal) => { const im = new Image(); im.onload = () => { const c = document.createElement("canvas"); c.width = anchoPx; c.height = alto; const x = c.getContext("2d"); x.fillStyle = COL.suelo; x.fillRect(0, 0, anchoPx, alto); x.drawImage(im, 0, 0, anchoPx, alto); ok(c.toDataURL("image/png")); }; im.onerror = () => mal(new Error("No se pudo generar la imagen")); im.src = url; });
}

// ---------- el editor ----------
const RITMOS = { lento: 2600, normal: 1700, rapido: 1000 };
/**
 * Pizarra interactiva en `host`. opciones: { datos, editable, jugadores:boolean, alCambiar(datos), alPaso(k), alSeleccionar(sel), pedirTexto(valor)→Promise<string|null>, alTerminar() }
 */
export function crearPizarra(host, opt = {}) {
  let D = normalizar(opt.datos || { pasos: [] }), k = 0, herr = "mover", sel = null, reja = false;
  let hist = [JSON.stringify(D)], hi = 0, anim = null;
  const { defs, ids } = crearDefs();
  const capa = s("g"), pistaHost = s("g");
  const svg = s("svg", { xmlns: NS, class: "pz-svg", "data-pz": "1", preserveAspectRatio: "xMidYMid meet", style: { touchAction: "none", display: "block", userSelect: "none", maxWidth: "100%", maxHeight: "100%" } }, defs, pistaHost, capa);
  host.replaceChildren(svg);
  const mostrar = (st) => dibujarPaso(capa, defs, ids, D, k, st || estadoEn(D, k, 1), { sel: opt.editable === false ? null : sel, jugadores: opt.jugadores !== false });
  function montarPista() { const { g, vb } = pistaGrupo(D.pista === "completa"); pistaHost.replaceChildren(g); svg.setAttribute("viewBox", `0 0 ${vb[0]} ${vb[1]}`); svg.style.aspectRatio = `${vb[0]} / ${vb[1]}`; if (!svg.style.width) { svg.style.width = "100%"; } }
  const avisar = () => opt.alCambiar && opt.alCambiar(D);
  function confirmar() { const j = JSON.stringify(D); if (j === hist[hi]) return; hist = hist.slice(0, hi + 1); hist.push(j); if (hist.length > 120) hist.shift(); hi = hist.length - 1; avisar(); }
  function restaurar(i) { hi = i; D = JSON.parse(hist[hi]); k = Math.min(k, D.pasos.length - 1); sel = null; montarPista(); mostrar(); avisar(); opt.alPaso && opt.alPaso(k); }
  const paso = () => D.pasos[k];

  function aPista(ev) {
    const pt = svg.createSVGPoint(); pt.x = ev.clientX; pt.y = ev.clientY;
    const q = pt.matrixTransform(svg.getScreenCTM().inverse());
    let x = q.y - M, y = q.x - M; const lim = D.pista === "completa" ? 2 * C.L : C.L;
    x = Math.max(-1.2, Math.min(lim + 1.2, x)); y = Math.max(-1.2, Math.min(C.W + 1.2, y));
    if (reja) { x = Math.round(x * 2) / 2; y = Math.round(y * 2) / 2; }
    return [Math.round(x * 100) / 100, Math.round(y * 100) / 100];
  }
  const fichaEn = (ev) => { const el = document.elementsFromPoint(ev.clientX, ev.clientY).find((e) => e.closest && e.closest("[data-ficha]") && svg.contains(e)); return el ? paso().fichas.find((f) => f.id === el.closest("[data-ficha]").dataset.ficha) : null; };

  // propaga el movimiento de una ficha a los pasos siguientes que aún tenían la posición anterior
  function mover(f, x, y) {
    const [ox, oy] = [f.x, f.y]; f.x = x; f.y = y;
    for (let j = k + 1; j < D.pasos.length; j++) { const g = D.pasos[j].fichas.find((z) => z.id === f.id); if (g && Math.abs(g.x - ox) < 0.01 && Math.abs(g.y - oy) < 0.01) { g.x = x; g.y = y; } else break; }
  }
  function borrar(id, esFicha) {
    if (esFicha) { for (const p of D.pasos) { p.fichas = p.fichas.filter((f) => f.id !== id); p.trazos = p.trazos.filter((t) => t.ficha !== id && t.a !== id); if (p.balon === id) p.balon = null; } }
    else paso().trazos = paso().trazos.filter((t) => t.id !== id);
    if (sel === id) sel = null; mostrar(); confirmar();
  }

  let gesto = null;
  svg.addEventListener("pointerdown", async (ev) => {
    if (anim || opt.editable === false || ev.button > 0) return;
    const p = aPista(ev), asa = ev.target.closest && ev.target.closest("[data-asa]"), fe = ev.target.closest && ev.target.closest("[data-ficha]"), te = ev.target.closest && ev.target.closest("[data-trazo]");
    const f = fe ? paso().fichas.find((x) => x.id === fe.dataset.ficha) : null;
    if (asa) { gesto = { tipo: "asa", t: paso().trazos.find((x) => x.id === asa.dataset.asa) }; svg.setPointerCapture(ev.pointerId); return; }
    if (herr === "borrar") { if (f) borrar(f.id, true); else if (te) borrar(te.dataset.trazo, false); return; }
    if (herr === "balon") { if (f) { paso().balon = f.id; mostrar(); confirmar(); } return; }
    if (herr === "of" || herr === "df") { if (f) { seleccionar(f.id); return; } const fi = { id: uid(herr === "of" ? "o" : "d"), tipo: herr, x: p[0], y: p[1], etiqueta: etiquetaLibre(paso(), herr) }; for (let j = k; j < D.pasos.length; j++) D.pasos[j].fichas.push({ ...fi }); if (!paso().balon && herr === "of") paso().balon = null; seleccionar(fi.id); confirmar(); return; }
    if (herr === "texto") { const txt = opt.pedirTexto ? await opt.pedirTexto("") : "Texto"; if (txt) { const t = { id: uid("t"), tipo: "texto", p0: p, c: p, p1: p, texto: txt }; paso().trazos.push(t); seleccionar(t.id); confirmar(); } return; }
    if (herr === "zona") { const t = { id: uid("t"), tipo: "zona", p0: p, c: p, p1: p }; paso().trazos.push(t); gesto = { tipo: "nuevo", t }; svg.setPointerCapture(ev.pointerId); return; }
    if (TIPOS_TRAZO.includes(herr) && herr !== "texto") { // trazo desde una ficha
      if (!f) { seleccionar(te ? te.dataset.trazo : null); return; }
      const t = { id: uid("t"), tipo: herr, ficha: f.id, p0: [f.x, f.y], c: [f.x, f.y], p1: [f.x, f.y] }; paso().trazos.push(t); gesto = { tipo: "nuevo", t, f }; svg.setPointerCapture(ev.pointerId); return;
    }
    // herramienta «mover»
    if (f) { seleccionar(f.id); gesto = { tipo: "mover", f, dx: p[0] - f.x, dy: p[1] - f.y }; svg.setPointerCapture(ev.pointerId); }
    else seleccionar(te ? te.dataset.trazo : null);
  });
  svg.addEventListener("pointermove", (ev) => {
    if (!gesto) return; const p = aPista(ev);
    if (gesto.tipo === "mover") { mover(gesto.f, Math.round((p[0] - gesto.dx) * 100) / 100, Math.round((p[1] - gesto.dy) * 100) / 100); mostrar(); }
    else if (gesto.tipo === "nuevo") { const t = gesto.t; t.p1 = p; t.c = [(t.p0[0] + p[0]) / 2, (t.p0[1] + p[1]) / 2]; mostrar(); }
    else if (gesto.tipo === "asa") { const t = gesto.t, m = [(t.p0[0] + t.p1[0]) / 2, (t.p0[1] + t.p1[1]) / 2]; t.c = [2 * p[0] - m[0], 2 * p[1] - m[1]]; mostrar(); }
  });
  const fin = (ev) => {
    if (!gesto) return; const g = gesto; gesto = null;
    if (g.tipo === "nuevo") {
      const t = g.t; const largo = dist(t.p0, t.p1);
      if (t.tipo === "zona") { if (largo < 0.5) paso().trazos = paso().trazos.filter((x) => x !== t); else seleccionar(t.id); }
      else if (largo < 0.5) paso().trazos = paso().trazos.filter((x) => x !== t);
      else {
        if (MUEVEN.includes(t.tipo)) mover(g.f, t.p1[0], t.p1[1]);
        else if (t.tipo === "pase" || t.tipo === "entrega") { const dest = fichaEn(ev); if (dest && dest.id !== g.f.id) { t.a = dest.id; t.p1 = [dest.x, dest.y]; t.c = [(t.p0[0] + t.p1[0]) / 2, (t.p0[1] + t.p1[1]) / 2]; paso().balon = dest.id; } }
        seleccionar(t.id);
      }
      mostrar();
    }
    confirmar();
  };
  svg.addEventListener("pointerup", fin); svg.addEventListener("pointercancel", fin);
  function seleccionar(id) { sel = id; mostrar(); opt.alSeleccionar && opt.alSeleccionar(info()); }
  function info() { if (!sel) return null; const f = paso().fichas.find((x) => x.id === sel); if (f) return { tipo: "ficha", ficha: f }; const t = paso().trazos.find((x) => x.id === sel); return t ? { tipo: "trazo", trazo: t } : null; }
  host.tabIndex = 0;
  host.addEventListener("keydown", (ev) => {
    if (ev.target.closest && ev.target.closest("input,textarea,select")) return;
    if ((ev.key === "Delete" || ev.key === "Backspace") && sel) { const esF = paso().fichas.some((f) => f.id === sel); borrar(sel, esF); ev.preventDefault(); }
    else if ((ev.metaKey || ev.ctrlKey) && ev.key.toLowerCase() === "z") { ev.shiftKey ? api.rehacer() : api.deshacer(); ev.preventDefault(); }
    else if (ev.key === "ArrowRight" && !anim) { api.irAPaso(k + 1); } else if (ev.key === "ArrowLeft" && !anim) { api.irAPaso(k - 1); }
    else if (ev.key === " ") { anim ? api.parar() : api.reproducir(); ev.preventDefault(); }
  });

  function tick(t) {
    if (!anim) return;
    const el = t - anim.t0, a = anim;
    if (a.fase === "ini") { if (el > 500) { a.fase = "mov"; a.k = 1; a.t0 = t; if (D.pasos.length < 2) return fin_anim(); k = 1; opt.alPaso && opt.alPaso(k); } else { mostrarEn(0, 1); } }
    else if (a.fase === "mov") {
      const u = Math.min(1, el / a.dur); mostrarEn(a.k, u);
      if (u >= 1) { a.fase = "pausa"; a.t0 = t; }
    } else if (a.fase === "pausa" && el > 450) {
      if (a.k + 1 < D.pasos.length) { a.k++; k = a.k; opt.alPaso && opt.alPaso(k); a.fase = "mov"; a.t0 = t; }
      else if (a.bucle) { k = 0; opt.alPaso && opt.alPaso(0); a.fase = "ini"; a.t0 = t; } else return fin_anim();
    }
    anim && requestAnimationFrame(tick);
  }
  function mostrarEn(kk, u) { k = kk; dibujarPaso(capa, defs, ids, D, kk, estadoEn(D, kk, u), { trazos: true, jugadores: opt.jugadores !== false }); }
  function fin_anim() { anim = null; mostrar(); opt.alTerminar && opt.alTerminar(); }

  const api = {
    get datos() { return D; }, get paso() { return k; }, get reproduciendo() { return !!anim; }, get herramienta() { return herr; },
    setDatos(d, { historia = true } = {}) { D = normalizar(d); k = 0; sel = null; if (historia) { hist = [JSON.stringify(D)]; hi = 0; } montarPista(); mostrar(); opt.alPaso && opt.alPaso(0); },
    herramienta(h) { herr = h; if (h !== "mover") { sel = null; mostrar(); } },
    irAPaso(i) { if (anim) api.parar(); k = Math.max(0, Math.min(D.pasos.length - 1, i)); sel = null; mostrar(); opt.alPaso && opt.alPaso(k); opt.alSeleccionar && opt.alSeleccionar(null); },
    anadirPaso() { D = nuevoPaso(D, k); k = k + 1; sel = null; mostrar(); confirmar(); opt.alPaso && opt.alPaso(k); },
    duplicarPaso() { api.anadirPaso(); },
    borrarPaso() { if (D.pasos.length > 1) { D = borrarPaso(D, k); k = Math.min(k, D.pasos.length - 1); sel = null; mostrar(); confirmar(); opt.alPaso && opt.alPaso(k); } },
    renombrarPaso(n) { paso().nombre = n || paso().nombre; confirmar(); },
    espejo() { D = espejo(D); sel = null; mostrar(); confirmar(); },
    cambiarPista(p) { D = conPista(D, p); montarPista(); mostrar(); confirmar(); },
    reja(v) { reja = !!v; },
    asignarJugador(id, jugador, txt) { for (const p of D.pasos) { const f = p.fichas.find((x) => x.id === id); if (f) { if (jugador) { f.jugador = jugador; f.jugador_txt = txt || ""; } else { delete f.jugador; delete f.jugador_txt; } } } mostrar(); confirmar(); },
    editarTrazo(id, cambios) { const t = paso().trazos.find((x) => x.id === id); if (t) { Object.assign(t, cambios); mostrar(); confirmar(); } },
    deshacer() { if (hi > 0) restaurar(hi - 1); }, rehacer() { if (hi < hist.length - 1) restaurar(hi + 1); },
    get puedeDeshacer() { return hi > 0; }, get puedeRehacer() { return hi < hist.length - 1; },
    reproducir({ ritmo = "normal", bucle = false } = {}) { if (anim) return; sel = null; k = 0; anim = { fase: "ini", t0: performance.now(), dur: RITMOS[ritmo] || RITMOS.normal, bucle, k: 0 }; opt.alPaso && opt.alPaso(0); requestAnimationFrame(tick); },
    parar() { if (anim) { anim = null; mostrar(); opt.alTerminar && opt.alTerminar(); } },
    ritmo(r) { if (anim) anim.dur = RITMOS[r] || RITMOS.normal; },
    svgActual(opts) { return svgJugada(D, k, opts); },
    destruir() { anim = null; host.replaceChildren(); },
  };
  montarPista(); mostrar();
  return api;
}
