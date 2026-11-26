// Sistema de enlaces entre elementos (versión de la interfaz; la del asistente es desktop/src-tauri/src/enlaces.rs, misma lógica).
// Dos ideas y nada más:
//  1. Contexto común: todo documento (nota, jugada, vídeo, marca) lleva {partido, equipo, jugador} (ids de la FEB + su texto).
//     Dos documentos están relacionados si comparten partido (peso 3), jugador (2) o equipo (1).
//  2. Menciones: [[nota]], [[jugada:12|texto]], [[marca:3]] dentro de cualquier texto Markdown. Las inversas («enlazan aquí»)
//     se calculan escaneando los textos: no hay tabla de enlaces que mantener.
import { invoke } from "./api.js";

const plegar = (s) => String(s || "").normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLowerCase();

/** ¿Es el mismo elemento? Con ids a ambos lados se comparan los ids; si falta alguno (datos antiguos), el texto sin acentos. */
export function igual(ai, at, bi, bt) {
  if (ai && bi) return ai === bi;
  return !!(at && bt) && plegar(at) === plegar(bt);
}

/** Peso y motivos de la relación entre dos contextos. */
export function puntuar(a, b) {
  let p = 0; const motivos = [];
  if (igual(a.partido, a.partido_txt, b.partido, b.partido_txt)) { p += 3; motivos.push("mismo partido"); }
  if (igual(a.jugador, a.jugador_txt, b.jugador, b.jugador_txt)) { p += 2; motivos.push("mismo jugador"); }
  if (igual(a.equipo, a.equipo_txt, b.equipo, b.equipo_txt)) { p += 1; motivos.push("mismo equipo"); }
  return { p, motivos };
}

/** Menciones [[...]] de un texto: «jugada:12», «Título de una nota». Ignora el código. */
export function menciones(texto) {
  const out = [];
  for (const seg of String(texto || "").split(/(```[\s\S]*?```|`[^`\n]+`)/).filter((_, i) => i % 2 === 0)) {
    for (const m of seg.matchAll(/\[\[([^\]\n|]+)(?:\|[^\]\n]*)?\]\]/g)) { const n = m[1].split("#")[0].trim(); if (n && !out.includes(n)) out.push(n); }
  }
  return out;
}
/** ¿La mención apunta a este documento? */
export function apunta(doc, mencion) {
  const m = mencion.trim(); const i = m.indexOf(":");
  if (i > 0 && /^(jugada|marca|video|nota)$/.test(m.slice(0, i).trim())) return m.slice(0, i).trim() === doc.tipo && m.slice(i + 1).trim() === String(doc.id);
  return doc.tipo === "nota" && plegar(doc.titulo) === plegar(m);
}

const ctxDe = (o) => ({ temporada: o.temporada || "", partido: String(o.partido || ""), partido_txt: o.partido_txt || "", equipo: o.equipo || "", equipo_txt: o.equipo_txt || "", jugador: o.jugador || "", jugador_txt: o.jugador_txt || "" });

/** Normaliza cada fuente a documentos {tipo, id, titulo, ctx, texto, menciones, ...}. */
export const docsDeNotas = (ns) => (ns || []).map((n) => ({ tipo: "nota", id: String(n.id), titulo: n.titulo, ctx: ctxDe(n.meta || {}), texto: n.extracto || "", menciones: n.enlaces || [], ref: n }));
export const docsDeJugadas = (js) => (js || []).map((j) => ({ tipo: "jugada", id: String(j.id), titulo: j.titulo, ctx: ctxDe(j), texto: [j.texto, j.descripcion].filter(Boolean).join("\n"), menciones: menciones(j.descripcion), ref: j }));
export const docsDeVideos = (vs) => (vs || []).map((v) => ({ tipo: "video", id: String(v.id), titulo: v.titulo, ctx: ctxDe({ partido: v.partido_id }), texto: v.descripcion || "", menciones: menciones(v.descripcion), ref: v }));
export const docsDeMarcas = (ms) => (ms || []).map((m) => ({ tipo: "marca", id: String(m.id), titulo: `${m.video} · ${m.boton || "marca"}`, ctx: ctxDe({ partido: m.partido_id, equipo: m.equipo_id, equipo_txt: m.equipo, jugador: m.jugador_id, jugador_txt: m.jugador }), texto: m.nota || "", menciones: menciones(m.nota), ref: m }));

/** Todos los documentos del usuario. Lo que no exista en este dispositivo (p. ej. notas en el iPad) simplemente no aparece. */
export async function cargarDocs() {
  const q = (cmd) => invoke(cmd).catch(() => []);
  const [n, j, v, m] = await Promise.all([q("notas_listar"), q("listar_jugadas"), q("listar_videos"), q("listar_marcas")]);
  return [...docsDeNotas(n), ...docsDeJugadas(j), ...docsDeVideos(v), ...docsDeMarcas(m)];
}

/** Documentos relacionados con un objetivo (`{doc}` o `{ctx}`): por contexto común y por menciones, de más a menos relacionado. */
export function relacionados(obj, docs, { tipos } = {}) {
  const doc = obj.doc, ctx = doc ? doc.ctx : obj.ctx;
  const sal = [];
  for (const d of docs) {
    if (doc && d.tipo === doc.tipo && d.id === doc.id) continue;
    if (tipos && !tipos.includes(d.tipo)) continue;
    let { p, motivos } = puntuar(ctx, d.ctx);
    if (doc) {
      if (doc.menciones.some((m) => apunta(d, m))) { p += 4; motivos.push("la menciona"); }
      if (d.menciones.some((m) => apunta(doc, m))) { p += 4; motivos.push("la cita"); }
    }
    if (p > 0) sal.push({ doc: d, p, motivos });
  }
  return sal.sort((a, b) => b.p - a.p || a.doc.titulo.localeCompare(b.doc.titulo, "es"));
}
/** Documentos que mencionan a `doc` (las «referencias inversas»). */
export const citadoPor = (doc, docs) => docs.filter((d) => !(d.tipo === doc.tipo && d.id === doc.id) && d.menciones.some((m) => apunta(doc, m)));
/** Cuenta por tipo: {nota: 3, jugada: 2, video: 1, marca: 0}; los vídeos y sus marcas cuentan juntos como «video». */
export function conteo(lista) {
  const c = { nota: 0, jugada: 0, video: 0 };
  for (const r of lista) c[r.doc.tipo === "marca" ? "video" : r.doc.tipo]++;
  return c;
}
/** Enlace de la aplicación para abrir un documento. */
export function hashDeDoc(d) {
  if (d.tipo === "nota") return `#/notas?abrir=${encodeURIComponent(d.id)}`;
  if (d.tipo === "jugada") return `#/playbook?j=${encodeURIComponent(d.id)}`;
  if (d.tipo === "video") return `#/video?v=${encodeURIComponent(d.id)}`;
  return `#/video?v=${encodeURIComponent(d.ref?.video_id ?? "")}&t=${Math.max(0, Math.round((d.ref?.t_ini ?? 0) - 2))}`;
}
