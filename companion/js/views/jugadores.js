// Vista "Jugadores": Estadísticas · Índice de Versatilidad · Qué significa, más el detalle por jugador/partido.
import { h, f0, f1, f2, fpct, tabla, vacioMsg, icono, dialogo, kpi, fechaCorta, tabsBar, conAyuda } from "../util.js";
import { S, ir, jugadorKey, equipoEnFoco, nombreDeKey, equipoDeKey, partidosDeEquipo } from "../state.js";
import { AYUDA } from "../ayuda.js";
import { mapaCancha } from "./tiros.js";
import { scatter } from "../charts/scatter.js";
import { radar } from "../charts/radar.js";
import { botonCSV, nombreArchivo } from "../export.js";

const J = { orden: { col: "puntos", dir: -1 }, ordenIdx: { col: "indice_final", dir: -1 }, ordenPJ: { col: "fecha", dir: 1 }, ordenBox: { col: "puntos", dir: -1 }, ordenTiro: { col: "ppt", dir: -1 }, ordenUso: { col: "uso_pct", dir: -1 }, radarA: "", radarB: "", q: "", tab: "temporada" };
const T = (key, label, extra = {}) => ({ key, label, title: AYUDA[key], ...extra });
const idx100 = (r) => (r.muestra_insuficiente || r.indice_final == null ? null : r.indice_final * 100);
const celdaIdx = (r) => (idx100(r) == null ? h("span", { class: "pill", title: "Menos de 30 tiros de campo: fuera del ranking", text: "—" })
  : h("span", { class: "idx" }, h("b", { text: f1(idx100(r)) }), h("span", { class: "barra" }, h("i", { style: { width: idx100(r) + "%" } }))));
const perfil = (r) => (r.perfil ? h("span", { class: "pill", text: r.perfil }) : "—");

const COLS_TEMP = [
  T("jugador", "Jugador", { render: (r) => h("strong", { text: r.jugador }) }), T("equipo", "Equipo"), T("dorsal", "#", { sec: true, num: true, val: (r) => parseInt(r.dorsal, 10) || 0, fmt: null, render: (r) => r.dorsal ?? "—" }),
  T("partidos", "PJ", { num: true }), T("minutos_total", "Min", { sec: true, num: true, fmt: f0 }), T("puntos", "Pts", { sec: true, num: true, fmt: f0 }), T("puntos_prom", "Pts/PJ", { num: true, fmt: f1 }),
  T("reb_tot", "Reb", { num: true }), T("asistencias", "Ast", { num: true }), T("recuperaciones", "Rec", { sec: true, num: true }), T("perdidas", "Per", { sec: true, num: true }), T("valoracion", "Val", { num: true }),
  T("tc_pct", "TC%", { num: true, fmt: fpct }), T("t2_pct", "T2%", { sec: true, num: true, fmt: fpct }), T("t3_pct", "T3%", { num: true, fmt: fpct }), T("tl_pct", "TL%", { num: true, fmt: fpct }),
  T("indice_final", "Índice", { num: true, val: idx100, render: celdaIdx, title: AYUDA.indice_final }), T("perfil", "Perfil", { render: perfil }),
];
const COLS_IDX = [
  T("jugador", "Jugador", { render: (r) => h("strong", { text: r.jugador }) }), T("equipo", "Equipo"), T("dorsal", "#", { sec: true, num: true, val: (r) => parseInt(r.dorsal, 10) || 0, render: (r) => r.dorsal ?? "—" }), T("partidos", "PJ", { num: true }),
  T("tiros_campo", "TC (temporada)", { num: true }), T("produccion_40", "Producción/40", { num: true, fmt: f1 }), T("zone_entropy", "Entropía zonal", { num: true, fmt: f2 }),
  T("versatilidad_espacial", "Versatilidad espacial", { num: true, fmt: f2 }), T("indice_final", "Índice de Versatilidad", { num: true, val: idx100, render: celdaIdx }), T("perfil", "Perfil", { render: perfil }),
];
const ROL_COLOR = { "Referente": "var(--ok)", "Punto débil": "var(--mal)", "Infrautilizado": "var(--azul)" };
const celdaRol = (r) => (r.rol ? h("span", { class: "pill", style: { color: ROL_COLOR[r.rol], borderColor: ROL_COLOR[r.rol] }, text: r.rol }) : "—");
const IDENT = [T("jugador", "Jugador", { render: (r) => h("strong", { text: r.jugador }) }), T("equipo", "Equipo"), T("partidos", "PJ", { num: true })];
const ts100 = (r) => (r.ts_pct == null ? null : r.ts_pct * 100);
const COLS_TIRO = [...IDENT, T("tiros_campo", "TC", { num: true, title: AYUDA.tiros_campo }), T("tc_pct", "TC%", { num: true, fmt: fpct }), T("t2_pct", "T2%", { num: true, fmt: fpct }), T("t3_pct", "T3%", { num: true, fmt: fpct }),
  T("ts_pct", "TS%", { num: true, val: ts100, fmt: fpct }), T("ppt2", "PPT2", { num: true, fmt: f2 }), T("ppt3", "PPT3", { num: true, fmt: f2 }), T("ppt", "PPT", { num: true, fmt: f2 }), T("ppm", "Pts/min", { num: true, fmt: f2 })];
const COLS_USO = [...IDENT, T("minutos_total", "Min", { num: true, fmt: f0 }), T("pos_usadas", "Pos", { num: true, fmt: f0 }), T("uso_pct", "Uso", { num: true, fmt: fpct }), T("pp_pos", "Pts/pos", { num: true, fmt: f2 }),
  T("abs_t2", "% T2 eq.", { num: true, fmt: fpct }), T("abs_t3", "% T3 eq.", { num: true, fmt: fpct }), T("abs_tc", "% TC eq.", { num: true, fmt: fpct }), T("rol", "Rol", { render: celdaRol })];
const fr = (a, i) => `${a}/${i}`;
const COLS_BOX = [
  T("jugador", "Jugador", { render: (r) => h("strong", { text: r.jugador }) }), T("equipo", "Equipo"), T("minutos", "Min", { num: true }), T("puntos", "Pts", { num: true }), T("reb_tot", "Reb", { num: true }),
  T("asistencias", "Ast", { num: true }), T("recuperaciones", "Rec", { num: true }), T("perdidas", "Per", { num: true }), T("valoracion", "Val", { num: true }), T("mas_menos", "+/-", { num: true }),
  T("t2", "T2", { par: ["t2_aciertos", "t2_intentos"], num: true, val: (r) => r.t2_aciertos, render: (r) => fr(r.t2_aciertos, r.t2_intentos) }), T("t3", "T3", { par: ["t3_aciertos", "t3_intentos"], num: true, val: (r) => r.t3_aciertos, render: (r) => fr(r.t3_aciertos, r.t3_intentos) }),
  T("tl", "TL", { par: ["tl_aciertos", "tl_intentos"], num: true, val: (r) => r.tl_aciertos, render: (r) => fr(r.tl_aciertos, r.tl_intentos) }),
];

export function vistaJugadores(root, f) {
  const foco = equipoEnFoco(f), rerender = () => vistaJugadores(root, f);
  const norm = (t) => t.normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase();
  root.replaceChildren(h("div", { class: "titulo" }, h("h1", { text: "Jugadores" }), h("p", { text: foco || "Todos los equipos del grupo" })));
  root.append(h("div", { class: "card" }, tabsBar([["temporada", "Resumen"], ["tiro", "Tiro"], ["uso", "Posesión y reparto"], ["dispersion", "Uso vs eficiencia"], ["radar", "Radar"], ["indice", "Índice de Versatilidad"], ["info", "Qué significa"]], J.tab, (v) => { J.tab = v; rerender(); }),
    J.tab === "info" ? explicacion() : J.tab === "indice" ? panelIndice(f, foco, rerender) : J.tab === "tiro" ? panelTabla("tiro", COLS_TIRO, "ordenTiro", "Tiro y eficiencia", "puntos por tiro y porcentajes", f, foco, rerender, norm)
      : J.tab === "uso" ? panelTabla("uso", COLS_USO, "ordenUso", "Posesión y reparto de tiros", "uso de posesión, eficiencia y peso en los tiros del equipo", f, foco, rerender, norm)
      : J.tab === "dispersion" ? panelDispersion(f, foco) : J.tab === "radar" ? panelRadar(f, foco, rerender) : panelStats(f, foco, rerender, norm)));
}

function buscador(rerender, norm) {
  return h("div", { class: "buscar" }, icono("buscar"), h("input", { type: "search", placeholder: "Buscar jugador…", value: J.q, "aria-label": "Buscar jugador",
    oninput: (e) => { J.q = e.target.value; const pos = e.target.selectionStart; rerender(); const i = document.querySelector(".buscar input"); i.focus(); i.setSelectionRange(pos, pos); } }));
}
function pool(foco, norm) {
  let filas = S.data.jugadores.filter((j) => !foco || j.equipo === foco);
  const q = norm(J.q.trim());
  return q ? filas.filter((j) => norm(j.jugador).includes(q)) : filas;
}
const selClase = (f) => (r) => (jugadorKey(r.jugador, r.equipo) === f.ju ? "sel" : "");
const nota = (n) => (n ? h("p", { class: "nota-kpi", text: `${n} jugador(es) con menos de 30 tiros de campo en la temporada quedan fuera del ranking (muestra insuficiente): su índice se muestra como «—».` }) : null);

function panelIndice(f, foco, rerender) {
  const filas = pool(foco, (t) => t.normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase());
  const cols = foco ? COLS_IDX.filter((c) => c.key !== "equipo") : COLS_IDX;
  return h("div", null, h("h2", { text: "Índice de Versatilidad" }, h("span", { class: "sub", text: "producción, eficiencia y versatilidad espacial" }),
    h("div", { class: "acciones" }, botonCSV({ cols, filas, orden: J.ordenIdx, nombre: nombreArchivo("indice_versatilidad", foco, S.data.temporada) }))),
    tabla({ cols: foco ? COLS_IDX.filter((c) => c.key !== "equipo") : COLS_IDX, filas, orden: J.ordenIdx, onOrden: (o) => { J.ordenIdx = o; rerender(); }, onFila: (r) => ir({ f: { ju: jugadorKey(r.jugador, r.equipo) } }), claseFila: selClase(f) }),
    nota(filas.filter((x) => x.muestra_insuficiente).length));
}

function panelTabla(id, colsTodas, claveOrden, titulo, sub, f, foco, rerender, norm) {
  const filas = pool(foco, norm), cols = foco ? colsTodas.filter((c) => c.key !== "equipo") : colsTodas;
  return h("div", null, h("h2", null, titulo, h("span", { class: "sub", text: sub }), h("span", { style: { flex: 1 } }), buscador(rerender, norm),
    botonCSV({ cols, filas, orden: J[claveOrden], nombre: nombreArchivo(id + "_jugadores", foco, S.data.temporada) })),
    tabla({ cols, filas, orden: J[claveOrden], onOrden: (o) => { J[claveOrden] = o; rerender(); }, onFila: (r) => ir({ f: { ju: jugadorKey(r.jugador, r.equipo) } }), claseFila: selClase(f), vacioTxt: "Ningún jugador coincide" }),
    id === "uso" ? h("p", { class: "nota-kpi", text: "El rol (Referente / Punto débil / Infrautilizado) solo se asigna con 30 o más tiros de campo en la temporada." }) : null);
}

function panelDispersion(f, foco) {
  const D = S.data, MIN_TC = 30;
  const todos = D.jugadores.filter((j) => (!foco || j.equipo === foco) && j.uso_pct != null && j.pp_pos != null && (j.tc_intentos || 0) >= MIN_TC);
  if (!todos.length) return vacioMsg("Aún no hay jugadores con muestra suficiente", "Hacen falta al menos 30 tiros de campo por jugador.");
  const pos = D.jugadores.reduce((a, j) => a + (j.pos_usadas || 0), 0), pts = D.jugadores.reduce((a, j) => a + (j.puntos || 0), 0), liga = pos ? pts / pos : null;
  const mins = todos.map((j) => j.minutos_total || 0), minMin = Math.min(...mins), maxMin = Math.max(...mins);
  const radio = (m) => 3 + 11 * (maxMin === minMin ? 0.5 : (m - minMin) / (maxMin - minMin)); // del que menos al que más minutos juega: 3 a 14 px
  const puntos = todos.map((j) => {
    const key = jugadorKey(j.jugador, j.equipo), sel = key === f.ju;
    return {
      x: j.uso_pct, y: j.pp_pos, r: radio(j.minutos_total || 0), color: ROL_COLOR[j.rol] || "var(--suave)", sel,
      titulo: foco ? j.jugador : `${j.jugador} (${j.equipo})`, etiqueta: sel || (foco && todos.length <= 16) ? j.jugador : null,
      filas: [["Equipo", j.equipo], ["Uso", fpct(j.uso_pct)], ["Pts/posesión", f2(j.pp_pos)], ["Minutos", f0(j.minutos_total)], ["Rol", j.rol || "—"]],
      onclick: () => ir({ f: { ju: key } }),
    };
  });
  return h("div", null, h("h2", { text: "Uso vs eficiencia" }, h("span", { class: "sub", text: foco ? `${foco}; las líneas de referencia son las del grupo entero` : "todos los jugadores del grupo; clic en un punto para filtrarlo" })),
    scatter({ puntos, ejeX: "Uso de posesión (%)", ejeY: "Puntos por posesión usada", refX: USO_REF, refY: liga,
      cuadrantes: [{ x: "der", y: "arr", texto: "Referente" }, { x: "der", y: "aba", texto: "Punto débil" }, { x: "izq", y: "arr", texto: "Infrautilizado" }, { x: "izq", y: "aba", texto: "Secundario" }] }),
    h("div", { class: "leyenda-rol" }, ...Object.entries(ROL_COLOR).map(([k, c]) => h("span", null, h("i", { style: { background: c } }), k)), h("span", null, h("i", { style: { background: "var(--suave)" } }), "Secundario"),
      h("span", { text: `Tamaño del punto = minutos jugados (de ${f0(minMin)} a ${f0(maxMin)})` })),
    h("p", { class: "nota-kpi", text: `Línea vertical: 20 % de uso (lo normal con 5 jugadores en pista). Línea horizontal: ${f2(liga)} puntos por posesión, la media del grupo. Solo jugadores con 30 o más tiros de campo.` }));
}
const USO_REF = 20;

// Ejes del radar: [etiqueta, valor(j), formato, mayor_es_mejor]. Cada eje se normaliza entre el peor (0) y el mejor (1) jugador con muestra suficiente.
const p40 = (k) => (j) => (j.minutos_total > 0 ? (j[k] / j.minutos_total) * 40 : null);
const EJES_JUG = [["Puntos/40", p40("puntos"), f1], ["Rebotes/40", p40("reb_tot"), f1], ["Asist./40", p40("asistencias"), f1], ["Robos/40", p40("recuperaciones"), f1],
  ["TS%", (j) => (j.ts_pct == null ? null : j.ts_pct * 100), fpct], ["Uso", (j) => j.uso_pct, fpct], ["Pts/pos", (j) => j.pp_pos, f2]];
const AYUDA_EJE = {
  "Puntos/40": "Puntos anotados por cada 40 minutos jugados (un partido completo), para no penalizar a quien juega menos.",
  "Rebotes/40": "Rebotes totales (defensivos + ofensivos) por cada 40 minutos jugados.",
  "Asist./40": "Asistencias por cada 40 minutos jugados.",
  "Robos/40": "Recuperaciones (balones robados al rival) por cada 40 minutos jugados.",
  "TS%": AYUDA.ts_pct, "Uso": AYUDA.uso_pct, "Pts/pos": AYUDA.pp_pos,
};
const MIN_MIN_RADAR = 150, COLOR_A = "#d9480f", COLOR_B = "#2f6fed";

function panelRadar(f, foco, rerender) {
  const D = S.data, todos = D.jugadores.filter((j) => j.minutos_total > 0);
  // umbral de minutos: 150, o la mediana si aún se han jugado pocos partidos (así siempre se compara contra la mitad del grupo con más minutos)
  const mins = todos.map((j) => j.minutos_total).sort((a, b) => a - b), umbral = Math.min(MIN_MIN_RADAR, Math.round(mins[Math.floor(mins.length / 2)] || 0));
  const calif = todos.filter((j) => j.minutos_total >= umbral);
  if (calif.length < 2) return vacioMsg("Aún no hay datos suficientes", "El radar necesita al menos dos jugadores con minutos.");
  const key = (j) => jugadorKey(j.jugador, j.equipo), porKey = new Map(todos.map((j) => [key(j), j]));
  const lista = todos.filter((j) => !foco || j.equipo === foco).sort((a, b) => a.jugador.localeCompare(b.jugador, "es"));
  const etq = (j) => (foco ? j.jugador : `${j.jugador} (${j.equipo})`);
  const valido = (k) => k && porKey.has(k) && (!foco || porKey.get(k).equipo === foco);
  const ka = f.ju && porKey.has(f.ju) ? f.ju : valido(J.radarA) ? J.radarA : key(lista.slice().sort((a, b) => b.puntos - a.puntos)[0] || todos[0]);
  const kb = J.radarB && porKey.has(J.radarB) && J.radarB !== ka ? J.radarB : "";
  const A = porKey.get(ka), B = kb ? porKey.get(kb) : null;
  const rango = EJES_JUG.map(([, v]) => { const x = calif.map(v).filter((n) => n != null); return [Math.min(...x), Math.max(...x)]; });
  const media = EJES_JUG.map(([, v]) => { const x = calif.map(v).filter((n) => n != null); return x.reduce((a, n) => a + n, 0) / x.length; });
  const valores = (j) => EJES_JUG.map(([, v], i) => (j ? v(j) : media[i]));
  const va = valores(A), vb = valores(B);
  const norm = (v, i) => { const [lo, hi] = rango[i]; return v == null ? 0 : Math.max(0, Math.min(1, hi === lo ? 0.5 : (v - lo) / (hi - lo))); };
  const ejes = EJES_JUG.map(([l], i) => ({ label: l, a: norm(va[i], i), b: norm(vb[i], i)}));
  const nomA = etq(A), nomB = B ? `${B.jugador} (${B.equipo})` : "Media del grupo";
  const sel = (id, etiqueta, opciones, valor, onCambio) => h("div", { class: "campo" }, h("label", { for: id, text: etiqueta }),
    h("select", { id, onchange: (e) => onCambio(e.target.value) }, opciones.map(([v, t]) => h("option", { value: v, selected: v === valor || null }, t))));
  const filas = EJES_JUG.map(([l], i) => ({ eje: l, a: va[i], b: vb[i] }));
  // en la tabla, el valor más alto de cada fila va en verde (en todos los ejes de jugadores, más alto = más lejos del centro)
  const celda = (lado) => (r) => {
    const fm = EJES_JUG.find(([l]) => l === r.eje)[2], propio = r[lado], otro = r[lado === "a" ? "b" : "a"];
    return h("span", { class: propio != null && otro != null && propio > otro ? "mejor" : "" }, fm(propio));
  };
  return h("div", null,
    h("h2", { text: "Radar de jugadores" }, h("span", { class: "sub", text: `centro = peor, borde = mejor entre jugadores con ${umbral}+ minutos; valores reales en la tabla` })),
    h("div", { class: "radar-ctrl" },
      sel("rj-a", "Jugador", lista.map((j) => [key(j), etq(j)]), ka, (v) => { J.radarA = v; if (f.ju) ir({ f: { ju: v } }); else rerender(); }),
      sel("rj-b", "Comparar con", [["", "Media del grupo"], ...todos.filter((j) => key(j) !== ka).sort((a, b) => a.jugador.localeCompare(b.jugador, "es")).map((j) => [key(j), `${j.jugador} (${j.equipo})`])], kb, (v) => { J.radarB = v; rerender(); })),
    h("div", { class: "leyenda-radar" }, h("span", null, h("i", { style: { background: COLOR_A } }), nomA), h("span", null, h("i", { style: { background: COLOR_B } }), nomB)),
    radar({ ejes, colores: [COLOR_A, COLOR_B] }),
    h("p", { class: "nota-kpi", style: { textAlign: "center" }, text: "En todos los ejes, más lejos del centro = valor más alto dentro del grupo. El centro es el jugador que menos tiene, y el borde el que más." }),
    tabla({ cols: [{ key: "eje", label: "Métrica", render: (r) => conAyuda(r.eje, AYUDA_EJE[r.eje], r.eje) }, { key: "a", label: nomA, num: true, fmt: null, render: celda("a") }, { key: "b", label: nomB, num: true, fmt: null, render: celda("b") }], filas, orden: { col: "eje", dir: 0 }, onOrden: () => {} }),
    h("p", { class: "nota-kpi", text: "En verde, el valor más alto de cada métrica. El uso no es 'mejor' por ser alto: hay que leerlo junto a los puntos por posesión (ver la pestaña Uso vs eficiencia)." }),
    A.minutos_total < umbral ? h("p", { class: "nota-kpi", text: `${A.jugador} tiene menos de ${umbral} minutos: sus ratios por 40 minutos son poco fiables.` }) : null);
}

function panelStats(f, foco, rerender, norm) {
  const D = S.data;
  if (f.ju && f.pa) { // un jugador en un partido concreto
    const nom = nombreDeKey(f.ju), eq = equipoDeKey(f.ju), p = S.idx.partidos.get(f.pa);
    const l = D.partidosJugador.find((r) => r.jugador === nom && r.equipo === eq && r.partido_id === f.pa);
    const riv = p ? (p.equipo_local === eq ? p.equipo_visitante : p.equipo_local) : "";
    if (!l) return vacioMsg("Este jugador no disputó este partido.");
    const c = [["Minutos", l.minutos], ["Puntos", l.puntos], ["Rebotes", l.reb_tot], ["Asistencias", l.asistencias], ["Recuperaciones", l.recuperaciones], ["Pérdidas", l.perdidas],
      ["T2", fr(l.t2_aciertos, l.t2_intentos)], ["T3", fr(l.t3_aciertos, l.t3_intentos)], ["TL", fr(l.tl_aciertos, l.tl_intentos)], ["Valoración", l.valoracion], ["+/-", l.mas_menos]];
    return h("div", null, h("h2", { text: `${nom} (${eq}) — vs ${riv}` }), h("div", { class: "kpis" }, c.map(([a, b]) => kpi(a, b))));
  }
  if (f.ju) { // un jugador: partido a partido
    const nom = nombreDeKey(f.ju), eq = equipoDeKey(f.ju), pe = partidosDeEquipo(eq);
    const filas = D.partidosJugador.filter((r) => r.jugador === nom && r.equipo === eq).map((r) => { const p = pe.find((x) => x.partido_id === r.partido_id); return { ...r, rival: p?.rival || r.partido_id, fecha: p?.fecha || "", resultado: p?.resultado || "" }; });
    const cols = [T("fecha", "Fecha", { val: (r) => r.fecha, render: (r) => fechaCorta(r.fecha) }), T("rival", "Rival"), T("resultado", "Res."), ...COLS_BOX.slice(2)];
    return h("div", null, h("h2", { text: `${nom} (${eq}) — partido a partido` }, h("div", { class: "acciones" }, h("button", { type: "button", class: "btn", onclick: () => fichaJugador(D.jugadores.find((j) => jugadorKey(j.jugador, j.equipo) === f.ju)) }, "Ver ficha"),
      botonCSV({ cols, filas, orden: J.ordenPJ, nombre: nombreArchivo("partidos", nom, S.data.temporada) }))),
      tabla({ cols, filas, orden: J.ordenPJ, onOrden: (o) => { J.ordenPJ = o; rerender(); }, onFila: (r) => ir({ f: { pa: r.partido_id } }) }));
  }
  if (f.pa) { // box score de un partido
    const p = S.idx.partidos.get(f.pa);
    const filas = D.partidosJugador.filter((r) => r.partido_id === f.pa);
    return h("div", null, h("h2", { text: `Box score — ${p ? p.equipo_local + " vs " + p.equipo_visitante : ""}` }, h("div", { class: "acciones" }, botonCSV({ cols: COLS_BOX, filas, orden: J.ordenBox, nombre: nombreArchivo("boxscore", p?.equipo_local, p?.equipo_visitante, p?.fecha?.slice(0, 10)) }))),
      tabla({ cols: COLS_BOX, filas, orden: J.ordenBox, onOrden: (o) => { J.ordenBox = o; rerender(); }, onFila: (r) => ir({ f: { ju: jugadorKey(r.jugador, r.equipo) } }) }));
  }
  const filas = pool(foco, norm);
  const colsE = foco ? COLS_TEMP.filter((c) => c.key !== "equipo") : COLS_TEMP;
  return h("div", null, h("h2", null, `${foco ? foco + " — jugadores" : "Jugadores — todo el grupo"} (${filas.length})`, h("span", { style: { flex: 1 } }), buscador(rerender, norm),
    botonCSV({ cols: colsE, filas, orden: J.orden, nombre: nombreArchivo("estadisticas_jugadores", foco, S.data.temporada) })),
    tabla({ cols: foco ? COLS_TEMP.filter((c) => c.key !== "equipo") : COLS_TEMP, filas, orden: J.orden, onOrden: (o) => { J.orden = o; rerender(); }, onFila: (r) => ir({ f: { ju: jugadorKey(r.jugador, r.equipo) } }), claseFila: selClase(f), vacioTxt: "Ningún jugador coincide" }),
    nota(filas.filter((x) => x.muestra_insuficiente).length));
}

function explicacion() {
  return h("div", { class: "explica" },
    h("h2", { text: "Qué significan el Índice de Versatilidad y el Perfil" }),
    h("p", null, h("strong", { text: "Índice de Versatilidad" }), " (0-100) combina tres bloques, cada uno comparado contra el resto de jugadores del grupo (percentil: 100 = el mejor del grupo en ese aspecto, 50 = justo en la media):"),
    h("ul", null,
      h("li", null, h("strong", { text: "Producción (40 %)" }), " — la valoración de la FEB (rebotes, asistencias, robos, tapones… resumidos en un número) ajustada «por 40 minutos jugados», para no penalizar a quien juega menos."),
      h("li", null, h("strong", { text: "Eficiencia (30 %)" }), " — el TS% (puntos entre intentos, contando el tiro libre con menos peso que uno de campo, porque se tira sin oposición). Es más justo que el simple % de acierto."),
      h("li", null, h("strong", { text: "Versatilidad espacial (30 %)" }), " — se calcula con los tiros de campo acertados de la temporada. La media cancha se divide en 9 zonas y combina cuántas zonas distintas toca el jugador (", h("code", { text: "entropía zonal" }), ": 0 si todo viene de una zona, 1 si se reparte por igual entre las 9) y cuánto se extienden esos aciertos alrededor de su punto medio de anotación.")),
    h("p", null, "Jugadores con menos de 30 tiros de campo en la temporada se marcan como ", h("strong", { text: "muestra insuficiente" }), " y quedan fuera del ranking: con tan pocos intentos, en qué zonas cayeron es casi aleatorio."),
    h("p", null, h("strong", { text: "Perfil de juego" }), " agrupa a los jugadores del grupo en 4 perfiles automáticos según sus estadísticas por 40 minutos, comparadas contra el resto del grupo. La etiqueta de cada grupo es la estadística en la que más se distancia de la media, no una descripción hecha a mano: dos jugadores distintos pueden caer en el mismo perfil si comparten ese rasgo dominante:"),
    h("ul", null, ...[["Anotador", "puntos"], ["Reboteador", "rebotes totales"], ["Organizador", "asistencias"], ["Recuperador", "robos (recuperaciones)"], ["Taponador", "tapones a favor"]].map(([a, b]) => h("li", null, h("strong", { text: a }), ` — destaca en ${b} por 40 minutos.`))),
    h("p", null, h("strong", { text: "Posesión y reparto" }), ": ", h("strong", { text: "Uso" }), " es el % de las posesiones del equipo que acaba el jugador mientras está en pista (20 % = lo normal con 5 en pista); ", h("strong", { text: "Pts/pos" }), " son los puntos que saca de cada posesión que usa; ", h("strong", { text: "% T2/T3/TC eq." }), " es la parte de los tiros del equipo que lanza él; ", h("strong", { text: "PPT" }), " son los puntos por tiro (2 × %T2, 3 × %T3), comparables entre T2 y T3."),
    h("ul", null, h("li", null, h("strong", { text: "Referente" }), " — mucho uso (≥ 20 %) y más puntos por posesión que la media del grupo."), h("li", null, h("strong", { text: "Punto débil" }), " — mucho uso pero por debajo de la media: gasta posesiones sin sacarles rendimiento."), h("li", null, h("strong", { text: "Infrautilizado" }), " — poco uso pero eficiente: candidato a tener más balón.")),
    h("p", null, h("strong", { text: "Radar" }), ": compara a un jugador con la media del grupo o con otro jugador en puntos, rebotes, asistencias y robos por 40 minutos, TS%, uso y puntos por posesión. Cada eje va del peor (0) al mejor (1) entre los jugadores con más minutos."),
    h("p", { class: "claro", text: "Jugadores con menos de 150 minutos en la temporada no se agrupan (columna vacía): con tan poco tiempo jugado, sus ratios por 40 minutos son poco fiables." }));
}

export function fichaJugador(j) {
  const tiros = S.data.tiros.filter((t) => t.equipo === j.equipo && t.jugador === j.jugador), key = jugadorKey(j.jugador, j.equipo);
  const log = S.data.partidosJugador.filter((r) => r.equipo === j.equipo && r.jugador === j.jugador).map((r) => ({ ...r, p: S.idx.partidos.get(r.partido_id) })).sort((a, b) => (a.p?.fecha || "").localeCompare(b.p?.fecha || ""));
  const cuerpo = h("div", { style: { display: "grid", gap: "16px" } },
    h("div", { class: "kpis" }, kpi("Partidos", j.partidos), kpi("Puntos/PJ", f1(j.puntos_prom)), kpi("Rebotes/PJ", f1(j.reb_tot_prom)), kpi("Asistencias/PJ", f1(j.asistencias_prom)), kpi("TC%", fpct(j.tc_pct)),
      kpi("Valoración/PJ", f1(j.valoracion_prom)), kpi("Índice de Versatilidad", idx100(j) == null ? "—" : f1(idx100(j)), { nota: AYUDA.indice_final }), kpi("Perfil", j.perfil || "—")),
    h("div", { class: "grid dos" },
      h("div", null, h("h2", { text: "Zonas de tiro", style: { fontSize: "15px", marginBottom: "10px" } }), tiros.length ? mapaCancha({ tiros, modo: "zonas", tamano: "mini" }).el : vacioMsg("Sin tiros registrados")),
      h("div", null, h("h2", { text: "Partido a partido", style: { fontSize: "15px", marginBottom: "10px" } }),
        tabla({ cols: [T("f", "Fecha", { val: (r) => r.p?.fecha || "", render: (r) => fechaCorta(r.p?.fecha) }), T("rival", "Rival", { val: (r) => (r.p ? (r.p.equipo_local === j.equipo ? r.p.equipo_visitante : r.p.equipo_local) : "") }),
          T("minutos", "Min", { num: true }), T("puntos", "Pts", { num: true }), T("reb_tot", "Reb", { num: true }), T("asistencias", "Ast", { num: true }), T("valoracion", "Val", { num: true })],
          filas: log, orden: { col: "f", dir: 1 }, onOrden: () => {} }))),
    h("div", null, h("button", { type: "button", class: "btn primario", onclick: () => { document.getElementById("dlg").close(); ir({ view: "tiros", f: { ju: key } }); } }, "Ver su mapa de tiros completo")));
  dialogo(j.jugador, cuerpo, `${j.equipo} · #${j.dorsal ?? "?"}${j.perfil ? " · " + j.perfil : ""}`);
}
