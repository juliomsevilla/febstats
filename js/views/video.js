// Vista "Vídeo" (estilo Nacsport): vídeo grande, botones de marcado a la derecha y registro de marcas debajo.
// Cada marca guarda el tiempo del vídeo, el tiempo de juego (cuarto + reloj), la nota y, si el vídeo está
// vinculado a un partido FEB, el jugador. La IA nunca ve el vídeo: solo ese texto.
import { h, vacioMsg, dialogo, fechaCorta } from "../util.js";
import { invoke, urlVideo, elegirVideo, enEscritorio } from "../api.js";

const fmt = (t) => { t = Math.max(0, t || 0); const m = Math.floor(t / 60), s = Math.floor(t % 60); return `${m}:${String(s).padStart(2, "0")}`; };
const fmtArchivo = (t) => { t = Math.floor(t || 0); const hh = Math.floor(t / 3600), m = Math.floor((t % 3600) / 60), s = t % 60; return `${hh ? hh + "h" : ""}${String(m).padStart(2, "0")}m${String(s).padStart(2, "0")}s`; };
const V = { videos: [], botones: [], eventos: [], sincros: [], video: null, filtro: "", sel: null, grupos: [], payloads: {}, partido: null, jugadores: [], jugadorActivo: "", aviso: "", orden: { col: "t", dir: 1 }, pendiente: null, vinculando: false };
const RESERVADAS = new Set([" ", "ArrowLeft", "ArrowRight", "C", "Escape"]);

// ---- tiempo de juego ----
const fmtJuego = (c, s) => (c == null || s == null ? "" : `${c}T ${fmt(s)}`);
function parseJuego(txt) {
  const m = String(txt).trim().match(/^(\d)\s*[tTqQº.ª]*\s*(\d{1,2}):(\d{2})$/);
  return m ? { cuarto: Number(m[1]), reloj_s: Number(m[2]) * 60 + Number(m[3]) } : null;
}
function relojEn(t) { // estimación a partir del punto de sincronización más cercano anterior (o el primero)
  if (!V.sincros.length) return null;
  const s = [...V.sincros].filter((x) => x.t_video <= t).pop() || V.sincros[0];
  return { cuarto: s.cuarto, reloj_s: Math.max(0, s.reloj_s - (t - s.t_video)) };
}

// ---- atajos: identificador independiente del teclado/idioma ----
export function idTecla(ev) {
  const c = ev.code || "";
  let k = c.startsWith("Key") ? c.slice(3) : c.startsWith("Digit") ? c.slice(5) : c.startsWith("Numpad") ? "Num" + c.slice(6) : /^F\d+$/.test(c) ? c : ev.key.length === 1 ? ev.key.toUpperCase() : ev.key;
  if (["Shift", "Control", "Alt", "Meta"].includes(ev.key)) return null;
  return (ev.shiftKey ? "Shift+" : "") + k;
}

async function payloadDe(db) { return (V.payloads[db] ||= await invoke("leer_payload", { db })); }
async function resolverPartido() {
  V.partido = null; V.jugadores = [];
  const v = V.video;
  if (!v?.partido_id || !v.grupo_db) return;
  try {
    const P = await payloadDe(v.grupo_db);
    const p = P.partidos.find((x) => String(x.partido_id) === String(v.partido_id));
    if (!p) return;
    V.partido = p;
    V.jugadores = P.jugadores.filter((j) => j.equipo === p.equipo_local || j.equipo === p.equipo_visitante)
      .sort((a, b) => a.equipo.localeCompare(b.equipo, "es") || a.jugador.localeCompare(b.jugador, "es"));
  } catch { /* datos FEB no disponibles: el vídeo funciona sin vínculo */ }
}

export async function vistaVideo(root) {
  if (!enEscritorio) { root.replaceChildren(vacioMsg("Solo en la app de escritorio", "El análisis de vídeo necesita la versión de escritorio de FEBstats.")); return; }
  V.videos = await invoke("listar_videos");
  V.botones = await invoke("listar_botones");
  V.grupos = await invoke("listar_grupos");
  if (window.__abrirVideo) { V.video = V.videos.find((v) => v.id === window.__abrirVideo) || V.video; window.__abrirVideo = null; }
  V.video = V.video && V.videos.find((v) => v.id === V.video.id) || V.videos[0] || null;
  V.eventos = V.video ? await invoke("listar_eventos", { videoId: V.video.id }) : [];
  V.sincros = V.video ? await invoke("listar_sincros", { videoId: V.video.id }) : [];
  await resolverPartido();
  pintar(root);
}

async function abrirVideo(root) {
  const ruta = await elegirVideo();
  if (!ruta) return;
  V.video = await invoke("anadir_video", { ruta, titulo: null });
  await vistaVideo(root);
}

const claveJ = (j) => `${j.equipo}\x01${j.jugador}`;

function pintar(root) {
  if (window.__quitarAtajos) window.__quitarAtajos();
  const cab = h("div", { class: "vid-cab" }, h("b", { class: "vid-h", text: "Vídeo" }),
    V.videos.length > 1 ? h("select", { class: "peq", onchange: async (e) => { V.video = V.videos.find((v) => v.id == e.target.value); V.vinculando = false; await vistaVideo(root); } },
      V.videos.map((v) => h("option", { value: v.id, selected: V.video?.id === v.id || null, text: `${v.titulo} (${v.n_eventos})` }))) : (V.video ? h("span", { class: "vid-titulo", text: V.video.titulo }) : null),
    h("button", { type: "button", class: "btn peq", onclick: () => abrirVideo(root) }, "Abrir vídeo…"),
    V.video ? panelPartido(root) : null);
  if (!V.video) { root.replaceChildren(cab, vacioMsg("Sin vídeos", "Pulsa «Abrir vídeo…» y elige un archivo mp4.")); return; }

  const vid = h("video", { class: "vid", controls: true, preload: "metadata", crossorigin: "anonymous", src: urlVideo(V.video), playsinline: true });
  const tl = h("div", { class: "vid-tl", title: "Línea de tiempo" });
  const tabla = h("tbody");
  clearTimeout(V.avisoTimer); V.aviso = "";
  const avisoTxt = h("span");
  const aviso = h("p", { class: "vid-ayuda vid-aviso", hidden: true }, avisoTxt,
    h("button", { type: "button", class: "btn fantasma vid-aviso-x", "aria-label": "Cerrar aviso", onclick: () => decir("") }, "✕"));
  const decir = (txt) => { // el aviso se cierra solo a los 20 s o con la ✕
    clearTimeout(V.avisoTimer); V.aviso = txt; avisoTxt.textContent = txt; aviso.hidden = !txt;
    if (txt) V.avisoTimer = setTimeout(() => decir(""), 20000);
  };
  const guardar = async (e) => { await invoke("guardar_evento", { evento: { id: e.id, video_id: V.video.id, boton_id: e.boton_id, t_ini: e.t_ini, t_fin: e.t_fin, nota: e.nota, equipo: e.equipo, jugador: e.jugador, cuarto: e.cuarto, reloj_s: e.reloj_s } }); };

  const saltar = (e) => { vid.currentTime = e.t_ini; vid.play(); V.sel = e.id; pintarTabla(); };
  const pintarTl = () => {
    const d = vid.duration || 0;
    tl.replaceChildren(...V.eventos.map((e) => h("button", { type: "button", class: "vid-marca", style: `left:${d ? (e.t_ini / d) * 100 : 0}%;background:${e.color || "#888"}`,
      title: `${fmt(e.t_ini)} ${e.boton || ""}`, onclick: () => saltar(e) })));
  };

  const selJugador = (valor, onCambio, vacio = "Jugador") => {
    const equipos = V.partido ? [V.partido.equipo_local, V.partido.equipo_visitante] : [];
    return h("select", { class: "vid-jug", onchange: (ev) => onCambio(ev.target.value) }, h("option", { value: "", text: vacio }),
      equipos.map((eq) => h("optgroup", { label: eq }, V.jugadores.filter((j) => j.equipo === eq).map((j) => h("option", { value: claveJ(j), selected: claveJ(j) === valor || null, text: j.jugador })))));
  };
  const aplicarJugador = (e, clave) => { const [eq, ju] = clave ? clave.split("\x01") : [null, null]; e.equipo = eq; e.jugador = ju; };

  const fila = (e, i) => {
    const nota = h("textarea", { rows: 1, placeholder: "¿Por qué lo marcas?", onchange: async () => { e.nota = nota.value; await guardar(e); if (e.nota.trim() && V.pendiente === e.id) { V.pendiente = null; pintarTabla(); } },
      onkeydown: (ev) => { if (ev.key === "Escape" || (ev.key === "Enter" && !ev.shiftKey)) { ev.preventDefault(); nota.blur(); } } }, e.nota || "");
    const juego = h("input", { class: "vid-juego", value: fmtJuego(e.cuarto, e.reloj_s), placeholder: "2T 7:32", title: "Cuarto y reloj del partido (ej. 2T 7:32)",
      onchange: async () => { const p = parseJuego(juego.value); if (p) { e.cuarto = p.cuarto; e.reloj_s = p.reloj_s; } else if (!juego.value.trim()) { e.cuarto = null; e.reloj_s = null; } juego.value = fmtJuego(e.cuarto, e.reloj_s); await guardar(e); },
      onkeydown: (ev) => { if (ev.key === "Escape" || ev.key === "Enter") juego.blur(); } });
    return h("tr", { class: V.sel === e.id ? "sel" : "", "data-id": e.id },
      h("td", { text: i + 1 }),
      h("td", null, h("button", { type: "button", class: "vid-t", onclick: () => saltar(e) }, "▶ " + fmt(e.t_ini))),
      h("td", null, juego),
      h("td", null, h("span", { class: "vid-chip", style: `background:${e.color || "#888"}`, text: e.boton || "—" })),
      V.partido ? h("td", null, selJugador(e.jugador ? `${e.equipo}\x01${e.jugador}` : "", async (c) => { aplicarJugador(e, c); await guardar(e); })) : null,
      h("td", { class: "vid-nota" }, nota),
      h("td", null, h("button", { type: "button", class: "btn fantasma", "aria-label": "Borrar marca", onclick: async () => { await invoke("borrar_evento", { id: e.id }); V.eventos = V.eventos.filter((x) => x.id !== e.id); pintarTabla(); } }, "✕")));
  };
  const cuenta = h("b");
  const COLS = [["n", "#"], ["t", "Vídeo"], ["juego", "Juego"], ["boton", "Marca"], V.partido ? ["jugador", "Jugador"] : null, ["nota", "Nota"]].filter(Boolean);
  const coll = new Intl.Collator("es", { sensitivity: "base", numeric: true });
  const clave = (e, c) => c === "t" || c === "n" ? e.t_ini : c === "juego" ? (e.cuarto == null ? Infinity : e.cuarto * 1000 - (e.reloj_s ?? 0) / 1000) : (e[c] || "");
  const ordenar = (ev) => {
    const { col, dir } = V.orden;
    return ev.slice().sort((a, b) => { const x = clave(a, col), y = clave(b, col); return dir * (typeof x === "number" ? x - y : coll.compare(x, y)); });
  };
  const cabecera = h("tr");
  const pintarCabecera = () => cabecera.replaceChildren(...COLS.map(([c, t]) => h("th", { class: "ord", "aria-sort": V.orden.col === c ? (V.orden.dir > 0 ? "ascending" : "descending") : "none",
    onclick: () => { V.orden = { col: c, dir: V.orden.col === c ? -V.orden.dir : 1 }; pintarTabla(); }, text: t + (V.orden.col === c ? (V.orden.dir > 0 ? " ▲" : " ▼") : "") }), h("th")));
  const pintarTabla = () => {
    let ev = ordenar(V.eventos.filter((e) => !V.filtro || String(e.boton_id) === V.filtro));
    const pend = V.pendiente && ev.find((e) => e.id === V.pendiente && !(e.nota || "").trim());
    if (pend) ev = [pend, ...ev.filter((e) => e !== pend)]; // la marca por rellenar siempre arriba, junto al vídeo
    else V.pendiente = null;
    cuenta.textContent = `Registro de marcas (${V.eventos.length})`;
    pintarCabecera();
    tabla.replaceChildren(...(ev.length ? ev.map((e) => fila(e, V.eventos.indexOf(e))) : [h("tr", null, h("td", { colspan: 7, class: "vid-vacio", text: "Sin marcas todavía. Usa los botones de la derecha o sus atajos de teclado mientras ves el partido." }))]));
    pintarTl();
  };

  const marcar = async (b) => {
    vid.pause(); // al registrar un momento, el vídeo se detiene para poder escribir la nota
    const t = vid.currentTime, r = relojEn(t);
    const ev = { video_id: V.video.id, boton_id: b.id, t_ini: Math.max(0, t - b.pre_s), t_fin: t + b.post_s, nota: "", equipo: null, jugador: null, cuarto: r?.cuarto ?? null, reloj_s: r ? Math.round(r.reloj_s) : null };
    if (V.partido && V.jugadorActivo) aplicarJugador(ev, V.jugadorActivo);
    ev.id = await invoke("guardar_evento", { evento: ev });
    ev.boton = b.nombre; ev.color = b.color;
    V.eventos.push(ev); V.eventos.sort((a, c) => a.t_ini - c.t_ini); V.sel = ev.id; V.pendiente = ev.id;
    pintarTabla();
    document.querySelector(".vid-tabla")?.scrollTo(0, 0);
    document.querySelector(`tr[data-id="${ev.id}"] textarea`)?.focus(); // escribir el porqué de inmediato (Enter/Esc vuelve a los atajos)
  };

  let capturando = false; // antirrebote: una pulsación = una captura
  const capturar = async () => {
    if (capturando) return; capturando = true; setTimeout(() => { capturando = false; }, 1200);
    if (!vid.videoWidth) { decir("El vídeo aún no está cargado."); return; }
    const c = document.createElement("canvas"); c.width = vid.videoWidth; c.height = vid.videoHeight;
    try {
      c.getContext("2d").drawImage(vid, 0, 0);
      const p = V.partido;
      const base = p ? `${p.equipo_local} vs ${p.equipo_visitante}_${(p.fecha || "").slice(0, 10)}` : V.video.titulo;
      const ruta = await invoke("guardar_captura", { nombre: `${base}_${fmtArchivo(vid.currentTime)}`, pngBase64: c.toDataURL("image/png") });
      decir(`Captura guardada: ${ruta}`);
    } catch (err) { decir(`No se pudo capturar: ${err?.message || err}`); }
  };

  // ---- panel derecho: botones de marcado agrupados por categoría ----
  const cats = [...new Set(V.botones.map((b) => b.categoria || ""))];
  const panelBotones = h("div", { class: "vid-panel" },
    V.partido ? h("div", { class: "vid-activo" }, h("label", { text: "Jugador de las próximas marcas" }), selJugador(V.jugadorActivo, (c) => { V.jugadorActivo = c; }, "Ninguno")) : null,
    cats.map((cat) => h("div", { class: "vid-cat" }, cat ? h("div", { class: "vid-cat-t", text: cat }) : null,
      h("div", { class: "vid-botones" }, V.botones.filter((b) => (b.categoria || "") === cat).map((b) =>
        h("button", { type: "button", class: "vid-btn", style: `--c:${b.color}`, onclick: () => marcar(b) }, h("span", { text: b.nombre }), b.atajo ? h("kbd", { text: b.atajo }) : null))))),
    !V.botones.length ? h("p", { class: "vid-vacio", text: "No hay botones. Créalos en Ajustes → Botones de vídeo." }) : null);

  // ---- reloj del partido ----
  const estim = h("span", { class: "vid-estim" });
  const selC = h("select", null, [1, 2, 3, 4, 5].map((c) => h("option", { value: c, text: c === 5 ? "Prórroga" : `${c}.º cuarto` })));
  const inpR = h("input", { class: "vid-reloj", placeholder: "mm:ss", value: "10:00", "aria-label": "Reloj del marcador" });
  const sincros = h("span", { class: "vid-sincros" });
  const pintarSincros = () => sincros.replaceChildren(...V.sincros.map((s) => h("span", { class: "vid-chip-s", title: "Punto de sincronización" },
    `${fmt(s.t_video)} → ${fmtJuego(s.cuarto, s.reloj_s)}`, h("button", { type: "button", "aria-label": "Quitar", onclick: async () => { await invoke("borrar_sincro", { id: s.id }); V.sincros = V.sincros.filter((x) => x.id !== s.id); pintarSincros(); } }, "✕"))));
  const pintarEstim = () => { const r = relojEn(vid.currentTime); estim.textContent = r ? `≈ ${fmtJuego(r.cuarto, r.reloj_s)}` : "sin sincronizar"; };
  const fijar = async () => {
    const m = inpR.value.trim().match(/^(\d{1,2}):(\d{2})$/);
    if (!m) { decir("Escribe el reloj del marcador como mm:ss (ej. 7:32)."); return; }
    await invoke("guardar_sincro", { videoId: V.video.id, tVideo: vid.currentTime, cuarto: Number(selC.value), relojS: Number(m[1]) * 60 + Number(m[2]) });
    V.sincros = await invoke("listar_sincros", { videoId: V.video.id }); pintarSincros(); pintarEstim(); decir("Reloj sincronizado.");
  };
  inpR.addEventListener("keydown", (ev) => { if (ev.key === "Enter") { ev.preventDefault(); fijar(); inpR.blur(); } if (ev.key === "Escape") inpR.blur(); });
  vid.addEventListener("timeupdate", pintarEstim);
  vid.addEventListener("loadedmetadata", () => { pintarTl(); pintarEstim(); });

  const barraReloj = h("div", { class: "vid-reloj-barra" }, h("b", { text: "Reloj del partido" }), selC, inpR,
    h("button", { type: "button", class: "btn", onclick: fijar, title: "Indica qué marca el reloj del marcador en este instante del vídeo" }, "Fijar aquí"), estim,
    sincros,
    h("button", { type: "button", class: "btn vid-cam", onclick: capturar, title: "Capturar imagen del vídeo (tecla C)", "aria-label": "Capturar imagen del vídeo" }, "📷"));

  const filtro = h("select", { onchange: (e) => { V.filtro = e.target.value; pintarTabla(); } },
    h("option", { value: "", text: "Todas las marcas" }), V.botones.map((b) => h("option", { value: b.id, selected: String(b.id) === V.filtro || null, text: b.nombre })));

  const teclas = (ev) => {
    const tag = ev.target.tagName;
    if (tag === "TEXTAREA" || tag === "INPUT" || tag === "SELECT") return; // escribiendo
    if (ev.ctrlKey || ev.metaKey || ev.altKey) return;
    if (ev.key === " ") { ev.preventDefault(); vid.paused ? vid.play() : vid.pause(); return; }
    if (ev.key === "ArrowLeft") { vid.currentTime -= ev.shiftKey ? 10 : 3; return; }
    if (ev.key === "ArrowRight") { vid.currentTime += ev.shiftKey ? 10 : 3; return; }
    const id = idTecla(ev);
    if (id === "C") { capturar(); return; }
    const b = id && V.botones.find((x) => x.atajo === id);
    if (b) { ev.preventDefault(); marcar(b); }
  };
  if (window.__teclasVideo) document.removeEventListener("keydown", window.__teclasVideo); // nunca dos manejadores a la vez
  window.__teclasVideo = teclas; document.addEventListener("keydown", teclas);
  window.__quitarAtajos = () => { document.removeEventListener("keydown", teclas); window.__teclasVideo = null; window.__quitarAtajos = null; };

  root.replaceChildren(cab,
    h("div", { class: "vid-main" },
      h("div", { class: "vid-izq" }, vid, tl, barraReloj, aviso,
        h("p", { class: "vid-ayuda", text: "Espacio: pausa · ←/→: ±3 s (Mayús ±10 s) · atajo de cada botón · C: captura" })),
      panelBotones),
    h("div", { class: "card vid-reg" }, h("div", { class: "vid-der-cab" }, cuenta, filtro),
      h("div", { class: "vid-tabla" }, h("table", null,
        h("thead", null, cabecera), tabla))));
  pintarTabla(); pintarSincros(); pintarEstim();
}

// Vincular el vídeo a un partido de la base FEB (opcional). Compacto: una etiqueta y, solo al pulsar, los desplegables.
function panelPartido(root) {
  const v = V.video;
  const caja = h("span", { class: "vid-vinculo" });
  if (V.partido && !V.vinculando) {
    caja.append(h("span", { class: "vid-ok", title: "Las marcas son datos de este partido", text: `🔗 ${V.partido.equipo_local} – ${V.partido.equipo_visitante}` }),
      h("button", { type: "button", class: "btn peq fantasma", onclick: () => { V.vinculando = true; pintar(root); } }, "Cambiar"),
      h("button", { type: "button", class: "btn peq fantasma", onclick: async () => { await invoke("vincular_video", { id: v.id, grupoDb: null, partidoId: null }); V.jugadorActivo = ""; await vistaVideo(root); } }, "Desvincular"));
    return caja;
  }
  if (!V.vinculando) {
    caja.append(h("button", { type: "button", class: "btn peq", title: "Opcional: permite asignar marcas a jugadores y cruzarlas con las estadísticas", onclick: () => { V.vinculando = true; pintar(root); } }, "🔗 Vincular a partido…"));
    return caja;
  }
  const grupoSel = h("select", { class: "peq", onchange: async (e) => { await cambiarGrupo(e.target.value); } },
    h("option", { value: "", text: "Grupo…" }),
    V.grupos.map((g) => h("option", { value: g.db, selected: g.db === v.grupo_db || null, text: `${g.temporada} · ${g.grupo.replace(/"/g, "")}` })));
  const partidoSel = h("select", { class: "peq", disabled: true, onchange: async (e) => {
    const pid = e.target.value;
    if (!pid) return;
    await invoke("vincular_video", { id: v.id, grupoDb: grupoSel.value, partidoId: pid });
    V.jugadorActivo = ""; V.vinculando = false; await vistaVideo(root);
  } }, h("option", { value: "", text: "Partido…" }));
  async function cambiarGrupo(db) {
    if (!db) { partidoSel.disabled = true; return; }
    const P = await payloadDe(db);
    const ps = P.partidos.slice().sort((a, b) => (b.fecha || "").localeCompare(a.fecha || ""));
    partidoSel.disabled = false;
    partidoSel.replaceChildren(h("option", { value: "", text: "Partido…" }),
      ...ps.map((p) => h("option", { value: p.partido_id, selected: String(p.partido_id) === String(v.partido_id) || null, text: `${fechaCorta(p.fecha)} · ${p.equipo_local} ${p.pts_local}–${p.pts_visitante} ${p.equipo_visitante}` })));
  }
  if (v.grupo_db) cambiarGrupo(v.grupo_db).catch(() => {});
  caja.append(grupoSel, partidoSel, h("button", { type: "button", class: "btn peq fantasma", onclick: () => { V.vinculando = false; pintar(root); } }, "Cancelar"));
  return caja;
}

// Editor de botones (pestaña «Botones de vídeo» de Ajustes): crear, editar y borrar sin límite; cada botón puede tener su atajo.
export async function panelBotones(cuerpo) {
  cuerpo.classList.add("vid-edit");
  const msg = h("p", { class: "vid-ayuda" });
  const pintarEd = async () => {
    V.botones = await invoke("listar_botones");
    const campo = (b, k, tipo, attrs = {}) => h("input", { type: tipo, value: b[k] ?? "", ...attrs, onchange: async (e) => { b[k] = tipo === "number" ? Number(e.target.value) : e.target.value; await invoke("guardar_boton", { boton: b }); } });
    const atajo = (b) => h("input", { class: "corto vid-atajo", readonly: true, value: b.atajo || "", placeholder: "pulsa tecla", title: "Haz clic y pulsa la tecla (Supr/Retroceso la quita)",
      onkeydown: async (ev) => {
        if (ev.key === "Tab") return;
        ev.preventDefault();
        if (ev.key === "Backspace" || ev.key === "Delete") { b.atajo = null; await invoke("guardar_boton", { boton: b }); ev.target.value = ""; msg.textContent = ""; return; }
        const id = idTecla(ev);
        if (!id) return;
        if (RESERVADAS.has(id)) { msg.textContent = `«${id}» está reservada (pausa, saltos, captura).`; return; }
        const otro = V.botones.find((x) => x.id !== b.id && x.atajo === id);
        if (otro) { msg.textContent = `«${id}» ya la usa «${otro.nombre}».`; return; }
        b.atajo = id; await invoke("guardar_boton", { boton: b }); ev.target.value = id; msg.textContent = "";
      } });
    cuerpo.replaceChildren(
      h("p", { class: "vid-ayuda", text: "Crea todos los botones que necesites y asígnales una tecla (haz clic en «Atajo» y pulsa la tecla). «Antes/Después» = segundos de clip alrededor de la marca. Los botones se agrupan por categoría en la vista Vídeo." }),
      h("div", { class: "vid-edit-fila vid-edit-cab" }, ["Nombre", "Color", "Atajo", "Categoría", "Antes (s)", "Después (s)", ""].map((t) => h("span", { text: t }))),
      ...V.botones.map((b) => h("div", { class: "vid-edit-fila" },
        campo(b, "nombre", "text"), campo(b, "color", "color"), atajo(b), campo(b, "categoria", "text"),
        campo(b, "pre_s", "number", { min: 0, step: 1, class: "corto" }), campo(b, "post_s", "number", { min: 0, step: 1, class: "corto" }),
        h("button", { type: "button", class: "btn fantasma", "aria-label": "Borrar botón", onclick: async () => { await invoke("borrar_boton", { id: b.id }); pintarEd(); } }, "✕"))),
      h("button", { type: "button", class: "btn primario", onclick: async () => { await invoke("guardar_boton", { boton: { nombre: "Nuevo botón", color: "#3a7ca5", pre_s: 5, post_s: 5 } }); pintarEd(); } }, "+ Añadir botón"), msg);
  };
  await pintarEd();
}
