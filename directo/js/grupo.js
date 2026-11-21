// Datos del grupo: importación del paquete FEBstats-iPad.json, consultas y exportación del .db.
import { DB, bytesABlob } from "./sqlite.js";
import { aplicarEsquema } from "./schema.js";
import { aSegundos, selloLocal, uid as nuevoUid } from "./util.js";

export const APP_VERSION = "1.0.0";
export const DURACION = { regular: 600, prorroga: 300 };
const LADOS = ["local", "visitante"];

/** Identidad FEB de un equipo. Los equipos nuevos reciben un id sintético estable por sesión. */
export const idEquipoFEB = (sesion, lado) => sesion[lado]?.equipoId || `directo-${lado}-${sesion.uid}`;
function nombreEquipoFEB(sesion, lado) {
  const nombre = sesion[lado]?.nombre || "";
  return sesion.local?.nombre === sesion.visitante?.nombre ? `${nombre} (${lado})` : nombre;
}
const CORNER_X = 1.575 + Math.sqrt(6.75 ** 2 - 6.6 ** 2);

/** 2 o 3 puntos según la geometría FIBA (coordenadas plegadas Xinv/Yinv). */
export function puntosDeTiro(xinv, yinv) {
  const esquina = (yinv <= 0.9 || yinv >= 14.1) && xinv <= CORNER_X;
  const triple = esquina || Math.hypot(xinv - 1.575, yinv - 7.5) >= 6.75;
  return triple ? 3 : 2;
}

export function normalizarPaquete(json) {
  if (!json || json.formato !== "feb-stats-paquete") throw new Error("El archivo no es un paquete de FEBstats (formato «feb-stats-paquete»).");
  if (+json.version < 3) throw new Error(`Paquete versión ${json.version}: esta app necesita la versión 3 o superior.`);
  const grupos = (json.grupos || []).filter((g) => g && g.payload && g.payload.clasificacion);
  if (!grupos.length) throw new Error("El paquete no contiene ningún grupo con datos.");
  return {
    generado: json.generado || "",
    version: +json.version,
    grupos: grupos.map((g) => ({ db: String(g.db || nombreDb(g.payload)), payload: g.payload })),
    notas: Array.isArray(json.notas) ? json.notas : [],
    imagenes: Array.isArray(json.imagenes) ? json.imagenes : [],
  };
}

export function nombreDb(payload) {
  const limpiar = (t) => String(t || "").toLowerCase().normalize("NFD").replace(/[\u0300-\u036f]/g, "").replace(/[^a-z0-9]+/g, "_").replace(/^_+|_+$/g, "");
  return `grupo_${limpiar(payload.competicion)}_${limpiar(payload.grupo)}_${limpiar(payload.temporada)}.db`;
}

const num = (v) => (v === "" || v == null || Number.isNaN(+v) ? null : +v);
const ent = (v) => (v === "" || v == null || Number.isNaN(+v) ? null : Math.round(+v));

/** Inserta un payload completo en una base nueva. Devuelve un resumen. */
export async function crearGrupoDesdePayload(payload, extras, { dbId } = {}) {
  const db = await DB.nuevo();
  aplicarEsquema(db);
  db.transaccion(() => escribirPayload(db, payload, extras, dbId || nombreDb(payload)));
  return { db, resumen: resumenGrupo(db) };
}

export function reemplazarPayload(db, payload, extras, dbId) {
  aplicarEsquema(db);
  db.transaccion(() => escribirPayload(db, payload, extras, dbId || nombreDb(payload)));
}

function escribirPayload(db, payload, extras, dbId) {
  // Base reemplazable: los datos FEB se sustituyen enteros; las tablas directo_* y las notas se reescriben aparte.
  for (const t of ["tiros", "jugador_stats", "equipo_stats", "partidos", "equipos", "equipos_info", "plantilla"]) db.run(`DELETE FROM ${t}`);
  db.run("DELETE FROM grupo_seguido");
  db.run("DELETE FROM directo_clasificacion");
  db.run("DELETE FROM directo_jugador_temporada");
  db.run("DELETE FROM directo_notas");
  db.run("DELETE FROM directo_imagenes");

  db.run("INSERT INTO grupo_seguido(id,competicion,grupo,temporada) VALUES(0,?,?,?)", [payload.competicion || "", payload.grupo || "", payload.temporada || ""]);

  // Equipos: nombre ↔ equipo_id (clasificación, jugadores y partidos).
  const equipos = new Map();
  for (const c of payload.clasificacion || []) if (c.equipo_id) equipos.set(String(c.equipo_id), c.equipo || "");
  for (const j of payload.jugadores || []) if (j.equipo_id) equipos.set(String(j.equipo_id), j.equipo || equipos.get(String(j.equipo_id)) || "");
  for (const p of payload.partidos || []) {
    if (p.local_id) equipos.set(String(p.local_id), p.equipo_local || "");
    if (p.visitante_id) equipos.set(String(p.visitante_id), p.equipo_visitante || "");
  }
  db.insertar("equipos", [...equipos].map(([id, nombre]) => ({ equipo_id: id, feb_id: null, nombre, club_id: null, color: null, logo: null })), { reemplazar: true });

  // Plantilla (identidad). Las métricas de temporada van a directo_jugador_temporada.
  const plantilla = [];
  const temporada = [];
  for (const j of payload.jugadores || []) {
    const clave = `${j.equipo_id || j.equipo}:${j.jugador_id || "d" + j.dorsal}`;
    plantilla.push({
      equipo_feb_id: String(j.equipo_id || j.equipo), equipo: j.equipo || "", jugador_id: String(j.jugador_id || ""),
      nombre: j.jugador || "", puesto: null, dorsal: String(j.dorsal ?? ""), nacimiento: null, fecha_nacimiento: null,
      lugar_nacimiento: null, nacionalidad: null, formacion: null, altura: null, peso: null,
    });
    temporada.push({
      clave, equipo_id: String(j.equipo_id || ""), equipo: j.equipo || "", jugador_id: String(j.jugador_id || ""),
      dorsal: String(j.dorsal ?? ""), nombre: j.jugador || "", partidos: ent(j.partidos), minutos_total: num(j.minutos_total),
      puntos: ent(j.puntos), perfil: j.perfil || null, rol: j.rol || null, uso_pct: num(j.uso_pct), ts_pct: num(j.ts_pct),
      datos: JSON.stringify(j),
    });
  }
  db.insertar("plantilla", plantilla, { reemplazar: true });
  // El paquete puede traer el mismo jugador dos veces con el nombre acentuado de otra forma:
  // se queda la ficha con más partidos.
  const unicos = new Map();
  for (const t of temporada) {
    const prev = unicos.get(t.clave);
    if (!prev || (t.partidos || 0) >= (prev.partidos || 0)) unicos.set(t.clave, t);
  }
  db.insertar("directo_jugador_temporada", [...unicos.values()], { reemplazar: true });

  // Partidos.
  const partidos = (payload.partidos || []).map((p) => ({
    partido_id: String(p.partido_id), competicion: p.competicion || payload.competicion || "", jornada: p.jornada || "",
    fecha: p.fecha || "", lugar: null, equipo_local: p.equipo_local || "", equipo_visitante: p.equipo_visitante || "",
    pts_local: ent(p.pts_local) ?? 0, pts_visitante: ent(p.pts_visitante) ?? 0,
    parciales: JSON.stringify([
      ...(p.parciales_local || []).map((v, i) => ({ local: ent(v) ?? 0, visitante: ent((p.parciales_visitante || [])[i]) ?? 0 })),
    ]),
    local_id: p.local_id ? String(p.local_id) : null, visitante_id: p.visitante_id ? String(p.visitante_id) : null,
  }));
  db.insertar("partidos", partidos, { reemplazar: true });

  // Estadísticas por jugador y partido.
  const jug = (payload.partidosJugador || []).map((s) => {
    const minutos = s.minutos || "";
    return {
      partido_id: String(s.partido_id), equipo: s.equipo || "", jugador: s.jugador || "", dorsal: String(s.dorsal ?? ""),
      titular: ent(s.titular) ?? 0, minutos, puntos: ent(s.puntos) ?? 0,
      t2_aciertos: ent(s.t2_aciertos) ?? 0, t2_intentos: ent(s.t2_intentos) ?? 0, t2_pct: num(s.t2_pct) ?? 0,
      t3_aciertos: ent(s.t3_aciertos) ?? 0, t3_intentos: ent(s.t3_intentos) ?? 0, t3_pct: num(s.t3_pct) ?? 0,
      tc_aciertos: ent(s.tc_aciertos) ?? 0, tc_intentos: ent(s.tc_intentos) ?? 0, tc_pct: num(s.tc_pct) ?? 0,
      tl_aciertos: ent(s.tl_aciertos) ?? 0, tl_intentos: ent(s.tl_intentos) ?? 0, tl_pct: num(s.tl_pct) ?? 0,
      reb_of: ent(s.reb_of) ?? 0, reb_def: ent(s.reb_def) ?? 0, reb_tot: ent(s.reb_tot) ?? 0,
      asistencias: ent(s.asistencias) ?? 0, recuperaciones: ent(s.recuperaciones) ?? 0, perdidas: ent(s.perdidas) ?? 0,
      tapones_favor: ent(s.tapones_favor) ?? 0, tapones_contra: ent(s.tapones_contra) ?? 0, mates: ent(s.mates) ?? 0,
      faltas_cometidas: ent(s.faltas_cometidas) ?? 0, faltas_recibidas: ent(s.faltas_recibidas) ?? 0,
      valoracion: ent(s.valoracion) ?? 0, mas_menos: ent(s.mas_menos) ?? 0,
      jugador_id: s.jugador_id ? String(s.jugador_id) : null, equipo_id: s.equipo_id ? String(s.equipo_id) : null,
      capitan: null, segundos: aSegundos(minutos), sta: null, ind: null,
    };
  });
  db.insertar("jugador_stats", jug, { reemplazar: true });

  // Tiros de campo (sin tiros libres), con puntos aditivos.
  const idxJug = new Map();
  for (const s of payload.partidosJugador || []) idxJug.set(`${s.partido_id}|${s.equipo}|${s.dorsal}`, [s.jugador_id, s.equipo_id]);
  const tiros = (payload.tiros || []).map((t) => {
    const [jid, eid] = idxJug.get(`${t.partido_id}|${t.equipo}|${t.dorsal}`) || [null, null];
    return {
      partido_id: String(t.partido_id), equipo: t.equipo || "", jugador: t.jugador || "", dorsal: String(t.dorsal ?? ""),
      cuarto: ent(t.cuarto) ?? 1, resultado: t.resultado === "acierto" ? "acierto" : "fallo",
      X: num(t.X) ?? 0, Y: num(t.Y) ?? 0, Xinv: num(t.Xinv) ?? num(t.X) ?? 0, Yinv: num(t.Yinv) ?? num(t.Y) ?? 0,
      fuente: "feb", confianza_deteccion: 1, jugador_id: jid ? String(jid) : null, equipo_id: eid ? String(eid) : null,
      tiempo: null, tiempo_seg: ent(t.tiempo_seg), puntos: puntosDeTiro(num(t.Xinv) ?? num(t.X) ?? 0, num(t.Yinv) ?? num(t.Y) ?? 0),
      evento_uid: null, sesion_uid: null,
    };
  });
  db.insertar("tiros", tiros);

  // Clasificación (básicos + avanzados en JSON).
  const clas = (payload.clasificacion || []).map((c) => ({
    equipo_id: String(c.equipo_id || c.equipo), equipo: c.equipo || "", posicion: ent(c.posicion) ?? ent(c.pos),
    pj: ent(c.pj), pg: ent(c.pg), pp: ent(c.pp), pf: ent(c.pf), pc: ent(c.pc), datos: JSON.stringify(c),
  }));
  db.insertar("directo_clasificacion", clas, { reemplazar: true });

  // Notas e imágenes del paquete.
  if (extras) escribirExtras(db, extras);

  const meta = new Map([
    ["app", "FEBstats Directo"], ["app_version", APP_VERSION], ["db", dbId],
    ["importado", selloLocal()], ["paquete_generado", extras?.generado || ""], ["paquete_version", String(extras?.version || 3)],
    ["competicion", payload.competicion || ""], ["grupo", payload.grupo || ""], ["temporada", payload.temporada || ""],
  ]);
  for (const [k, v] of meta) db.run("INSERT OR REPLACE INTO directo_meta(clave,valor) VALUES(?,?)", [k, String(v)]);
}

export function escribirExtras(db, extras) {
  db.run("DELETE FROM directo_notas");
  db.run("DELETE FROM directo_imagenes");
  const notas = (extras.notas || []).map((n) => ({
    id: String(n.id), titulo: n.titulo || "Sin título", cuerpo: n.cuerpo || "",
    temporada: n.temporada || "", grupo: n.grupo || "", partido: n.partido ? String(n.partido) : "", partido_txt: n.partido_txt || "",
    equipo: n.equipo ? String(n.equipo) : "", equipo_txt: n.equipo_txt || "", jugador: n.jugador ? String(n.jugador) : "", jugador_txt: n.jugador_txt || "",
    creada: n.creada || "", modificada: Number(n.modificada) || 0,
  }));
  db.insertar("directo_notas", notas, { reemplazar: true });
  const imgs = (extras.imagenes || []).filter((i) => i && i.nombre && i.base64).map((i) => ({
    nombre: i.nombre, mime: i.mime || "image/png", datos: base64ABytesSeguro(i.base64),
  }));
  if (imgs.length) db.insertar("directo_imagenes", imgs, { reemplazar: true });
}

function base64ABytesSeguro(b64) {
  try {
    const s = atob(b64);
    const out = new Uint8Array(s.length);
    for (let i = 0; i < s.length; i++) out[i] = s.charCodeAt(i);
    return out;
  } catch { return new Uint8Array(); }
}

// ---------------- consultas ----------------

export function resumenGrupo(db) {
  const g = db.one("SELECT competicion,grupo,temporada FROM grupo_seguido WHERE id=0") || {};
  return {
    competicion: g.competicion || "", grupo: g.grupo || "", temporada: g.temporada || "",
    equipos: db.valor("SELECT COUNT(*) FROM equipos") || 0,
    jugadores: db.valor("SELECT COUNT(*) FROM plantilla") || 0,
    partidos: db.valor("SELECT COUNT(*) FROM partidos WHERE partido_id NOT LIKE 'directo-%'") || 0,
    tiros: db.valor("SELECT COUNT(*) FROM tiros WHERE sesion_uid IS NULL") || 0,
    notas: db.valor("SELECT COUNT(*) FROM directo_notas") || 0,
  };
}

export function equiposDe(db) {
  return db.all("SELECT equipo_id,nombre FROM equipos ORDER BY nombre COLLATE NOCASE");
}

export function equipoIdPorNombre(db, nombre) {
  return db.valor("SELECT equipo_id FROM equipos WHERE nombre=? LIMIT 1", [nombre]);
}

export function listarPartidos(db, { equipoId = "", texto = "", soloOficiales = false } = {}) {
  const cond = [], par = [];
  if (soloOficiales) cond.push("partido_id NOT LIKE 'directo-%'");
  if (equipoId) { cond.push("(local_id=? OR visitante_id=?)"); par.push(equipoId, equipoId); }
  if (texto) { cond.push("(equipo_local LIKE ? OR equipo_visitante LIKE ? OR fecha LIKE ?)"); const t = `%${texto}%`; par.push(t, t, t); }
  return db.all(`SELECT partido_id,fecha,jornada,equipo_local,equipo_visitante,pts_local,pts_visitante,parciales,local_id,visitante_id,
    competicion FROM partidos ${cond.length ? "WHERE " + cond.join(" AND ") : ""} ORDER BY fecha DESC, partido_id DESC`, par);
}

export function plantillaDe(db, equipoId) {
  const filas = db.all(`SELECT p.jugador_id,p.nombre,p.dorsal,p.equipo_feb_id,t.perfil,t.rol,t.partidos,t.minutos_total,t.puntos,t.uso_pct,t.ts_pct,t.datos
    FROM plantilla p LEFT JOIN directo_jugador_temporada t ON t.equipo_id=p.equipo_feb_id AND t.jugador_id=p.jugador_id
    WHERE p.equipo_feb_id=? ORDER BY CAST(NULLIF(p.dorsal,'') AS INTEGER), p.dorsal, p.nombre`, [equipoId]);
  return filas.map((f) => ({ ...f, ...(f.datos ? safeJson(f.datos) : {}) }));
}

function safeJson(t) { try { return JSON.parse(t); } catch { return {}; } }

/** Minutos de los últimos `n` partidos de un equipo, por jugador (para sugerir titulares). */
export function minutosRecientes(db, equipoId, n = 5) {
  const partidos = db.all(`SELECT partido_id FROM partidos WHERE (local_id=? OR visitante_id=?) AND partido_id NOT LIKE 'directo-%' ORDER BY fecha DESC LIMIT ?`, [equipoId, equipoId, n]).map((p) => p.partido_id);
  if (!partidos.length) return new Map();
  const marcas = partidos.map(() => "?").join(",");
  const filas = db.all(`SELECT COALESCE(jugador_id, dorsal) AS clave, SUM(COALESCE(segundos,0)) AS seg, COUNT(*) AS n
    FROM jugador_stats WHERE equipo_id=? AND partido_id IN (${marcas}) GROUP BY clave`, [equipoId, ...partidos]);
  return new Map(filas.map((f) => [String(f.clave), f]));
}

/** Informe de scouting de un equipo a partir del paquete (temporada). */
export function scoutingEquipo(db, equipoId) {
  const fila = db.one("SELECT equipo,posicion,pj,pg,pp,pf,pc,datos FROM directo_clasificacion WHERE equipo_id=?", [equipoId]);
  const clas = fila ? { ...fila, ...safeJson(fila.datos || "{}") } : null;
  const jugadores = db.all(`SELECT nombre,dorsal,puntos,partidos,perfil,rol,uso_pct,ts_pct,minutos_total
    FROM directo_jugador_temporada WHERE equipo_id=? ORDER BY puntos DESC, minutos_total DESC LIMIT 7`, [equipoId]);
  const tiros = db.all(`SELECT Xinv,Yinv,resultado,puntos FROM tiros WHERE equipo_id=? AND Xinv IS NOT NULL AND Yinv IS NOT NULL`, [equipoId]);
  const t2 = tiros.filter((t) => t.puntos === 2), t3 = tiros.filter((t) => t.puntos === 3);
  const a = (l) => l.filter((t) => t.resultado === "acierto").length;
  const partidos = db.all(`SELECT partido_id,fecha,equipo_local,equipo_visitante,pts_local,pts_visitante,local_id,visitante_id
    FROM partidos WHERE (local_id=? OR visitante_id=?) AND partido_id NOT LIKE 'directo-%' ORDER BY fecha DESC LIMIT 5`, [equipoId, equipoId]);
  return {
    clas, jugadores, tiros, partidos,
    resumen: { n: tiros.length, t2i: t2.length, t2a: a(t2), t3i: t3.length, t3a: a(t3), pct2: pct(a(t2), t2.length), pct3: pct(a(t3), t3.length) },
  };
}

export function notasDe(db, { texto = "" } = {}) {
  const cond = texto ? "WHERE (titulo LIKE ? OR cuerpo LIKE ?)" : "";
  const par = texto ? [`%${texto}%`, `%${texto}%`] : [];
  return db.all(`SELECT id,titulo,cuerpo,temporada,grupo,partido,partido_txt,equipo,equipo_txt,jugador,jugador_txt,creada,modificada
    FROM directo_notas ${cond} ORDER BY COALESCE(NULLIF(modificada,0),0) DESC, titulo`, par);
}

export function imagenDe(db, nombre) {
  return db.one("SELECT nombre,mime,datos FROM directo_imagenes WHERE nombre=?", [nombre]);
}

// ---------------- exportación de la sesión ----------------

/**
 * Escribe la sesión en las tablas FEB (partido, boxscore, tiros) y en las tablas directo_*.
 * `proy` viene de model.js; `eventos` es el registro completo (incluidas anulaciones).
 */
export function exportarSesion(db, sesion, proy, eventos, { ahora = selloLocal(), notas = null } = {}) {
  aplicarEsquema(db);
  const partidoId = sesion.partidoId;
  db.transaccion(() => {
    // 1) directo_* de la sesión (idempotente).
    for (const t of ["directo_eventos", "directo_posesiones", "directo_jugadores", "directo_boxscore", "directo_equipo_stats", "directo_tiros"]) {
      db.run(`DELETE FROM ${t} WHERE sesion_uid=?`, [sesion.uid]);
    }
    db.run(`INSERT OR REPLACE INTO directo_sesion(sesion_uid,partido_id,grupo_db,competicion,grupo,temporada,jornada,fecha,
      equipo_local_id,equipo_local,equipo_visitante_id,equipo_visitante,pabellon,estado,cuarto,tipo_periodo,reloj_seg,
      pts_local,pts_visitante,inicio,fin,app_version,creado) VALUES(?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)`, [
      sesion.uid, partidoId, sesion.grupoDb || "", sesion.competicion || "", sesion.grupo || "", sesion.temporada || "",
      sesion.jornada || "", sesion.fecha || "", idEquipoFEB(sesion, "local"), sesion.local?.nombre || "",
      idEquipoFEB(sesion, "visitante"), sesion.visitante?.nombre || "", sesion.pabellon || "", sesion.estado || "en_curso",
      proy.cuarto, proy.tipoPeriodo, proy.reloj, proy.pts.local, proy.pts.visitante, sesion.inicio || "", sesion.fin || null,
      APP_VERSION, sesion.creado || ahora,
    ]);

    const jugadores = [];
    for (const lado of LADOS) {
      const eq = sesion[lado];
      const vistos = new Set();
      for (const j of sesion.jugadores[lado]) {
        if (vistos.has(String(j.dorsal))) continue;
        vistos.add(String(j.dorsal));
        jugadores.push({
          sesion_uid: sesion.uid, equipo_lado: lado, equipo_id: idEquipoFEB(sesion, lado), equipo: eq.nombre,
          jugador_id: j.jugadorId || null, dorsal: String(j.dorsal), nombre: j.nombre, titular: j.titular ? 1 : 0, orden: j.orden ?? null,
        });
      }
    }
    db.insertar("directo_jugadores", jugadores);

    const evs = eventos.filter((e) => !e.soloLocal).map((e) => ({
      uid: e.uid, sesion_uid: sesion.uid, numero: e.n, ts: e.ts, tipo: e.t, cuarto: e.cuarto ?? null,
      tipo_periodo: e.tipoPeriodo ?? null, reloj_seg: e.reloj ?? null, equipo_lado: e.lado ?? null,
      equipo_id: e.equipoId ?? null, equipo: e.equipo ?? null, jugador_id: e.jugadorId ?? null, jugador: e.jugador ?? null,
      dorsal: e.dorsal ?? null, datos: JSON.stringify(e.datos || {}),
    }));
    db.insertar("directo_eventos", evs);

    if (proy.posesiones?.length) {
      db.insertar("directo_posesiones", proy.posesiones.map((p) => ({
        uid: p.uid, sesion_uid: sesion.uid, numero: p.numero, cuarto: p.cuarto, tipo_periodo: p.tipoPeriodo,
        reloj_inicio: p.relojInicio ?? null, reloj_fin: p.relojFin ?? null, equipo_lado: p.lado ?? null,
        equipo_id: p.equipoId ?? null, equipo: p.equipo ?? null, resultado: p.resultado ?? null,
        puntos: p.puntos || 0, evento_uid: p.eventoUid ?? null, ts: p.ts ?? null,
      })));
    }

    // 2) Boxscore en directo, en tablas propias. NO se sobrescriben las tablas FEB del partido oficial:
    //    así el .db conserva el acta original y `importar_directo` lee solo este namespace.
    const filasBox = [], filasEq = [];
    for (const lado of LADOS) {
      const eq = sesion[lado];
      const vistos = new Set();
      for (const j of sesion.jugadores[lado]) {
        const dorsal = String(j.dorsal);
        if (vistos.has(dorsal)) continue;
        vistos.add(dorsal);
        const st = proy.jugadores[lado][dorsal] || statsVacias();
        filasBox.push({
          sesion_uid: sesion.uid, equipo_lado: lado, equipo_id: idEquipoFEB(sesion, lado), equipo: eq.nombre,
          jugador_id: j.jugadorId || null, dorsal, nombre: j.nombre, titular: j.titular ? 1 : 0,
          ...columnasJugador(st),
        });
      }
      filasEq.push({
        sesion_uid: sesion.uid, equipo_lado: lado, equipo_id: idEquipoFEB(sesion, lado), equipo: eq.nombre,
        ...columnasEquipo(proy.equipos[lado]),
      });
    }
    db.insertar("directo_boxscore", filasBox);
    db.insertar("directo_equipo_stats", filasEq);

    // 3) Tiros en directo en `tiros` (columnas aditivas). Solo se sustituyen los de ESTA sesión.
    db.run("DELETE FROM tiros WHERE sesion_uid=?", [sesion.uid]);
    const filasT = [], filasDT = [];
    for (const lado of LADOS) {
      const eq = sesion[lado];
      for (const t of proy.tiros.filter((x) => x.lado === lado && x.Xinv != null && x.Yinv != null)) {
        filasT.push({
          partido_id: partidoId, equipo: nombreEquipoFEB(sesion, lado), jugador: t.nombre, dorsal: t.dorsal, cuarto: t.cuarto,
          resultado: t.resultado, X: t.X, Y: t.Y, Xinv: t.Xinv, Yinv: t.Yinv, fuente: "directo", confianza_deteccion: 1,
          jugador_id: t.jugadorId || null, equipo_id: idEquipoFEB(sesion, lado), tiempo: segAMinutos(t.tiempoRestante),
          tiempo_seg: Math.round(t.tiempoRestante), puntos: t.puntos, evento_uid: t.eventoUid || t.uid, sesion_uid: sesion.uid,
        });
        filasDT.push({
          sesion_uid: sesion.uid, evento_uid: t.eventoUid || t.uid, equipo_lado: lado, partido_id: partidoId,
          equipo: eq.nombre, equipo_id: idEquipoFEB(sesion, lado), jugador: t.nombre, jugador_id: t.jugadorId || null,
          dorsal: t.dorsal, cuarto: t.cuarto, resultado: t.resultado, X: t.X, Y: t.Y, Xinv: t.Xinv, Yinv: t.Yinv,
          puntos: t.puntos, tiempo_seg: Math.round(t.tiempoRestante),
        });
      }
    }
    db.insertar("tiros", filasT);
    db.insertar("directo_tiros", filasDT);

    // 4) Notas editables (todas las del dispositivo) en directo_notas.
    if (notas !== null) {
      db.run("DELETE FROM directo_notas");
      const filasNotas = notas.map((n) => ({
        id: String(n.id || ""), titulo: n.titulo || "", cuerpo: n.cuerpo || "",
        temporada: n.temporada || "", grupo: n.grupo || "",
        partido: n.partido || "", partido_txt: n.partido_txt || "",
        equipo: n.equipo || "", equipo_txt: n.equipo_txt || "",
        jugador: n.jugador || "", jugador_txt: n.jugador_txt || "",
        creada: n.creada || "", modificada: Number(n.modificada) || 0,
      }));
      if (filasNotas.length) db.insertar("directo_notas", filasNotas);
    }

    // 5) Si es un amistoso (o el partido no estaba en la base), se añade a las tablas FEB.
    escribirPartidoFEB(db, sesion, proy);

    // 6) Metadatos de exportación.
    for (const [k, v] of [
      ["exportado", ahora], ["sesion_uid", sesion.uid], ["esquema_directo", "1"],
      ["partido_id", partidoId], ["app_version", APP_VERSION],
      ["parciales", JSON.stringify(proy.periodos.map((p) => ({ cuarto: p.n, local: p.pts.local, visitante: p.pts.visitante })))],
    ]) db.run("INSERT OR REPLACE INTO directo_meta(clave,valor) VALUES(?,?)", [k, String(v)]);
  });
  return db.bytes();
}

function columnasJugador(s) {
  return {
    minutos: segAMinutos(s.segundos), segundos: Math.round(s.segundos), puntos: s.puntos,
    t2_aciertos: s.t2a, t2_intentos: s.t2i, t2_pct: pct(s.t2a, s.t2i),
    t3_aciertos: s.t3a, t3_intentos: s.t3i, t3_pct: pct(s.t3a, s.t3i),
    tc_aciertos: s.t2a + s.t3a, tc_intentos: s.t2i + s.t3i, tc_pct: pct(s.t2a + s.t3a, s.t2i + s.t3i),
    tl_aciertos: s.tla, tl_intentos: s.tli, tl_pct: pct(s.tla, s.tli),
    reb_of: s.rebOf, reb_def: s.rebDef, reb_tot: s.rebOf + s.rebDef,
    asistencias: s.asistencias, recuperaciones: s.recuperaciones, perdidas: s.perdidas,
    tapones_favor: s.taponesFavor, tapones_contra: s.taponesContra, mates: s.mates,
    faltas_cometidas: s.faltas, faltas_recibidas: s.faltasRecibidas, valoracion: valoracion(s), mas_menos: s.masMenos,
  };
}

function columnasEquipo(st) {
  return {
    minutos: segAMinutos(st.segundos), segundos: Math.round(st.segundos), acciones_equipo: JSON.stringify(st.acciones || {}),
    tl_aciertos: st.tla, tl_intentos: st.tli, tl_pct: pct(st.tla, st.tli),
    t2_aciertos: st.t2a, t2_intentos: st.t2i, t2_pct: pct(st.t2a, st.t2i),
    t3_aciertos: st.t3a, t3_intentos: st.t3i, t3_pct: pct(st.t3a, st.t3i),
    tc_aciertos: st.t2a + st.t3a, tc_intentos: st.t2i + st.t3i, tc_pct: pct(st.t2a + st.t3a, st.t2i + st.t3i),
    asistencias: st.asistencias, tapones_favor: st.taponesFavor, tapones_contra: st.taponesContra, mates: st.mates,
    reb_of: st.rebOf, reb_def: st.rebDef, reb_tot: st.rebOf + st.rebDef,
    faltas_cometidas: st.faltas, faltas_recibidas: st.faltasRecibidas, perdidas: st.perdidas, recuperaciones: st.recuperaciones,
    valoracion: st.valoracion ?? valoracion(st), puntos: st.puntos,
  };
}

function escribirPartidoFEB(db, sesion, proy) {
  const pid = sesion.partidoId;
  const existe = db.one("SELECT partido_id FROM partidos WHERE partido_id=?", [pid]);
  // Partido oficial ya presente: el acta de la FEB no se toca. El directo va en directo_*.
  if (sesion.oficial && existe) return;

  const parciales = proy.periodos.map((p) => ({ local: p.pts.local, visitante: p.pts.visitante }));
  if (existe) {
    db.run(`UPDATE partidos SET pts_local=?,pts_visitante=?,parciales=?,estado=?,cuartos=?,datos_v=? WHERE partido_id=?`, [
      proy.pts.local, proy.pts.visitante, JSON.stringify(parciales), proy.estado === "final" ? "Final" : "En juego",
      proy.periodos.length, 2, pid,
    ]);
  } else {
    db.run(`INSERT INTO partidos(partido_id,competicion,jornada,fecha,lugar,equipo_local,equipo_visitante,pts_local,pts_visitante,
      parciales,local_id,visitante_id,estado,cuartos,datos_v) VALUES(?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)`, [
      pid, sesion.competicion || "", sesion.jornada || "", sesion.fecha || selloLocal().slice(0, 16), null,
      sesion.local.nombre, sesion.visitante.nombre, proy.pts.local, proy.pts.visitante, JSON.stringify(parciales),
      idEquipoFEB(sesion, "local"), idEquipoFEB(sesion, "visitante"), proy.estado === "final" ? "Final" : "En juego",
      proy.periodos.length, 2,
    ]);
  }

  for (const t of ["jugador_stats", "equipo_stats"]) db.run(`DELETE FROM ${t} WHERE partido_id=?`, [pid]);
  const filasJ = [], filasE = [];
  for (const lado of LADOS) {
    const eq = sesion[lado];
    const vistos = new Set();
    for (const j of sesion.jugadores[lado]) {
      const dorsal = String(j.dorsal);
      if (vistos.has(dorsal)) continue;
      vistos.add(dorsal);
      const st = proy.jugadores[lado][dorsal] || statsVacias();
      filasJ.push({
        partido_id: pid, equipo: nombreEquipoFEB(sesion, lado), jugador: j.nombre, dorsal, titular: j.titular ? 1 : 0,
        ...columnasJugador(st), jugador_id: j.jugadorId || null, equipo_id: idEquipoFEB(sesion, lado),
        capitan: null, sta: null, ind: null,
      });
    }
    const st = proy.equipos[lado];
    filasE.push({
      partido_id: pid, equipo: nombreEquipoFEB(sesion, lado), equipo_id: idEquipoFEB(sesion, lado), indice: null,
      ...columnasEquipo(st),
      contraataque: null, pts_tras_perdida: null, pts_segunda_oportunidad: null, pts_banquillo: null, pts_pintura: null,
      faltas: st.faltas,
      ea_reb_of: null, ea_reb_def: null, ea_reb_tot: null, ea_faltas_cometidas: null, ea_faltas_recibidas: null,
      ea_perdidas: null, ea_recuperaciones: null,
    });
  }
  db.insertar("jugador_stats", filasJ);
  db.insertar("equipo_stats", filasE);
}

export function statsVacias() {
  return {
    segundos: 0, puntos: 0, t2a: 0, t2i: 0, t3a: 0, t3i: 0, tla: 0, tli: 0, rebOf: 0, rebDef: 0,
    asistencias: 0, recuperaciones: 0, perdidas: 0, taponesFavor: 0, taponesContra: 0, mates: 0, faltas: 0, faltasRecibidas: 0,
    masMenos: 0,
  };
}
export const pct = (a, i) => (i ? Math.round((1000 * a) / i) / 10 : 0);
export function segAMinutos(seg) {
  const s = Math.max(0, Math.round(seg));
  return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, "0")}`;
}
export function valoracion(s) {
  return (s.puntos + (s.rebOf + s.rebDef) + s.asistencias + s.recuperaciones + s.taponesFavor + s.faltasRecibidas)
    - ((s.t2i - s.t2a) + (s.t3i - s.t3a) + (s.tli - s.tla) + s.perdidas + s.taponesContra);
}

export function blobGrupo(db) { return bytesABlob(db.bytes()); }
export { nuevoUid };
