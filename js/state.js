// Estado global: el filtro (db, equipo, jugador, partido) vive en el hash de la URL
// (#/vista?db=..&eq=..&ju=..&pa=..) para que atrás/adelante y los enlaces funcionen.
import { puntosDeTiro } from "./court.js";

export const SEP = "\x01"; // jugador\x01equipo: dos equipos pueden tener un jugador homónimo
export const jugadorKey = (j, e) => j + SEP + e;
export const nombreDeKey = (k) => k.split(SEP)[0];
export const equipoDeKey = (k) => k.split(SEP)[1];

export const S = { data: null, db: "", grupos: [], idx: null };

export function leerHash() {
  const [path, q] = (location.hash.slice(1) || "/equipo").split("?");
  const p = new URLSearchParams(q || "");
  return { view: path.replace(/^\//, "") || "equipo", db: p.get("db") || "", f: { eq: p.get("eq") || "", ju: p.get("ju") || "", pa: p.get("pa") || "" } };
}
export function hashDe({ view, db, f }) {
  const p = new URLSearchParams();
  if (db) p.set("db", db);
  for (const k of ["eq", "ju", "pa"]) if (f[k]) p.set(k, f[k]);
  return `#/${view}?${p}`;
}

// Mantiene coherentes los tres filtros (un jugador fija su equipo; un partido debe ser del equipo).
export function normalizar(f) {
  const o = { ...f };
  if (S.data) {
    if (o.ju) {
      if (!S.idx.jugadores.has(o.ju)) o.ju = "";
      else o.eq = equipoDeKey(o.ju);
    }
    if (o.eq && !S.data.equipos.includes(o.eq)) o.eq = "";
    if (o.pa) {
      const p = S.idx.partidos.get(o.pa);
      if (!p || (o.eq && p.equipo_local !== o.eq && p.equipo_visitante !== o.eq)) o.pa = "";
      else if (o.ju && !S.idx.partidosDeJugador.get(o.ju)?.has(o.pa)) o.pa = "";
    }
  }
  return o;
}

export function ir(patch) {
  const cur = leerHash();
  let f = { ...cur.f, ...(patch.f || {}) };
  // al cambiar de equipo se descartan jugador/partido que ya no encajan
  if (patch.f && "eq" in patch.f && patch.f.eq !== cur.f.eq && !("ju" in patch.f)) f.ju = "";
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
