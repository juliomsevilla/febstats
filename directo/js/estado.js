// Estado de la aplicación: grupos importados, sesión en directo, reloj y registro de eventos.
// La fuente de verdad de una sesión es el registro append-only de IndexedDB; todo lo demás se
// reconstruye con proyectar().
import { idb } from "./idb.js";
import { DB, blobABytes, bytesABlob } from "./sqlite.js";
import { aplicarEsquema } from "./schema.js";
import { APP_VERSION, DURACION, resumenGrupo } from "./grupo.js";
import { sembrarNotasDesdeGrupo, notaDeSesion, tituloDeNota } from "./notas-modelo.js";
import { proyectar, relojAhora } from "./model.js";
import { uid, selloLocal } from "./util.js";

export { relojAhora };

export const app = {
  grupos: [],
  sesiones: [],
  grupo: null,        // DB de sql.js activa
  grupoId: null,
  sesion: null,
  eventos: [],
  proy: null,
  ladoAtaque: "local",
  seleccion: null,    // {lado, dorsal}
  escuchas: new Set(),
  guardando: false,
  errorGrupo: "",
};

export const etiquetaPeriodo = (p) => {
  const n = p?.cuarto ?? 1;
  if ((p?.tipoPeriodo || "regular") === "prorroga") return `PR${Math.max(1, n - 4)}`;
  return `${n}C`;
};

export function avisar(fn) { for (const f of app.escuchas) { try { f(); } catch (e) { console.error(e); } } }
export function suscribir(fn) { app.escuchas.add(fn); return () => app.escuchas.delete(fn); }

export async function cargarTodo() {
  app.grupos = (await idb.todos("grupos")).sort((a, b) => String(b.importado).localeCompare(String(a.importado)));
  app.sesiones = (await idb.todos("sesiones")).sort((a, b) => String(b.creado).localeCompare(String(a.creado)));
  if (!app.grupo && app.grupos.length) {
    try { await abrirGrupo(app.grupos[0].id); } catch (e) { app.errorGrupo = e.message; }
  }
  if (app.grupo) {
    const r = app.grupos.find((g) => g.id === app.grupoId)?.resumen || {};
    try { await sembrarNotasDesdeGrupo(app.grupo, { grupo: app.grupoId, temporada: r.temporada }); } catch (e) { console.error(e); }
  }
  try { await migrarNotasEventos(); } catch (e) { console.error(e); }
  avisar();
}

/** Crea (o reutiliza) un grupo vacío para empezar a anotar sin importar datos FEB. */
export async function crearGrupoSinDatos() {
  const id = "grupo_sin_datos.db";
  if (await idb.get("grupos", id)) { await abrirGrupo(id); return id; }
  const db = await DB.nuevo();
  aplicarEsquema(db);
  db.run("INSERT OR REPLACE INTO grupo_seguido(id,competicion,grupo,temporada) VALUES(0,?,?,?)", ["AMISTOSO", "Sin datos", ""]);
  for (const [k, v] of [["app", "FEBstats Directo"], ["app_version", APP_VERSION], ["esquema_directo", "1"], ["creado", selloLocal()]]) {
    db.run("INSERT OR REPLACE INTO directo_meta(clave,valor) VALUES(?,?)", [k, String(v)]);
  }
  const resumen = { ...resumenGrupo(db), sinDatos: true };
  await guardarGrupoEnIDB(id, db, resumen, "");
  app.grupo = db;
  app.grupoId = id;
  avisar();
  return id;
}

/** Migración única: las notas antiguas vivían como eventos `nota`; pasan al store editable. */
async function migrarNotasEventos() {
  if (await idb.get("meta", "notas_eventos_migradas")) return;
  for (const s of app.sesiones) {
    let evs = [];
    try { evs = await idb.porIndice("eventos", "sesion", s.id); } catch { continue; }
    for (const e of evs) {
      if (e.t !== "nota" || !e.datos?.texto) continue;
      const id = `ev:${e.uid}`;
      if (await idb.get("notas", id)) continue;
      const lado = e.lado || null;
      const jugador = lado ? (s.jugadores[lado] || []).find((j) => j.dorsal === String(e.dorsal)) : null;
      const n = notaDeSesion(s, { cuerpo: e.datos.texto, lado, jugador });
      n.id = id;
      n.titulo = tituloDeNota(n);
      n.creada = selloLocal(new Date(e.ts || Date.now()));
      n.modificada = Number(e.ts) || Date.now();
      n.origen = "local";
      await idb.put("notas", n);
    }
  }
  await idb.put("meta", { clave: "notas_eventos_migradas", valor: "1" });
}

export async function guardarGrupoEnIDB(id, db, resumen, paqueteId = "") {
  const registro = {
    id, resumen, paqueteId, importado: selloLocal(), actualizado: selloLocal(),
    bytes: bytesABlob(db.bytes()),
  };
  await idb.put("grupos", registro);
  const i = app.grupos.findIndex((g) => g.id === id);
  if (i >= 0) app.grupos[i] = registro; else app.grupos.unshift(registro);
  // Si se reimporta el grupo activo, la instancia en memoria debe ser la nueva.
  if (app.grupoId === id && app.grupo !== db) app.grupo = db;
  avisar();
  return registro;
}

export async function abrirGrupo(id) {
  if (app.grupo && app.grupoId === id) return app.grupo;
  const registro = await idb.get("grupos", id);
  if (!registro) throw new Error("Ese grupo ya no está en el iPad.");
  const db = await DB.desdeBytes(await blobABytes(registro.bytes));
  aplicarEsquema(db);
  app.grupo = db;
  app.grupoId = id;
  return db;
}

export function metaGrupoActual() {
  // Se recalcula desde la base: así el contador del grupo no incluye los partidos
  // amistosos ni los tiros del directo que se van añadiendo al exportar.
  if (app.grupo) return resumenGrupo(app.grupo);
  const r = app.grupos.find((g) => g.id === app.grupoId);
  return r?.resumen || {};
}

// ---------------- sesiones ----------------

export function jugadoresVacios() {
  return [];
}

/**
 * Crea una sesión local. `local` y `visitante` = {equipoId, nombre, jugadores:[{dorsal,nombre,jugadorId,titular,orden}]}.
 */
export async function nuevaSesion({ grupoId, partido = null, local, visitante, competicion = "", grupo = "", temporada = "", jornada = "", fecha = "", pabellon = "" }) {
  const id = uid("ses");
  const sesion = {
    id, uid: id, grupoId, grupoDb: grupoId,
    partidoId: partido?.partido_id || `directo-${id}`,
    oficial: !!partido?.partido_id,
    competicion, grupo, temporada, jornada: jornada || partido?.jornada || "", fecha: fecha || partido?.fecha || "",
    pabellon,
    local: { equipoId: local.equipoId || null, nombre: local.nombre },
    visitante: { equipoId: visitante.equipoId || null, nombre: visitante.nombre },
    jugadores: {
      local: normalizarJugadores(local.jugadores),
      visitante: normalizarJugadores(visitante.jugadores),
    },
    estado: "en_curso", inicio: selloLocal(), fin: null, creado: selloLocal(),
    reloj: { cuarto: 1, tipoPeriodo: "regular", reloj: DURACION.regular, corriendo: false, desde: null },
    ladoAtaque: "local", ultimoN: 0, version: 1,
  };
  await idb.put("sesiones", sesion);
  app.sesiones.unshift(sesion);
  await cargarSesion(id);
  await agregar("inicio", { datos: { app: "FEBstats Directo" } });
  await iniciarPeriodo(1, "regular", { silencioso: true, posesion: false });
  await agregar("posesion", { lado: "local" });
  return sesion;
}

function normalizarJugadores(lista) {
  const vistos = new Set();
  return (lista || []).map((j, i) => ({
    dorsal: String(j.dorsal ?? "").trim(),
    nombre: String(j.nombre || `#${j.dorsal}`).trim(),
    jugadorId: j.jugadorId ? String(j.jugadorId) : null,
    titular: !!j.titular,
    orden: j.orden ?? i,
  })).filter((j) => j.dorsal && !vistos.has(j.dorsal) && vistos.add(j.dorsal));
}

export async function cargarSesion(id) {
  const s = await idb.get("sesiones", id);
  if (!s) throw new Error("Esa sesión ya no existe.");
  // El reloj no sigue corriendo entre aperturas: se guarda el valor y se queda parado.
  // Así cerrar la app no descuenta minutos de partido.
  if (s.reloj?.corriendo && !app.soloConsulta) {
    s.reloj = { ...s.reloj, reloj: Math.max(0, Number(s.reloj.reloj) || 0), corriendo: false, desde: null };
    await idb.put("sesiones", s);
  }
  app.sesion = s;
  try { localStorage.setItem("fd:sesion", id); } catch { /* modo privado */ }
  app.ladoAtaque = s.ladoAtaque || "local";
  app.seleccion = null;
  app.eventos = (await idb.porIndice("eventos", "sesion", id)).sort((a, b) => a.n - b.n);
  if (app.grupoId !== s.grupoId) { try { await abrirGrupo(s.grupoId); } catch (e) { app.errorGrupo = e.message; } }
  reproyectar();
  avisar();
  return s;
}

export function reproyectar() {
  if (!app.sesion) { app.proy = null; return null; }
  app.proy = proyectar(app.sesion, app.eventos);
  return app.proy;
}

export async function guardarSesion() {
  if (!app.sesion) return;
  const s = app.sesion;
  s.ladoAtaque = app.ladoAtaque;
  if (s.reloj.corriendo) s.reloj = { ...s.reloj, reloj: Math.max(0, Math.round(relojAhora(s.reloj) * 10) / 10), desde: Date.now() };
  if (app.proy) s.resumen = {
    ptsLocal: app.proy.pts.local, ptsVisitante: app.proy.pts.visitante,
    cuarto: s.reloj.cuarto, tipoPeriodo: s.reloj.tipoPeriodo, reloj: relojAhora(s.reloj),
    estado: s.estado, tiros: app.proy.tiros.length,
  };
  await idb.put("sesiones", s);
  const i = app.sesiones.findIndex((x) => x.id === s.id);
  if (i >= 0) app.sesiones[i] = s; else app.sesiones.unshift(s);
}

/** Añade un evento al registro y reproyecta. */
export async function agregar(t, payload = {}) {
  if (!app.sesion) throw new Error("No hay sesión abierta.");
  const s = app.sesion;
  const reloj = Math.round(relojAhora(s.reloj) * 10) / 10;
  const lado = payload.lado ?? (payload.dorsal != null ? app.seleccion?.lado : null) ?? null;
  const eq = lado ? s[lado] : null;
  const jugador = lado && payload.dorsal != null ? s.jugadores[lado].find((j) => j.dorsal === String(payload.dorsal)) : null;
  const ev = {
    uid: payload.uid || uid("ev"), sesion: s.id, n: ++s.ultimoN, ts: Date.now(), t,
    cuarto: s.reloj.cuarto, tipoPeriodo: s.reloj.tipoPeriodo, reloj,
    lado: lado || null,
    equipoId: eq?.equipoId || null, equipo: eq?.nombre || null,
    jugadorId: payload.jugadorId ?? jugador?.jugadorId ?? null,
    jugador: payload.jugador ?? jugador?.nombre ?? null,
    dorsal: payload.dorsal != null ? String(payload.dorsal) : null,
    datos: payload.datos || {},
  };
  await idb.put("eventos", ev);
  app.eventos.push(ev);
  reproyectar();
  await guardarSesion();
  avisar();
  return ev;
}

function anulados() {
  return new Set(app.eventos.filter((e) => e.t === "anulacion" && e.datos?.ref).map((e) => e.datos.ref));
}

export async function deshacer() {
  const anul = anulados();
  const saltar = new Set(["anulacion", "reloj", "posesion"]);
  const ultimo = [...app.eventos].reverse().find((e) => !saltar.has(e.t) && !anul.has(e.uid) && !e.soloLocal);
  if (!ultimo) return false;
  await agregar("anulacion", { uid: uid("anu"), datos: { ref: ultimo.uid, tipo: ultimo.t } });
  return true;
}

export async function borrarSesion(id) {
  await idb.borrarSesion(id);
  app.sesiones = app.sesiones.filter((s) => s.id !== id);
  if (app.sesion?.id === id) {
    app.sesion = null; app.proy = null; app.eventos = [];
    try { localStorage.removeItem("fd:sesion"); } catch { /* nada */ }
  }
  avisar();
}

// ---------------- reloj ----------------

export function relojActual() { return relojAhora(app.sesion.reloj); }

export async function iniciarReloj() {
  const s = app.sesion;
  if (!s || s.estado === "final" || s.reloj.corriendo) return;
  if (relojAhora(s.reloj) <= 0) return;
  s.reloj = { ...s.reloj, corriendo: true, desde: Date.now() };
  await agregar("reloj", { datos: { accion: "iniciar", valor: s.reloj.reloj } });
}

export async function pararReloj({ automatico = false } = {}) {
  const s = app.sesion;
  if (!s || !s.reloj.corriendo) return;
  const v = relojAhora(s.reloj);
  s.reloj = { ...s.reloj, corriendo: false, reloj: Math.max(0, Math.round(v * 10) / 10), desde: null };
  await agregar("reloj", { datos: { accion: automatico ? "fin_tiempo" : "parar", valor: s.reloj.reloj } });
}

export async function ajustarReloj(delta) {
  const s = app.sesion;
  if (!s) return;
  const v = Math.min(DURACION[s.reloj.tipoPeriodo] || DURACION.regular, Math.max(0, Math.round((relojAhora(s.reloj) + delta) * 10) / 10));
  s.reloj = { ...s.reloj, reloj: v, desde: s.reloj.corriendo ? Date.now() : null };
  await agregar("reloj", { datos: { accion: "ajuste", delta, valor: v } });
}

export async function iniciarPeriodo(cuarto, tipoPeriodo = "regular", { silencioso = false, posesion = true } = {}) {
  const s = app.sesion;
  const dur = DURACION[tipoPeriodo] || DURACION.regular;
  s.reloj = { cuarto, tipoPeriodo, reloj: dur, corriendo: false, desde: null };
  s.estado = "en_curso";
  await agregar("periodo", { datos: { accion: "inicio", cuarto, tipoPeriodo, duracion: dur, silencioso } });
  if (posesion) await agregar("posesion", { lado: app.ladoAtaque });
}

export async function finPeriodo({ descanso = false } = {}) {
  const s = app.sesion;
  if (!s) return;
  if (s.reloj.corriendo) await pararReloj();
  await agregar("periodo", { datos: { accion: "fin", cuarto: s.reloj.cuarto, tipoPeriodo: s.reloj.tipoPeriodo } });
  if (descanso) { s.estado = "descanso"; await guardarSesion(); avisar(); }
}

export async function finalizar() {
  const s = app.sesion;
  if (!s) return;
  if (s.reloj.corriendo) await pararReloj();
  const empate = app.proy && app.proy.pts.local === app.proy.pts.visitante;
  await agregar("final", { datos: { empate } });
  s.estado = "final"; s.fin = selloLocal();
  await guardarSesion(); reproyectar(); avisar();
}

export function siguientePeriodo() {
  const s = app.sesion;
  if (!s) return { cuarto: 1, tipoPeriodo: "regular" };
  const n = s.reloj.cuarto + 1;
  return { cuarto: n, tipoPeriodo: n > 4 ? "prorroga" : "regular" };
}

// ---------------- posesión ----------------

export async function cambiarAtaque(lado, { registrar = true } = {}) {
  if (!app.sesion || (lado !== "local" && lado !== "visitante")) return;
  if (registrar && app.ladoAtaque === lado) return;
  app.ladoAtaque = lado;
  app.sesion.ladoAtaque = lado;
  if (registrar) await agregar("posesion", { lado });
  else await guardarSesion();
  avisar();
}

export async function cambiarAtaqueSi(cond) {
  if (!cond) return;
  const otro = app.ladoAtaque === "local" ? "visitante" : "local";
  await cambiarAtaque(otro);
}

// ---------------- exportación ----------------

export async function exportarSesionActual() {
  if (!app.sesion) throw new Error("No hay sesión abierta.");
  const { exportarSesion } = await import("./grupo.js");
  const db = app.grupo && app.grupoId === app.sesion.grupoId ? app.grupo : await abrirGrupo(app.sesion.grupoId);
  // Ajusta el reloj real antes de proyectar para que los minutos cuadren.
  if (app.sesion.reloj.corriendo) {
    app.sesion.reloj.reloj = Math.max(0, Math.round(relojAhora(app.sesion.reloj) * 10) / 10);
    app.sesion.reloj.desde = Date.now();
  }
  reproyectar();
  await guardarSesion();
  const notas = await idb.todos("notas");
  const bytes = exportarSesion(db, app.sesion, app.proy, app.eventos, { notas });
  // Persiste el grupo con el snapshot (los datos importados + directo_* de esta sesión).
  await guardarGrupoEnIDB(app.sesion.grupoId, db, metaGrupoActual(), "");
  return bytes;
}

export function nombreArchivoExport(sesion = app.sesion) {
  const limpiar = (t) => String(t || "").normalize("NFD").replace(/[\u0300-\u036f]/g, "").replace(/[^a-zA-Z0-9]+/g, "_").replace(/^_+|_+$/g, "").slice(0, 40);
  const base = sesion.oficial ? String(sesion.partidoId) : `amistoso_${limpiar(sesion.local?.nombre)}_${limpiar(sesion.visitante?.nombre)}`;
  return `directo_${limpiar(base).slice(0, 60)}_${sesion.id.slice(-6)}.db`;
}
