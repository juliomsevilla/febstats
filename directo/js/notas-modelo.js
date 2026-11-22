// Notas editables: misma idea que FEBstats. Cada nota guarda título, cuerpo Markdown y
// vinculación opcional con temporada/grupo, partido, equipo y jugador (id + texto legible).
// Viven en IndexedDB (store `notas`) y se exportan a `directo_notas` en el .db.
import { idb } from "./idb.js";
import { uid, selloLocal } from "./util.js";
import { notasDe } from "./grupo.js";

export const CAMPOS = ["titulo", "cuerpo", "temporada", "grupo", "partido", "partido_txt", "equipo", "equipo_txt", "jugador", "jugador_txt"];

const s = (v) => String(v ?? "").trim();
const num = (v) => (Number.isFinite(Number(v)) ? Number(v) : 0);

export function tituloDeNota(n) {
  const t = s(n.titulo);
  if (t) return t;
  for (const linea of String(n.cuerpo || "").split("\n")) {
    const l = linea.trim();
    if (l.startsWith("# ")) return l.slice(2).trim() || "Nota";
    if (l && !l.startsWith("![") && !l.startsWith("```")) return l.slice(0, 80);
  }
  return "Nota";
}

export function notaNueva(seed = {}) {
  return {
    id: "", titulo: "", cuerpo: "", temporada: "", grupo: "", partido: "", partido_txt: "",
    equipo: "", equipo_txt: "", jugador: "", jugador_txt: "",
    creada: selloLocal(), modificada: Date.now(), origen: "local",
    ...seed,
  };
}

export async function listarNotas() {
  const filas = await idb.todos("notas");
  return filas.sort((a, b) => num(b.modificada) - num(a.modificada) || tituloDeNota(a).localeCompare(tituloDeNota(b), "es"));
}

let canal;
function obtenerCanal() {
  if (canal === undefined) {
    try { canal = typeof BroadcastChannel !== "undefined" ? new BroadcastChannel("fd-notas") : null; } catch { canal = null; }
  }
  return canal;
}
export function avisarCambioNotas() { try { obtenerCanal()?.postMessage({ tipo: "cambio" }); } catch { /* nada */ } }
export function suscribirNotas(fn) {
  const c = obtenerCanal();
  if (!c) return () => {};
  const oyente = () => fn();
  c.addEventListener("message", oyente);
  return () => c.removeEventListener("message", oyente);
}

export async function guardarNota(n) {
  const out = {
    ...notaNueva(),
    ...n,
    id: n.id || uid("nota"),
    titulo: tituloDeNota(n),
    cuerpo: String(n.cuerpo || ""),
    temporada: s(n.temporada), grupo: s(n.grupo),
    partido: s(n.partido), partido_txt: s(n.partido_txt),
    equipo: s(n.equipo), equipo_txt: s(n.equipo_txt),
    jugador: s(n.jugador), jugador_txt: s(n.jugador_txt),
    creada: s(n.creada) || selloLocal(),
    modificada: Date.now(),
    origen: n.origen || "local",
  };
  await idb.put("notas", out);
  avisarCambioNotas();
  return out;
}

export async function borrarNota(id) {
  await idb.del("notas", id);
  avisarCambioNotas();
}

async function sembrarUna(n, fallback) {
  const id = n.id ? (String(n.id).startsWith("pkg:") ? String(n.id) : `pkg:${n.id}`) : `pkg:${n.titulo || "nota"}:${n.creada || ""}`;
  if (await idb.get("notas", id)) return false;
  await idb.put("notas", {
    id,
    titulo: s(n.titulo) || tituloDeNota(n),
    cuerpo: String(n.cuerpo || ""),
    temporada: s(n.temporada) || s(fallback.temporada),
    grupo: s(n.grupo) || s(fallback.grupo),
    partido: s(n.partido), partido_txt: s(n.partido_txt),
    equipo: s(n.equipo), equipo_txt: s(n.equipo_txt),
    jugador: s(n.jugador), jugador_txt: s(n.jugador_txt),
    creada: s(n.creada) || selloLocal(),
    modificada: num(n.modificada) || Date.now(),
    origen: "paquete",
  });
  return true;
}

export async function sembrarNotasPaquete(notas, fallback = {}) {
  let n = 0;
  for (const nota of notas || []) if (await sembrarUna(nota, fallback)) n++;
  return n;
}

/** Migración: las notas que ya estaban en directo_notas del grupo pasan al store editable. */
export async function sembrarNotasDesdeGrupo(db, fallback = {}) {
  if (!db) return 0;
  let filas = [];
  try { filas = notasDe(db); } catch { return 0; }
  let n = 0;
  for (const nota of filas) if (await sembrarUna(nota, fallback)) n++;
  return n;
}

/** Nota rápida vinculada al partido (y al jugador/equipo seleccionado, si lo hay). */
export function notaDeSesion(sesion, { cuerpo = "", lado = null, jugador = null } = {}) {
  const eq = lado ? sesion[lado] : null;
  return notaNueva({
    cuerpo,
    temporada: sesion?.temporada || "",
    grupo: sesion?.grupo || "",
    partido: sesion?.partidoId || "",
    partido_txt: sesion ? `${sesion.local.nombre} vs ${sesion.visitante.nombre}` : "",
    equipo: eq?.equipoId || "",
    equipo_txt: eq?.nombre || "",
    jugador: jugador?.jugadorId || "",
    jugador_txt: jugador?.nombre || "",
  });
}

// ---------------- enlaces entre notas: [[Título]] y [[nota:ID|Título]] (como en FEBstats para Mac) ----------------

export const plegar = (t) => String(t ?? "").normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase().trim();
const RE_WIKI = /\[\[([^\]\n|]+)(?:\|([^\]\n]+))?\]\]/g;

/** Destinos de los [[…]] de un cuerpo (sin duplicados). */
export function enlacesDeNota(cuerpo) {
  return [...new Set([...String(cuerpo || "").matchAll(RE_WIKI)].map((m) => m[1].trim()))];
}

/** Nota a la que apunta un enlace: por id (`nota:ID`) o por título sin distinguir mayúsculas ni tildes. */
export function resolverNota(notas, nombre) {
  const t = String(nombre ?? "").trim();
  const id = t.match(/^nota:(.+)$/);
  if (id) return notas.find((n) => String(n.id) === id[1]) || null;
  const q = plegar(t);
  if (!q) return null;
  return notas.find((n) => plegar(tituloDeNota(n)) === q) || null;
}

/** Texto que se escribe dentro de [[…]] para enlazar a una nota: el título, o `nota:ID|Título` si hay títulos repetidos. */
export function refDeNota(notas, n) {
  const t = tituloDeNota(n);
  const repetido = notas.filter((m) => plegar(tituloDeNota(m)) === plegar(t)).length > 1;
  return repetido ? `nota:${n.id}|${t.replace(/[\[\]|]/g, "")}` : t.replace(/[\[\]|]/g, "");
}

/** Notas que enlazan a `n` (enlaces inversos, calculados al vuelo). */
export function enlazanA(notas, n) {
  return notas.filter((m) => m.id !== n.id && enlacesDeNota(m.cuerpo).some((e) => resolverNota(notas, e)?.id === n.id));
}
