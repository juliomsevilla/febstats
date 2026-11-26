// Editor de un vídeo (estilo Nacsport): el usuario marca inicio y final de cada jugada (o usa «antes/después» del botón),
// las ajusta en la barra de recorte y quedan guardadas como minivídeos (un tramo del original: no se copia ningún archivo).
// Cada jugada guarda el tiempo del vídeo, el tiempo de juego (cuarto + reloj), la nota y, si el vídeo está vinculado a un
// partido FEB, el jugador.
import { h } from "../util.js";
import { invoke } from "../api.js";
import { paramHash } from "../state.js";
import { elegirDocumento } from "./relacionado.js";
import { fmt, fmtJuego, videoEl, cargarEnlazables, pintarEnlaces, activarAtajos } from "./video-comun.js";
import { idTecla } from "./video-teclas.js";
import { recortador } from "./video-recorte.js";

const fmtArchivo = (t) => { t = Math.floor(t || 0); const hh = Math.floor(t / 3600), m = Math.floor((t % 3600) / 60), s = t % 60; return `${hh ? hh + "h" : ""}${String(m).padStart(2, "0")}m${String(s).padStart(2, "0")}s`; };
const V = { docs: [], botones: [], eventos: [], sincros: [], video: null, filtro: "", sel: null, partido: null, jugadores: [], jugadorActivo: "", aviso: "", orden: { col: "t", dir: 1 }, pendiente: null, ini: null, fin: null };

// ---- tiempo de juego ----
function parseJuego(txt) {
  const m = String(txt).trim().match(/^(\d)\s*[tTqQº.ª]*\s*(\d{1,2}):(\d{2})$/);
  return m ? { cuarto: Number(m[1]), reloj_s: Number(m[2]) * 60 + Number(m[3]) } : null;
}
function relojEn(t) { // estimación a partir del punto de sincronización más cercano anterior (o el primero)
  if (!V.sincros.length) return null;
  const s = [...V.sincros].filter((x) => x.t_video <= t).pop() || V.sincros[0];
  return { cuarto: s.cuarto, reloj_s: Math.max(0, s.reloj_s - (t - s.t_video)) };
}

async function resolverPartido() {
  V.partido = null; V.jugadores = [];
  const v = V.video;
  if (!v?.partido_id || !v.grupo_db) return;
  try {
    const P = await invoke("leer_payload", { db: v.grupo_db });
    const p = P.partidos.find((x) => String(x.partido_id) === String(v.partido_id));
    if (!p) return;
    V.partido = p;
    V.jugadores = P.jugadores.filter((j) => j.equipo === p.equipo_local || j.equipo === p.equipo_visitante)
      .sort((a, b) => a.equipo.localeCompare(b.equipo, "es") || a.jugador.localeCompare(b.jugador, "es"));
  } catch { /* datos FEB no disponibles: el vídeo funciona sin vínculo */ }
}

export async function vistaEditor(root, id) {
  const videos = await invoke("listar_videos");
  const video = videos.find((v) => String(v.id) === String(id));
  if (!video) { location.replace("#/video"); return; }
  if (V.video?.id !== video.id) Object.assign(V, { video, sel: null, pendiente: null, ini: null, fin: null, jugadorActivo: "", filtro: "" });
  V.video = video;
  [V.botones, V.eventos, V.sincros, V.docs] = await Promise.all([invoke("listar_botones"), invoke("listar_eventos", { videoId: video.id }), invoke("listar_sincros", { videoId: video.id }), cargarEnlazables()]);
  await resolverPartido();
  pintar(root);
  const t = Number(paramHash("t")); // #/video?v=ID&t=SEG: salta a la jugada
  if (t > 0) { const el = root.querySelector("video"); if (el) { const ir = () => { el.currentTime = t; }; if (el.readyState >= 1) ir(); else el.addEventListener("loadedmetadata", ir, { once: true }); } }
}

const claveJ = (j) => `${j.equipo}\x01${j.jugador}`;

function pintar(root) {
  const cab = h("div", { class: "vid-cab" }, h("a", { class: "btn peq", href: "#/video" }, "← Vídeos"), h("b", { class: "vid-h", text: V.video.titulo }),
    V.partido ? h("span", { class: "vid-ok", text: `🔗 ${V.partido.equipo_local} – ${V.partido.equipo_visitante}` }) : null,
    h("a", { class: "btn peq", href: "#/video?lista=1" }, "▶ Listas de reproducción"));

  const faltaAviso = V.video.existe === false ? h("div", { class: "vid-falta" }, h("span", { text: `No encuentro el archivo de este vídeo (${V.video.ruta}). Localízalo desde la lista de vídeos. Tus jugadas se conservan.` })) : null;
  const vid = videoEl(V.video, { controls: true });
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
  const guardar = async (e) => { await invoke("guardar_evento", { evento: { id: e.id, video_id: V.video.id, boton_id: e.boton_id, t_ini: e.t_ini, t_fin: e.t_fin, nota: e.nota, equipo: e.equipo, jugador: e.jugador, cuarto: e.cuarto, reloj_s: e.reloj_s, equipo_id: e.equipo_id || null, jugador_id: e.jugador_id || null } }); };

  let tramo = null; // jugada que se está reproduciendo: al llegar a su final, se pausa
  const reproducir = (ini, fin) => { tramo = { ini, fin }; vid.currentTime = ini; vid.play(); };
  const saltar = (e) => { V.ini = V.fin = null; V.sel = e.id; reproducir(e.t_ini, e.t_fin); pintarTabla(); recorte.pintar(); };
  vid.addEventListener("timeupdate", () => {
    if (!tramo) return;
    if (vid.currentTime < tramo.ini - 1 || vid.currentTime > tramo.fin + 1) tramo = null; // el usuario se ha ido a otro punto
    else if (vid.currentTime >= tramo.fin) { tramo = null; vid.pause(); }
  });
  const pintarTl = () => {
    const d = vid.duration || 0, pos = (t) => (d ? Math.min(100, (t / d) * 100) : 0);
    const seg = (ini, fin, props) => h("button", { type: "button", ...props, style: `left:${pos(ini)}%;width:${pos(fin) - pos(ini)}%;${props.style || ""}` });
    tl.replaceChildren(...V.eventos.map((e) => seg(e.t_ini, e.t_fin, { class: "vid-marca" + (V.sel === e.id ? " sel" : ""), style: `background:${e.color || "#888"}`, title: `${fmt(e.t_ini)}–${fmt(e.t_fin)} ${e.boton || ""}`, onclick: (ev) => { ev.stopPropagation(); saltar(e); } })),
      ...(V.ini != null ? [seg(V.ini, V.fin ?? Math.max(V.ini, vid.currentTime), { class: "vid-marca nueva", title: "Jugada sin guardar" })] : []));
  };
  tl.addEventListener("click", (ev) => { const r = tl.getBoundingClientRect(); if (vid.duration) vid.currentTime = ((ev.clientX - r.left) / r.width) * vid.duration; });

  // ---- inicio y final marcados por el usuario ----
  const marcarInicio = () => { V.ini = vid.currentTime; if (V.fin != null && V.fin <= V.ini) V.fin = null; V.sel = null; recorte.pintar(); pintarTabla(); };
  const marcarFin = () => {
    if (V.ini == null || vid.currentTime <= V.ini) { decir("Marca primero el inicio (tecla I) en un punto anterior del vídeo."); return; }
    V.fin = vid.currentTime; vid.pause(); decir(""); recorte.pintar(); pintarTl();
  };
  const descartar = () => { V.ini = V.fin = null; recorte.pintar(); pintarTl(); };

  const selJugador = (valor, onCambio, vacio = "Jugador") => {
    const equipos = V.partido ? [V.partido.equipo_local, V.partido.equipo_visitante] : [];
    return h("select", { class: "vid-jug", onchange: (ev) => onCambio(ev.target.value) }, h("option", { value: "", text: vacio }),
      equipos.map((eq) => h("optgroup", { label: eq }, V.jugadores.filter((j) => j.equipo === eq).map((j) => h("option", { value: claveJ(j), selected: claveJ(j) === valor || null, text: j.jugador })))));
  };
  const aplicarJugador = (e, clave) => { const [eq, ju] = clave ? clave.split("\x01") : [null, null]; e.equipo = eq; e.jugador = ju; const j = clave && V.jugadores.find((x) => claveJ(x) === clave); e.equipo_id = j?.equipo_id || null; e.jugador_id = j?.jugador_id || null; }; // los ids de la FEB enlazan la marca con notas y jugadas

  // enlaces a notas y jugadas del Playbook citadas en la nota de la marca: se pueden abrir con un clic
  const enlacesDe = (e) => { const caja = h("div", { class: "vid-enls" }); pintarEnlaces(caja, V.docs, e.nota); return caja; };
  const botonEnlace = (e, nota, tipo, icono, ayuda) => h("button", { type: "button", class: "btn fantasma vid-b", title: ayuda, "aria-label": ayuda, onclick: async () => {
    const m = await elegirDocumento({ tipos: [tipo] }); if (!m) return;
    nota.value = `${nota.value} ${m}`.trim(); e.nota = nota.value; await guardar(e); const caja = nota.closest("td")?.querySelector(".vid-enls"); if (caja) pintarEnlaces(caja, V.docs, e.nota); } }, icono);

  const fila = (e, i) => {
    const nota = h("textarea", { rows: 1, placeholder: "¿Por qué lo marcas?", onchange: async () => { e.nota = nota.value; await guardar(e); const caja = nota.closest("td")?.querySelector(".vid-enls"); if (caja) pintarEnlaces(caja, V.docs, e.nota); if (e.nota.trim() && V.pendiente === e.id) { V.pendiente = null; pintarTabla(); } },
      onkeydown: (ev) => { if (ev.key === "Escape" || (ev.key === "Enter" && !ev.shiftKey)) { ev.preventDefault(); nota.blur(); } } }, e.nota || "");
    const juego = h("input", { class: "vid-juego", value: fmtJuego(e.cuarto, e.reloj_s), placeholder: "2T 7:32", title: "Cuarto y reloj del partido (ej. 2T 7:32)",
      onchange: async () => { const p = parseJuego(juego.value); if (p) { e.cuarto = p.cuarto; e.reloj_s = p.reloj_s; } else if (!juego.value.trim()) { e.cuarto = null; e.reloj_s = null; } juego.value = fmtJuego(e.cuarto, e.reloj_s); await guardar(e); },
      onkeydown: (ev) => { if (ev.key === "Escape" || ev.key === "Enter") juego.blur(); } });
    return h("tr", { class: V.sel === e.id ? "sel" : "", "data-id": e.id, onclick: (ev) => { if (!ev.target.closest("button,a,select,input,textarea") && V.sel !== e.id) saltar(e); } },
      h("td", { text: i + 1 }),
      h("td", null, h("button", { type: "button", class: "vid-t", onclick: () => saltar(e) }, `▶ ${fmt(e.t_ini)}–${fmt(e.t_fin)}`)),
      h("td", null, juego),
      h("td", null, h("select", { class: "vid-chip", style: `background:${e.color || "#888"}`, "aria-label": "Etiqueta", onchange: async (ev) => { const b = V.botones.find((x) => String(x.id) === ev.target.value); Object.assign(e, { boton_id: b?.id ?? null, boton: b?.nombre ?? null, color: b?.color ?? null }); await guardar(e); pintarTabla(); } },
        h("option", { value: "", text: "Sin etiqueta" }), V.botones.map((b) => h("option", { value: b.id, selected: b.id === e.boton_id || null, text: b.nombre })))),
      V.partido ? h("td", null, selJugador(e.jugador ? `${e.equipo}\x01${e.jugador}` : "", async (c) => { aplicarJugador(e, c); await guardar(e); })) : null,
      h("td", { class: "vid-nota" }, h("div", { class: "vid-nota-fila" }, nota, botonEnlace(e, nota, "jugada", "🏀", "Enlazar una jugada del Playbook en la nota de esta marca"), botonEnlace(e, nota, "nota", "📝", "Enlazar una nota en la nota de esta marca")), enlacesDe(e)),
      h("td", null, h("button", { type: "button", class: "btn fantasma", "aria-label": "Borrar jugada", onclick: async () => { await invoke("borrar_evento", { id: e.id }); V.eventos = V.eventos.filter((x) => x.id !== e.id); if (V.sel === e.id) V.sel = null; pintarTabla(); recorte.pintar(); } }, "✕")));
  };
  const cuenta = h("b");
  const COLS = [["n", "#"], ["t", "Vídeo"], ["juego", "Juego"], ["boton", "Etiqueta"], V.partido ? ["jugador", "Jugador"] : null, ["nota", "Nota"]].filter(Boolean);
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
    cuenta.textContent = `Jugadas guardadas (${V.eventos.length})`;
    pintarCabecera();
    tabla.replaceChildren(...(ev.length ? ev.map((e) => fila(e, V.eventos.indexOf(e))) : [h("tr", null, h("td", { colspan: 7, class: "vid-vacio", text: "Sin jugadas todavía. Marca inicio (I) y fin (O) y elige una etiqueta, o pulsa directamente un botón mientras ves el partido." }))]));
    pintarTl();
  };

  // Guarda una jugada con la etiqueta `b` (o sin etiqueta). Con inicio marcado usa ese tramo; si no, «antes/después» del botón.
  const marcar = async (b) => {
    vid.pause(); // al registrar un momento, el vídeo se detiene para poder escribir la nota
    tramo = null;
    const t = vid.currentTime, propio = V.ini != null;
    const t_ini = propio ? V.ini : Math.max(0, t - (b?.pre_s ?? 5));
    const t_fin = propio ? (V.fin ?? (t > V.ini ? t : V.ini + (b?.post_s ?? 5))) : t + (b?.post_s ?? 5);
    const r = relojEn(propio ? t_ini : t);
    const ev = { video_id: V.video.id, boton_id: b?.id ?? null, t_ini, t_fin, nota: "", equipo: null, jugador: null, cuarto: r?.cuarto ?? null, reloj_s: r ? Math.round(r.reloj_s) : null };
    if (V.partido && V.jugadorActivo) aplicarJugador(ev, V.jugadorActivo);
    ev.id = await invoke("guardar_evento", { evento: ev });
    ev.boton = b?.nombre ?? null; ev.color = b?.color ?? null;
    V.eventos.push(ev); V.eventos.sort((a, c) => a.t_ini - c.t_ini); V.sel = ev.id; V.pendiente = ev.id; V.ini = V.fin = null;
    pintarTabla(); recorte.pintar();
    document.querySelector(".vid-tabla")?.scrollTo(0, 0);
    document.querySelector(`tr[data-id="${ev.id}"] textarea`)?.focus(); // escribir el porqué de inmediato (Enter/Esc vuelve a los atajos)
  };

  const recorte = recortador(vid, {
    objetivo: () => { if (V.ini != null) return { nueva: true, ini: V.ini, fin: V.fin }; const e = V.eventos.find((x) => x.id === V.sel); return e ? { nueva: false, id: e.id, ini: e.t_ini, fin: e.t_fin, nombre: e.boton || "Sin etiqueta" } : null; },
    mover: (ini, fin) => { tramo = null; if (V.ini != null) { V.ini = ini; V.fin = fin; } else { const e = V.eventos.find((x) => x.id === V.sel); if (e) { e.t_ini = ini; e.t_fin = fin; } } pintarTl(); },
    soltar: async () => { if (V.ini != null) return; const e = V.eventos.find((x) => x.id === V.sel); if (e) { await guardar(e); V.eventos.sort((a, c) => a.t_ini - c.t_ini); pintarTabla(); } },
    inicio: marcarInicio, fin: marcarFin, descartar, reproducir, guardarSinEtiqueta: () => marcar(null),
    cerrar: () => { V.sel = null; tramo = null; pintarTabla(); recorte.pintar(); },
  });

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
    h("option", { value: "", text: "Todas las jugadas" }), V.botones.map((b) => h("option", { value: b.id, selected: String(b.id) === V.filtro || null, text: b.nombre })));

  const teclas = (ev) => {
    if (ev.key === " ") { ev.preventDefault(); vid.paused ? vid.play() : vid.pause(); return; }
    if (ev.key === "ArrowLeft") { ev.preventDefault(); vid.currentTime -= ev.shiftKey ? 10 : 3; return; }
    if (ev.key === "ArrowRight") { ev.preventDefault(); vid.currentTime += ev.shiftKey ? 10 : 3; return; }
    if (ev.key === "Escape") { if (V.ini != null) descartar(); return; }
    const id = idTecla(ev);
    if (id === "I") { marcarInicio(); return; }
    if (id === "O") { marcarFin(); return; }
    if (id === "C") { capturar(); return; }
    const b = id && V.botones.find((x) => x.atajo === id);
    if (b) { ev.preventDefault(); marcar(b); }
  };
  activarAtajos(teclas, vid);
  vid.addEventListener("timeupdate", () => { recorte.cursor(); if (V.ini != null && V.fin == null) pintarTl(); });
  vid.addEventListener("loadedmetadata", () => { recorte.pintar(); if (!V.video.duracion && vid.duration) { V.video.duracion = vid.duration; invoke("actualizar_video", { id: V.video.id, datos: { duracion: vid.duration } }).catch(() => {}); } });

  root.replaceChildren(cab,
    h("div", { class: "vid-main" },
      h("div", { class: "vid-izq" }, faltaAviso, vid, tl, recorte.el, barraReloj, aviso,
        h("p", { class: "vid-ayuda", text: "Espacio: pausa · ←/→: ±3 s (Mayús ±10 s) · I: inicio · O: fin · Esc: descartar · atajo de cada botón: guardar jugada · C: captura" })),
      panelBotones),
    h("div", { class: "card vid-reg" }, h("div", { class: "vid-der-cab" }, cuenta, filtro),
      h("div", { class: "vid-tabla" }, h("table", null,
        h("thead", null, cabecera), tabla))));
  pintarTabla(); pintarSincros(); pintarEstim(); recorte.pintar();
}
