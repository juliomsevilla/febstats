// Vista «Playbook»: diseñador de jugadas (pizarra con pista media o completa, pasos y reproducción), biblioteca por colecciones y
// vinculación con partidos, jugadores, notas y vídeos. Las jugadas se guardan en usuario.db; el asistente las lee como texto.
// En el iPad (modo local) es solo un visor: se ven y se reproducen, no se editan.
import { h, dialogo, vacioMsg, menu } from "../util.js";
import { invoke, enLocal, MODO, guardarArchivo } from "../api.js";
import { S, paramHash } from "../state.js";
import { crearPizarra, svgJugada, aPng } from "../pizarra.js";
import { FORMACIONES, DEFENSAS, conFormacion, describir, normalizar, vacia } from "../jugada-modelo.js";
import { formulario, contextoActual, chipsDe, payloadDe, dbDe, CTX_VACIO } from "./vinculo.js";
import { panelRelacionado, elegirDocumento } from "./relacionado.js";
import { docsDeJugadas } from "../relaciones.js";
import { cargarLibs, renderizar, hidratarImagenes, documentoHtml, esc } from "../mdx.js";
import { md } from "../md.js";
import { crearPaleta } from "./jugada-herramientas.js";

const EDITABLE = !enLocal;
const P = { lista: [], sel: null, pz: null, entradas: new Map(), lado: true, f: { q: "", temporada: "", equipo: "", jugador: "", coleccion: "" }, ritmo: "normal", bucle: false, tab: "desc", seleccion: null, reja: false };
try { P.lado = localStorage.getItem("jg-lado") !== "0"; P.ritmo = localStorage.getItem("jg-ritmo") || "normal"; } catch { /* sin almacenamiento */ }

let refs = {};
const msg = (e) => (typeof e === "string" ? e : e?.message || String(e));
const errorDlg = (e) => dialogo("No se pudo completar", h("p", { text: msg(e) }));
const nombreArchivo = (t) => (t || "jugada").replace(/[\\/:*?"<>|\n\r]+/g, "-").replace(/\s+/g, " ").trim().slice(0, 80) || "jugada";
const horaCorta = () => new Date().toLocaleTimeString("es-ES");
const estado = (t, mal = false) => { if (refs.estado) { refs.estado.textContent = t; refs.estado.classList.toggle("mal", mal); } };
const ctxDe = (j) => ({ temporada: j.temporada || "", grupo: j.grupo || "", partido: j.partido || "", partido_txt: j.partido_txt || "", equipo: j.equipo || "", equipo_txt: j.equipo_txt || "", jugador: j.jugador || "", jugador_txt: j.jugador_txt || "" });

// ---------- datos ----------
async function refrescar() { P.lista = (await invoke("listar_jugadas").catch(() => [])) || []; }
const entradaDe = (id) => P.entradas.get(id);
async function guardar(e, forzar = false) {
  if (!EDITABLE || !e) return;
  e.cola = (e.cola || Promise.resolve()).then(async () => {
    const j = e.j, datos = JSON.stringify(e.datos);
    if (!forzar && datos === e.guardado && !e.sucia) return;
    try {
      const id = await invoke("guardar_jugada", { jugada: { ...j, datos, texto: describir(e.datos), pista: e.datos.pista } });
      if (!j.id) { j.id = id; }
      e.guardado = datos; e.sucia = false;
      const i = P.lista.findIndex((x) => x.id === j.id); const fila = { ...j, datos, texto: describir(e.datos), pista: e.datos.pista };
      if (i >= 0) P.lista[i] = fila; else P.lista.push(fila);
      if (P.sel === j.id) estado(`Guardado ${horaCorta()}`);
      clearTimeout(P.tLista); P.tLista = setTimeout(() => pintarLista(), 500);
    } catch (x) { if (P.sel === j.id) estado(`⚠ ${msg(x)}`, true); }
  });
  return e.cola;
}
const programar = (e) => { e.sucia = true; clearTimeout(e.t); e.t = setTimeout(() => guardar(e), 800); estado("Sin guardar…"); };
if (!window.__jgFlush) { window.__jgFlush = true; const todo = () => { for (const e of P.entradas.values()) if (e.sucia) guardar(e, true); }; window.addEventListener("hashchange", todo); window.addEventListener("pagehide", todo); }

// ---------- biblioteca ----------
const unicos = (k) => [...new Set(P.lista.map((j) => j[k]).filter(Boolean))].sort((a, b) => a.localeCompare(b, "es"));
const pasa = (j) => {
  const f = P.f, q = f.q.trim().toLowerCase();
  if (f.temporada && j.temporada !== f.temporada) return false; if (f.equipo && j.equipo_txt !== f.equipo) return false; if (f.jugador && j.jugador_txt !== f.jugador) return false;
  if (f.coleccion === "\x00" ? j.coleccion : (f.coleccion && j.coleccion !== f.coleccion)) return false;
  if (!q) return true;
  return [j.titulo, j.descripcion, j.texto, j.equipo_txt, j.jugador_txt, j.partido_txt, j.coleccion, j.seccion].some((t) => String(t || "").toLowerCase().includes(q));
};
const sel = (id, et, valor, ops, cambiar) => h("div", { class: "campo" }, h("label", { for: id, text: et }), h("select", { id, onchange: (e) => cambiar(e.target.value) }, ops.map(([v, t]) => h("option", { value: v, selected: v === valor || null }, t))));
function miniatura(j) { try { const d = JSON.parse(j.datos); return h("span", { class: "jg-mini", innerHTML: "" }, (() => { const el = svgJugada(d, 0, { jugadores: false }); el.setAttribute("width", "100%"); el.removeAttribute("height"); return el; })()); } catch { return h("span", { class: "jg-mini" }); } }
function pintarLista() {
  if (!refs.items) return;
  const f = P.f; const visibles = P.lista.filter(pasa);
  refs.filtros.replaceChildren(
    sel("jg-f-c", "Colección", f.coleccion, [["", "Todas"], ["\x00", "Sin colección"], ...unicos("coleccion").map((x) => [x, x])], (v) => { f.coleccion = v; pintarLista(); }),
    sel("jg-f-t", "Temporada", f.temporada, [["", "Todas"], ...unicos("temporada").map((x) => [x, x])], (v) => { f.temporada = v; pintarLista(); }),
    sel("jg-f-e", "Equipo", f.equipo, [["", "Todos"], ...unicos("equipo_txt").map((x) => [x, x])], (v) => { f.equipo = v; pintarLista(); }),
    sel("jg-f-j", "Jugador", f.jugador, [["", "Todos"], ...unicos("jugador_txt").map((x) => [x, x])], (v) => { f.jugador = v; pintarLista(); }));
  refs.cuenta.textContent = `${visibles.length} jugada${visibles.length === 1 ? "" : "s"}${visibles.length !== P.lista.length ? ` de ${P.lista.length}` : ""}`;
  const grupos = new Map();
  for (const j of visibles) { const k = j.coleccion || ""; if (!grupos.has(k)) grupos.set(k, new Map()); const sc = grupos.get(k); const sk = j.seccion || ""; if (!sc.has(sk)) sc.set(sk, []); sc.get(sk).push(j); }
  const nodos = [];
  for (const [col, secs] of [...grupos].sort((a, b) => (a[0] || "￿").localeCompare(b[0] || "￿", "es"))) {
    nodos.push(h("div", { class: "jg-col" }, h("b", { text: col || "Sin colección" }), EDITABLE && col ? h("button", { type: "button", class: "btn fantasma jg-b", title: "Renombrar la colección", onclick: () => renombrarColeccion(col) }, "✎") : null,
      EDITABLE && col ? h("button", { type: "button", class: "btn fantasma jg-b", title: "Imprimir o exportar a PDF la colección", onclick: () => hoja(P.lista.filter((j) => j.coleccion === col), col) }, "🖨") : null));
    for (const [sec, js] of secs) {
      if (sec) nodos.push(h("div", { class: "jg-sec", text: sec }));
      for (const j of js) nodos.push(h("button", { type: "button", class: "jg-item", "aria-current": j.id === P.sel ? "true" : null, onclick: () => abrir(j.id).catch(errorDlg) },
        miniatura(j), h("span", { class: "jg-it" }, h("b", { text: j.titulo }), h("span", { class: "nt-chips" }, chipsDe(ctxDe(j)).slice(1).map((t) => h("i", { text: t }))))));
    }
  }
  refs.items.replaceChildren(...(nodos.length ? nodos : [h("p", { class: "nt-vacio", text: P.lista.length ? "Ninguna jugada coincide." : EDITABLE ? "Aún no hay jugadas. Crea la primera con «Nueva jugada»." : "No hay jugadas en este iPad. Llévalas desde el Mac (Ajustes → Descarga de datos → «Llevar los datos al iPad»)." })]));
}
function renombrarColeccion(col) {
  const inp = h("input", { type: "text", value: col }); const d = dialogo("Renombrar colección", h("div", { class: "nt-form" }, inp, h("div", { class: "nt-acciones" }, h("button", { type: "button", class: "btn", onclick: () => d.close() }, "Cancelar"),
    h("button", { type: "button", class: "btn primario", onclick: async () => { d.close(); await invoke("renombrar_coleccion", { de: col, a: inp.value }); await refrescar(); pintarLista(); if (P.sel) await abrir(P.sel, true); } }, "Renombrar"))));
}

// ---------- apertura ----------
async function abrir(id, recargar = false) {
  const prev = entradaDe(P.sel); if (prev && prev.sucia) guardar(prev, true);
  let e = entradaDe(id);
  if (!e || recargar) {
    const j = P.lista.find((x) => x.id === id); if (!j) throw new Error("Esa jugada ya no existe.");
    let datos; try { datos = normalizar(JSON.parse(j.datos)); } catch { datos = vacia(); }
    e = { j: { ...j, datos: undefined }, datos, guardado: JSON.stringify(datos), sucia: false }; P.entradas.set(id, e);
  }
  P.sel = id; P.seleccion = null;
  if (innerWidth <= 900) P.lado = false; // pantalla estrecha: al abrir una jugada se oculta la biblioteca
  refs.root.querySelector(".jg")?.classList.toggle("sin-lado", !P.lado);
  pintarLista(); pintarMain();
}

// ---------- creación ----------
function nuevaJugada() {
  const v = { titulo: "", pista: "media", ataque: "Horns (cuerno)", defensa: "Individual", coleccion: P.f.coleccion && P.f.coleccion !== "\x00" ? P.f.coleccion : "" };
  const caja = h("div", { class: "nt-form" });
  const d = dialogo("Nueva jugada", caja, "Empieza con una formación y dibuja los pasos. Se vincula a lo que tengas filtrado en la app.");
  const pintarForm = () => caja.replaceChildren(
    h("div", { class: "campo" }, h("label", { text: "Título" }), h("input", { type: "text", value: v.titulo, placeholder: "Ej.: Horns – pick and roll lado derecho", oninput: (ev) => { v.titulo = ev.target.value; } })),
    h("div", { class: "campo" }, h("label", { text: "Pista" }), h("div", { class: "seg", role: "radiogroup" }, [["media", "Media pista"], ["completa", "Pista completa"]].map(([k, t]) => h("button", { type: "button", role: "radio", "aria-checked": String(v.pista === k), class: v.pista === k ? "on" : "", onclick: () => { v.pista = k; pintarForm(); } }, t)))),
    h("div", { class: "campo" }, h("label", { text: "Formación de ataque" }), h("select", { onchange: (ev) => { v.ataque = ev.target.value; } }, [["", "Pizarra vacía"], ...Object.keys(FORMACIONES).map((k) => [k, k])].map(([k, t]) => h("option", { value: k, selected: k === v.ataque || null }, t)))),
    h("div", { class: "campo" }, h("label", { text: "Defensa" }), h("select", { onchange: (ev) => { v.defensa = ev.target.value; } }, [["", "Sin defensa"], ...Object.keys(DEFENSAS).map((k) => [k, k])].map(([k, t]) => h("option", { value: k, selected: k === v.defensa || null }, t)))),
    h("div", { class: "campo" }, h("label", { text: "Colección (opcional)" }), h("input", { type: "text", value: v.coleccion, list: "jg-colecciones", placeholder: "Ej.: Ataque posicional", oninput: (ev) => { v.coleccion = ev.target.value; } }),
      h("datalist", { id: "jg-colecciones" }, unicos("coleccion").map((c) => h("option", { value: c })))),
    h("div", { class: "nt-acciones" }, h("button", { type: "button", class: "btn", onclick: () => d.close() }, "Cancelar"), h("button", { type: "button", class: "btn primario", onclick: async () => {
      d.close();
      try {
        const datos = v.ataque ? conFormacion(v.pista, v.ataque, v.defensa) : vacia(v.pista);
        const ctx = contextoActual();
        const j = { titulo: v.titulo.trim() || (v.ataque || "Jugada nueva"), coleccion: v.coleccion.trim(), seccion: "", descripcion: "", orden: P.lista.length, ...ctx };
        const id = await invoke("guardar_jugada", { jugada: { ...j, datos: JSON.stringify(datos), texto: describir(datos), pista: datos.pista } });
        await refrescar(); await abrir(id);
      } catch (x) { errorDlg(x); }
    } }, "Crear jugada")));
  pintarForm();
}

// ---------- borrar / duplicar ----------
function confirmar(titulo, texto, boton, onOk) {
  const d = dialogo(titulo, h("div", null, h("p", { text: texto }), h("div", { class: "nt-acciones" }, h("button", { type: "button", class: "btn", onclick: () => d.close() }, "Cancelar"), h("button", { type: "button", class: "btn primario", onclick: async () => { d.close(); await onOk(); } }, boton))));
}
function borrarJugada() {
  const e = entradaDe(P.sel); if (!e) return;
  confirmar("Borrar jugada", `«${e.j.titulo}» se borrará del playbook. Las notas o marcas que la mencionen quedarán con un enlace roto.`, "Borrar", async () => {
    try { clearTimeout(e.t); await e.cola; await invoke("borrar_jugada", { id: e.j.id }); P.entradas.delete(e.j.id); P.sel = null; await refrescar(); pintar(); } catch (x) { errorDlg(x); }
  });
}
async function duplicarJugada() { const e = entradaDe(P.sel); if (!e) return; try { await guardar(e, true); const id = await invoke("duplicar_jugada", { id: e.j.id }); await refrescar(); await abrir(id); } catch (x) { errorDlg(x); } }

// ---------- exportar / imprimir ----------
const aDataUrl = (blob) => new Promise((ok, mal) => { const r = new FileReader(); r.onload = () => ok(r.result); r.onerror = () => mal(r.error); r.readAsDataURL(blob); });
async function exportarPng(todos) {
  const e = entradaDe(P.sel); if (!e) return;
  try {
    if (!todos) { if (await guardarArchivo(`${nombreArchivo(e.j.titulo)} - ${e.datos.pasos[P.pz?.paso || 0].nombre}.png`, await aPng(P.pz.svgActual(), 1400))) estado("PNG exportado."); return; }
    const n = e.datos.pasos.length, cols = Math.min(2, n), w = 900, imgs = [];
    for (let i = 0; i < n; i++) imgs.push(await new Promise(async (ok) => { const im = new Image(); im.onload = () => ok(im); im.src = await aPng(svgJugada(e.datos, i), w); }));
    const hh = imgs[0].height, filas = Math.ceil(n / cols), c = document.createElement("canvas"); c.width = cols * w; c.height = filas * (hh + 50);
    const x = c.getContext("2d"); x.fillStyle = "#fff"; x.fillRect(0, 0, c.width, c.height); x.fillStyle = "#222"; x.font = "bold 30px system-ui,sans-serif";
    imgs.forEach((im, i) => { const cx = (i % cols) * w, cy = Math.floor(i / cols) * (hh + 50); x.drawImage(im, cx, cy + 40, w, hh); x.fillText(e.datos.pasos[i].nombre, cx + 14, cy + 30); });
    if (await guardarArchivo(`${nombreArchivo(e.j.titulo)} - todos los pasos.png`, c.toDataURL("image/png"))) estado("PNG exportado.");
  } catch (x) { errorDlg(x); }
}
async function exportarJson() { const e = entradaDe(P.sel); if (!e) return; const t = JSON.stringify({ feb_playbook: 1, titulo: e.j.titulo, descripcion: e.j.descripcion, datos: e.datos }, null, 2); if (await guardarArchivo(`${nombreArchivo(e.j.titulo)}.json`, await aDataUrl(new Blob([t], { type: "application/json" })))) estado("JSON exportado."); }
async function importarJson(fichero) {
  try {
    const t = JSON.parse(await fichero.text()); const datos = normalizar(t.datos || t);
    const id = await invoke("guardar_jugada", { jugada: { titulo: t.titulo || fichero.name.replace(/\.json$/i, ""), descripcion: t.descripcion || "", datos: JSON.stringify(datos), texto: describir(datos), pista: datos.pista, ...contextoActual(), orden: P.lista.length } });
    await refrescar(); await abrir(id);
  } catch (x) { errorDlg("El archivo no es una jugada válida: " + msg(x)); }
}
const hojaVisibles = () => hoja(P.lista.filter(pasa), "Playbook");
/** Hoja HTML de una o varias jugadas (un paso por viñeta, pasos en texto y descripción): para imprimir y para PDF. */
async function hojaHtml(js, titulo) {
  let libs = false; const trozos = [];
  for (const j of js) {
    let d; try { d = normalizar(JSON.parse(j.datos)); } catch { continue; }
    const svgs = d.pasos.map((p, i) => `<figure><div class="hj-img">${new XMLSerializer().serializeToString(svgJugada(d, i, { jugadores: true }))}</div><figcaption>${esc(p.nombre)}</figcaption></figure>`).join("");
    let desc = ""; if (j.descripcion) { try { if (!libs) { await cargarLibs(); libs = true; } const tmp = document.createElement("div"); tmp.innerHTML = renderizar(j.descripcion); desc = tmp.innerHTML; } catch { desc = `<p>${esc(j.descripcion)}</p>`; } }
    trozos.push(`<section class="hj"><h1>${esc(j.titulo)}</h1><p class="hj-v">${esc(chipsDe(ctxDe(j)).join(" · "))}${j.coleccion ? ` · ${esc(j.coleccion)}` : ""}</p><div class="hj-pasos">${svgs}</div><pre class="hj-t">${esc(describir(d))}</pre>${desc}</section>`);
  }
  return trozos.join("");
}
const CSS_HOJA = `.hj{break-inside:avoid;margin:0 0 18px;padding-bottom:10px;border-bottom:1px solid #ddd}.hj h1{font:700 20px system-ui,sans-serif;margin:0}.hj-v{font:12px system-ui,sans-serif;color:#666;margin:2px 0 8px}
.hj-pasos{display:grid;grid-template-columns:repeat(2,1fr);gap:8px}.hj-pasos figure{margin:0}.hj-img svg{width:100%;height:auto;display:block;border:1px solid #ddd}.hj-pasos figcaption{font:600 11px system-ui,sans-serif;color:#444}
.hj-t{white-space:pre-wrap;font:12px/1.5 system-ui,sans-serif;margin:8px 0 0}@page{size:A4;margin:14mm}`;
async function hoja(js, titulo) {
  if (!js.length) return;
  const cuerpo = await hojaHtml(js, titulo);
  const d = dialogo("Hoja del playbook", h("div", { class: "nt-form" }, h("p", { text: `${js.length} jugada${js.length === 1 ? "" : "s"} con sus pasos, el texto de cada paso y la descripción.` }),
    h("div", { class: "nt-acciones" },
      h("button", { type: "button", class: "btn", disabled: MODO === "nativo" ? null : true, title: MODO === "nativo" ? "" : "Solo en la app del Mac: aquí usa Imprimir → Guardar como PDF", onclick: async () => {
        const T = window.__TAURI__; const ruta = await T.dialog.save({ defaultPath: `${nombreArchivo(titulo || "Playbook")}.pdf`, filters: [{ name: "PDF", extensions: ["pdf"] }] }); if (!ruta) return; d.close();
        try { estado("Generando PDF…"); await invoke("notas_pdf", { html: documentoHtml(titulo || "Playbook", cuerpo).replace("</style>", CSS_HOJA + "</style>"), ruta }); estado("PDF exportado."); } catch (x) { errorDlg(x); }
      } }, "Guardar PDF"),
      h("button", { type: "button", class: "btn primario", onclick: async () => {
        d.close(); let raiz = document.getElementById("print-root"); if (!raiz) { raiz = h("div", { id: "print-root" }); document.body.append(raiz); }
        raiz.replaceChildren(h("style", { text: CSS_HOJA }), h("div", { class: "mdx", innerHTML: "" })); raiz.lastChild.innerHTML = cuerpo; document.body.classList.add("nt-imprimiendo");
        await new Promise((r) => setTimeout(r, 150)); try { if (MODO === "nativo") await invoke("notas_imprimir"); else window.print(); } catch (x) { errorDlg(x); }
      } }, "Imprimir"))));
}

// ---------- interfaz del editor ----------
function pedirTexto(valor) {
  return new Promise((res) => { const i = h("input", { type: "text", value: valor, placeholder: "Texto", style: { width: "100%" } }); const ok = () => { d.close(); res(i.value.trim() || null); };
    const d = dialogo("Texto", h("div", { class: "nt-form" }, i, h("div", { class: "nt-acciones" }, h("button", { type: "button", class: "btn", onclick: () => { d.close(); res(null); } }, "Cancelar"), h("button", { type: "button", class: "btn primario", onclick: ok }, "Aceptar"))));
    i.addEventListener("keydown", (ev) => { if (ev.key === "Enter") ok(); }); d.addEventListener("close", () => res(null), { once: true }); setTimeout(() => i.focus(), 50); });
}
const botonLado = () => h("button", { type: "button", class: "btn fantasma nt-b nt-lado-btn", title: "Mostrar u ocultar la biblioteca", "aria-label": "Mostrar u ocultar la biblioteca", onclick: () => { P.lado = !P.lado; refs.root.querySelector(".jg")?.classList.toggle("sin-lado", !P.lado); try { localStorage.setItem("jg-lado", P.lado ? "1" : "0"); } catch { /* ignorar */ } } }, "☰ Biblioteca");

function pintarPasos() {
  const e = entradaDe(P.sel); if (!refs.pasos || !e || !P.pz) return;
  const D = P.pz.datos, k = P.pz.paso, rep = P.pz.reproduciendo;
  refs.pasos.replaceChildren(...[
    h("button", { type: "button", class: "btn fantasma nt-b", "aria-label": "Paso anterior", onclick: () => P.pz.irAPaso(k - 1) }, "◀"),
    ...D.pasos.map((p, i) => h("button", { type: "button", class: "jg-paso" + (i === k ? " on" : ""), onclick: () => P.pz.irAPaso(i), ondblclick: EDITABLE ? async () => { const n = await pedirTexto(p.nombre); if (n) { P.pz.irAPaso(i); P.pz.renombrarPaso(n); } } : null, title: "Doble clic para renombrar" }, p.nombre)),
    h("button", { type: "button", class: "btn fantasma nt-b", "aria-label": "Paso siguiente", onclick: () => P.pz.irAPaso(k + 1) }, "▶"),
    EDITABLE ? h("button", { type: "button", class: "btn nt-b", title: "Añade un paso copiando las posiciones del actual", onclick: () => P.pz.anadirPaso() }, "+ Añadir paso") : null,
    EDITABLE ? h("button", { type: "button", class: "btn fantasma nt-b", title: "Eliminar el paso actual", disabled: D.pasos.length < 2 ? true : null, onclick: () => P.pz.borrarPaso() }, "Quitar paso") : null,
    h("span", { class: "nt-sep" }),
    h("button", { type: "button", class: "btn primario nt-b", onclick: () => (P.pz.reproduciendo ? P.pz.parar() : P.pz.reproducir({ ritmo: P.ritmo, bucle: P.bucle })) }, rep ? "■ Parar" : "▶ Reproducir"),
    h("select", { "aria-label": "Ritmo", title: "Velocidad de la reproducción", onchange: (ev) => { P.ritmo = ev.target.value; P.pz.ritmo(P.ritmo); try { localStorage.setItem("jg-ritmo", P.ritmo); } catch { /* ignorar */ } } }, [["lento", "Lento"], ["normal", "Normal"], ["rapido", "Rápido"]].map(([v, t]) => h("option", { value: v, selected: v === P.ritmo || null }, t))),
    h("label", { class: "jg-chk" }, h("input", { type: "checkbox", checked: P.bucle || null, onchange: (ev) => { P.bucle = ev.target.checked; } }), " Bucle")].filter(Boolean));
}
function pintarDeshacer() { if (!refs.deshacer || !P.pz) return; refs.deshacer.disabled = !P.pz.puedeDeshacer; refs.rehacer.disabled = !P.pz.puedeRehacer; }

async function pintarPanel() {
  const e = entradaDe(P.sel); if (!refs.panel || !e) return;
  const tabs = [["desc", "Descripción"], ["rel", "Relacionado"], ["ficha", P.seleccion?.tipo === "trazo" ? "Trazo" : "Ficha"]];
  const cuerpo = h("div", { class: "jg-panel-c" });
  refs.panel.replaceChildren(h("div", { class: "tabs" }, tabs.map(([v, t]) => h("button", { type: "button", role: "tab", "aria-selected": String(P.tab === v), onclick: () => { P.tab = v; pintarPanel(); } }, t))), cuerpo);
  if (P.tab === "desc") {
    const ta = h("textarea", { class: "jg-desc", placeholder: "Describe la jugada: cuándo usarla, lecturas, variantes… Admite Markdown y enlaces [[nota]] y [[jugada:ID|título]].", disabled: EDITABLE ? null : true, oninput: (ev) => { e.j.descripcion = ev.target.value; programar(e); } }); ta.value = e.j.descripcion || "";
    const prev = h("div", { class: "mdx jg-prev" });
    const ver = async () => { try { await cargarLibs(); prev.innerHTML = renderizar(ta.value); await hidratarImagenes(prev, (n) => invoke("notas_leer_imagen", { nombre: n })); } catch { prev.innerHTML = md(ta.value, { blando: true }); } }; // sin las bibliotecas (iPad en un solo archivo): Markdown básico
    const enlazar = EDITABLE ? h("div", { class: "jg-fila" }, h("button", { type: "button", class: "btn", onclick: async () => { const m = await elegirDocumento({ tipos: ["nota", "jugada"], excluir: { tipo: "jugada", id: String(e.j.id) } }); if (m) { const i = ta.selectionStart ?? ta.value.length; ta.setRangeText(m, i, ta.selectionEnd ?? i, "end"); ta.dispatchEvent(new Event("input")); ta.focus(); } } }, "🔗 Enlazar nota o jugada"),
      h("button", { type: "button", class: "btn fantasma", onclick: ver }, "Vista previa")) : null;
    cuerpo.append(...[EDITABLE ? ta : null, enlazar, prev].filter(Boolean));
    if (!EDITABLE) ver();
    cuerpo.append(h("details", { class: "jg-texto" }, h("summary", { text: "Pasos en texto (lo que lee el asistente)" }), h("pre", { text: describir(e.datos) || "(la jugada aún no tiene pasos)" })));
  } else if (P.tab === "rel") {
    cuerpo.append(h("div", { class: "jg-fila" }, EDITABLE ? h("button", { type: "button", class: "btn", onclick: vincular }, "Vincular a partido, jugador o equipo…") : null), h("div", { class: "nt-chips" }, chipsDe(ctxDe(e.j)).map((t) => h("i", { text: t }))));
    cuerpo.append(h("p", { class: "nt-vacio", text: "Cargando…" }));
    const doc = docsDeJugadas([{ ...e.j, datos: "" }])[0];
    try { const pr = await panelRelacionado({ doc }, { titulo: "" }); cuerpo.lastChild.replaceWith(pr); } catch (x) { cuerpo.lastChild.textContent = msg(x); }
  } else {
    const s0 = P.seleccion;
    if (!s0) cuerpo.append(h("p", { class: "nt-vacio", text: "Selecciona una ficha o un trazo de la pizarra para ver sus opciones (y asignar un jugador real a una ficha)." }));
    else if (s0.tipo === "ficha") {
      const f = s0.ficha; const D = await payloadDe(await dbDe(ctxDe(e.j)));
      const jug = (D?.jugadores || []).filter((j) => !e.j.equipo || (j.equipo_id || j.equipo) === e.j.equipo).sort((a, b) => a.jugador.localeCompare(b.jugador, "es"));
      cuerpo.append(h("div", { class: "campo" }, h("label", { text: `Ficha ${f.etiqueta} (${f.tipo === "of" ? "ataque" : "defensa"})` }),
        EDITABLE ? h("select", { onchange: (ev) => { const j = jug.find((x) => (x.jugador_id || x.jugador) === ev.target.value); P.pz.asignarJugador(f.id, j ? ev.target.value : "", j?.jugador || ""); pintarPanel(); } },
          [["", e.j.equipo ? "Sin jugador asignado" : "Vincula la jugada a un equipo para asignar jugadores"], ...jug.map((j) => [j.jugador_id || j.jugador, j.jugador])].map(([v, t]) => h("option", { value: v, selected: v === (f.jugador || "") || null }, t))) : h("p", { text: f.jugador_txt || "Sin jugador asignado" })),
        h("p", { class: "nt-vacio", text: "El jugador asignado aparece bajo la ficha y el asistente sabe quién ejecuta cada posición." }));
    } else {
      const t = s0.trazo;
      cuerpo.append(h("div", { class: "campo" }, h("label", { text: `Trazo: ${t.tipo}` }), ["zona", "texto"].includes(t.tipo) && EDITABLE ? h("input", { type: "text", value: t.texto || "", oninput: (ev) => P.pz.editarTrazo(t.id, { texto: ev.target.value }) }) : null),
        h("p", { class: "nt-vacio", text: "Arrastra el punto naranja del trazo para curvarlo. Supr lo elimina." }));
    }
  }
}
function vincular() {
  const e = entradaDe(P.sel); if (!e) return;
  formulario({ titulo: "Vinculación de la jugada", inicial: ctxDe(e.j), textoBoton: "Guardar", onOk: async (m) => { const { titulo, ...ctx } = m; Object.assign(e.j, ctx); await guardar(e, true); pintarCabecera(); pintarLista(); pintarPanel(); } });
}
function pintarCabecera() {
  const e = entradaDe(P.sel); if (!e || !refs.vinculo) return;
  refs.vinculo.replaceChildren(...chipsDe(ctxDe(e.j)).map((t) => h("i", { text: t })));
}

function pintarMain() {
  const main = refs.main; const e = entradaDe(P.sel);
  if (P.pz) { P.pz.destruir(); P.pz = null; } if (P.ro) { P.ro.disconnect(); P.ro = null; }
  if (!e) {
    main.replaceChildren(h("div", { class: "nt-cab" }, botonLado()), h("div", { class: "nt-inicio" }, vacioMsg("Playbook", EDITABLE ? "Diseña jugadas sobre una pista media o completa, por pasos y con reproducción animada. Vincúlalas a partidos, jugadores y equipos, enlázalas desde tus notas y marcas de vídeo, y el asistente las entenderá." : "Jugadas del Mac, para consultar y reproducir."),
      EDITABLE ? h("button", { type: "button", class: "btn primario", onclick: nuevaJugada }, "Nueva jugada") : null,
      EDITABLE && P.lista.length ? menu("Exportar", [{ texto: "Hoja de las jugadas de la lista…", accion: hojaVisibles }]) : null));
    refs.pasos = refs.panel = refs.estado = refs.vinculo = null; return;
  }
  const j = e.j;
  refs.titulo = h("input", { type: "text", class: "nt-titulo", "aria-label": "Título de la jugada", value: j.titulo, disabled: EDITABLE ? null : true, oninput: (ev) => { j.titulo = ev.target.value; programar(e); } });
  refs.vinculo = h("span", { class: "nt-chips" }); refs.estado = h("span", { class: "nt-estado", role: "status" });
  const coleccion = h("input", { type: "text", class: "jg-col-in", list: "jg-colecciones", placeholder: "Colección", value: j.coleccion || "", title: "Colección (playbook) a la que pertenece", disabled: EDITABLE ? null : true, oninput: (ev) => { j.coleccion = ev.target.value.trim(); programar(e); } });
  const seccion = h("input", { type: "text", class: "jg-col-in", placeholder: "Sección", value: j.seccion || "", title: "Sección dentro de la colección", disabled: EDITABLE ? null : true, oninput: (ev) => { j.seccion = ev.target.value.trim(); programar(e); } });
  const lienzo = h("div", { class: "jg-lienzo" });
  refs.pasos = h("div", { class: "jg-pasos" }); refs.panel = h("aside", { class: "jg-panel", "aria-label": "Panel de la jugada" });
  refs.deshacer = h("button", { type: "button", class: "btn fantasma nt-b", title: "Deshacer (Cmd+Z)", "aria-label": "Deshacer", onclick: () => P.pz.deshacer() }, "↶ Deshacer");
  refs.rehacer = h("button", { type: "button", class: "btn fantasma nt-b", title: "Rehacer (Cmd+Mayús+Z)", "aria-label": "Rehacer", onclick: () => P.pz.rehacer() }, "↷ Rehacer");
  const ficheroJson = h("input", { type: "file", accept: "application/json,.json", hidden: true, onchange: (ev) => { if (ev.target.files[0]) importarJson(ev.target.files[0]); ev.target.value = ""; } });
  const herr = EDITABLE ? crearPaleta((id) => { P.pz.herramienta(id); lienzo.dataset.h = id; }) : null;
  const barra = EDITABLE ? h("div", { class: "nt-barra2 jg-barra" },
    refs.deshacer, refs.rehacer, h("span", { class: "nt-sep" }),
    h("div", { class: "seg", role: "radiogroup", "aria-label": "Pista" }, [["media", "Media pista"], ["completa", "Pista completa"]].map(([v, t]) => h("button", { type: "button", role: "radio", "aria-checked": String(e.datos.pista === v), class: e.datos.pista === v ? "on" : "", onclick: () => { P.pz.cambiarPista(v); e.datos = P.pz.datos; pintarMain(); } }, t))),
    h("button", { type: "button", class: "btn", title: "Refleja la jugada de izquierda a derecha", onclick: () => P.pz.espejo() }, "⇋ Voltear lados"),
    h("label", { class: "jg-chk", title: "Ajusta las fichas a una rejilla de 0,5 m" }, h("input", { type: "checkbox", checked: P.reja || null, onchange: (ev) => { P.reja = ev.target.checked; P.pz.reja(P.reja); } }), " Ajustar a rejilla"),
    h("span", { class: "nt-sep" }),
    menu("Exportar", [
      { texto: "Imagen PNG de este paso", accion: () => exportarPng(false) },
      { texto: "Imagen PNG de todos los pasos", accion: () => exportarPng(true) },
      { texto: "Hoja de la jugada (PDF o imprimir)…", accion: () => hoja([{ ...j, datos: JSON.stringify(e.datos) }], j.titulo) },
      { texto: "Hoja de las jugadas de la lista…", ayuda: "Todas las que muestra la biblioteca con la búsqueda y los filtros actuales", accion: hojaVisibles },
      null,
      { texto: "Archivo de jugada (JSON)", accion: exportarJson },
      { texto: "Importar jugada (JSON)…", accion: () => ficheroJson.click() },
    ]), ficheroJson,
    h("button", { type: "button", class: "btn fantasma", onclick: duplicarJugada }, "Duplicar"), h("button", { type: "button", class: "btn fantasma", onclick: borrarJugada }, "Borrar"), refs.estado) : null;
  main.replaceChildren(...[
    h("div", { class: "nt-cab" }, botonLado(), refs.titulo, EDITABLE ? h("button", { type: "button", class: "btn", onclick: vincular, title: "Vincular a temporada, equipo, jugador o partido" }, refs.vinculo, " ✎") : refs.vinculo, EDITABLE || j.coleccion ? coleccion : null, EDITABLE || j.seccion ? seccion : null,
      h("datalist", { id: "jg-colecciones" }, unicos("coleccion").map((c) => h("option", { value: c })))),
    barra,
    h("div", { class: "jg-trabajo" + (herr ? "" : " visor") }, herr?.paleta, h("div", { class: "jg-centro" }, herr?.ayuda, lienzo, refs.pasos), refs.panel)].filter(Boolean));
  P.pz = crearPizarra(lienzo, { datos: e.datos, editable: EDITABLE, pedirTexto, alAviso: herr?.aviso, alPaso: () => { pintarPasos(); pintarDeshacer(); }, alTerminar: () => pintarPasos(),
    alSeleccionar: (s0) => { P.seleccion = s0; if (s0 && EDITABLE) { P.tab = "ficha"; } pintarPanel(); },
    alCambiar: (datos) => { e.datos = datos; programar(e); pintarDeshacer(); pintarPasos(); if (P.tab === "desc") { const det = refs.panel?.querySelector(".jg-texto pre"); if (det) det.textContent = describir(datos); } } });
  P.pz.reja(P.reja);
  // la pista ocupa todo el espacio disponible sin deformarse
  if (P.ro) P.ro.disconnect();
  const ajustar = () => { const sv = lienzo.querySelector("svg"); if (!sv) return; const vb = sv.viewBox.baseVal, r = vb.width / vb.height, w = lienzo.clientWidth - 14, hh = lienzo.clientHeight - 14;
    if (w <= 0 || hh <= 0) return; let W = w, H = w / r; if (H > hh) { H = hh; W = hh * r; } sv.style.width = `${Math.floor(W)}px`; sv.style.height = `${Math.floor(H)}px`; };
  P.ro = new ResizeObserver(() => requestAnimationFrame(ajustar)); P.ro.observe(lienzo); ajustar(); P.ajustar = ajustar;
  pintarCabecera(); pintarPasos(); pintarDeshacer(); pintarPanel();
}

function pintar() {
  const root = refs.root;
  refs.lista = h("aside", { class: "nt-lado", "aria-label": "Biblioteca de jugadas" });
  refs.filtros = h("div", { class: "nt-filtros" }); refs.cuenta = h("small", { class: "nt-cuenta" }); refs.items = h("div", { class: "nt-items" });
  const entrada = h("input", { type: "search", class: "nt-q", placeholder: "Buscar jugadas…", value: P.f.q, "aria-label": "Buscar jugadas", oninput: (ev) => { P.f.q = ev.target.value; pintarLista(); } });
  refs.lista.append(h("div", { class: "nt-lado-cab" }, h("b", { text: "Playbook" }), EDITABLE ? h("button", { type: "button", class: "btn primario", onclick: nuevaJugada }, "+ Nueva jugada") : null),
    h("div", { class: "nt-buscar" }, entrada, h("div", { class: "nt-opc" }, refs.cuenta)), refs.filtros, refs.items);
  refs.main = h("section", { class: "nt-centro jg-centro-main" });
  root.replaceChildren(h("div", { class: "jg nt" + (P.lado ? "" : " sin-lado") }, refs.lista, refs.main));
  pintarLista(); pintarMain();
}

export async function vistaPlaybook(root) {
  root.replaceChildren(vacioMsg("Cargando Playbook…"));
  try { if (!S.grupos.length) { try { S.grupos = await invoke("listar_grupos"); } catch { /* sin datos FEB */ } } await refrescar(); } catch (x) { root.replaceChildren(vacioMsg("No se pudo abrir el Playbook", msg(x))); return; }
  document.body.classList.remove("nt-imprimiendo");
  refs = { root };
  const pedida = paramHash("j"); if (pedida && P.lista.some((j) => String(j.id) === pedida)) P.sel = Number(pedida);
  if (P.sel && !P.lista.some((j) => j.id === P.sel)) P.sel = null;
  if (P.sel && innerWidth <= 900) P.lado = false;
  if (!P.sel && P.lista.length && !P.entradas.size) P.sel = null;
  if (P.sel) { const j = P.lista.find((x) => x.id === P.sel); if (j && !entradaDe(P.sel)) { try { let datos; try { datos = normalizar(JSON.parse(j.datos)); } catch { datos = vacia(); } P.entradas.set(j.id, { j: { ...j, datos: undefined }, datos, guardado: JSON.stringify(datos), sucia: false }); } catch { P.sel = null; } } }
  pintar();
}
