// Vista "Datos" (solo escritorio): descarga y actualiza los datos de cualquier competición/grupo/temporada de feb.es.
// Es incremental: solo baja los partidos jugados que aún no están guardados.
import { h, vacioMsg } from "../util.js";
import { invoke, escuchar as alEvento, MODO } from "../api.js";
import { S } from "../state.js";

const NOMBRES = { lfendesa: "Liga Endesa", primerafeb: "Primera FEB", lfchallenge: "LF Challenge", segundafeb: "Segunda FEB", lf2: "Liga Femenina 2", tercerafeb: "Tercera FEB",
  ligau: "Liga Universitaria", copaespaa: "Copa de España", cessaaminimas: "Campeonato España Minis masc.", cessaaminifem: "Campeonato España Minis fem.",
  cessaacadetemas: "Campeonato España Cadete masc.", cessaacadetefem: "Campeonato España Cadete fem.", cessaainfantilmas: "Campeonato España Infantil masc.",
  cessaainfantilfem: "Campeonato España Infantil fem.", minicopalfendesa: "Minicopa Endesa", cespclubesjrmasc: "Clubes Junior masc.", cespclubesjrfem: "Clubes Junior fem.",
  cespclubescadmasc: "Clubes Cadete masc.", cespclubescadfem: "Clubes Cadete fem.", cespclubesinfmasc: "Clubes Infantil masc.", cespclubesinffem: "Clubes Infantil fem.",
  cespclubesminimasc: "Clubes Mini masc.", cespclubesminifem: "Clubes Mini fem." };
const nombreComp = (slug) => NOMBRES[slug] || slug;
const D = { fuentes: [], navegador: undefined, comps: [], comp: "tercerafeb", temporadas: [], temporada: "", grupos: [], grupo: "", cargando: false, activo: false, log: [], progreso: null, resumen: null, error: "", escuchando: false };

// Refresco en vivo durante la descarga. IMPORTANTE: el contenedor cambia cada vez que se abre la pestaña, así que el
// manejador usa siempre D.root (el actual) y no el que había al registrarlo.
function estadoTexto() {
  const p = D.progreso; if (!D.activo || !p) return "";
  const seg = Math.max(0, Math.round((Date.now() - (D.tUltimo || Date.now())) / 1000));
  return p.total ? `Partido ${Math.min(p.actual + 1, p.total)} de ${p.total} · ${seg} s` : `${p.mensaje || "Trabajando…"} · ${seg} s`;
}
function actualizarVivo() {
  const prog = document.querySelector(".dat-prog"); const log = document.querySelector(".dat-log"); const est = document.querySelector(".dat-estado");
  if (!prog || !log) return false;
  const p = D.progreso || {};
  const barra = prog.querySelector("progress"); if (barra) { barra.max = p.total || 1; if (p.total) barra.value = p.actual; else barra.removeAttribute("value"); }
  const n = prog.querySelector(".dat-n"); if (n) n.textContent = p.total ? `${p.actual}/${p.total}` : "…";
  log.textContent = D.log.join("\n"); log.scrollTop = log.scrollHeight;
  if (est) est.textContent = estadoTexto();
  return true;
}
async function escuchar() {
  if (D.escuchando) return; D.escuchando = true;
  setInterval(() => { const est = document.querySelector(".dat-estado"); if (est) est.textContent = estadoTexto(); }, 1000);
  await alEvento("descarga", async (ev) => {
    const p = ev.payload; const antes = D.progreso?.actual ?? 0; D.progreso = p; D.tUltimo = Date.now();
    if (p.mensaje) D.log = [...D.log.slice(-60), p.mensaje];
    if (p.fase === "error") { D.error = p.mensaje; D.activo = false; }
    if (!document.querySelector(".dat-root") || !D.root) return;
    if (p.fase === "descargando" && p.actual > antes) { try { S.grupos = await invoke("listar_grupos"); } catch { /* ignorar */ } pintar(D.root); } // un partido más guardado: refresca también la tabla
    else if (p.fase !== "descargando" || !actualizarVivo()) pintar(D.root);
  });
}

export async function vistaDatos(root) {
  D.root = root; await escuchar();
  D.fuentes = await invoke("listar_fuentes");
  S.grupos = await invoke("listar_grupos");
  D.navegador = (await invoke("estado_navegador")).ruta;
  pintar(root);
  if (D.navegador && !D.grupos.length) cargarOpciones(root, D.comp, null);
}

async function cargarOpciones(root, comp, temporada) {
  const comps = D.comps.length ? D.comps : [["tercerafeb", "3"]];
  const id = (comps.find((c) => c[0] === comp) || [comp, "3"])[1];
  D.cargando = true; D.error = ""; pintar(root);
  try {
    const o = await invoke("feb_opciones", { competicionId: id, slug: comp, temporada: temporada || null });
    if (o.competiciones?.length) D.comps = [...new Map(o.competiciones.map(([, i, s]) => [s, [s, i]])).values()];
    D.temporadas = o.temporadas; D.temporada = temporada || o.temporadas.find(([t]) => t === o.temporada)?.[1] || o.temporadas[0]?.[1] || "";
    D.grupos = o.grupos; D.grupo = o.grupos[0]?.[1] || "";
  } catch (e) { D.error = mensajeError(e); }
  D.cargando = false; pintar(root);
}
const mensajeError = (e) => (String(e).includes("NO_NAVEGADOR") ? "No se encontró Chrome, Edge ni Chromium. Pulsa «Instalar navegador»." : String(e));

async function descargar(root, args) {
  D.activo = true; D.tUltimo = Date.now(); D.resumen = null; D.error = ""; D.log = []; D.progreso = { fase: "buscando", actual: 0, total: 0 }; pintar(root);
  try { D.resumen = await invoke("descargar_grupo", args); S.grupos = await invoke("listar_grupos"); D.fuentes = await invoke("listar_fuentes"); }
  catch (e) { D.error = mensajeError(e); }
  D.activo = false; pintar(root);
}

function pintar(root) {
  D.root = root;
  const idComp = (slug) => (D.comps.find((c) => c[0] === slug) || [slug, "3"])[1];
  const comps = D.comps.length ? D.comps : [["tercerafeb", "3"]];
  const sel = (opciones, valor, onc, attrs = {}) => h("select", { onchange: (e) => onc(e.target.value), ...attrs }, opciones.map(([v, t]) => h("option", { value: v, selected: v === valor || null, text: t })));
  const p = D.progreso;
  const barra = D.activo && p ? h("div", { class: "dat-prog" }, h("progress", { max: p.total || 1, value: p.total ? p.actual : null }), h("span", { class: "dat-n", text: p.total ? `${p.actual}/${p.total}` : "…" }), h("span", { class: "dat-estado vid-ayuda", text: estadoTexto() }),
    h("button", { type: "button", class: "btn", onclick: () => invoke("cancelar_descarga") }, "Cancelar")) : null;
  const r = D.resumen;
  const nuevo = h("div", { class: "card dat-root" },
    h("h2", { text: "Descargar datos de la FEB" }),
    D.navegador === null ? h("div", { class: "dat-aviso" }, h("p", { text: "Para leer feb.es hace falta un navegador (Chrome, Edge o Chromium). No se ha encontrado ninguno." }),
      h("button", { type: "button", class: "btn primario", disabled: D.activo || null, onclick: async () => { D.activo = true; pintar(root); try { D.navegador = await invoke("instalar_navegador"); } catch (e) { D.error = String(e); } D.activo = false; pintar(root); if (D.navegador) cargarOpciones(root, D.comp, null); } }, "Instalar navegador (una vez, ~150 MB)")) : null,
    h("div", { class: "dat-form" },
      h("label", null, "Competición", sel(comps.map(([s]) => [s, nombreComp(s)]), D.comp, (v) => { D.comp = v; D.temporada = ""; cargarOpciones(root, v, null); }, { disabled: D.activo || D.cargando || null })),
      h("label", null, "Temporada", sel(D.temporadas.map(([t, v]) => [v, t]), D.temporada, (v) => { D.temporada = v; cargarOpciones(root, D.comp, v); }, { disabled: D.activo || D.cargando || !D.temporadas.length || null })),
      h("label", null, "Grupo / división", sel(D.grupos.map(([t, v]) => [v, t.replace(/"/g, "")]), D.grupo, (v) => { D.grupo = v; }, { disabled: D.activo || D.cargando || !D.grupos.length || null })),
      h("button", { type: "button", class: "btn primario", disabled: D.activo || D.cargando || !D.grupo || !D.navegador || null,
        onclick: () => descargar(root, { competicionId: idComp(D.comp), slug: D.comp, temporada: D.temporada || null, grupoValor: D.grupo }) }, D.activo ? "Descargando…" : "Descargar / actualizar")),
    D.cargando ? h("p", { class: "vid-ayuda", text: "Consultando feb.es…" }) : null,
    barra,
    D.error ? h("p", { class: "dat-error", text: D.error }) : null,
    r ? h("div", { class: "dat-ok" }, h("b", { text: `${r.competicion} · ${r.grupo} · ${r.temporada}` }),
      h("p", { text: r.cancelado ? "Descarga cancelada: lo ya guardado se conserva." : `Listo: ${r.nuevos} partido(s) nuevo(s) de ${r.partidos} (${r.equipos} equipos, ${r.tiros} tiros).` }),
      r.fallos.length ? h("p", { class: "dat-error", text: `${r.fallos.length} partido(s) no se pudieron descargar; vuelve a pulsar «Descargar» para reintentarlos.` }) : null,
      h("a", { class: "btn primario", href: `#/equipo?db=${encodeURIComponent(r.db)}` }, "Ver estos datos")) : null,
    D.log.length ? h("pre", { class: "dat-log", text: D.log.join("\n") }) : null);

  const todo = async () => { for (const f of D.fuentes) { if (D.error) break; await descargar(root, { competicionId: f.competicion_id, slug: f.slug, temporada: f.temporada_valor, grupoValor: f.grupo_valor }); } };
  const lista = h("div", { class: "card" }, h("h2", { text: "Datos guardados " }, D.fuentes.length > 1 ? h("button", { type: "button", class: "btn", disabled: D.activo || !D.navegador || null, onclick: todo }, "Actualizar todo") : null),
    S.grupos.length ? h("table", { class: "dat-tabla" }, h("thead", null, h("tr", null, ["Competición", "Grupo", "Temporada", "Partidos", "Actualizado", ""].map((t) => h("th", { text: t })))),
      h("tbody", null, S.grupos.map((g) => {
        const f = D.fuentes.find((x) => x.db === g.db);
        return h("tr", null, h("td", { text: g.competicion }), h("td", { text: (g.grupo || "").replace(/"/g, "") }), h("td", { text: g.temporada }), h("td", { text: g.partidos ?? "" }),
          h("td", { text: f ? (f.actualizado || "").slice(0, 16) : "" }),
          h("td", null, h("a", { class: "btn fantasma", href: `#/equipo?db=${encodeURIComponent(g.db)}` }, "Ver"),
            f ? h("button", { type: "button", class: "btn", disabled: D.activo || !D.navegador || null, onclick: () => descargar(root, { competicionId: f.competicion_id, slug: f.slug, temporada: f.temporada_valor, grupoValor: f.grupo_valor }) }, "Actualizar")
              : h("span", { class: "vid-ayuda", title: "Descárgalo una vez desde el formulario de arriba (no repite los partidos que ya tiene) y quedará con botón «Actualizar»", text: "sin origen" })));
      }))) : vacioMsg("Aún no has descargado nada", "Elige competición, temporada y grupo arriba. Cada vez que se jueguen partidos nuevos, pulsa «Actualizar»: solo se descargan los nuevos."));
  root.replaceChildren(nuevo, lista, ...(MODO === "nativo" ? [importar(root), exportar(root)] : []));
  const lg = root.querySelector(".dat-log"); if (lg) lg.scrollTop = lg.scrollHeight;
}

// «Llevar los datos al iPad»: genera un único archivo con los grupos elegidos, que se importa en el iPad (Ajustes → Datos).
let _sel = null;
function exportar(root) {
  _sel ||= new Set(S.grupos.map((g) => g.db));
  const msg = h("p", { class: "vid-ayuda" });
  const hacer = async () => {
    const ruta = await window.__TAURI__.dialog.save({ defaultPath: "FEB-Stats-iPad.json", filters: [{ name: "Datos para la app del iPad", extensions: ["json"] }, { name: "Archivo único HTML (experimental)", extensions: ["html"] }] });
    if (!ruta) return; msg.textContent = "Generando…";
    try { msg.textContent = await invoke("exportar_paquete", { ruta, dbs: [..._sel] }); } catch (e) { msg.textContent = String(e); }
  };
  return h("div", { class: "card" }, h("h2", { text: "Llevar los datos al iPad" }),
    h("p", { class: "vid-ayuda", text: "Genera un archivo con los datos que elijas. Pásalo al iPad por AirDrop o cable e impórtalo en la app instalada en el iPad (Ajustes → Datos). La app del iPad se instala una sola vez desde https://juliomsevilla.github.io/febstats/ (Safari → Compartir → Añadir a pantalla de inicio). La opción «.html» (app y datos en un solo archivo) es experimental." }),
    h("div", { class: "con-lista" }, S.grupos.map((g) => h("label", { class: "ia-breve" }, h("input", { type: "checkbox", checked: _sel.has(g.db) || null, onchange: (e) => { e.target.checked ? _sel.add(g.db) : _sel.delete(g.db); } }), ` ${g.temporada} · ${g.competicion} ${String(g.grupo).replace(/"/g, "")}`))),
    h("div", { class: "vid-herr" }, h("button", { type: "button", class: "btn primario", onclick: hacer }, "Exportar datos para iPad…")), msg);
}

// Importar un .db que ya tengas (p. ej. generado antes con el scraper de Python o copiado de otro Mac).
function importar(root) {
  const msg = h("p", { class: "vid-ayuda" });
  const hacer = async () => {
    const f = await window.__TAURI__.dialog.open({ multiple: true, filters: [{ name: "Base de datos de un grupo", extensions: ["db"] }] });
    if (!f) return; msg.textContent = "Importando…";
    try { const out = []; for (const r of [].concat(f)) out.push(await invoke("importar_db", { ruta: r })); await vistaDatos(root); root.append(h("p", { class: "dat-ok", text: "Importado: " + out.join(" ") })); }
    catch (e) { msg.textContent = String(e); }
  };
  return h("div", { class: "card" }, h("h2", { text: "Importar datos que ya tengo" }),
    h("p", { class: "vid-ayuda", text: "Si ya tienes archivos .db de grupos (por ejemplo «grupo_tercera_feb_….db» de otro ordenador o del programa anterior), impórtalos aquí y aparecerán en la lista de datos guardados." }),
    h("div", { class: "vid-herr" }, h("button", { type: "button", class: "btn primario", onclick: hacer }, "Importar archivo(s) .db…")), msg);
}
