// Estado global: el filtro (db, equipo, jugador, partido) vive en el hash de la URL
// (#/vista?db=..&eq=..&ju=..&pa=..) para que atrás/adelante y los enlaces funcionen.
import { puntosDeTiro } from "./court.js";

export const SEP = "\x01"; // jugador\x01equipo: dos equipos pueden tener un jugador homónimo
export const jugadorKey = (j, e) => j + SEP + e;
export const nombreDeKey = (k) => k.split(SEP)[0];
export const equipoDeKey = (k) => k.split(SEP)[1];

// data/idx: lo que ven las vistas. completo/idxCompleto: el payload entero; difiere de data solo en una categoría (varios grupos) con un grupo elegido.
export const S = { data: null, db: "", grupos: [], idx: null, completo: null, idxCompleto: null, categorias: null };

export function leerHash() {
  const [path, q] = (location.hash.slice(1) || "/equipo").split("?");
  const p = new URLSearchParams(q || "");
  return { view: path.replace(/^\//, "") || "equipo", db: p.get("db") || "", f: { eq: p.get("eq") || "", ju: p.get("ju") || "", pa: p.get("pa") || "", gr: p.get("gr") || "" } };
}
/** Parámetro extra de la ruta actual (p. ej. #/notas?abrir=… o #/playbook?j=12). */
export const paramHash = (k) => new URLSearchParams(location.hash.split("?")[1] || "").get(k) || "";
export function hashDe({ view, db, f }) {
  const p = new URLSearchParams();
  if (db) p.set("db", db);
  for (const k of ["gr", "eq", "ju", "pa"]) if (f[k]) p.set(k, f[k]);
  return `#/${view}?${p}`;
}

// Mantiene coherentes los tres filtros (un jugador fija su equipo; un partido debe ser del equipo).
/** Grupo al que pertenece un equipo (solo en una categoría con varios grupos). */
export const grupoDeEquipo = (eq) => (S.completo?.clasificacion || []).find((c) => c.equipo === eq)?.grupo || "";

/** Subconjunto de una categoría con solo los equipos de un grupo (clasificación, partidos, jugadores, tiros). Los índices y percentiles
 *  del payload siguen siendo los de la categoría entera. */
function subconjuntoDeGrupo(D, gr) {
  const eqs = new Set(D.clasificacion.filter((c) => c.grupo === gr).map((c) => c.equipo));
  const ids = new Set(D.partidos.filter((p) => eqs.has(p.equipo_local)).map((p) => p.partido_id));
  return { ...D, grupo: gr, ambito_grupo: true, equipos: D.equipos.filter((e) => eqs.has(e)), clasificacion: D.clasificacion.filter((c) => eqs.has(c.equipo)),
    partidos: D.partidos.filter((p) => ids.has(p.partido_id)), jugadores: D.jugadores.filter((j) => eqs.has(j.equipo)),
    partidosJugador: D.partidosJugador.filter((r) => ids.has(r.partido_id)), tiros: D.tiros.filter((t) => ids.has(t.partido_id)) };
}
let grAplicado = "";
/** Fija lo que ven las vistas: la categoría entera o solo un grupo suyo. Debe llamarse tras cargar y antes de normalizar/pintar. */
export function aplicarAmbito(gr) {
  const C = S.completo; if (!C) return;
  const quiere = C.es_categoria && gr && (C.grupos || []).includes(gr) ? gr : "";
  if (quiere === grAplicado && S.data) return;
  grAplicado = quiere;
  if (quiere) { S.data = subconjuntoDeGrupo(C, quiere); S.idx = indexar(S.data); } else { S.data = C; S.idx = S.idxCompleto; }
}
export function fijarCompleto(payload) { S.completo = payload; S.idxCompleto = indexar(payload); S.data = payload; S.idx = S.idxCompleto; grAplicado = ""; }

export function normalizar(f) {
  const o = { ...f };
  const D = S.completo || S.data, idx = S.idxCompleto || S.idx;
  if (D) {
    if (!D.es_categoria || !(D.grupos || []).includes(o.gr)) o.gr = "";
    if (o.ju) {
      if (!idx.jugadores.has(o.ju)) o.ju = "";
      else o.eq = equipoDeKey(o.ju);
    }
    if (o.eq && !D.equipos.includes(o.eq)) o.eq = "";
    if (o.gr && o.eq && grupoDeEquipo(o.eq) !== o.gr) o.gr = ""; // un equipo de otro grupo: se amplía a toda la categoría
    if (o.pa) {
      const p = idx.partidos.get(o.pa);
      if (!p || (o.eq && p.equipo_local !== o.eq && p.equipo_visitante !== o.eq)) o.pa = "";
      else if (o.ju && !idx.partidosDeJugador.get(o.ju)?.has(o.pa)) o.pa = "";
    }
  }
  return o;
}

export function ir(patch) {
  const cur = leerHash();
  let f = { ...cur.f, ...(patch.f || {}) };
  // al cambiar de equipo se descartan jugador/partido que ya no encajan
  if (patch.f && "eq" in patch.f && patch.f.eq !== cur.f.eq && !("ju" in patch.f)) f.ju = "";
  if (patch.f && "gr" in patch.f && patch.f.gr !== cur.f.gr) { if (!("eq" in patch.f)) f.eq = ""; if (!("ju" in patch.f)) f.ju = ""; if (!("pa" in patch.f)) f.pa = ""; }
  const next = { view: patch.view || cur.view, db: patch.db ?? cur.db, f: normalizar(f) };
  const h = hashDe(next);
  if (h === location.hash) window.dispatchEvent(new HashChangeEvent("hashchange"));
  else location.hash = h;
}

export const equipoEnFoco = (f) => f.eq || (f.ju ? equipoDeKey(f.ju) : "");

export function indexar(data) {
  const partidos = new Map(data.partidos.map((p) => [p.partido_id, p]));
  const jugadores = new Map(data.jugadores.map((j) => [jugadorKey(j.jugador, j.equipo), j]));
  const partidosDeJugador = new Map();
  for (const r of data.partidosJugador) {
    const k = jugadorKey(r.jugador, r.equipo);
    if (!partidosDeJugador.has(k)) partidosDeJugador.set(k, new Set());
    partidosDeJugador.get(k).add(r.partido_id);
  }
  // PPA medio de la liga (puntos por tiro de campo): centro de las escalas divergentes de los mapas
  let pts = 0;
  for (const t of data.tiros) if (t.resultado === "acierto") pts += puntosDeTiro(t);
  const ppaLiga = data.tiros.length ? pts / data.tiros.length : 1;
  return { partidos, jugadores, partidosDeJugador, ppaLiga: Math.min(1.25, Math.max(0.85, ppaLiga)) };
}

export function partidosDeEquipo(eq) {
  return S.data.partidos
    .filter((p) => p.equipo_local === eq || p.equipo_visitante === eq)
    .map((p) => {
      const loc = p.equipo_local === eq;
      const a = loc ? p.pts_local : p.pts_visitante, b = loc ? p.pts_visitante : p.pts_local;
      return { ...p, local: loc, rival: loc ? p.equipo_visitante : p.equipo_local, pts_propios: a, pts_rival: b, resultado: a > b ? "V" : "D" };
    })
    .sort((x, y) => (x.fecha || "").localeCompare(y.fecha || ""));
}
