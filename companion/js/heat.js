// Mapas de calor: densidad kernel (KDE) gaussiana sobre la media pista, pintada en canvas.
// Sustituye a la antigua cuadrícula de celdas de 1 m² del dashboard.
import { C, ZONA_IDS, ZONAS, asignarZona, puntosDeTiro } from "./court.js";
import { clamp } from "./util.js";

// ---------- escalas de color ----------
// Densidad: secuencial amarillo → naranja → rojo → morado (la luminosidad baja al subir: legible sin color)
const DENSIDAD = [[0, [255, 237, 160]], [0.25, [254, 178, 76]], [0.5, [240, 85, 46]], [0.75, [189, 0, 70]], [1, [88, 10, 110]]];
// Eficiencia (puntos por tiro): rojo ← neutro → verde
const MALO = [192, 57, 43], NEUTRO = [236, 233, 222], BUENO = [24, 128, 76];
// "En contra" usa otra familia de color (azul ↔ naranja) para no confundirlo con "A favor" (rojo ↔ verde).
const BUENO_C = [38, 104, 196], MALO_C = [226, 126, 18];
const DENSIDAD_C = [[0, [226, 241, 250]], [0.3, [128, 196, 226]], [0.6, [38, 128, 190]], [1, [12, 44, 110]]];

const mezcla = (a, b, t) => [0, 1, 2].map((i) => Math.round(a[i] + (b[i] - a[i]) * t));
function rampa(paradas, t) {
  t = clamp(t, 0, 1);
  let i = 0;
  while (i < paradas.length - 2 && t > paradas[i + 1][0]) i++;
  const [t0, c0] = paradas[i], [t1, c1] = paradas[i + 1];
  return mezcla(c0, c1, (t - t0) / (t1 - t0));
}
export const colorDensidad = (t, contra) => rampa(contra ? DENSIDAD_C : DENSIDAD, t);
// d ∈ [-1, 1]: negativo = peor que la media. invertido: en "En contra" conceder pocos puntos es bueno.
export function colorEficiencia(d, invertido) {
  if (invertido) return d <= 0 ? mezcla(NEUTRO, BUENO_C, Math.min(1, -d)) : mezcla(NEUTRO, MALO_C, Math.min(1, d));
  return d >= 0 ? mezcla(NEUTRO, BUENO, Math.min(1, d)) : mezcla(NEUTRO, MALO, Math.min(1, -d));
}
export const rgb = (c) => `rgb(${c[0]},${c[1]},${c[2]})`;
export const degradadoDensidad = (contra) => `linear-gradient(90deg, ${(contra ? DENSIDAD_C : DENSIDAD).map(([t, c]) => `${rgb(c)} ${t * 100}%`).join(", ")})`;
export const degradadoEficiencia = (invertido) =>
  `linear-gradient(90deg, ${rgb(colorEficiencia(invertido ? -1 : -1, invertido))}, ${rgb(colorEficiencia(0, invertido))}, ${rgb(colorEficiencia(1, invertido))})`;

// ---------- KDE ----------
const RANGO_EF = 0.55; // ± puntos/tiro respecto a la media de la liga que saturan la escala

/** Rejilla de densidad (nº equivalente de tiros) y puntos suavizados. Pantalla: i = Y (ancho), j = X (largo). */
export function kde(tiros, { res = 0.1, bw = 1.0 } = {}) {
  const nx = Math.round(C.W / res), ny = Math.round(C.L / res);
  // Los tiros se agrupan primero en la rejilla y después se suaviza con un núcleo gaussiano separable: el coste deja de depender del nº de
  // tiros (una categoría entera son decenas de miles). Equivale al núcleo 2D de antes salvo por situar cada tiro en el centro de su celda (0,1 m).
  const dens0 = new Float32Array(nx * ny), pts0 = new Float32Array(nx * ny);
  for (const t of tiros) {
    const ci = Math.min(nx - 1, Math.max(0, Math.floor(t.Yinv / res))), cj = Math.min(ny - 1, Math.max(0, Math.floor(t.Xinv / res)));
    dens0[cj * nx + ci] += 1;
    if (t.resultado === "acierto") pts0[cj * nx + ci] += puntosDeTiro(t);
  }
  const rad = Math.ceil((3 * bw) / res), inv = 1 / (2 * bw * bw);
  const ker = new Float32Array(2 * rad + 1);
  for (let d = -rad; d <= rad; d++) ker[d + rad] = Math.exp(-(d * res * d * res) * inv);
  const suavizar = (src) => {
    const tmp = new Float32Array(nx * ny), out = new Float32Array(nx * ny);
    for (let j = 0; j < ny; j++) { // a lo largo de i (ancho)
      const fila = j * nx;
      for (let i = 0; i < nx; i++) {
        const v = src[fila + i];
        if (v === 0) continue;
        for (let d = Math.max(-rad, -i); d <= Math.min(rad, nx - 1 - i); d++) tmp[fila + i + d] += v * ker[d + rad];
      }
    }
    for (let j = 0; j < ny; j++) { // a lo largo de j (largo)
      for (let i = 0; i < nx; i++) {
        const v = tmp[j * nx + i];
        if (v === 0) continue;
        for (let d = Math.max(-rad, -j); d <= Math.min(rad, ny - 1 - j); d++) out[(j + d) * nx + i] += v * ker[d + rad];
      }
    }
    return out;
  };
  const dens = suavizar(dens0), pts = suavizar(pts0);
  let max = 0;
  for (let k = 0; k < dens.length; k++) if (dens[k] > max) max = dens[k];
  return { nx, ny, res, dens, pts, max, n: tiros.length };
}

function pintar(canvas, nx, ny, fn) {
  canvas.width = nx; canvas.height = ny;
  const ctx = canvas.getContext("2d");
  const img = ctx.createImageData(nx, ny), d = img.data;
  for (let k = 0; k < nx * ny; k++) {
    const px = fn(k);
    if (px) { d[k * 4] = px[0]; d[k * 4 + 1] = px[1]; d[k * 4 + 2] = px[2]; d[k * 4 + 3] = px[3]; }
  }
  ctx.putImageData(img, 0, 0);
}

/** Calor de volumen de tiros. vmax compartido permite comparar dos mapas con la misma escala. */
export function pintarDensidad(canvas, g, vmax, contra = false) {
  const m = vmax || g.max || 1;
  pintar(canvas, g.nx, g.ny, (k) => {
    const t = g.dens[k] / m;
    if (t < 0.02) return null;
    const a = clamp((t - 0.02) / 0.18, 0, 1) * 0.9;
    return [...colorDensidad(Math.pow(t, 0.8), contra), Math.round(a * 255)];
  });
}

/** Superficie de puntos por tiro suavizada, encogida hacia la media de la liga donde hay pocos tiros
 *  y atenuada (transparencia) donde la muestra es insuficiente para no sugerir falsa precisión. */
export function pintarEficiencia(canvas, g, { centro, invertido = false }) {
  const K = 3.5, DMIN = 3.5, DMAX = 0.35;
  pintar(canvas, g.nx, g.ny, (k) => {
    const d = g.dens[k];
    if (d < DMAX) return null;
    const ppa = (g.pts[k] + K * centro) / (d + K);
    const conf = clamp((d - DMAX) / (DMIN - DMAX), 0, 1);
    return [...colorEficiencia((ppa - centro) / RANGO_EF, invertido), Math.round(conf * 0.88 * 255)];
  });
}

// ---------- zonas (coropleta) ----------
export function estadisticasZonas(tiros) {
  const z = Object.fromEntries(ZONA_IDS.map((id) => [id, { n: 0, ac: 0, pts: 0 }]));
  for (const t of tiros) {
    const e = z[asignarZona(t.Xinv, t.Yinv)];
    e.n++;
    if (t.resultado === "acierto") { e.ac++; e.pts += puntosDeTiro(t); }
  }
  return z;
}

let mapaZonas = null; // zona de cada píxel (se calcula una vez por resolución)
function zonasPorPixel(nx, ny, res) {
  const key = `${nx}x${ny}`;
  if (mapaZonas?.key === key) return mapaZonas.arr;
  const arr = new Uint8Array(nx * ny);
  for (let j = 0; j < ny; j++) for (let i = 0; i < nx; i++) arr[j * nx + i] = ZONA_IDS.indexOf(asignarZona((j + 0.5) * res, (i + 0.5) * res));
  mapaZonas = { key, arr };
  return arr;
}

export function pintarZonas(canvas, stats, { centro, invertido = false }) {
  const res = 0.05, nx = Math.round(C.W / res), ny = Math.round(C.L / res);
  const arr = zonasPorPixel(nx, ny, res);
  const col = ZONA_IDS.map((id) => {
    const e = stats[id];
    if (!e.n) return null;
    const ppa = (e.pts + 3 * centro) / (e.n + 3);
    return [...colorEficiencia((ppa - centro) / RANGO_EF, invertido), Math.round((0.35 + 0.4 * clamp(e.n / 25, 0, 1)) * 255)];
  });
  pintar(canvas, nx, ny, (k) => col[arr[k]]);
}

// ---------- métricas Spread / Range (Goldsberry): celdas de 1 m², ahora solo como dato ----------
export function spreadRange(tiros) {
  const celdas = new Map();
  for (const t of tiros) {
    const k = Math.min(13, Math.floor(t.Xinv)) * 15 + Math.min(14, Math.floor(t.Yinv));
    const c = celdas.get(k) || { n: 0, pts: 0 };
    c.n++;
    if (t.resultado === "acierto") c.pts += puntosDeTiro(t);
    celdas.set(k, c);
  }
  let efectivas = 0;
  for (const c of celdas.values()) if (c.pts / c.n > 1) efectivas++;
  return { spread: (celdas.size / 210) * 100, range: (efectivas / 210) * 100 };
}

export const nombreZona = (id) => ZONAS[id].nombre;

// ---------- Spread + Range: celdas de 1 m² y comparativas (misma lógica que el dashboard original) ----------
export function celdasSR(tiros) {
  const celdas = new Map();
  for (const t of tiros) {
    const cx = Math.min(13, Math.max(0, Math.floor(t.Xinv))), cy = Math.min(14, Math.max(0, Math.floor(t.Yinv)));
    const k = cx * 15 + cy, c = celdas.get(k) || { cx, cy, n: 0, pts: 0 };
    c.n++;
    if (t.resultado === "acierto") c.pts += puntosDeTiro(t);
    celdas.set(k, c);
  }
  return celdas;
}
/** Rojo (pocos pts/tiro) → neutro (1) → verde (muchos). invertido: en "En contra" conceder poco es bueno. */
export const colorPPA = (ppa, invertido) => rgb(colorEficiencia(ppa < 1 ? ppa - 1 : (ppa - 1) / 0.8, invertido));
const media = (xs, k) => (xs.length ? xs.reduce((a, x) => a + x[k], 0) / xs.length : 0);
const agrupar = (lista, clave) => { const m = new Map(); for (const x of lista) { const k = clave(x); const a = m.get(k); if (a) a.push(x); else m.set(k, [x]); } return m; };
export function srPromedioEntreEquipos(tiros, equipos) {
  const por = agrupar(tiros, (t) => t.equipo); // una sola pasada: con una categoría entera hay muchos equipos y decenas de miles de tiros
  const l = equipos.map((e) => spreadRange(por.get(e) || []));
  return { spread: media(l, "spread"), range: media(l, "range") };
}
/** Media real de los jugadores de un equipo (cada uno por separado, no la unión de casillas). */
export function srPromedioJugadores(tiros) {
  const por = new Map();
  for (const t of tiros) { if (!por.has(t.jugador)) por.set(t.jugador, []); por.get(t.jugador).push(t); }
  const l = [...por.values()].map(spreadRange);
  return { spread: media(l, "spread"), range: media(l, "range") };
}
export function srContraPromedio(equipos, partidos, tiros) {
  const porPartido = agrupar(tiros, (t) => t.partido_id);
  const l = equipos.map((e) => {
    const rivales = [];
    for (const p of partidos) if (p.equipo_local === e || p.equipo_visitante === e) for (const t of porPartido.get(p.partido_id) || []) if (t.equipo !== e) rivales.push(t);
    return spreadRange(rivales);
  });
  return { spread: media(l, "spread"), range: media(l, "range") };
}

// ---------- Puntos esperados ----------
const K_XP = 8; // tiros "virtuales" con la media de la zona que estabilizan las casillas con pocos tiros de referencia
const RANGO_XP = 0.6; // ± puntos/tiro de diferencia que saturan la escala de color

/** Función (cx, cy) → {ppa, fg}: puntos por tiro y % de acierto medios de la referencia en esa casilla de 1 m²,
 *  encogidos hacia la media de su zona cuando la casilla tiene pocos tiros. */
export function esperadoPorCelda(ref) {
  const zonas = estadisticasZonas(ref), celdas = new Map();
  let n = 0, ac = 0, pts = 0;
  for (const t of ref) {
    const cx = Math.min(13, Math.max(0, Math.floor(t.Xinv))), cy = Math.min(14, Math.max(0, Math.floor(t.Yinv)));
    const k = cx * 15 + cy, c = celdas.get(k) || { n: 0, ac: 0, pts: 0 };
    c.n++; n++;
    if (t.resultado === "acierto") { c.ac++; c.pts += puntosDeTiro(t); ac++; pts += puntosDeTiro(t); }
    celdas.set(k, c);
  }
  const g = n ? { ppa: pts / n, fg: ac / n } : { ppa: 0, fg: 0 };
  return (cx, cy) => {
    const z = zonas[asignarZona(cx + 0.5, cy + 0.5)], zp = z.n ? { ppa: z.pts / z.n, fg: z.ac / z.n } : g;
    const c = celdas.get(cx * 15 + cy) || { n: 0, ac: 0, pts: 0 };
    return { ppa: (c.pts + K_XP * zp.ppa) / (c.n + K_XP), fg: (c.ac + K_XP * zp.fg) / (c.n + K_XP) };
  };
}

/** Rendimiento real de `tiros` frente a lo esperado según la casilla desde la que se tiró. */
export function puntosEsperados(tiros, esperado) {
  const celdas = new Map();
  for (const t of tiros) {
    const cx = Math.min(13, Math.max(0, Math.floor(t.Xinv))), cy = Math.min(14, Math.max(0, Math.floor(t.Yinv)));
    const k = cx * 15 + cy, c = celdas.get(k) || { cx, cy, n: 0, ac: 0, pts: 0 };
    c.n++;
    if (t.resultado === "acierto") { c.ac++; c.pts += puntosDeTiro(t); }
    celdas.set(k, c);
  }
  const r = { n: 0, ac: 0, pts: 0, esp: 0, espAc: 0, celdas };
  for (const c of celdas.values()) {
    const e = esperado(c.cx, c.cy);
    c.espPpa = e.ppa; c.espFg = e.fg; c.esp = c.n * e.ppa; c.espAc = c.n * e.fg;
    r.n += c.n; r.ac += c.ac; r.pts += c.pts; r.esp += c.esp; r.espAc += c.espAc;
  }
  return r;
}
// Paletas propias para no confundirlas con las de Spread + Range (rojo/verde y azul/naranja):
// "A favor" magenta ← neutro → turquesa; "En contra" marrón ← neutro → lila (lila = concede menos, bueno).
const XP_BAJO = [170, 40, 130], XP_ALTO = [0, 145, 165], XPC_MALO = [125, 72, 28], XPC_BUENO = [155, 90, 210];
export function colorXPrgb(dif, invertido) {
  const d = clamp(dif / RANGO_XP, -1, 1);
  if (invertido) return d <= 0 ? mezcla(NEUTRO, XPC_BUENO, -d) : mezcla(NEUTRO, XPC_MALO, d); // conceder más de lo esperado = malo
  return d >= 0 ? mezcla(NEUTRO, XP_ALTO, d) : mezcla(NEUTRO, XP_BAJO, -d);
}
export const colorXP = (dif, invertido) => rgb(colorXPrgb(dif, invertido));
export const degradadoXP = (invertido) => {
  const [a, b] = invertido ? [XPC_MALO, XPC_BUENO] : [XP_BAJO, XP_ALTO];
  return `linear-gradient(90deg, ${rgb(a)}, ${rgb(NEUTRO)}, ${rgb(b)})`;
};
