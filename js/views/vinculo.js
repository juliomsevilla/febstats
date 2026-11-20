// Vinculación común de notas, jugadas y marcas de vídeo con los datos de la FEB. Todo documento lleva el mismo «contexto»:
//   { temporada, grupo, partido, partido_txt, equipo, equipo_txt, jugador, jugador_txt }
// donde partido, equipo y jugador son IDs de la FEB (los enlaces van por id) y *_txt su nombre legible. Ver relaciones.js.
import { h, dialogo } from "../util.js";
import { invoke } from "../api.js";
import { S, leerHash, equipoEnFoco, nombreDeKey, equipoDeKey } from "../state.js";

export const CTX_VACIO = { temporada: "", grupo: "", partido: "", partido_txt: "", equipo: "", equipo_txt: "", jugador: "", jugador_txt: "" };
const cache = new Map();

/** Datos (payload) de un grupo; el que está abierto en la aplicación se reutiliza. */
export async function payloadDe(db) {
  if (!db) return null;
  if (S.db === db && S.data) return S.data;
  if (!cache.has(db)) cache.set(db, invoke("leer_payload", { db }).catch(() => null));
  return cache.get(db);
}
export const etiquetaGrupo = (g) => `${g.temporada} · ${String(g.grupo || "").replace(/"/g, "")}`;
const idEq = (e) => e.equipo_id || e.equipo;         // sin id (datos antiguos) se enlaza por el nombre
const idJug = (j) => j.jugador_id || j.jugador;
const fechaCorta = (f) => (f || "").slice(0, 10).split("-").reverse().join("/");
export const textoPartido = (p) => `${fechaCorta(p.fecha)} ${p.equipo_local} – ${p.equipo_visitante}`;

/** Grupo (db) cuyos datos contienen los ids del contexto; para preseleccionar el formulario al editar. */
export async function dbDe(ctx) {
  if (!ctx || (!ctx.partido && !ctx.equipo && !ctx.jugador && !ctx.temporada)) return "";
  const orden = [...S.grupos.filter((g) => g.temporada === ctx.temporada), ...S.grupos.filter((g) => g.temporada !== ctx.temporada)];
  for (const g of orden) {
    const D = await payloadDe(g.db); if (!D) continue;
    if ((ctx.partido && D.partidos.some((p) => String(p.partido_id) === ctx.partido)) || (ctx.equipo && D.clasificacion.some((c) => idEq(c) === ctx.equipo))
      || (ctx.jugador && D.jugadores.some((j) => idJug(j) === ctx.jugador))) return g.db;
  }
  return S.grupos.find((g) => g.temporada === ctx.temporada)?.db || "";
}

/** Contexto de lo que está en foco en la aplicación (filtros de equipo, jugador y partido), para preseleccionar al crear algo. */
export function contextoActual() {
  try {
    const D = S.data; if (!D) return { ...CTX_VACIO };
    const f = leerHash().f; const eq = equipoEnFoco(f);
    const e = eq && D.clasificacion.find((c) => c.equipo === eq);
    const j = f.ju && D.jugadores.find((x) => x.jugador === nombreDeKey(f.ju) && x.equipo === equipoDeKey(f.ju));
    const p = f.pa && D.partidos.find((x) => String(x.partido_id) === String(f.pa));
    const g = S.grupos.find((x) => x.db === S.db);
    return { ...CTX_VACIO, temporada: g?.temporada || D.temporada || "", grupo: String(g?.grupo || "").replace(/"/g, ""),
      equipo: e ? idEq(e) : "", equipo_txt: e ? e.equipo : "", jugador: j ? idJug(j) : "", jugador_txt: j ? j.jugador : "", partido: p ? String(p.partido_id) : "", partido_txt: p ? textoPartido(p) : "" };
  } catch { return { ...CTX_VACIO }; }
}

/** Diálogo de vinculación: temporada → equipo → jugador → partido (todo opcional). `onOk` recibe {titulo, ...contexto}. */
export async function formulario({ titulo, inicial = {}, textoBoton, conTitulo, onOk }) {
  const grupos = S.grupos;
  const v = { db: await dbDe(inicial), equipo: inicial.equipo || "", jugador: inicial.jugador || "", partido: inicial.partido || "", titulo: inicial.titulo || "" };
  const caja = h("div", { class: "nt-form" }); const d = dialogo(titulo, caja);
  async function pintarForm() {
    const D = await payloadDe(v.db);
    const equipos = (D?.clasificacion || []).map((c) => [idEq(c), c.equipo]).sort((a, b) => a[1].localeCompare(b[1], "es"));
    if (v.equipo && D && !equipos.some((e) => e[0] === v.equipo)) v.equipo = "";
    const jug = (D?.jugadores || []).filter((j) => !v.equipo || idEq(j) === v.equipo).sort((a, b) => a.jugador.localeCompare(b.jugador, "es"));
    if (v.jugador && !jug.some((j) => idJug(j) === v.jugador)) v.jugador = "";
    const nomEq = (id) => equipos.find((e) => e[0] === id)?.[1] || "";
    const pas = (D?.partidos || []).filter((p) => !v.equipo || [p.equipo_local, p.equipo_visitante].includes(nomEq(v.equipo))).sort((a, b) => (b.fecha || "").localeCompare(a.fecha || ""));
    if (v.partido && !pas.some((p) => String(p.partido_id) === v.partido)) v.partido = "";
    const sel = (et, valor, ops, cambiar, off) => h("div", { class: "campo" }, h("label", { text: et }),
      h("select", { disabled: off || null, onchange: (ev) => { cambiar(ev.target.value); pintarForm(); } }, ops.map(([val, t]) => h("option", { value: val, selected: val === valor || null }, t))));
    caja.replaceChildren(
      conTitulo ? h("div", { class: "campo" }, h("label", { text: "Título (opcional)" }), h("input", { type: "text", value: v.titulo, placeholder: "Si lo dejas vacío se usa el primer # título del texto", oninput: (ev) => { v.titulo = ev.target.value; } })) : null,
      sel("Temporada", v.db, [["", "General (sin temporada)"], ...grupos.map((g) => [g.db, etiquetaGrupo(g)])], (x) => { v.db = x; v.equipo = v.jugador = v.partido = ""; }),
      sel("Equipo", v.equipo, [["", v.db ? "Sin equipo" : "—"], ...equipos], (x) => { v.equipo = x; }, !v.db),
      sel("Jugador", v.jugador, [["", v.db ? "Sin jugador" : "—"], ...jug.map((j) => [idJug(j), v.equipo ? j.jugador : `${j.jugador} (${j.equipo})`])], (x) => { v.jugador = x; if (x && !v.equipo) v.equipo = idEq(jug.find((j) => idJug(j) === x) || {}) || ""; }, !v.db),
      sel("Partido", v.partido, [["", v.db ? "Sin partido" : "—"], ...pas.map((p) => [String(p.partido_id), textoPartido(p)])], (x) => { v.partido = x; }, !v.db),
      h("div", { class: "nt-acciones" }, h("button", { type: "button", class: "btn", onclick: () => d.close() }, "Cancelar"),
        h("button", { type: "button", class: "btn primario", onclick: async () => {
          const g = grupos.find((x) => x.db === v.db); const p = (D?.partidos || []).find((x) => String(x.partido_id) === v.partido); const j = jug.find((x) => idJug(x) === v.jugador);
          d.close();
          try {
            await onOk({ titulo: v.titulo.trim(), temporada: g?.temporada || "", grupo: String(g?.grupo || "").replace(/"/g, ""), equipo: v.equipo, equipo_txt: nomEq(v.equipo),
              jugador: v.jugador, jugador_txt: j?.jugador || "", partido: v.partido, partido_txt: p ? textoPartido(p) : "" });
          } catch (x) { dialogo("No se pudo completar", h("p", { text: typeof x === "string" ? x : x?.message || String(x) })); }
        } }, textoBoton)));
  }
  pintarForm();
  return d;
}

/** Chips de texto de la vinculación («2025 · D-B», equipo, jugador, partido). */
export const chipsDe = (m) => [m.temporada ? `${m.temporada}${m.grupo ? " · " + m.grupo : ""}` : "General", m.equipo_txt, m.jugador_txt, m.partido_txt].filter(Boolean);
