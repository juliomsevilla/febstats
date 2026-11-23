// Vista "Scouting": jugadores de TODAS las categorías descargadas en una sola lista filtrable (edad, minutos, perfil, rol…) y, al abrir uno,
// su recorrido por temporadas y categorías. Cada fila se compara solo con su propia categoría (índice, perfil y rol salen de su categoría):
// nunca se mezclan niveles en un mismo ranking.
import { h, f0, f1, fpct, tabla, vacioMsg, tabsBar } from "../util.js";
import { COLS_JUGADOR } from "./jugadores.js";
import { invoke } from "../api.js";
import { jugadorKey } from "../state.js";

const X = { filas: null, cats: [], q: "", comp: "", temp: "", edadMin: "", edadMax: "", minMin: "150", perfil: "", rol: "", soloIndice: false, tab: "temporada", ordenes: { temporada: { col: "valoracion", dir: -1 }, tiro: { col: "ppt", dir: -1 }, uso: { col: "uso_pct", dir: -1 }, indice: { col: "indice_final", dir: -1 } }, abierto: null, max: 200 };
const norm = (s) => String(s || "").normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase();
const limpio = (g) => String(g || "").replace(/"/g, "");

function edadDe(nac) {
  if (!nac) return null;
  const d = new Date(nac); if (Number.isNaN(d.getTime())) return null;
  const hoy = new Date(); let e = hoy.getFullYear() - d.getFullYear();
  if (hoy.getMonth() < d.getMonth() || (hoy.getMonth() === d.getMonth() && hoy.getDate() < d.getDate())) e--;
  return e;
}
const idPersona = (r) => r.jugador_id || `${r.jugador}\x01${r.equipo}`; // sin id de la FEB (datos antiguos) se cae al nombre + equipo
const minPJ = (r) => (r.partidos ? r.minutos_total / r.partidos : null);

const TABS = [["temporada", "Resumen"], ["tiro", "Tiro"], ["uso", "Posesión y reparto"], ["indice", "Índice de Versatilidad"]];
// Las mismas columnas que las pestañas de Jugadores, con la categoría y la edad delante en lugar del dorsal.
const COLS_ID = [
  { key: "ambito", label: "Categoría", val: (r) => `${r.competicion} ${r.temporada}`, render: (r) => `${r.competicion} · ${r.temporada}${r.n_grupo > 1 ? ` · ${limpio(r.grupo)}` : ""}` },
  { key: "edad", label: "Edad", num: true, val: (r) => edadDe(r.nacimiento), fmt: (v) => (v == null ? "—" : v) },
];
const colsDe = (tab) => { const [jug, eq, ...resto] = COLS_JUGADOR[tab].filter((c) => c.key !== "dorsal"); return [jug, eq, ...COLS_ID, ...resto]; };

function filtradas() {
  const q = norm(X.q.trim()), emin = X.edadMin === "" ? null : +X.edadMin, emax = X.edadMax === "" ? null : +X.edadMax, mmin = X.minMin === "" ? 0 : +X.minMin;
  return X.filas.filter((r) => {
    if (X.comp && r.competicion !== X.comp) return false;
    if (X.temp && r.temporada !== X.temp) return false;
    if ((r.minutos_total || 0) < mmin) return false;
    if (X.perfil && r.perfil !== X.perfil) return false;
    if (X.rol && r.rol !== X.rol) return false;
    if (X.soloIndice && r.indice_final == null) return false;
    if (emin != null || emax != null) { const e = edadDe(r.nacimiento); if (e == null || (emin != null && e < emin) || (emax != null && e > emax)) return false; }
    if (q && !norm(`${r.jugador} ${r.equipo}`).includes(q)) return false;
    return true;
  });
}

export async function vistaScouting(root) {
  root.replaceChildren(vacioMsg("Calculando el índice de jugadores…", "La primera vez puede tardar unos segundos si hay muchas categorías."));
  try { const d = await invoke("indice_jugadores"); X.filas = d.jugadores; X.cats = d.categorias; }
  catch (e) { root.replaceChildren(vacioMsg("No se pudo calcular", String(e))); return; }
  if (!X.filas.length) { root.replaceChildren(vacioMsg("Aún no hay datos", "Descarga alguna competición en Ajustes → Datos.")); return; }
  pintar(root);
}

function pintar(root) {
  const comps = [...new Set(X.filas.map((r) => r.competicion))].sort((a, b) => a.localeCompare(b, "es"));
  const temps = [...new Set(X.filas.map((r) => r.temporada))].sort().reverse();
  const perfiles = [...new Set(X.filas.map((r) => r.perfil).filter(Boolean))].sort();
  const roles = [...new Set(X.filas.map((r) => r.rol).filter(Boolean))].sort();
  const sel = (valor, opciones, vacio, onc) => h("select", { onchange: (e) => { onc(e.target.value); pintar(root); } }, h("option", { value: "", text: vacio }), opciones.map((o) => h("option", { value: o, selected: o === valor || null, text: o })));
  const num = (clave, ph, ancho = "5.5em") => h("input", { type: "number", min: "0", placeholder: ph, value: X[clave], style: `width:${ancho}`, onchange: (e) => { X[clave] = e.target.value; pintar(root); } });
  const buscar = h("input", { type: "search", placeholder: "Buscar jugador o equipo…", value: X.q, autocomplete: "off", spellcheck: "false", style: "min-width:14em" });
  buscar.addEventListener("input", () => { X.q = buscar.value; X.max = 200; repintarTabla(); });

  const zona = h("div");
  const cuerpo = h("div", { class: "card" });
  function repintarTabla() {
    const todas = filtradas();
    const cols = colsDe(X.tab), orden = cols.some((c) => c.key === X.ordenes[X.tab].col) ? X.ordenes[X.tab] : { col: cols.find((c) => c.num)?.key || cols[0].key, dir: -1 }; // por si la columna ya no existe
    const col = cols.find((c) => c.key === orden.col) || cols[0];
    const v = (r) => (col.val ? col.val(r) : r[col.key]);
    const ord = todas.slice().sort((a, b) => { const x = v(a), y = v(b); if (x == null && y == null) return 0; if (x == null) return 1; if (y == null) return -1; return (typeof x === "string" ? x.localeCompare(y, "es") : x - y) * orden.dir; });
    const ver = ord.slice(0, X.max);
    zona.replaceChildren(h("p", { class: "vid-ayuda", text: `${todas.length} jugador(es)${todas.length > ver.length ? ` · se muestran los ${ver.length} primeros del orden elegido` : ""}` }),
      tabla({ cols, filas: ver, orden, onOrden: (o) => { X.ordenes[X.tab] = o; repintarTabla(); }, onFila: (r) => { X.abierto = r; pintar(root); window.scrollTo(0, 0); }, vacioTxt: "Ningún jugador cumple los filtros" }),
      todas.length > ver.length ? h("button", { type: "button", class: "btn", onclick: () => { X.max += 200; repintarTabla(); } }, "Mostrar más") : null);
  }

  if (X.abierto) { root.replaceChildren(ficha(root)); return; }
  cuerpo.append(h("div", { class: "dat-form" },
    buscar,
    sel(X.comp, comps, "Todas las competiciones", (v) => { X.comp = v; }),
    sel(X.temp, temps, "Todas las temporadas", (v) => { X.temp = v; }),
    h("label", null, "Edad", h("span", { style: "display:flex;gap:6px;align-items:center" }, num("edadMin", "mín"), "–", num("edadMax", "máx"))),
    h("label", { title: "Minutos totales jugados en esa temporada" }, "Min. totales ≥", num("minMin", "0", "6em")),
    sel(X.perfil, perfiles, "Cualquier perfil", (v) => { X.perfil = v; }),
    sel(X.rol, roles, "Cualquier rol", (v) => { X.rol = v; }),
    h("label", { class: "ia-breve", style: "display:flex;gap:6px;align-items:center;padding-bottom:6px", title: "Excluye a quien no llega al mínimo de tiros para tener índice" }, h("input", { type: "checkbox", checked: X.soloIndice || null, onchange: (e) => { X.soloIndice = e.target.checked; pintar(root); } }), " Solo con índice")),
    h("p", { class: "vid-ayuda", text: "Índice, perfil y rol de cada fila son respecto a su propia categoría y temporada: no se comparan entre categorías. La edad sale de la plantilla de la FEB (si la categoría no la publica, aparece «—» y el filtro de edad la excluye)." }),
    tabsBar(TABS, X.tab, (v) => { X.tab = v; X.max = 200; pintar(root); }),
    zona);
  root.replaceChildren(h("div", { class: "titulo" }, h("h1", { text: "Scouting" }), h("p", { text: `Jugadores de ${X.cats.length} categoría(s) descargadas` })), cuerpo);
  repintarTabla();
}

/** Recorrido de un jugador: una línea por temporada y categoría, con sus números y su rango dentro de cada una. */
function ficha(root) {
  const base = X.abierto, id = idPersona(base);
  const filas = X.filas.filter((r) => idPersona(r) === id).sort((a, b) => String(b.temporada).localeCompare(String(a.temporada)));
  const edad = edadDe(filas.find((r) => r.nacimiento)?.nacimiento);
  const cols = [
    { key: "temporada", label: "Temporada" }, { key: "competicion", label: "Competición" }, { key: "grupo", label: "Grupo", render: (r) => limpio(r.grupo) || "—" }, { key: "equipo", label: "Equipo" },
    ...COLS_JUGADOR.temporada.filter((c) => ["partidos", "puntos_prom", "reb_tot", "asistencias", "valoracion", "t3_pct", "indice_final", "perfil"].includes(c.key)),
    ...COLS_JUGADOR.uso.filter((c) => ["uso_pct", "rol"].includes(c.key)),
  ];
  const abrir = (r) => { location.hash = `#/jugadores?db=${encodeURIComponent(r.categoria)}&eq=${encodeURIComponent(r.equipo)}&ju=${encodeURIComponent(jugadorKey(r.jugador, r.equipo))}`; };
  const personal = [edad != null ? `${edad} años` : null, filas.find((r) => r.nacionalidad)?.nacionalidad, filas.find((r) => r.puesto)?.puesto, filas.find((r) => r.altura)?.altura].filter(Boolean).join(" · ");
  return h("div", null,
    h("div", { class: "con-barra" }, h("button", { type: "button", class: "btn", onclick: () => { X.abierto = null; pintar(root); } }, "← Volver a la lista")),
    h("div", { class: "titulo" }, h("h1", { text: base.jugador }), h("p", { text: personal || "Sin datos personales en la plantilla de la FEB" })),
    h("div", { class: "card" }, h("h2", { text: "Recorrido" }, h("span", { class: "sub", text: "clic en una fila para abrirla en Jugadores" })),
      tabla({ cols, filas, orden: { col: "temporada", dir: -1 }, onOrden: () => {}, onFila: abrir }),
      h("p", { class: "nota-kpi", text: "El índice, el perfil y el rol de cada línea son respecto a su categoría y temporada; no se pueden comparar entre líneas de distinta categoría." })));
}
