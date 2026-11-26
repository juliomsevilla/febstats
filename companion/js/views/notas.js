// Vista «Notas»: notas en Markdown del entrenador, vinculables a temporada / equipo / jugador / partido (o generales).
// Editor con vista previa, enlaces [[nota]] a lo Obsidian, imágenes, autoguardado con historial de versiones, búsqueda completa y
// exportación a HTML, Word y PDF (más impresión). Las notas viven en la base de datos (usuario.db), con sus versiones e imágenes; el asistente también las consulta.
import { h, dialogo, vacioMsg, menu } from "../util.js";
import { invoke, MODO, guardarArchivo, enLocal } from "../api.js";
import { md } from "../md.js";
import { S, paramHash } from "../state.js";
import { formulario, contextoActual, chipsDe } from "./vinculo.js";
import { svgJugada, aPng as svgAPng } from "../pizarra.js";
import { panelRelacionado } from "./relacionado.js";
import { docsDeNotas } from "../relaciones.js";
import { cargarLibs, renderizar, hidratarImagenes, plegar, esc, estiloKatex, documentoHtml, titulos } from "../mdx.js";
import { crearDocx } from "../docx.js";

const EDITABLE = !enLocal; // en el iPad las notas son de solo lectura
const P = {
  lado: true, jugadas: [], todas: [], resultados: [], sel: null, docs: new Map(), cm: null, vista: "dividida", cargada: false, token: 0,
  f: { q: "", regex: false, mayus: false, temporada: "", equipo: "", jugador: "" }, payloads: new Map(), imgs: new Map(),
};
try { P.vista = localStorage.getItem("nt-vista") || "dividida"; P.lado = localStorage.getItem("nt-lado") !== "0"; } catch { /* sin almacenamiento */ }

const pad = (n, l = 2) => String(n).padStart(l, "0");
const sello = (d = new Date()) => `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())} ${pad(d.getHours())}${pad(d.getMinutes())}${pad(d.getSeconds())}.${pad(d.getMilliseconds(), 3)}`;
const fechaHora = (ms) => new Date(Number(ms)).toLocaleString("es-ES", { dateStyle: "short", timeStyle: "medium" });
const horaCorta = () => new Date().toLocaleTimeString("es-ES");
const msg = (e) => (typeof e === "string" ? e : e?.message || String(e));
const errorDlg = (e) => dialogo("No se pudo completar", h("p", { text: msg(e) }));
const nombreArchivo = (t) => (t || "nota").replace(/[\\/:*?"<>|\n\r]+/g, "-").replace(/\s+/g, " ").trim().slice(0, 80) || "nota";

// ---------- resolución de [[enlaces]] ----------
function resolver(nombre) {
  const m = String(nombre).trim().match(/^nota:(\d+)/); if (m) return P.todas.find((n) => String(n.id) === m[1]) || null; // [[nota:12|Título]]: enlace por id (títulos repetidos)
  const q = plegar(String(nombre).trim());
  if (!q) return null;
  return P.todas.find((n) => plegar(n.titulo) === q) || null;
}
const nombreEnlace = (n) => (P.todas.filter((m) => plegar(m.titulo) === plegar(n.titulo)).length > 1 ? `nota:${n.id}|${n.titulo.replace(/[\[\]|]/g, "")}` : n.titulo);
const enlazanA = (n) => P.todas.filter((m) => m.id !== n.id && m.enlaces.some((e) => resolver(e)?.id === n.id));

// ---------- lista y búsqueda ----------
async function refrescarLista() {
  const yo = ++P.token;
  P.todas = await invoke("notas_listar"); P.jugadas = (await invoke("listar_jugadas").catch(() => [])) || [];
  const f = P.f;
  let r;
  if (f.q.trim()) {
    try { r = await invoke("notas_buscar", { consulta: f.q, regex: f.regex, mayus: f.mayus, filtro: filtroServidor() }); P.errorBusqueda = ""; }
    catch (e) { P.errorBusqueda = msg(e); r = []; }
  } else {
    P.errorBusqueda = "";
    r = P.todas.filter((n) => coincideFiltro(n));
  }
  if (yo !== P.token) return;
  P.resultados = r;
}
function filtroServidor() {
  const f = P.f, o = {};
  if (f.temporada === "\x00") o.general = true; else if (f.temporada) o.temporada = f.temporada;
  if (f.equipo) o.equipo = f.equipo; if (f.jugador) o.jugador = f.jugador;
  return o;
}
function coincideFiltro(n) {
  const f = P.f, m = n.meta;
  if (f.temporada === "\x00" && m.temporada) return false;
  if (f.temporada && f.temporada !== "\x00" && m.temporada !== f.temporada) return false;
  return (!f.equipo || m.equipo_txt === f.equipo) && (!f.jugador || m.jugador_txt === f.jugador);
}
const unicos = (k, base) => [...new Set(base.map((n) => n.meta[k]).filter(Boolean))].sort((a, b) => a.localeCompare(b, "es"));

function resaltar(texto, q) {
  if (!q.trim() || P.f.regex) return [texto];
  const t = plegar(texto), qq = plegar(q.trim()), out = []; let i = 0;
  // plegar() no cambia la longitud de los caracteres sin acento, que es el caso normal; si cambiara, se muestra sin resaltar
  if (t.length !== texto.length) return [texto];
  for (let k = t.indexOf(qq); k >= 0; k = t.indexOf(qq, i)) { out.push(texto.slice(i, k), h("mark", { text: texto.slice(k, k + qq.length) })); i = k + qq.length; }
  out.push(texto.slice(i)); return out;
}

// ---------- guardado ----------
function metaDe(e) { return { ...e.meta }; }
function guardarEntrada(e, forzar = false) {
  if (!e.doc) return Promise.resolve(); // visor (iPad): nada que guardar
  const texto = e.doc.getValue();
  if (!forzar && texto === e.base && !e.metaSucia) return Promise.resolve();
  e.cola = (e.cola || Promise.resolve()).then(async () => {
    const contenido = e.doc.getValue(), meta = metaDe(e);
    try {
      await invoke("notas_guardar", { id: e.id, meta, contenido, forzar });
      e.base = contenido; e.metaSucia = false; e.error = "";
      if (P.sel === e.id) estado(`Guardado ${horaCorta()}`);
      actualizarLocal(e);
    } catch (x) { e.error = msg(x); if (P.sel === e.id) estado(`⚠ ${e.error}`, true); }
  });
  return e.cola;
}
function actualizarLocal(e) {
  const n = P.todas.find((m) => m.id === e.id); if (!n) return;
  n.meta = { ...e.meta }; n.titulo = e.meta.titulo || (e.doc.getValue().match(/^# (.+)$/m) || [])[1] || n.titulo; n.modificada = Date.now();
  n.enlaces = [...e.doc.getValue().matchAll(/\[\[([^\]\n|#]+)/g)].map((m) => m[1].trim());
  clearTimeout(P.tLista); P.tLista = setTimeout(async () => { await refrescarLista(); pintarLista(); pintarEnlaces(); }, 600);
}
async function guardarTodo(forzar = false) { await Promise.all([...P.docs.values()].map((e) => guardarEntrada(e, forzar))); }
if (!window.__ntFlush) { window.__ntFlush = true; window.addEventListener("hashchange", () => guardarTodo()); window.addEventListener("pagehide", () => guardarTodo(true)); }

let refs = {}; // elementos de la interfaz actual
function estado(t, mal = false) { if (refs.estado) { refs.estado.textContent = t; refs.estado.classList.toggle("mal", mal); } }

// ---------- abrir / crear / borrar ----------
/** Visor de solo lectura (iPad): cabecera, vista previa y enlaces; sin editor ni guardado. */
async function abrirVisor(id) {
  let e = P.docs.get(id);
  if (!e) { const r = await invoke("notas_leer", { id }); e = { id, meta: r.meta, texto: r.contenido }; P.docs.set(id, e); }
  P.sel = id;
  if (innerWidth <= 900) { P.lado = false; refs.root?.querySelector(".nt")?.classList.add("sin-lado"); }
  pintarLista(); pintarVisor();
}
function clicsEnPrevia(pv) {
  pv.addEventListener("click", (ev) => {
    const a = ev.target.closest("a[href]"); if (!a) return;
    const href = a.getAttribute("href");
    if (href.startsWith("#wiki=")) { ev.preventDefault(); abrirEnlace(decodeURIComponent(href.slice(6))); }
    else if (href.startsWith("#")) { ev.preventDefault(); document.getElementById(decodeURIComponent(href.slice(1)))?.scrollIntoView({ block: "start" }); }
    else { ev.preventDefault(); } // los enlaces web no se abren dentro de la app
  });
}
async function abrirVisorSinPintar(id) { const r = await invoke("notas_leer", { id }); P.docs.set(id, { id, meta: r.meta, texto: r.contenido }); P.sel = id; }
function pintarVisor() {
  const main = refs.main, e = P.docs.get(P.sel);
  if (!e) { main.replaceChildren(h("div", { class: "nt-cab" }, botonLado()), h("div", { class: "nt-inicio" }, vacioMsg("Notas", "Tus notas del Mac, para consultar. Elige una en la lista."))); refs.pv = refs.enlaces = refs.pie = null; return; }
  const n = P.todas.find((m) => m.id === e.id);
  refs.pv = h("article", { class: "nt-pv mdx", "aria-label": "Nota" }); refs.enlaces = h("div", { class: "nt-enlaces" }); refs.pie = h("small", { class: "nt-pie" });
  refs.vinculo = h("span", { class: "nt-chips" }, chipsDe(e.meta).map((t) => h("i", { text: t })));
  main.replaceChildren(h("div", { class: "nt-cab" }, botonLado(), h("h2", { class: "nt-titulo-fijo", text: n?.titulo || "Nota" }), refs.vinculo,
    h("button", { type: "button", class: "btn", onclick: relacionadoDeNota }, "🔗 Relacionado")),
    h("div", { class: "nt-visor" }, refs.pv), h("div", { class: "nt-base" }, refs.enlaces, refs.pie));
  refs.pie.textContent = n ? `${n.palabras} palabras${e.meta.creada ? ` · creada ${e.meta.creada.slice(0, 19)}` : ""}` : "";
  clicsEnPrevia(refs.pv); pintarPrevia(); pintarEnlaces();
}
async function abrirNota(id) {
  if (!EDITABLE) return abrirVisor(id);
  if (P.sel && P.docs.has(P.sel)) guardarEntrada(P.docs.get(P.sel), true);
  let e = P.docs.get(id);
  if (!e) {
    const r = await invoke("notas_leer", { id });
    const doc = CodeMirror.Doc(r.contenido, "markdown");
    e = { id, doc, meta: r.meta, base: r.contenido, metaSucia: false };
    doc.on("change", () => cambio(e));
    P.docs.set(id, e);
  }
  P.sel = id;
  if (innerWidth <= 900) { P.lado = false; refs.root?.querySelector(".nt")?.classList.add("sin-lado"); } // pantalla estrecha: al abrir una nota se oculta la lista
  if (!P.cm || !refs.trabajo) { pintarLista(); pintarMain(); P.cm?.focus(); return; } // venía de la pantalla de inicio: se construye el editor
  P.cm.swapDoc(e.doc); P.cm.focus();
  pintarLista(); pintarCabecera(); pintarPrevia(); pintarEnlaces(); estado(e.error ? `⚠ ${e.error}` : "");
}
function cambio(e) {
  clearTimeout(e.t); e.t = setTimeout(() => guardarEntrada(e), 800);
  if (P.sel === e.id) { estado("Sin guardar…"); clearTimeout(P.tPrev); P.tPrev = setTimeout(pintarPrevia, 180); pintarPie(); }
}
async function crearNota(meta, contenido = "") {
  const s = sello();
  const r = await invoke("notas_crear", { meta: { ...meta, creada: s }, contenido, sello: s });
  await refrescarLista();
  await abrirNota(r.id);
  return r.id;
}
function confirmar(titulo, texto, boton, onOk) {
  const d = dialogo(titulo, h("div", null, h("p", { text: texto }), h("div", { class: "nt-acciones" },
    h("button", { type: "button", class: "btn", onclick: () => d.close() }, "Cancelar"),
    h("button", { type: "button", class: "btn primario", onclick: async () => { d.close(); await onOk(); } }, boton))));
}
function borrarNota() {
  const e = P.docs.get(P.sel); if (!e) return;
  const n = P.todas.find((m) => m.id === e.id);
  confirmar("Borrar nota", `«${n?.titulo || "esta nota"}» se quitará de tus notas.`, "Borrar", async () => {
    try {
      clearTimeout(e.t); await e.cola;
      await invoke("notas_borrar", { id: e.id });
      P.docs.delete(e.id); P.sel = null;
      await refrescarLista(); pintar();
    } catch (x) { errorDlg(x); }
  });
}

function nuevaNota() {
  formulario({ titulo: "Nueva nota", inicial: contextoActual(), textoBoton: "Crear nota", conTitulo: true,
    onOk: async (m) => { const { titulo, ...resto } = m; await crearNota({ ...resto, titulo }, titulo ? `# ${titulo}\n\n` : ""); P.cm?.focus(); } });
}
function vincular() {
  const e = P.docs.get(P.sel); if (!e) return;
  formulario({ titulo: "Vinculación de la nota", inicial: e.meta, textoBoton: "Guardar",
    onOk: async (m) => { const { titulo, ...resto } = m; e.meta = { ...e.meta, ...resto }; e.metaSucia = true; await guardarEntrada(e, true); await refrescarLista(); pintarCabecera(); pintarLista(); } });
}

// ---------- editor ----------
function envolver(cm, a, b = a) {
  const s = cm.getSelection();
  if (s) cm.replaceSelection(a + s + b); else { const c = cm.getCursor(); cm.replaceSelection(a + b); cm.setCursor({ line: c.line, ch: c.ch + a.length }); }
  cm.focus();
}
function prefijar(cm, f) {
  const a = cm.getCursor("from").line, b = cm.getCursor("to").line;
  for (let i = a; i <= b; i++) cm.replaceRange(f(i - a, cm.getLine(i)), { line: i, ch: 0 }, { line: i, ch: cm.getLine(i).length });
  cm.focus();
}
function bloqueTexto(cm, t) { const c = cm.getCursor(); const antes = c.ch > 0 ? "\n" : ""; cm.replaceSelection(antes + t); cm.focus(); }
const ACCIONES = {
  negrita: (cm) => envolver(cm, "**"), cursiva: (cm) => envolver(cm, "*"), tachado: (cm) => envolver(cm, "~~"), codigo: (cm) => envolver(cm, "`"),
  h1: (cm) => prefijar(cm, (_, l) => "# " + l.replace(/^#+\s*/, "")), h2: (cm) => prefijar(cm, (_, l) => "## " + l.replace(/^#+\s*/, "")), h3: (cm) => prefijar(cm, (_, l) => "### " + l.replace(/^#+\s*/, "")),
  lista: (cm) => prefijar(cm, (_, l) => "- " + l), numerada: (cm) => prefijar(cm, (i, l) => `${i + 1}. ${l}`), tarea: (cm) => prefijar(cm, (_, l) => "- [ ] " + l), cita: (cm) => prefijar(cm, (_, l) => "> " + l),
  bloque: (cm) => { const s = cm.getSelection(); cm.replaceSelection("```\n" + s + "\n```"); if (!s) { const c = cm.getCursor(); cm.setCursor({ line: c.line - 1, ch: 0 }); } cm.focus(); },
  tabla: (cm) => bloqueTexto(cm, "| Columna 1 | Columna 2 | Columna 3 |\n| --- | --- | --- |\n|  |  |  |\n"),
  enlace: (cm) => { const s = cm.getSelection(); if (s) cm.replaceSelection(`[${s}](https://)`); else envolver(cm, "[", "](https://)"); cm.focus(); },
  nota: (cm) => { envolver(cm, "[[", "]]"); sugerirWiki(cm); },
  formula: (cm) => envolver(cm, "$"),
  aviso: (cm) => bloqueTexto(cm, "> [!NOTE]\n> Texto del aviso\n"),
  pie: (cm) => { const n = (cm.getValue().match(/\[\^(\d+)\]:/g) || []).length + 1; cm.replaceSelection(`[^${n}]`); cm.replaceRange(`\n\n[^${n}]: `, { line: cm.lastLine(), ch: cm.getLine(cm.lastLine()).length }); cm.focus(); },
  regla: (cm) => bloqueTexto(cm, "\n---\n"),
};
function continuarLista(cm) {
  if (cm.somethingSelected()) return CodeMirror.Pass;
  const c = cm.getCursor(), l = cm.getLine(c.line);
  const m = l.match(/^(\s*)([-*+]|\d+[.)])\s+(\[[ xX]\]\s+)?(.*)$/);
  if (!m || c.ch < l.length) return CodeMirror.Pass;
  if (!m[4].trim()) { cm.replaceRange("", { line: c.line, ch: 0 }, { line: c.line, ch: l.length }); return; } // elemento vacío: termina la lista
  const marca = /\d/.test(m[2]) ? `${parseInt(m[2], 10) + 1}${m[2].slice(-1)}` : m[2];
  cm.replaceSelection(`\n${m[1]}${marca} ${m[3] ? "[ ] " : ""}`);
}
function crearEditor(el) {
  const teclas = { Enter: continuarLista, "Ctrl-B": ACCIONES.negrita, "Cmd-B": ACCIONES.negrita, "Ctrl-I": ACCIONES.cursiva, "Cmd-I": ACCIONES.cursiva, "Ctrl-K": ACCIONES.enlace, "Cmd-K": ACCIONES.enlace,
    "Ctrl-S": () => guardarTodo(true), "Cmd-S": () => guardarTodo(true), Tab: (cm) => (cm.somethingSelected() ? cm.indentSelection("add") : cm.replaceSelection("  ")), "Shift-Tab": (cm) => cm.indentSelection("subtract") };
  const e = P.docs.get(P.sel);
  const cm = CodeMirror(el, { value: e ? e.doc : "", mode: "markdown", lineWrapping: true, indentUnit: 2, tabSize: 2, extraKeys: teclas, placeholder: "Escribe en Markdown… [[ para enlazar otra nota; pega o arrastra imágenes" });
  cm.on("cursorActivity", () => sugerirWiki(cm));
  cm.on("blur", cerrarWiki);
  cm.on("paste", (c, ev) => {
    const cd = ev.clipboardData; if (!cd) return;
    let fs = [...(cd.files || [])].filter((f) => f.type.startsWith("image/"));
    if (!fs.length) fs = [...(cd.items || [])].filter((i) => i.kind === "file" && i.type.startsWith("image/")).map((i) => i.getAsFile()).filter(Boolean); // capturas de pantalla (WebKit)
    if (fs.length) { ev.preventDefault(); subirImagenes(fs); }
  });
  cm.on("drop", (c, ev) => { const fs = [...(ev.dataTransfer?.files || [])].filter((f) => f.type.startsWith("image/")); if (fs.length) { ev.preventDefault(); c.setCursor(c.coordsChar({ left: ev.clientX, top: ev.clientY })); subirImagenes(fs); } });
  cm.on("scroll", () => { if (P.vista !== "dividida" || P.sincronizando) return; const i = cm.getScrollInfo(), pv = refs.pv; if (!pv) return; P.sincronizando = true; pv.scrollTop = (i.top / Math.max(1, i.height - i.clientHeight)) * (pv.scrollHeight - pv.clientHeight); requestAnimationFrame(() => { P.sincronizando = false; }); });
  cm.on("historyAdded", actualizarDeshacer); cm.on("change", actualizarDeshacer); cm.on("swapDoc", actualizarDeshacer);
  return cm;
}
function actualizarDeshacer() { if (!P.cm || !refs.deshacer) return; const hs = P.cm.historySize(); refs.deshacer.disabled = !hs.undo; refs.rehacer.disabled = !hs.redo; }

// ---------- imágenes ----------
const EXT_MIME = { "image/png": "png", "image/jpeg": "jpg", "image/gif": "gif", "image/webp": "webp" };
const aBase64 = (f) => new Promise((ok, mal) => { const r = new FileReader(); r.onload = () => ok(String(r.result).split(",")[1]); r.onerror = () => mal(r.error); r.readAsDataURL(f); });
async function aPng(f) { // convierte cualquier imagen que el navegador sepa abrir a PNG
  const bmp = await createImageBitmap(f); const c = document.createElement("canvas"); c.width = bmp.width; c.height = bmp.height; c.getContext("2d").drawImage(bmp, 0, 0);
  return await new Promise((ok, mal) => c.toBlob((b) => (b ? ok(b) : mal(new Error("sin imagen"))), "image/png"));
}
async function subirImagenes(files) {
  if (!P.cm) return;
  const e = P.docs.get(P.sel); if (!e) return;
  let k = 0;
  for (const f of files) {
    let ext = EXT_MIME[f.type], datos = f;
    if (!ext) { try { datos = await aPng(f); ext = "png"; } catch { estado(`No se pudo leer la imagen (${f.type || f.name}). Usa PNG, JPG, GIF o WEBP.`, true); continue; } } // p. ej. TIFF o HEIC → PNG
    try {
      const nombre = await invoke("notas_guardar_imagen", { nombre: `img-${sello().replace(/[ :]/g, "-")}${files.length > 1 ? `-${++k}` : ""}.${ext}`, base64: await aBase64(datos) });
      P.cm.replaceSelection(`![${(f.name || "").replace(/\.[^.]+$/, "").replace(/[\[\]]/g, "")}](imagenes/${encodeURI(nombre)})\n`);
    } catch (x) { estado(`⚠ ${msg(x)}`, true); }
  }
  P.cm.focus();
}
const leerImagen = (n) => { if (!P.imgs.has(n)) P.imgs.set(n, invoke("notas_leer_imagen", { nombre: n }).catch((x) => { P.imgs.delete(n); throw x; })); return P.imgs.get(n); };

// ---------- autocompletado de [[ ]] ----------
let wl, wItems = [], wSel = 0, wDesde = null, wTeclas = null;
function cerrarWiki() { if (wl && !wl.hidden) { wl.hidden = true; P.cm?.removeKeyMap(wTeclas); } }
function pintarWiki() {
  wl.replaceChildren(...wItems.map((n, i) => h("div", { class: i === wSel ? "on" : "", onmousedown: (ev) => { ev.preventDefault(); wSel = i; elegirWiki(); } }, h("b", { text: n.titulo }), h("small", { text: [n.meta.temporada, n.meta.equipo_txt, n.meta.jugador_txt].filter(Boolean).join(" · ") }))));
  wl.children[wSel]?.scrollIntoView({ block: "nearest" });
}
function elegirWiki() {
  const cm = P.cm, n = wItems[wSel]; if (!n) return;
  const c = cm.getCursor(); const sigue = cm.getRange(c, { line: c.line, ch: c.ch + 2 }) === "]]";
  cm.replaceRange(n.ins + (sigue ? "" : "]]"), wDesde, c); if (sigue) cm.setCursor({ line: c.line, ch: wDesde.ch + n.ins.length + 2 });
  cerrarWiki(); cm.focus();
}
function sugerirWiki(cm) {
  const c = cm.getCursor(), m = P.sel && cm.getLine(c.line).slice(0, c.ch).match(/\[\[([^\]\n|]*)$/);
  if (!m) return cerrarWiki();
  const q = plegar(m[1]);
  wItems = [...P.todas.filter((n) => n.id !== P.sel && plegar(n.titulo).includes(q)).map((n) => ({ ...n, ins: nombreEnlace(n) })),
    ...P.jugadas.filter((j) => plegar(j.titulo).includes(q) || "jugada".includes(q)).map((j) => ({ titulo: `🏀 ${j.titulo}`, meta: { temporada: "Jugada del Playbook", equipo_txt: j.equipo_txt, jugador_txt: j.jugador_txt }, ins: `jugada:${j.id}|${j.titulo.replace(/[\[\]|]/g, "")}` }))].slice(0, 14);
  if (!wItems.length) return cerrarWiki();
  if (!wl) { wl = h("div", { id: "nt-wiki", hidden: true }); document.body.append(wl); }
  wSel = 0; wDesde = { line: c.line, ch: c.ch - m[1].length };
  const pos = cm.cursorCoords(c, "window"); wl.style.left = `${Math.min(pos.left, innerWidth - 320)}px`; wl.style.top = `${pos.bottom + 2}px`;
  if (wl.hidden) {
    wl.hidden = false;
    wTeclas = { Down: () => { wSel = (wSel + 1) % wItems.length; pintarWiki(); }, Up: () => { wSel = (wSel - 1 + wItems.length) % wItems.length; pintarWiki(); }, Enter: elegirWiki, Tab: elegirWiki, Esc: cerrarWiki };
    cm.addKeyMap(wTeclas);
  }
  pintarWiki();
}

// ---------- vista previa ----------
async function pintarPrevia() {
  const pv = refs.pv; if (!pv) return;
  const e = P.docs.get(P.sel); if (!e) { pv.replaceChildren(); return; }
  const yo = ++P.prevToken;
  const src = e.doc ? e.doc.getValue() : e.texto;
  if (P.libs !== false) { try { pv.innerHTML = renderizar(src); } catch { P.libs = false; } }
  if (P.libs === false) pv.innerHTML = md(src, { blando: true }); // sin las bibliotecas (iPad en un solo archivo): Markdown básico
  marcarEnlaces(pv);
  await hidratarImagenes(pv, leerImagen);
  if (yo !== P.prevToken) return;
}
P.prevToken = 0;
function marcarEnlaces(raiz) {
  for (const a of raiz.querySelectorAll('a[href^="#wiki="]')) {
    const n = decodeURIComponent(a.getAttribute("href").slice(6));
    const jm = n.match(/^jugada:(\d+)/);
    if (jm) { // enlace a una jugada del Playbook: se muestra con su miniatura
      const j = P.jugadas.find((x) => String(x.id) === jm[1]); a.classList.add("wiki", "wiki-jugada"); a.classList.toggle("wiki-nueva", !j); a.title = j ? `Abrir la jugada «${j.titulo}» en el Playbook` : "Esa jugada ya no existe";
      if (j) { try { const sv = svgJugada(JSON.parse(j.datos), 0, { jugadores: false }); sv.removeAttribute("height"); sv.setAttribute("width", "100%"); a.after(h("span", { class: "nt-mini", "data-jugada": j.id }, sv)); } catch { /* sin miniatura */ } }
      continue;
    }
    const ok = resolver(n.split("#")[0]);
    a.classList.add("wiki"); a.classList.toggle("wiki-nueva", !ok); a.title = ok ? `Abrir «${ok.titulo}»` : `La nota «${n}» no existe todavía: clic para crearla`;
  }
}
async function abrirEnlace(nombre) {
  const jm = nombre.match(/^jugada:(\d+)/); if (jm) { location.hash = `#/playbook?j=${jm[1]}`; return; }
  const n = resolver(nombre.split("#")[0]);
  if (n) return abrirNota(n.id);
  if (!EDITABLE) return; // solo lectura: no se crean notas desde un enlace roto
  const e = P.docs.get(P.sel);
  confirmar("Crear nota", `No existe ninguna nota llamada «${nombre}». ¿Crearla? Heredará la temporada, equipo, jugador y partido de la nota actual.`, "Crear nota", async () => {
    try {
      const m = e ? { temporada: e.meta.temporada, grupo: e.meta.grupo, equipo: e.meta.equipo, equipo_txt: e.meta.equipo_txt, jugador: e.meta.jugador, jugador_txt: e.meta.jugador_txt, partido: e.meta.partido, partido_txt: e.meta.partido_txt } : {};
      await crearNota({ ...m, titulo: nombre }, `# ${nombre}\n\n`); pintar();
    } catch (x) { errorDlg(x); }
  });
}

// ---------- exportación e impresión ----------
async function documentoDe() {
  const e = P.docs.get(P.sel); if (!e) return null;
  await guardarEntrada(e, true);
  const src = e.doc.getValue(), n = P.todas.find((m) => m.id === e.id);
  const tmp = document.createElement("div"); tmp.innerHTML = renderizar(src); await hidratarImagenes(tmp, leerImagen);
  marcarEnlaces(tmp);
  for (const mi of tmp.querySelectorAll(".nt-mini")) { // las miniaturas de jugadas pasan a imagen para HTML, Word y PDF
    const sv = mi.querySelector("svg"); if (!sv) continue;
    try { const img = document.createElement("img"); img.src = await svgAPng(sv, 700); img.alt = "Jugada del Playbook"; img.style.maxWidth = "320px"; mi.replaceChildren(img); } catch { mi.remove(); }
  }
  const m = e.meta, titulo = n?.titulo || "Nota";
  const lineas = [m.temporada && `Temporada ${m.temporada}${m.grupo ? " · " + m.grupo : ""}`, m.equipo_txt && `Equipo: ${m.equipo_txt}`, m.jugador_txt && `Jugador: ${m.jugador_txt}`, m.partido_txt && `Partido: ${m.partido_txt}`, m.creada && `Creada: ${m.creada.slice(0, 19)}`].filter(Boolean);
  return { titulo, html: tmp.innerHTML, lineas, src, cabecera: lineas.length ? `<div class="nota-meta">${lineas.map(esc).join(" · ")}</div>` : "" };
}
const aDataUrl = (blob) => new Promise((ok, mal) => { const r = new FileReader(); r.onload = () => ok(r.result); r.onerror = () => mal(r.error); r.readAsDataURL(blob); });
async function exportar(tipo) {
  try {
    const d = await documentoDe(); if (!d) return;
    estado("Preparando exportación…");
    if (tipo === "html") {
      const html = documentoHtml(d.titulo, d.html, { cabecera: d.cabecera, katexCss: await estiloKatex(d.src) });
      if (await guardarArchivo(`${nombreArchivo(d.titulo)}.html`, await aDataUrl(new Blob([html], { type: "text/html" })))) estado("HTML exportado.");
    } else if (tipo === "docx") {
      const blob = await crearDocx(d.html, { titulo: d.titulo, cabecera: d.lineas });
      if (await guardarArchivo(`${nombreArchivo(d.titulo)}.docx`, await aDataUrl(blob))) estado("Word exportado.");
    } else if (tipo === "pdf") {
      const T = window.__TAURI__;
      if (!T) { estado("El PDF directo solo está en la app del Mac: usa Imprimir → Guardar como PDF.", true); return; }
      const ruta = await T.dialog.save({ defaultPath: `${nombreArchivo(d.titulo)}.pdf`, filters: [{ name: "PDF", extensions: ["pdf"] }] });
      if (!ruta) { estado(""); return; }
      estado("Generando PDF…");
      await invoke("notas_pdf", { html: documentoHtml(d.titulo, d.html, { cabecera: d.cabecera, katexCss: await estiloKatex(d.src) }), ruta });
      estado("PDF exportado.");
    }
  } catch (x) { estado(`⚠ ${msg(x)}`, true); errorDlg(x); }
}
async function imprimir() {
  try {
    const d = await documentoDe(); if (!d) return;
    let raiz = document.getElementById("print-root");
    if (!raiz) { raiz = h("div", { id: "print-root" }); document.body.append(raiz); }
    raiz.replaceChildren(h("div", { class: "mdx" }));
    raiz.firstChild.innerHTML = d.cabecera + d.html;
    document.body.classList.add("nt-imprimiendo");
    await new Promise((r) => setTimeout(r, 150)); // deja que carguen las imágenes
    if (MODO === "nativo") await invoke("notas_imprimir"); else window.print();
  } catch (x) { errorDlg(x); }
}

const opcionMd = { texto: "Todas las notas en Markdown (.md)…", ayuda: "Guarda todas las notas, con sus imágenes, en una carpeta para abrirlas en otro programa", accion: () => exportarMd() };
async function exportarMd() {
  const T = window.__TAURI__; if (!T) { estado("Solo en la app del Mac.", true); return; }
  const dir = await T.dialog.open({ directory: true, multiple: false, title: "Elige dónde guardar las notas (.md)" }); if (!dir) return;
  try { const r = await invoke("notas_exportar_md", { carpeta: dir }); if (refs.estado) estado(r); else dialogo("Notas exportadas", h("p", { text: r })); } catch (x) { errorDlg(x); }
}
async function relacionadoDeNota() {
  const e = P.docs.get(P.sel), n = e && P.todas.find((m) => m.id === e.id); if (!n) return;
  if (e.doc) await guardarEntrada(e, true);
  const doc = docsDeNotas([{ ...n, meta: e.meta, enlaces: [...(e.doc ? e.doc.getValue() : e.texto).matchAll(/\[\[([^\]\n|#]+)/g)].map((m) => m[1].trim()) }])[0];
  dialogo("Relacionado con esta nota", await panelRelacionado({ doc }, { titulo: "" }));
}

// ---------- historial de versiones ----------
async function historial() {
  const e = P.docs.get(P.sel); if (!e) return;
  await guardarEntrada(e, true);
  let vs; try { vs = await invoke("notas_versiones", { id: e.id }); } catch (x) { return errorDlg(x); }
  const vista = h("div", { class: "nt-hist-vista" }, h("p", { class: "nt-vacio", text: "Elige una versión para verla." }));
  const lista = h("div", { class: "nt-hist-lista" }, vs.length ? vs.map((v, i) => h("button", { type: "button", class: "nt-hist-item", onclick: async (ev) => {
    [...lista.children].forEach((b) => b.classList.remove("on")); ev.currentTarget.classList.add("on");
    const r = await invoke("notas_leer_version", { id: e.id, ts: v.ts });
    const cont = h("div", { class: "mdx" }); cont.innerHTML = renderizar(r.contenido); await hidratarImagenes(cont, leerImagen); marcarEnlaces(cont);
    vista.replaceChildren(h("div", { class: "nt-acciones arriba" }, h("span", { text: `${fechaHora(v.ts)} · ${v.palabras} palabras` }),
      h("button", { type: "button", class: "btn primario", onclick: () => { restaurar(e, r.contenido); d.close(); } }, "Restaurar esta versión")), cont);
  } }, h("b", { text: fechaHora(v.ts) }), h("small", { text: `${v.palabras} palabras${i === 0 ? " · más reciente" : ""}` }))) : h("p", { class: "nt-vacio", text: "Aún no hay versiones: se crean solas mientras escribes." }));
  const d = dialogo("Historial de versiones", h("div", { class: "nt-hist" }, lista, vista), "Se guarda una versión cada pocos segundos de edición. Restaurar es reversible: la versión actual queda en el historial y puedes deshacer con Cmd+Z.");
  d.classList.add("nt-dlg-ancho"); d.addEventListener("close", () => d.classList.remove("nt-dlg-ancho"), { once: true });
}
async function restaurar(e, contenido) {
  await guardarEntrada(e, true); // la versión actual queda en el historial
  if (P.sel === e.id && P.cm) { P.cm.setValue(contenido); } else e.doc.setValue(contenido);
  await guardarEntrada(e, true); estado("Versión restaurada (Deshacer la revierte).");
}

// ---------- interfaz ----------
function pintarLista() {
  if (!refs.lista) return;
  const f = P.f, q = f.q.trim();
  const base = P.todas;
  refs.filtros.replaceChildren(
    sel("nt-f-t", "Temporada", f.temporada, [["", "Todas"], ["\x00", "General (sin temporada)"], ...unicos("temporada", base).map((x) => [x, x])], (v) => { f.temporada = v; buscar(); }),
    sel("nt-f-e", "Equipo", f.equipo, [["", "Todos"], ...unicos("equipo_txt", base).map((x) => [x, x])], (v) => { f.equipo = v; buscar(); }),
    sel("nt-f-j", "Jugador", f.jugador, [["", "Todos"], ...unicos("jugador_txt", base).map((x) => [x, x])], (v) => { f.jugador = v; buscar(); }));
  const r = P.resultados;
  refs.cuenta.textContent = P.errorBusqueda ? P.errorBusqueda : `${r.length} nota${r.length === 1 ? "" : "s"}${(q || f.temporada || f.equipo || f.jugador) && r.length !== P.todas.length ? ` de ${P.todas.length}` : ""}`;
  refs.cuenta.classList.toggle("mal", !!P.errorBusqueda);
  refs.items.replaceChildren(...(r.length ? r.map((n) => h("button", { type: "button", class: "nt-item", "aria-current": n.id === P.sel ? "true" : null, onclick: () => abrirNota(n.id).catch(errorDlg) },
    h("b", { text: n.titulo }),
    h("span", { class: "nt-chips" }, chipsDe(n.meta).map((t) => h("i", { text: t }))),
    n.lineas?.length ? h("span", { class: "nt-hits" }, n.lineas.map((l) => h("span", null, h("small", { text: `${l.n}` }), ...resaltar(l.texto, q)))) : h("span", { class: "nt-ext", text: n.extracto || "(vacía)" }),
    h("small", { class: "nt-fecha", text: fechaHora(n.modificada) }))) : [h("p", { class: "nt-vacio", text: P.todas.length ? "Ninguna nota coincide." : EDITABLE ? "Aún no hay notas. Crea la primera con «Nueva nota»." : "No hay notas en este iPad. Llévalas desde el Mac (Ajustes → Descarga de datos → «Llevar los datos al iPad»)." })]));
}
const sel = (id, et, valor, ops, cambiar) => h("div", { class: "campo" }, h("label", { for: id, text: et }), h("select", { id, onchange: (e) => cambiar(e.target.value) }, ops.map(([v, t]) => h("option", { value: v, selected: v === valor || null }, t))));
let tBus = 0;
function buscar() { clearTimeout(tBus); tBus = setTimeout(async () => { await refrescarLista(); pintarLista(); }, 220); }

function pintarEnlaces() {
  if (!refs.enlaces) return;
  const e = P.docs.get(P.sel); const n = e && P.todas.find((m) => m.id === e.id);
  if (!e || !n) { refs.enlaces.replaceChildren(); return; }
  const entrantes = enlazanA(n), salientes = [...new Set(n.enlaces)];
  const chip = (nota, txt) => {
    const jm = String(txt || "").match(/^jugada:(\d+)/); // menciones a jugadas del Playbook
    if (jm) { const j = P.jugadas.find((x) => String(x.id) === jm[1]); return j ? h("button", { type: "button", class: "nt-enl", title: "Abrir la jugada en el Playbook", onclick: () => { location.hash = `#/playbook?j=${j.id}`; } }, `🏀 ${j.titulo}`) : h("span", { class: "nt-enl nueva", text: "⚠ jugada que ya no existe" }); }
    return nota ? h("button", { type: "button", class: "nt-enl", onclick: () => abrirNota(nota.id).catch(errorDlg) }, txt || nota.titulo)
      : EDITABLE ? h("button", { type: "button", class: "nt-enl nueva", onclick: () => abrirEnlace(txt) }, txt, " (crear)") : h("span", { class: "nt-enl nueva", text: `⚠ ${txt}` });
  };
  refs.enlaces.replaceChildren(
    h("div", null, h("b", { text: `Enlazan aquí (${entrantes.length})` }), entrantes.length ? entrantes.map((m) => chip(m)) : h("span", { class: "nt-vacio", text: " Ninguna nota enlaza con esta." })),
    h("div", null, h("b", { text: `Enlaza con (${salientes.length})` }), salientes.length ? salientes.map((s) => chip(resolver(s), s)) : h("span", { class: "nt-vacio", text: " Esta nota no enlaza con otras: usa [[nombre]]." })));
}
function pintarPie() {
  const e = P.docs.get(P.sel); if (!e || !refs.pie) return;
  const t = e.doc.getValue(); refs.pie.textContent = `${t.trim() ? t.trim().split(/\s+/).length : 0} palabras · ${t.length} caracteres`;
}
function pintarCabecera() {
  const e = P.docs.get(P.sel); if (!refs.titulo) return;
  const n = e && P.todas.find((m) => m.id === e.id);
  refs.titulo.value = e ? e.meta.titulo || "" : ""; refs.titulo.placeholder = n ? n.titulo : "Título";
  const m = e?.meta || {};
  refs.vinculo.replaceChildren(...chipsDe(m).map((t) => h("i", { text: t })));
  refs.archivoTxt.textContent = e && e.meta.creada ? `Creada ${e.meta.creada.slice(0, 19)}` : ""; pintarPie(); actualizarDeshacer();
}
function aplicarVista() {
  if (!refs.trabajo) return;
  refs.trabajo.dataset.vista = P.vista;
  [...refs.segVista.children].forEach((b) => b.setAttribute("aria-checked", String(b.dataset.v === P.vista)));
  try { localStorage.setItem("nt-vista", P.vista); } catch { /* ignorar */ }
  requestAnimationFrame(() => P.cm?.refresh());
}
const BARRA = [["B", "negrita", "Negrita (Cmd+B)"], ["I", "cursiva", "Cursiva (Cmd+I)"], ["S", "tachado", "Tachado"], ["H1", "h1", "Título 1"], ["H2", "h2", "Título 2"], ["H3", "h3", "Título 3"],
  ["•", "lista", "Lista"], ["1.", "numerada", "Lista numerada"], ["☐", "tarea", "Lista de tareas"], ["❝", "cita", "Cita"], ["</>", "codigo", "Código en línea"], ["{ }", "bloque", "Bloque de código"],
  ["▦", "tabla", "Tabla"], ["🔗", "enlace", "Enlace web (Cmd+K)"], ["[[ ]]", "nota", "Enlazar otra nota"], ["Σ", "formula", "Fórmula ($…$)"], ["ⓘ", "aviso", "Aviso (NOTE, TIP, WARNING…)"], ["[^]", "pie", "Nota al pie"], ["―", "regla", "Línea horizontal"]];

function soltarEditor() { // un Doc de CodeMirror solo puede estar en un editor a la vez: se libera el anterior antes de crear otro
  if (P.cm) { try { P.cm.swapDoc(CodeMirror.Doc("", "markdown")); } catch { /* ya liberado */ } P.cm = null; }
}
function aplicarLado() { refs.root?.querySelector(".nt")?.classList.toggle("sin-lado", !P.lado); requestAnimationFrame(() => P.cm?.refresh()); try { localStorage.setItem("nt-lado", P.lado ? "1" : "0"); } catch { /* ignorar */ } }
function botonLado() {
  return h("button", { type: "button", class: "btn fantasma nt-b nt-lado-btn", title: "Mostrar u ocultar la lista de notas", "aria-label": "Mostrar u ocultar la lista de notas", onclick: () => { P.lado = !P.lado; aplicarLado(); } }, "☰ Notas");
}
function pintarMain() {
  if (!EDITABLE) return pintarVisor();
  const main = refs.main; soltarEditor();
  const e = P.docs.get(P.sel);
  if (!e) {
    main.replaceChildren(h("div", { class: "nt-cab" }, botonLado()), h("div", { class: "nt-inicio" }, vacioMsg("Notas", "Notas en Markdown sobre tus equipos, jugadores y partidos. Vincúlalas a una temporada, equipo, jugador o partido (o déjalas generales), enlázalas entre sí con [[nombre]] y pregúntale al asistente por ellas."),
      EDITABLE ? h("button", { type: "button", class: "btn primario", onclick: nuevaNota }, "Nueva nota") : null,
      MODO === "nativo" && P.todas.length ? menu("Exportar", [opcionMd]) : null));
    refs.titulo = refs.vinculo = refs.trabajo = refs.pv = refs.enlaces = refs.deshacer = refs.estado = refs.pie = null; P.cm = null; return;
  }
  refs.titulo = h("input", { type: "text", class: "nt-titulo", "aria-label": "Título de la nota", oninput: (ev) => { e.meta.titulo = ev.target.value.trim(); e.metaSucia = true; clearTimeout(e.t); e.t = setTimeout(() => guardarEntrada(e), 800); } });
  refs.vinculo = h("span", { class: "nt-chips" }); refs.archivoTxt = h("small", { class: "nt-archivo" }); refs.estado = h("span", { class: "nt-estado", role: "status" });
  refs.deshacer = h("button", { type: "button", class: "btn fantasma nt-b", title: "Deshacer (Cmd+Z)", "aria-label": "Deshacer", onmousedown: (ev) => ev.preventDefault(), onclick: () => { P.cm.undo(); P.cm.focus(); } }, "↶");
  refs.rehacer = h("button", { type: "button", class: "btn fantasma nt-b", title: "Rehacer (Cmd+Mayús+Z)", "aria-label": "Rehacer", onmousedown: (ev) => ev.preventDefault(), onclick: () => { P.cm.redo(); P.cm.focus(); } }, "↷");
  refs.segVista = h("div", { class: "seg", role: "radiogroup", "aria-label": "Vista" }, [["editor", "Editor"], ["dividida", "Dividida"], ["previa", "Vista previa"]].map(([v, t]) =>
    h("button", { type: "button", role: "radio", "data-v": v, onclick: () => { P.vista = v; aplicarVista(); } }, t)));
  const ficheroImg = h("input", { type: "file", accept: "image/png,image/jpeg,image/gif,image/webp", multiple: true, hidden: true, onchange: (ev) => { subirImagenes([...ev.target.files]); ev.target.value = ""; } });
  refs.ed = h("div", { class: "nt-ed" }); refs.pv = h("article", { class: "nt-pv mdx", "aria-label": "Vista previa" });
  refs.trabajo = h("div", { class: "nt-work" }, refs.ed, refs.pv);
  refs.enlaces = h("div", { class: "nt-enlaces" }); refs.pie = h("small", { class: "nt-pie" });
  main.replaceChildren(
    h("div", { class: "nt-cab" }, botonLado(), refs.titulo, h("button", { type: "button", class: "btn", onclick: vincular, title: "Cambiar temporada, equipo, jugador o partido" }, refs.vinculo, " ✎"), refs.archivoTxt),
    h("div", { class: "nt-barra" },
      refs.deshacer, refs.rehacer, h("span", { class: "nt-sep" }),
      ...BARRA.flatMap(([t, a, ayuda]) => [h("button", { type: "button", class: "btn fantasma nt-b", title: ayuda, "aria-label": ayuda, onmousedown: (ev) => ev.preventDefault(), onclick: () => ACCIONES[a](P.cm) }, t),
        a === "tabla" ? h("button", { type: "button", class: "btn fantasma nt-b", title: "Insertar imagen (también se puede pegar o arrastrar)", "aria-label": "Insertar imagen", onmousedown: (ev) => ev.preventDefault(), onclick: () => ficheroImg.click() }, "🖼") : null]), ficheroImg),
    h("div", { class: "nt-barra2" }, refs.segVista, h("span", { class: "nt-sep" }),
      h("button", { type: "button", class: "btn", onclick: () => historial() }, "Historial"), h("button", { type: "button", class: "btn", title: "Jugadas, vídeos y otras notas relacionados con esta", onclick: relacionadoDeNota }, "🔗 Relacionado"),
      menu("Exportar", [
        { texto: "Página web (HTML)", accion: () => exportar("html") },
        { texto: "Word (.docx)", accion: () => exportar("docx") },
        { texto: "PDF", off: MODO !== "nativo", ayuda: MODO === "nativo" ? "" : "Solo en la app del Mac; aquí usa Imprimir → Guardar como PDF", accion: () => exportar("pdf") },
        { texto: "Imprimir…", accion: imprimir },
        ...(MODO === "nativo" ? [null, opcionMd] : []),
      ]),
      h("button", { type: "button", class: "btn fantasma", onclick: borrarNota }, "Borrar"), refs.estado),
    refs.trabajo, h("div", { class: "nt-base" }, refs.enlaces, refs.pie));
  P.cm = crearEditor(refs.ed);
  clicsEnPrevia(refs.pv);
  refs.pv.addEventListener("scroll", () => { if (P.vista !== "dividida" || P.sincronizando) return; P.sincronizando = true; const i = P.cm.getScrollInfo(); P.cm.scrollTo(null, (refs.pv.scrollTop / Math.max(1, refs.pv.scrollHeight - refs.pv.clientHeight)) * (i.height - i.clientHeight)); requestAnimationFrame(() => { P.sincronizando = false; }); });
  aplicarVista(); pintarCabecera(); pintarPrevia(); pintarEnlaces();
}

function pintar() {
  const root = refs.root;
  refs.lista = h("aside", { class: "nt-lado", "aria-label": "Notas" });
  refs.filtros = h("div", { class: "nt-filtros" }); refs.cuenta = h("small", { class: "nt-cuenta" }); refs.items = h("div", { class: "nt-items" });
  const entrada = h("input", { type: "search", class: "nt-q", placeholder: "Buscar en todas las notas…", value: P.f.q, "aria-label": "Buscar en las notas", oninput: (ev) => { P.f.q = ev.target.value; buscar(); } });
  const tog = (k, txt, ayuda) => h("button", { type: "button", class: "chip", "aria-pressed": String(P.f[k]), title: ayuda, onclick: (ev) => { P.f[k] = !P.f[k]; ev.currentTarget.setAttribute("aria-pressed", String(P.f[k])); buscar(); } }, txt);
  refs.lista.append(
    h("div", { class: "nt-lado-cab" }, h("b", { text: "Notas" }), EDITABLE ? h("button", { type: "button", class: "btn primario", onclick: nuevaNota }, "+ Nueva nota") : null),
    h("div", { class: "nt-buscar" }, entrada, h("div", { class: "nt-opc" }, tog("regex", ".*", "Expresión regular"), tog("mayus", "Aa", "Distinguir mayúsculas y acentos"), refs.cuenta)),
    refs.filtros, refs.items);
  refs.main = h("section", { class: "nt-centro" });
  root.replaceChildren(h("div", { class: "nt" + (P.lado ? "" : " sin-lado") }, refs.lista, refs.main));
  pintarLista(); pintarMain();
}

export async function vistaNotas(root) {
  root.replaceChildren(vacioMsg("Cargando Notas…"));
  try {
    if (EDITABLE) await cargarLibs(); else { P.libs = await Promise.race([cargarLibs().then(() => true, () => false), new Promise((r) => setTimeout(() => r(false), 2500))]); } // el visor funciona también sin las bibliotecas
    if (!S.grupos.length) { try { S.grupos = await invoke("listar_grupos"); } catch { /* sin datos FEB: solo notas generales */ } }
    await refrescarLista();
  } catch (x) { root.replaceChildren(vacioMsg("No se pudo abrir el Notas", msg(x))); return; }
  document.body.classList.remove("nt-imprimiendo");
  refs = { root };
  const pedida = Number(paramHash("abrir")); if (pedida && P.todas.some((n) => n.id === pedida)) P.sel = pedida; // enlace desde «Relacionado»
  if (P.sel && !P.todas.some((n) => n.id === P.sel)) P.sel = null;
  if (!P.sel && P.docs.size === 0 && P.todas.length) P.sel = P.todas[0].id;
  if (!EDITABLE) { if (P.sel) { try { const id = P.sel; P.sel = null; await abrirVisorSinPintar(id); } catch { P.sel = null; } } pintar(); return; }
  if (P.sel && !P.docs.has(P.sel)) { try { const a = P.sel; P.sel = null; const r = await invoke("notas_leer", { id: a }); const doc = CodeMirror.Doc(r.contenido, "markdown"); const e = { id: a, doc, meta: r.meta, base: r.contenido, metaSucia: false }; doc.on("change", () => cambio(e)); P.docs.set(a, e); P.sel = a; } catch { P.sel = null; } }
  pintar();
}
