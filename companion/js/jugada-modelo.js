// Modelo de una jugada del Playbook (funciones puras, sin DOM: se prueban con node).
//
// Coordenadas en metros, como los datos de tiros: x a lo largo de la pista (0 = línea de fondo, el aro de la media pista está en
// x = 1,575) e y a lo ancho (0–15). La pista se dibuja con el aro ARRIBA. Media pista: x de 0 a 14; completa: de 0 a 28.
//
// datos = { v:1, pista:"media"|"completa", pasos:[ paso ] }
// paso  = { nombre, fichas:[{id, tipo:"of"|"df"|"balon"?, x, y, etiqueta, jugador?}], balon: idFicha|null,
//           trazos:[{id, tipo, ficha?, a?, p0:[x,y], c:[x,y], p1:[x,y], texto?}] }
// Las posiciones de un paso son las FINALES; los trazos del paso son el recorrido desde el paso anterior (corte, bote, bloqueo mueven
// la ficha por su trazado; pase y entrega mueven el balón; tiro, zona y texto son anotaciones).
export const TIPOS_TRAZO = ["corte", "bote", "pase", "entrega", "bloqueo", "tiro", "zona", "texto"];
export const MUEVEN = ["corte", "bote", "bloqueo"];     // trazos que llevan a su ficha por el recorrido
export const L = { media: 14, completa: 28 }, ANCHO = 15, ARO = [1.575, 7.5];
const KD = 5.8, KY0 = 7.5 - 2.45, KY1 = 7.5 + 2.45, R3 = 6.75, ESQ = 0.9;

let _n = 0;
export const uid = (p = "e") => `${p}${Date.now().toString(36)}${(_n++).toString(36)}`;
const r2 = (n) => Math.round(n * 100) / 100;
const copia = (o) => JSON.parse(JSON.stringify(o));
export const dist = (a, b) => Math.hypot(a[0] - b[0], a[1] - b[1]);

export function pasoVacio(nombre = "Paso 1") { return { nombre, fichas: [], balon: null, trazos: [] }; }
export function vacia(pista = "media") { return { v: 1, pista: pista === "completa" ? "completa" : "media", pasos: [pasoVacio()] }; }

/** Datos válidos: rellena lo que falte y descarta lo que no sea del modelo (protege de JSON importado a mano). */
export function normalizar(d) {
  const o = { v: 1, pista: d && d.pista === "completa" ? "completa" : "media", pasos: [] };
  const pasos = Array.isArray(d && d.pasos) && d.pasos.length ? d.pasos : [pasoVacio()];
  const num = (n, def) => (Number.isFinite(+n) ? +n : def);
  const pt = (p, def) => (Array.isArray(p) && p.length >= 2 ? [num(p[0], def[0]), num(p[1], def[1])] : def);
  pasos.forEach((p, i) => {
    const fichas = (p.fichas || []).filter((f) => f && f.id && (f.tipo === "of" || f.tipo === "df")).map((f) => ({ id: String(f.id), tipo: f.tipo, x: num(f.x, 7), y: num(f.y, 7.5), etiqueta: String(f.etiqueta ?? ""), ...(f.jugador ? { jugador: String(f.jugador), jugador_txt: String(f.jugador_txt || "") } : {}) }));
    const ids = new Set(fichas.map((f) => f.id));
    const trazos = (p.trazos || []).filter((t) => t && TIPOS_TRAZO.includes(t.tipo)).map((t) => {
      const p0 = pt(t.p0, [0, 0]), p1 = pt(t.p1, p0);
      return { id: String(t.id || uid("t")), tipo: t.tipo, ...(t.ficha && ids.has(t.ficha) ? { ficha: t.ficha } : {}), ...(t.a && ids.has(t.a) ? { a: t.a } : {}), p0, c: pt(t.c, [(p0[0] + p1[0]) / 2, (p0[1] + p1[1]) / 2]), p1, ...(t.texto ? { texto: String(t.texto) } : {}) };
    });
    o.pasos.push({ nombre: String(p.nombre || `Paso ${i + 1}`), fichas, balon: p.balon && ids.has(p.balon) ? p.balon : null, trazos });
  });
  return o;
}

// ---------- geometría ----------
export const bezier = (p0, c, p1, t) => { const u = 1 - t; return [u * u * p0[0] + 2 * u * t * c[0] + t * t * p1[0], u * u * p0[1] + 2 * u * t * c[1] + t * t * p1[1]]; };
export function muestras(t, n = 14) { const r = []; for (let i = 0; i <= n; i++) r.push(bezier(t.p0, t.c, t.p1, i / n)); return r; }
/** Posición de la ficha a lo largo de una polilínea (0 ≤ s ≤ 1, por longitud). */
function aLoLargo(pts, s) {
  if (pts.length === 1) return pts[0];
  const seg = []; let total = 0;
  for (let i = 1; i < pts.length; i++) { const d = dist(pts[i - 1], pts[i]); seg.push(d); total += d; }
  if (total === 0) return pts[pts.length - 1];
  let m = s * total;
  for (let i = 0; i < seg.length; i++) { if (m <= seg[i] || i === seg.length - 1) { const k = seg[i] ? Math.min(1, m / seg[i]) : 1; return [pts[i][0] + (pts[i + 1][0] - pts[i][0]) * k, pts[i][1] + (pts[i + 1][1] - pts[i][1]) * k]; } m -= seg[i]; }
  return pts[pts.length - 1];
}
export const suave = (u) => u * u * (3 - 2 * u);

/** Recorrido de una ficha en el paso k: posición anterior → trazos que la mueven → posición final. */
export function recorrido(d, k, id) {
  const p = d.pasos[k], f = p.fichas.find((x) => x.id === id); if (!f) return [];
  const prev = k > 0 ? d.pasos[k - 1].fichas.find((x) => x.id === id) : null;
  const pts = [prev ? [prev.x, prev.y] : [f.x, f.y]];
  for (const t of p.trazos) {
    if (t.ficha !== id || !MUEVEN.includes(t.tipo)) continue;
    const m = muestras(t); if (dist(pts[pts.length - 1], m[0]) > 0.05) pts.push(m[0]);
    pts.push(...m.slice(1));
  }
  if (dist(pts[pts.length - 1], [f.x, f.y]) > 0.05) pts.push([f.x, f.y]);
  return pts;
}

/** Estado de la pizarra en el instante u (0–1) de la transición hacia el paso k (k = 0: la posición inicial). */
export function estadoEn(d, k, u) {
  const p = d.pasos[k];
  if (k === 0 || u >= 1) return { fichas: p.fichas.map((f) => ({ ...f })), balon: balonDe(p, p.fichas) };
  const s = suave(Math.max(0, u));
  const fichas = p.fichas.map((f) => { const [x, y] = aLoLargo(recorrido(d, k, f.id), s); return { ...f, x, y }; });
  const ant = d.pasos[k - 1];
  const de = ant.balon && fichas.find((f) => f.id === ant.balon), a = p.balon && fichas.find((f) => f.id === p.balon);
  let balon = null;
  if (de && a && de.id !== a.id) { const q = suave(Math.max(0, Math.min(1, (u - 0.15) / 0.5))); balon = { x: de.x + (a.x - de.x) * q, y: de.y + (a.y - de.y) * q, vuela: q > 0 && q < 1 }; }
  else if (a) balon = { x: a.x, y: a.y }; else if (de) balon = { x: de.x, y: de.y };
  return { fichas, balon };
}
const balonDe = (p, fichas) => { const f = p.balon && fichas.find((x) => x.id === p.balon); return f ? { x: f.x, y: f.y } : null; };

// ---------- operaciones ----------
/** Nuevo paso a partir del último (mismas posiciones y balón, sin trazos). */
export function nuevoPaso(d, desde = d.pasos.length - 1) {
  const o = copia(d), base = o.pasos[desde];
  o.pasos.splice(desde + 1, 0, { nombre: `Paso ${o.pasos.length + 1}`, fichas: copia(base.fichas), balon: base.balon, trazos: [] });
  o.pasos.forEach((p, i) => { if (/^Paso \d+$/.test(p.nombre)) p.nombre = `Paso ${i + 1}`; });
  return o;
}
export function borrarPaso(d, k) {
  if (d.pasos.length <= 1) return d;
  const o = copia(d); o.pasos.splice(k, 1); o.pasos.forEach((p, i) => { if (/^Paso \d+$/.test(p.nombre)) p.nombre = `Paso ${i + 1}`; }); return o;
}
/** Refleja la jugada de izquierda a derecha (y → 15 − y). */
export function espejo(d) {
  const o = copia(d), f = (p) => [p[0], r2(ANCHO - p[1])];
  for (const p of o.pasos) { for (const x of p.fichas) x.y = r2(ANCHO - x.y); for (const t of p.trazos) { t.p0 = f(t.p0); t.c = f(t.c); t.p1 = f(t.p1); } }
  return o;
}
/** Cambia de media a pista completa (o al revés) sin tocar nada: las posiciones están en metros. */
export function conPista(d, pista) { const o = copia(d); o.pista = pista === "completa" ? "completa" : "media"; return o; }

// ---------- plantillas ----------
const O = (etiqueta, x, y) => ({ id: uid("o"), tipo: "of", etiqueta, x, y });
const X = (etiqueta, x, y) => ({ id: uid("d"), tipo: "df", etiqueta, x, y });
export const FORMACIONES = {
  "5 fuera": () => [O("1", 10.8, 7.5), O("2", 8.4, 12.6), O("3", 8.4, 2.4), O("4", 3.2, 13.8), O("5", 3.2, 1.2)],
  "4 fuera 1 dentro": () => [O("1", 10.8, 7.5), O("2", 8.4, 12.6), O("3", 8.4, 2.4), O("4", 3.2, 13.8), O("5", 3.6, 7.5)],
  "1-4 alto": () => [O("1", 11.2, 7.5), O("2", 7.2, 2.0), O("3", 7.2, 13.0), O("4", 7.2, 5.2), O("5", 7.2, 9.8)],
  "Horns (cuerno)": () => [O("1", 11, 7.5), O("2", 8.8, 12.4), O("3", 8.8, 2.6), O("4", 5.8, 10.0), O("5", 5.8, 5.0)],
  "Caja": () => [O("1", 10.2, 7.5), O("2", 5.8, 10.0), O("3", 5.8, 5.0), O("4", 2.4, 10.0), O("5", 2.4, 5.0)],
};
export const DEFENSAS = {
  "Individual": (of) => of.map((f, i) => X(`X${i + 1}`, r2(Math.max(0.8, f.x - 1.3)), r2(f.y + (7.5 - f.y) * 0.15))),
  "Zona 2-3": () => [X("X1", 6.2, 5.4), X("X2", 6.2, 9.6), X("X3", 2.6, 2.6), X("X4", 2.8, 7.5), X("X5", 2.6, 12.4)],
  "Zona 3-2": () => [X("X1", 7.4, 2.8), X("X2", 7.8, 7.5), X("X3", 7.4, 12.2), X("X4", 3.0, 5.2), X("X5", 3.0, 9.8)],
  "Zona 1-3-1": () => [X("X1", 8.2, 7.5), X("X2", 5.8, 3.0), X("X3", 5.2, 7.5), X("X4", 5.8, 12.0), X("X5", 2.2, 7.5)],
};
/** Jugada nueva con una formación de ataque y, si se pide, una defensa; el balón lo lleva la ficha «1». */
export function conFormacion(pista, ataque, defensa) {
  const d = vacia(pista); const of = FORMACIONES[ataque] ? FORMACIONES[ataque]() : [];
  const df = defensa && DEFENSAS[defensa] ? DEFENSAS[defensa](of) : [];
  d.pasos[0].fichas = [...of, ...df]; d.pasos[0].balon = (of.find((f) => f.etiqueta === "1") || {}).id || null; return d;
}
/** Siguiente etiqueta libre de ataque (1–5, luego 6, 7…) o de defensa (X1–X5…). */
export function etiquetaLibre(paso, tipo) {
  const usadas = new Set(paso.fichas.filter((f) => f.tipo === tipo).map((f) => f.etiqueta));
  for (let i = 1; i < 30; i++) { const e = tipo === "df" ? `X${i}` : String(i); if (!usadas.has(e)) return e; }
  return "?";
}

// ---------- lenguaje natural (para el asistente y la hoja impresa) ----------
/** Zona de la pista, en palabras (mirando hacia el aro: izquierda = lado izquierdo de la pantalla). */
export function zonaTexto(x, y) {
  const lado = y < 5.7 ? "izquierda" : y > 9.3 ? "derecha" : "centro";
  const dAro = dist([x, y], ARO);
  if (dAro < 1.6) return "debajo del aro";
  if (x <= KD && y >= KY0 && y <= KY1) return x < 3.4 ? "bloque bajo de la pintura" : "poste alto (línea de tiros libres)";
  const esquina = (y <= ESQ + 1.3 || y >= ANCHO - ESQ - 1.3) && x < 4.2;
  if (esquina) return `esquina ${y < 7.5 ? "izquierda" : "derecha"}`;
  if (dAro >= R3 - 0.2) return lado === "centro" ? "perímetro frontal (por encima del triple)" : `ala ${lado} (perímetro)`;
  return lado === "centro" ? "media distancia, centro" : `media distancia, lado ${lado === "izquierda" ? "izquierdo" : "derecho"}`;
}
const nombre = (f) => (f ? (f.tipo === "df" ? `el defensor ${f.etiqueta}` : `el ${f.etiqueta}`) : "un jugador");
const cerca = (p, fichas, tipo, max = 1.4) => fichas.filter((f) => f.tipo === tipo && dist([f.x, f.y], p) <= max).sort((a, b) => dist([a.x, a.y], p) - dist([b.x, b.y], p))[0];
/** «Paso 1: …» frase por acción; en el primer paso, las posiciones de partida. */
export function describir(d) {
  const L_ = [];
  d.pasos.forEach((p, k) => {
    const por = (id) => p.fichas.find((f) => f.id === id);
    const fr = [];
    if (k === 0) {
      const of = p.fichas.filter((f) => f.tipo === "of").sort((a, b) => a.etiqueta.localeCompare(b.etiqueta, "es", { numeric: true }));
      if (of.length) fr.push("Posiciones de ataque: " + of.map((f) => `${f.etiqueta} ${zonaTexto(f.x, f.y)}`).join("; "));
      const df = p.fichas.filter((f) => f.tipo === "df"); if (df.length) fr.push(`Defensa: ${df.length} defensores`);
      const b = por(p.balon); if (b) fr.push(`Balón: ${nombre(b)}`);
    }
    for (const t of p.trazos) {
      const f = por(t.ficha), a = por(t.a);
      if (t.tipo === "pase") fr.push(`${nombre(f)} pasa ${a ? "a " + nombre(a) : "hacia " + zonaTexto(...t.p1)}`);
      else if (t.tipo === "entrega") fr.push(`${nombre(f)} entrega el balón ${a ? "a " + nombre(a) : "hacia " + zonaTexto(...t.p1)}`);
      else if (t.tipo === "corte") fr.push(`${nombre(f)} corta hacia ${zonaTexto(...t.p1)}`);
      else if (t.tipo === "bote") fr.push(`${nombre(f)} bota hacia ${zonaTexto(...t.p1)}`);
      else if (t.tipo === "bloqueo") { const df = cerca(t.p1, p.fichas, "df"); fr.push(`${nombre(f)} bloquea en ${zonaTexto(...t.p1)}${df ? ` (sobre ${nombre(df)})` : ""}`); }
      else if (t.tipo === "tiro") fr.push(`${nombre(f)} tira a canasta`);
      else if (t.tipo === "zona") fr.push(`Zona señalada: ${zonaTexto(...t.p0)}${t.texto ? ` (${t.texto})` : ""}`);
      else if (t.tipo === "texto" && t.texto) fr.push(`Nota: ${t.texto}`);
    }
    const bAnt = k > 0 ? d.pasos[k - 1].balon : null;
    if (k > 0 && p.balon && p.balon !== bAnt && !p.trazos.some((t) => t.tipo === "pase" || t.tipo === "entrega")) fr.push(`El balón pasa a ${nombre(por(p.balon))}`);
    if (k > 0) for (const f of p.fichas) { const ant = d.pasos[k - 1].fichas.find((x) => x.id === f.id); if (ant && dist([ant.x, ant.y], [f.x, f.y]) > 0.6 && !p.trazos.some((t) => t.ficha === f.id && MUEVEN.includes(t.tipo))) fr.push(`${nombre(f)} se mueve a ${zonaTexto(f.x, f.y)}`); }
    if (fr.length) L_.push(`${p.nombre}: ${fr.map((x) => x[0].toUpperCase() + x.slice(1)).join(". ")}.`);
  });
  return L_.join("\n").replace(/\ba el /g, "al ").replace(/\bde el /g, "del ");
}
