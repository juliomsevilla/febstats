// Portada de «Vídeo»: los vídeos trabajados, con vista previa, descripción, enlaces (partido FEB, notas y jugadas) y borrado.
import { h, vacioMsg, dialogo, fechaCorta } from "../util.js";
import { invoke, elegirVideo } from "../api.js";
import { fmt, videoEl, cargarEnlazables, pintarEnlaces } from "./video-comun.js";
import { elegirDocumento } from "./relacionado.js";
import { payloadDe, textoPartido, etiquetaGrupo } from "./vinculo.js";

const B = { busqueda: "", vinculando: null };
const plegar = (x) => String(x || "").normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLowerCase();

export async function vistaBiblioteca(root) {
  const [videos, grupos, docs] = await Promise.all([invoke("listar_videos"), invoke("listar_grupos"), cargarEnlazables()]);
  const rejilla = h("div", { class: "vbib" });
  const error = (x) => dialogo("No se pudo completar", h("p", { text: String(x?.message || x) }));
  const recargar = () => vistaBiblioteca(root);

  const anadir = async () => {
    const ruta = await elegirVideo(); if (!ruta) return;
    try { await invoke("anadir_video", { ruta, titulo: null }); B.busqueda = ""; await recargar(); } catch (x) { error(x); }
  };
  const borrar = (v) => {
    const d = dialogo("Eliminar vídeo", h("div", { class: "vbib-conf" },
      h("p", { text: `Se eliminará «${v.titulo}» de FEBstats junto con sus ${v.n_eventos} jugadas marcadas, sus notas y la sincronización del reloj. No se puede deshacer.` }),
      h("p", { class: "vid-ayuda", text: "El archivo de vídeo no se borra del disco." }),
      h("div", { class: "nt-acciones" }, h("button", { type: "button", class: "btn", onclick: () => d.close() }, "Cancelar"),
        h("button", { type: "button", class: "btn primario", onclick: async () => { d.close(); try { await invoke("borrar_video", { id: v.id }); await recargar(); } catch (x) { error(x); } } }, "Eliminar"))));
  };

  const tarjeta = (v) => {
    const abrir = `#/video?v=${v.id}`;
    const previa = h("div", { class: "vbib-previa" });
    const pintarPrevia = () => previa.replaceChildren(v.existe === false ? h("span", { class: "vbib-sin", text: "Archivo no encontrado" })
      : h("button", { type: "button", class: "vbib-play", title: "Vista previa", "aria-label": `Vista previa de ${v.titulo}`, onclick: () => { const el = videoEl(v, { controls: true, autoplay: true }); previa.replaceChildren(el); } },
        v.miniatura ? h("img", { src: v.miniatura, alt: "" }) : null, h("span", { class: "vbib-tri", text: "▶" })),
      v.duracion ? h("span", { class: "vbib-dur", text: fmt(v.duracion) }) : "");
    pintarPrevia();
    v.__previa = () => { if (!previa.querySelector("video")) pintarPrevia(); };

    const titulo = h("input", { class: "vbib-tit", value: v.titulo, "aria-label": "Título", onchange: async () => {
      if (!titulo.value.trim()) { titulo.value = v.titulo; return; }
      v.titulo = titulo.value.trim(); await invoke("actualizar_video", { id: v.id, datos: { titulo: v.titulo } }).catch(error); },
      onkeydown: (ev) => { if (ev.key === "Enter") titulo.blur(); } });
    const enlaces = h("div", { class: "vid-enls" });
    const desc = h("textarea", { class: "vbib-desc", rows: 3, placeholder: "Descripción: qué contiene, qué buscar…", "aria-label": "Descripción", onchange: () => guardarDesc() }, v.descripcion || "");
    const guardarDesc = async () => { v.descripcion = desc.value; await invoke("actualizar_video", { id: v.id, datos: { descripcion: v.descripcion } }).catch(error); pintarEnlaces(enlaces, docs, v.descripcion); };
    pintarEnlaces(enlaces, docs, v.descripcion);
    const enlazar = (tipo, texto) => h("button", { type: "button", class: "btn peq", onclick: async () => {
      const m = await elegirDocumento({ tipos: [tipo] }); if (!m) return;
      desc.value = `${desc.value} ${m}`.trim(); await guardarDesc(); } }, texto);

    const vinculo = h("span", { class: "vbib-vinculo" });
    panelPartido(vinculo, v, grupos, recargar).catch(error);

    return h("article", { class: "card vbib-card" }, previa,
      h("div", { class: "vbib-cuerpo" }, titulo,
        h("div", { class: "vbib-meta", text: `Añadido el ${fechaCorta(v.creado)}` }),
        desc, enlaces, h("div", { class: "vbib-vinculo" }, vinculo, h("span", { class: "vbib-marcas", text: `Marcas de vídeo: ${v.n_eventos}` })),
        v.existe === false ? h("div", { class: "vid-falta" }, h("span", { text: `No encuentro el archivo (${v.ruta}). Tus jugadas se conservan.` }),
          h("button", { type: "button", class: "btn peq", onclick: async () => { const r = await elegirVideo(); if (!r) return; try { await invoke("relocalizar_video", { id: v.id, ruta: r }); await recargar(); } catch (x) { error(x); } } }, "Localizar archivo…")) : null,
        h("div", { class: "vbib-acc" }, h("a", { class: "btn primario peq", href: abrir }, "✂️ Editar jugadas"), enlazar("jugada", "🏀 Enlazar jugada"), enlazar("nota", "📝 Enlazar nota"),
          h("button", { type: "button", class: "btn peq fantasma vbib-borrar", onclick: () => borrar(v) }, "Eliminar"))));
  };

  const pintar = () => {
    const t = plegar(B.busqueda);
    const ver = videos.filter((v) => !t || plegar(`${v.titulo} ${v.descripcion}`).includes(t));
    rejilla.replaceChildren(...(ver.length ? ver.map(tarjeta) : [h("p", { class: "vid-vacio", text: "Ningún vídeo coincide con la búsqueda." })]));
  };
  const buscar = h("input", { type: "search", class: "vbib-buscar", placeholder: "Buscar vídeo…", value: B.busqueda, oninput: () => { B.busqueda = buscar.value; pintar(); } });
  if (window.__quitarAtajos) window.__quitarAtajos();
  root.replaceChildren(
    h("div", { class: "vid-cab" }, h("b", { class: "vid-h", text: "Vídeos" }), h("button", { type: "button", class: "btn primario peq", onclick: anadir }, "+ Añadir vídeo"),
      h("a", { class: "btn peq", href: "#/video?lista=1" }, "▶ Listas de reproducción"), videos.length > 3 ? buscar : null),
    videos.length ? rejilla : vacioMsg("Sin vídeos", "Pulsa «+ Añadir vídeo» y elige un archivo mp4."));
  if (videos.length) pintar();
  generarMiniaturas(videos, rejilla);
}

/** Crea, de uno en uno, la vista previa y la duración de los vídeos que aún no las tienen. */
async function generarMiniaturas(videos, rejilla) {
  for (const v of videos.filter((x) => x.existe !== false && !x.miniatura)) {
    if (!rejilla.isConnected) return;
    const datos = await fotograma(v).catch(() => null);
    if (!datos) continue;
    Object.assign(v, datos);
    await invoke("actualizar_video", { id: v.id, datos }).catch(() => {});
    v.__previa?.();
  }
}
function fotograma(v) {
  return new Promise((res, rej) => {
    const el = videoEl(v, { preload: "auto" }); el.muted = true;
    const fin = (f, x) => { clearTimeout(limite); el.removeAttribute("src"); el.load(); f(x); };
    const limite = setTimeout(() => fin(rej, "tiempo agotado"), 15000);
    el.addEventListener("error", () => fin(rej, "no se puede leer"), { once: true });
    el.addEventListener("loadedmetadata", () => { el.currentTime = Math.min(el.duration * 0.1, 120) || 0; }, { once: true });
    el.addEventListener("seeked", () => {
      try {
        const c = document.createElement("canvas"); c.width = 480; c.height = Math.round((480 * el.videoHeight) / el.videoWidth) || 270;
        c.getContext("2d").drawImage(el, 0, 0, c.width, c.height);
        fin(res, { miniatura: c.toDataURL("image/jpeg", 0.7), duracion: el.duration });
      } catch (x) { fin(rej, x); }
    }, { once: true });
  });
}

// Vincular el vídeo a un partido de la base FEB (opcional): permite asignar jugadas a jugadores y cruzarlas con las estadísticas.
async function panelPartido(caja, v, grupos, recargar) {
  const pintar = () => panelPartido(caja, v, grupos, recargar);
  if (B.vinculando !== v.id) {
    const boton = (texto, accion, clase = "") => h("button", { type: "button", class: `btn peq ${clase}`, onclick: accion }, texto);
    const cambiar = () => { B.vinculando = v.id; pintar(); };
    if (!v.partido_id) { caja.replaceChildren(boton("🔗 Vincular a partido…", cambiar)); return; }
    const P = await payloadDe(v.grupo_db);
    const p = P?.partidos.find((x) => String(x.partido_id) === String(v.partido_id));
    const texto = p ? textoPartido(p) : "partido sin datos descargados";
    caja.replaceChildren(h("span", { class: "vid-ok", text: `🔗 ${texto}` }), boton("Cambiar", cambiar, "fantasma"),
      boton("Desvincular", async () => { await invoke("vincular_video", { id: v.id, grupoDb: null, partidoId: null }); await recargar(); }, "fantasma"));
    return;
  }
  const partidoSel = h("select", { class: "peq", disabled: true, onchange: async (e) => {
    if (!e.target.value) return;
    await invoke("vincular_video", { id: v.id, grupoDb: grupoSel.value, partidoId: e.target.value });
    B.vinculando = null; await recargar();
  } }, h("option", { value: "", text: "Partido…" }));
  const cambiarGrupo = async (db) => {
    const P = await payloadDe(db);
    partidoSel.disabled = !P;
    const ps = (P?.partidos || []).slice().sort((a, b) => (b.fecha || "").localeCompare(a.fecha || ""));
    partidoSel.replaceChildren(h("option", { value: "", text: "Partido…" }),
      ...ps.map((p) => h("option", { value: p.partido_id, selected: String(p.partido_id) === String(v.partido_id) || null, text: `${fechaCorta(p.fecha)} · ${p.equipo_local} ${p.pts_local}–${p.pts_visitante} ${p.equipo_visitante}` })));
  };
  const grupoSel = h("select", { class: "peq", onchange: (e) => cambiarGrupo(e.target.value) }, h("option", { value: "", text: "Grupo…" }),
    grupos.map((g) => h("option", { value: g.db, selected: g.db === v.grupo_db || null, text: etiquetaGrupo(g) })));
  caja.replaceChildren(grupoSel, partidoSel, h("button", { type: "button", class: "btn peq fantasma", onclick: () => { B.vinculando = null; pintar(); } }, "Cancelar"));
  if (v.grupo_db) await cambiarGrupo(v.grupo_db);
}
