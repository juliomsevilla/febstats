// Arranque, enrutado por hash y barra superior con los filtros globales.
import { h, s, icono, vacioMsg, tip } from "./util.js";
import { S, leerHash, hashDe, normalizar, ir, fijarCompleto, aplicarAmbito, grupoDeEquipo, equipoEnFoco, partidosDeEquipo, nombreDeKey, jugadorKey } from "./state.js";
import { vistaEquipo } from "./views/equipo.js";
import { vistaJugadores } from "./views/jugadores.js";
import { vistaPartidos } from "./views/partidos.js";
import { vistaTiros } from "./views/tiros.js";
import { vistaVideo } from "./views/video.js";
import { vistaAjustes } from "./views/ajustes.js";
import { vistaIA } from "./views/ia.js";
import { enEscritorio, enLocal, conVideo, invoke, MODO } from "./api.js";
import { vistaConsulta } from "./views/consulta.js";
import { vistaScouting } from "./views/scouting.js";
import { vistaNotas } from "./views/notas.js";
import { vistaPlaybook } from "./views/jugadas.js";
import { chipRelacionado } from "./views/relacionado.js";
import { contextoActual } from "./views/vinculo.js";
import { activarExportacion } from "./exportar-auto.js";

// Vistas de datos (estadísticas); el resto del menú son herramientas de trabajo.
const ESTADISTICAS = ["consulta", "equipo", "jugadores", "partidos", "tiros"];
const VISTAS = [
  ["equipo", "Equipo", vistaEquipo], ["jugadores", "Jugadores", vistaJugadores],
  ["partidos", "Partidos", vistaPartidos], ["tiros", "Mapas", vistaTiros],
];
if (enEscritorio) {
  if (MODO !== "nativo") VISTAS.unshift(["consulta", "Consulta", vistaConsulta]); // buscador rápido para el banquillo (iPad); en el Mac lo cubren Equipo, Jugadores y Scouting
  if (MODO === "nativo" || MODO === "remoto") VISTAS.splice(VISTAS.findIndex(([id]) => id === "tiros") + 1, 0, ["scouting", "Scouting", vistaScouting]); // debajo de Mapas: jugadores de todas las categorías descargadas
  if (conVideo) VISTAS.push(["video", "Vídeo", vistaVideo]);      // el iPad no gestiona vídeo ni capturas
  VISTAS.push(["playbook", "Playbook", vistaPlaybook]);                 // diseñador de jugadas (en el iPad, solo visor)
  VISTAS.push(["notas", "Notas", vistaNotas]);                  // notas Markdown (en el iPad, solo lectura)
  VISTAS.push(["ia", "Asistente", vistaIA], ["ajustes", "Ajustes", vistaAjustes]);
}
if (enLocal && !location.hash) location.hash = "#/consulta"; // en el iPad se abre directamente el buscador
if (enLocal && "serviceWorker" in navigator && location.protocol === "https:") { // uso sin conexión
  const habia = navigator.serviceWorker.controller; // si ya había uno y llega una versión nueva de la app, se recarga para usarla (si no, se vería la antigua hasta la siguiente apertura)
  navigator.serviceWorker.addEventListener("controllerchange", () => { if (habia) location.reload(); });
  navigator.serviceWorker.register("sw.js").catch(() => {});
}
// Marca: escudo con degradado naranja-rojo y un balón con costuras, en guiño (no copia) al escudo de la FEB.
const ESCUDO = "M16 1.5C8.6 1.5 3.5 5.6 3.5 12.4v8.2c0 6.2 5.6 10.6 12.5 14 6.9-3.4 12.5-7.8 12.5-14v-8.2C28.5 5.6 23.4 1.5 16 1.5Z";
function logo() {
  const costura = { fill: "none", stroke: "#fff", "stroke-width": 1.15, "stroke-linecap": "round" };
  return s("svg", { class: "logo", viewBox: "0 0 32 36", "aria-hidden": "true" },
    s("defs", null, s("linearGradient", { id: "lg", x1: 0.1, y1: 0, x2: 0.9, y2: 1 }, s("stop", { offset: 0, "stop-color": "#ffb21c" }), s("stop", { offset: 0.55, "stop-color": "#f4571d" }), s("stop", { offset: 1, "stop-color": "#d71a21" }))),
    s("path", { d: ESCUDO, fill: "url(#lg)" }),
    s("g", costura, s("circle", { cx: 16, cy: 16.5, r: 9 }), s("path", { d: "M7 16.5h18M16 7.5v18M9.4 10.1q6.2 6.4 0 12.8M22.6 10.1q-6.2 6.4 0 12.8" })));
}
const $ = (id) => document.getElementById(id);

// ---------- tema ----------
function aplicarTema(t) {
  if (t) document.documentElement.dataset.theme = t; else delete document.documentElement.dataset.theme;
}
try { aplicarTema(localStorage.getItem("tema")); } catch { /* sin almacenamiento */ }
function alternarTema() {
  const oscuro = document.documentElement.dataset.theme ? document.documentElement.dataset.theme === "dark" : matchMedia("(prefers-color-scheme: dark)").matches;
  const nuevo = oscuro ? "light" : "dark";
  aplicarTema(nuevo);
  try { localStorage.setItem("tema", nuevo); } catch { /* ignorar */ }
}

// ---------- menú lateral plegable (da más sitio al vídeo) ----------
function alternarPlegado() {
  const plegada = document.querySelector(".app").classList.toggle("plegada");
  try { localStorage.setItem("menu-plegado", plegada ? "1" : "0"); } catch { /* ignorar */ }
}
try { if (localStorage.getItem("menu-plegado") === "1") document.querySelector(".app").classList.add("plegada"); } catch { /* sin almacenamiento */ }

// ---------- carga de datos ----------
async function cargarGrupos() {
  if (enEscritorio) return await invoke("listar_grupos");
  try {
    const r = await fetch("/api/grupos");
    if (r.ok && (r.headers.get("content-type") || "").includes("json")) return await r.json();
  } catch { /* sin servidor local: web estática */ }
  S.estatico = true;
  return await (await fetch("data/grupos.json")).json();
}
async function cargar(db) {
  // Con el servidor local: /api/payload. En la web publicada (estática): data/<temporada>.json.
  if (enEscritorio) { fijarCompleto(await invoke("leer_payload", { db })); S.db = db; return; }
  const r = await fetch(S.estatico ? `data/${db.replace(/\.db$/, "")}.json` : `/api/payload?db=${encodeURIComponent(db)}`);
  if (!r.ok) throw new Error((await r.json().catch(() => ({}))).error || `Error ${r.status}`);
  fijarCompleto(await r.json());
  S.db = db;
}

// ---------- shell ----------
function pintarNav(view, db) {
  const nav = $("nav");
  nav.replaceChildren(
    h("div", { class: "marca" }, logo(), h("b", { text: "FEBstats" })),
    ...VISTAS.filter(([id]) => id !== "ajustes").flatMap(([id, nombre], i, lista) => {
      const herramienta = !ESTADISTICAS.includes(id);
      const a = h("a", { href: hashDe({ view: id, db, f: leerHash().f }), class: herramienta ? "herr" : null, "aria-current": id === view ? "page" : null }, icono(id), h("span", { class: "t", text: nombre }));
      // separador al pasar de las vistas estadísticas a las herramientas
      return herramienta && (i === 0 || ESTADISTICAS.includes(lista[i - 1][0])) ? [h("div", { class: "nav-sep", role: "separator" }, h("span", { class: "t", text: "Herramientas" })), a] : [a];
    }),
    h("div", { class: "grow" }),
    ...(VISTAS.some(([id]) => id === "ajustes") ? [h("a", { href: "#/ajustes", "aria-current": view === "ajustes" ? "page" : null }, icono("ajustes"), h("span", { class: "t", text: "Ajustes" }))] : []),
    h("button", { type: "button", class: "plegar", onclick: alternarPlegado, "aria-label": "Plegar o desplegar el menú" }, h("span", { "aria-hidden": "true", text: "⇔" }), h("span", { class: "t", text: "Plegar menú" })),
    h("button", { type: "button", class: "tema", onclick: alternarTema, "aria-label": "Cambiar tema claro/oscuro" }, icono("sol"), h("span", { class: "t", text: "Tema" })));
}

function opcion(v, t, sel) { return h("option", { value: v, selected: sel || null }, t); }
function selector(id, etiqueta, opciones, valor, onCambio) {
  return h("div", { class: "campo" }, h("label", { for: id, text: etiqueta }),
    h("select", { id, onchange: (e) => onCambio(e.target.value) }, opciones.map(([v, t]) => opcion(v, t, v === valor))));
}

function pintarTop(f) {
  const D = S.data, top = $("top"), cat = !!S.completo?.es_categoria;
  const foco = equipoEnFoco(f);
  const jugadores = D.jugadores.filter((j) => !foco || j.equipo === foco)
    .sort((a, b) => a.jugador.localeCompare(b.jugador, "es")).map((j) => [jugadorKey(j.jugador, j.equipo), foco ? j.jugador : `${j.jugador} (${j.equipo})`]);
  const partidos = (foco ? partidosDeEquipo(foco).map((p) => [p.partido_id, `${p.fecha?.slice(5, 10).split("-").reverse().join("/")} ${p.local ? "vs" : "@"} ${p.rival}`])
    : D.partidos.slice().sort((a, b) => (b.fecha || "").localeCompare(a.fecha || "")).map((p) => [p.partido_id, `${p.equipo_local} – ${p.equipo_visitante}`]));
  const hay = f.eq || f.ju || f.pa;
  top.replaceChildren(
    h("div", { class: "contexto" }, h("b", { text: `${D.competicion} · ${cat && !f.gr ? "Toda la categoría" : D.grupo.replace(/"/g, "")}` }), h("span", { text: `Temporada ${D.temporada}${cat ? ` · ${S.completo.grupos.length} grupos` : ""}` })),
    h("div", { class: "filtros" },
      S.grupos.length + S.categorias.length > 1 ? selector("f-db", "Temporada", [...S.grupos.map((g) => [g.db, `${g.temporada} · ${g.grupo.replace(/"/g, "")}`]),
        ...S.categorias.map((c) => [c.db, `${c.temporada} · Toda la categoría (${c.competicion}, ${c.grupos} grupos)`])], S.db, (v) => ir({ db: v, f: { gr: "", eq: "", ju: "", pa: "" } })) : null,
      cat ? selector("f-gr", "Grupo", [["", "Todos los grupos"], ...S.completo.grupos.map((g) => [g, g.replace(/"/g, "")])], f.gr, (v) => ir({ f: { gr: v } })) : null,
      selector("f-eq", "Equipo", [["", "Todos"], ...D.equipos.map((e) => [e, cat && !f.gr ? `${e} · ${grupoDeEquipo(e).replace(/"/g, "")}` : e])], f.eq || foco, (v) => ir({ f: { eq: v, ju: "", pa: "" } })),
      selector("f-ju", "Jugador", [["", "Todos"], ...jugadores], f.ju, (v) => ir({ f: { ju: v } })),
      selector("f-pa", "Partido", [["", "Todos"], ...partidos], f.pa, (v) => ir({ f: { pa: v } })),
      hay ? h("button", { type: "button", class: "btn fantasma", onclick: () => ir({ f: { eq: "", ju: "", pa: "" } }) }, "Quitar filtros") : null));
  // «Relacionado»: notas, jugadas y vídeos enlazados con el equipo, jugador o partido en foco (solo si hay algo)
  if (enEscritorio && hay) chipRelacionado(contextoActual(), "Relacionado con lo que tienes filtrado").then((c) => { if (c && top.isConnected) top.querySelector(".filtros")?.append(c); }).catch(() => {});
}

// ---------- enrutado ----------
let cargando = 0;
async function render() {
  tip.hide();
  const yo = ++cargando;
  const hash = leerHash();
  const main = $("vista");
  main.classList.toggle("ancho", hash.view === "notas" || hash.view === "playbook" || hash.view === "video"); // estas pantallas usan todo el ancho de la ventana
  try {
    if (["consulta", "scouting", "video", "ajustes", "ia", "notas", "playbook"].includes(hash.view) && VISTAS.some((x) => x[0] === hash.view)) { // no dependen de ningún grupo de datos FEB
      const v = VISTAS.find((x) => x[0] === hash.view);
      document.title = `${v[1]} · FEBstats`; pintarNav(v[0], hash.db || ""); $("top").replaceChildren(); $("top").style.display = "none";
      await v[2](main); S._previa = v[0]; return;
    }
    if (window.__quitarAtajos) window.__quitarAtajos();
    $("top").style.display = "";
    if (!S.grupos.length) S.grupos = await cargarGrupos();
    if (!S.categorias) { try { S.categorias = (MODO === "nativo" || MODO === "remoto") ? (await invoke("listar_categorias")).filter((c) => c.grupos > 1) : []; } catch { S.categorias = []; } }
    let db = hash.db;
    if (!db) {
      if (!S.grupos.length) { pintarNav(hash.view, ""); $("top").replaceChildren(); main.replaceChildren(vacioMsg(enEscritorio ? "Aún no hay datos" : "No hay ninguna base de datos", enLocal ? "Importa tu archivo de datos en Ajustes → Datos." : enEscritorio ? "Ve a Ajustes → Descarga de datos para bajar los de la FEB, o importa un .db que ya tengas." : "Genera una con: python -m feb_scraper.dashboard <url> --grupo …  (archivo .db en la raíz del proyecto).")); return; }
      db = S.grupos.slice().sort((a, b) => b.temporada.localeCompare(a.temporada))[0].db;
      location.replace(hashDe({ view: hash.view, db, f: hash.f }));
      return;
    }
    if (db !== S.db || !S.data) { main.replaceChildren(vacioMsg("Cargando datos…")); await cargar(db); }
    if (yo !== cargando) return;
    aplicarAmbito(hash.f.gr);
    const f = normalizar(hash.f);
    if (JSON.stringify(f) !== JSON.stringify(hash.f)) { location.replace(hashDe({ view: hash.view, db, f })); return; }
    const vista = VISTAS.find((v) => v[0] === hash.view) || VISTAS[0];
    document.title = `${vista[1]} · FEBstats`;
    pintarNav(vista[0], db);
    pintarTop(f);
    const cambioVista = S._previa !== vista[0];
    const pintar = () => { vista[2](main, f); if (cambioVista) window.scrollTo(0, 0); }; // al cambiar de sección se empieza arriba
    if (document.startViewTransition && cambioVista) document.startViewTransition(pintar); else pintar();
    S._previa = vista[0];
  } catch (e) {
    main.replaceChildren(vacioMsg("No se pudo cargar", String(e.message || e)));
  }
}
activarExportacion();
// Aviso persistente (solo app del Mac): carpeta de datos no disponible, datos de una versión más nueva, configuración recuperada…
if (MODO === "nativo") invoke("estado_datos").then((d) => {
  if (!d?.aviso) return;
  const b = h("div", { class: "aviso-datos", role: "alert" }, h("b", { text: "⚠ Tus datos: " }), d.aviso, " ", h("a", { href: "#/ajustes?tab=carpetas" }, "Ver Ajustes → Carpetas"),
    h("button", { type: "button", class: "btn fantasma", "aria-label": "Ocultar aviso", onclick: () => b.remove() }, "✕"));
  document.body.prepend(b);
}).catch(() => {});
window.addEventListener("hashchange", render);
render();
