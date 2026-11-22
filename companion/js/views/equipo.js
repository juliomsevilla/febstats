// Vista "Equipo": KPIs, racha, resultados, progresión y clasificación.
import { h, f0, f1, f2, fsigno, fpct, kpi, tabla, vacioMsg, minutos, fechaCorta, tabsBar, conAyuda } from "../util.js";
import { S, ir, equipoEnFoco, partidosDeEquipo, nombreDeKey, equipoDeKey } from "../state.js";
import { AYUDA } from "../ayuda.js";
import { REGLAS } from "../reglas.js";
import { lineChart } from "../charts/line.js";
import { radar } from "../charts/radar.js";
import { botonCSV, csvDatos, pngSvg, nombreArchivo } from "../export.js";
import { icono } from "../util.js";

const V = { orden: { col: "posicion", dir: 1 }, ordenAD: { col: "neto", dir: -1 }, ordenTiro: { col: "ppt", dir: -1 }, tabCl: "general", radarA: "", radarB: "", ordenRes: { col: "fecha", dir: 1 }, vars: ["valoracion"] };
const VARS = [
  ["valoracion", "Valoración", "#1b8a5a"], ["puntos", "Puntos", "#d9480f"], ["reb_tot", "Rebotes", "#2f6fed"],
  ["asistencias", "Asistencias", "#8a4fd9"], ["recuperaciones", "Recuperaciones", "#0aa5a0"], ["perdidas", "Pérdidas", "#c23616"],
  ["mas_menos", "+/-", "#6b7280"], ["minutos", "Minutos", "#e0a100"],
];

function kpisPartido(f, foco) {
  const p = S.idx.partidos.get(f.pa);
  if (!p) return null;
  const parc = (a) => (a || []).join(" / ");
  if (foco && (p.equipo_local === foco || p.equipo_visitante === foco)) {
    const loc = p.equipo_local === foco, a = loc ? p.pts_local : p.pts_visitante, b = loc ? p.pts_visitante : p.pts_local;
    const rival = loc ? p.equipo_visitante : p.equipo_local, gana = a > b;
    return [kpi("Resultado", gana ? "V" : "D", { tono: gana ? "win" : "loss" }), kpi("Marcador", `${a} - ${b}`), kpi("Rival", rival),
      kpi("Fecha", fechaCorta(p.fecha)), kpi(`Parciales ${foco}`, parc(loc ? p.parciales_local : p.parciales_visitante)), kpi(`Parciales ${rival}`, parc(loc ? p.parciales_visitante : p.parciales_local))];
  }
  return [kpi("Local", p.equipo_local), kpi("Visitante", p.equipo_visitante), kpi("Marcador", `${p.pts_local} - ${p.pts_visitante}`),
    kpi("Fecha", fechaCorta(p.fecha)), kpi("Parciales local", parc(p.parciales_local)), kpi("Parciales visitante", parc(p.parciales_visitante))];
}

export function vistaEquipo(root, f) {
  const foco = equipoEnFoco(f), D = S.data;
  const rerender = () => vistaEquipo(root, f);
  root.replaceChildren(h("div", { class: "titulo" }, h("h1", { text: foco || "Visión general del grupo" }),
    h("p", { text: foco ? "Resultados, progresión y rendimiento de la temporada" : "Clasificación y datos globales. Selecciona un equipo para ver su detalle." })));
  if (!D.partidos.length) { root.append(vacioMsg("Aún no hay partidos", "Extrae la temporada para ver datos aquí.")); return; }

  let kpis;
  if (f.pa) kpis = kpisPartido(f, foco);
  else if (foco) {
    const c = D.clasificacion.find((x) => x.equipo === foco), dif = c.pf_prom - c.pc_prom;
    kpis = [kpi("Partidos jugados", c.pj), kpi("Victorias – derrotas", `${c.pg} – ${c.pp}`), kpi("Puntos a favor (prom.)", f1(c.pf_prom)),
      kpi("Puntos en contra (prom.)", f1(c.pc_prom)), kpi("Diferencial (prom.)", fsigno(dif), { tono: dif >= 0 ? "win" : "loss" }),
      kpi("Ritmo (pos/PJ)", f1(c.ritmo)), kpi("Ataque (pts/100 pos)", f1(c.ortg)), kpi("Defensa (pts/100 pos)", f1(c.drtg)),
      kpi("Concentración de anotación (Gini)", c.gini_puntos != null ? fpct(c.gini_puntos) : "—")];
  } else {
    const tot = D.partidos.reduce((a, p) => a + p.pts_local + p.pts_visitante, 0);
    const lider = D.jugadores.slice().sort((a, b) => (b.puntos || 0) - (a.puntos || 0))[0];
    kpis = [kpi("Equipos", D.equipos.length), kpi("Partidos jugados", D.partidos.length), kpi("Puntos por partido (ambos equipos)", f1(tot / D.partidos.length)),
      kpi("Máximo anotador", lider ? `${lider.jugador} (${lider.equipo})` : "—"), kpi("Puntos del máximo anotador", lider ? f0(lider.puntos) : "—")];
  }
  if (kpis) root.append(h("div", { class: "kpis" }, kpis));
  if (foco) {
    const lista = partidosDeEquipo(foco);
    root.append(h("div", { class: "card" }, h("h2", { text: "Racha" }, h("span", { class: "sub", text: "pulsa un partido para filtrar" })),
      h("div", { class: "racha" }, lista.map((p) => h("button", { type: "button", class: p.resultado + (p.partido_id === f.pa ? " act" : ""),
        title: `${fechaCorta(p.fecha)} · ${p.local ? "vs" : "@"} ${p.rival} (${p.pts_propios}-${p.pts_rival})`,
        onclick: () => ir({ f: { pa: p.partido_id === f.pa ? "" : p.partido_id } }) }, p.resultado)))));
    const colsRes = [
          { key: "fecha", label: "Fecha", render: (r) => fechaCorta(r.fecha), csv: (r) => (r.fecha || "").slice(0, 10) },
          { key: "cond", label: "", csvLabel: "Condición", val: (r) => (r.local ? "Local" : "Visitante"), render: (r) => h("span", { class: "pill", text: r.local ? "Local" : "Visit." }) },
          { key: "rival", label: "Rival", title: AYUDA.rival },
          { key: "resultado", label: "Res.", render: (r) => h("strong", { class: r.resultado === "V" ? "ok" : "mal", text: r.resultado }) },
          { key: "pts_propios", label: "PF", num: true, title: AYUDA.pf }, { key: "pts_rival", label: "PC", num: true, title: AYUDA.pc },
          { key: "dif", label: "Dif", num: true, val: (r) => r.pts_propios - r.pts_rival, fmt: fsigno },
          { key: "parc", label: "Parciales", val: (r) => 0, render: (r) => (r.parciales_local || []).join(" · "), csv: (r) => (r.parciales_local || []).join(" ") },
          { key: "parc_r", label: "Parc. rival", val: (r) => 0, render: (r) => (r.parciales_visitante || []).join(" · "), csv: (r) => (r.parciales_visitante || []).join(" ") },
    ];
    const filasRes = lista.map((r) => ({ ...r, parciales_local: r.local ? r.parciales_local : r.parciales_visitante, parciales_visitante: r.local ? r.parciales_visitante : r.parciales_local }));
    root.append(h("div", { class: "card" }, h("h2", { text: "Resultados" }, h("span", { class: "sub", text: `${lista.length} partidos` }),
      h("div", { class: "acciones" }, botonCSV({ cols: colsRes, filas: filasRes, orden: V.ordenRes, nombre: nombreArchivo("resultados", foco, S.data.temporada) }))),
      tabla({
        cols: colsRes, filas: filasRes,
        orden: V.ordenRes, onOrden: (o) => { V.ordenRes = o; rerender(); },
        onFila: (r) => ir({ f: { pa: r.partido_id === f.pa ? "" : r.partido_id } }), claseFila: (r) => (r.partido_id === f.pa ? "sel" : ""),
      })));
  }
  root.append(progresion(f, foco));

  root.append(panelClasificacion(f, foco, rerender));
}

// Clasificación en pestañas: las columnas se reparten por temas para que ninguna tabla sea enorme.
const LEAD = [
  { key: "posicion", label: "#", num: true, title: AYUDA.posicion }, { key: "equipo", label: "Equipo", title: AYUDA.equipo },
  { key: "pj", label: "PJ", num: true, title: AYUDA.pj },
];
const colNum = (key, label, fmt = f1) => ({ key, label, num: true, fmt, title: AYUDA[key] });
const COLS_CL = {
  general: [...LEAD, { key: "ptos", label: "Pts", num: true, title: AYUDA.ptos }, { key: "pg", label: "PG", num: true, title: AYUDA.pg }, { key: "pp", label: "PP", num: true, title: AYUDA.pp },
    { key: "pf", label: "PF", num: true, title: AYUDA.pf }, { key: "pc", label: "PC", num: true, title: AYUDA.pc },
    { key: "dif", label: "+/-", num: true, title: AYUDA.dif, fmt: (v) => (v > 0 ? "+" : "") + v },
    colNum("pf_prom", "PF/PJ"), colNum("pc_prom", "PC/PJ"), colNum("gini_puntos", "Gini", fpct)],
  ataque: [...LEAD, colNum("pos", "Pos", f0), colNum("ritmo", "Ritmo"), colNum("ortg", "Ataque"), colNum("drtg", "Defensa"), colNum("neto", "Neto", fsigno)],
  tiro: [...LEAD, colNum("ppt2", "PPT2", f2), colNum("ppt3", "PPT3", f2), colNum("ppt", "PPT", f2), colNum("pct_t3", "% T3", fpct), colNum("ts_pct", "TS%", fpct)],
};
const TABS_CL = [["general", "General"], ["ataque", "Ataque y defensa"], ["tiro", "Tiro"], ["radar", "Radar"], ["info", "Qué significa"], ["reglas", "Reglas FIBA"]];

function panelClasificacion(f, foco, rerender) {
  const D = S.data, card = h("div", { class: "card" });
  card.append(tabsBar(TABS_CL, V.tabCl, (v) => { V.tabCl = v; rerender(); }));
  if (V.tabCl === "radar") return card.append(panelRadar(foco, rerender)), card;
  if (V.tabCl === "info") return card.append(explicacionEquipo()), card;
  if (V.tabCl === "reglas") return card.append(panelReglas()), card;
  const [clave, orden, nombre] = V.tabCl === "ataque" ? ["ordenAD", V.ordenAD, "ataque_defensa"] : V.tabCl === "tiro" ? ["ordenTiro", V.ordenTiro, "tiro"] : ["orden", V.orden, "clasificacion"];
  const cols = COLS_CL[V.tabCl];
  card.append(h("h2", { text: V.tabCl === "general" ? "Clasificación" : TABS_CL.find(([k]) => k === V.tabCl)[1] }, h("span", { class: "sub", text: "clic en un equipo para ver su detalle" }),
    h("div", { class: "acciones" }, botonCSV({ cols, filas: D.clasificacion, orden, nombre: nombreArchivo(nombre, D.grupo, D.temporada) }))),
    tabla({
      cols, filas: D.clasificacion, orden, onOrden: (o) => { V[clave] = o; rerender(); },
      claseFila: (r) => (r.equipo === foco ? "sel" : ""),
      onFila: (r) => ir({ f: { eq: r.equipo === foco ? "" : r.equipo, ju: "", pa: "" } }),
    }));
  if (D.clasificacion.some((c) => c.ortg == null) && V.tabCl !== "general") card.append(h("p", { class: "nota-kpi", text: "Los equipos sin box score del rival en algún partido no tienen ataque/defensa calculados." }));
  return card;
}

// Ejes del radar: [clave, etiqueta, mayor_es_mejor]. Cada eje se normaliza entre el peor (0) y el mejor (1) equipo del grupo.
const EJES_RADAR = [["ritmo", "Ritmo", true], ["ortg", "Ataque", true], ["drtg", "Defensa", false], ["ppt2", "PPT2", true], ["ppt3", "PPT3", true], ["ts_pct", "TS%", true]];
const FMT_RADAR = { ritmo: f1, ortg: f1, drtg: f1, ppt2: f2, ppt3: f2, ts_pct: fpct };
const COLOR_A = "#d9480f", COLOR_B = "#2f6fed";

function panelRadar(foco, rerender) {
  const D = S.data, equipos = D.clasificacion.filter((c) => c.ortg != null);
  const cont = h("div", null);
  if (equipos.length < 2) return vacioMsg("Aún no hay datos suficientes", "El radar necesita el box score de al menos dos equipos.");
  const nombres = equipos.map((c) => c.equipo);
  const A = foco && nombres.includes(foco) ? foco : (nombres.includes(V.radarA) ? V.radarA : nombres[0]);
  const B = nombres.includes(V.radarB) && V.radarB !== A ? V.radarB : "";
  const rango = Object.fromEntries(EJES_RADAR.map(([k]) => { const v = equipos.map((c) => c[k]); return [k, [Math.min(...v), Math.max(...v)]]; }));
  const norm = (k, v, mejor) => { const [lo, hi] = rango[k], t = hi === lo ? 0.5 : (v - lo) / (hi - lo); return mejor ? t : 1 - t; };
  const media = (k) => equipos.reduce((a, c) => a + c[k], 0) / equipos.length;
  const valores = (nom) => EJES_RADAR.map(([k]) => (nom === "" ? media(k) : equipos.find((c) => c.equipo === nom)[k]));
  const va = valores(A), vb = valores(B);
  const ejes = EJES_RADAR.map(([k, l, mejor], i) => ({ label: l, a: norm(k, va[i], mejor), b: norm(k, vb[i], mejor) }));
  const nomB = B || "Media del grupo";
  const sel = (id, etiqueta, opciones, valor, onCambio) => h("div", { class: "campo" }, h("label", { for: id, text: etiqueta }),
    h("select", { id, onchange: (e) => onCambio(e.target.value) }, opciones.map(([v, t]) => h("option", { value: v, selected: v === valor || null }, t))));
  cont.append(h("h2", { text: "Radar de equipos" }, h("span", { class: "sub", text: "centro = peor equipo del grupo, borde = mejor. Valores reales en la tabla" })),
    h("div", { class: "radar-ctrl" },
      foco ? h("div", { class: "campo" }, h("label", { text: "Equipo" }), h("b", { text: foco })) : sel("rd-a", "Equipo", nombres.map((n) => [n, n]), A, (v) => { V.radarA = v; rerender(); }),
      sel("rd-b", "Comparar con", [["", "Media del grupo"], ...nombres.filter((n) => n !== A).map((n) => [n, n])], B, (v) => { V.radarB = v; rerender(); })),
    h("div", { class: "leyenda-radar" }, h("span", null, h("i", { style: { background: COLOR_A } }), A), h("span", null, h("i", { style: { background: COLOR_B } }), nomB)),
    radar({ ejes, colores: [COLOR_A, COLOR_B] }),
    h("p", { class: "nota-kpi", style: { textAlign: "center" }, text: "En todos los ejes, más lejos del centro = mejor. En Defensa, mejor es encajar menos puntos: por eso un valor más bajo queda más lejos del centro." }));
  // en la tabla, el mejor valor de cada fila va en verde (en Defensa, el más bajo)
  const info = (r) => EJES_RADAR.find(([, l]) => l === r.eje);
  const celda = (lado) => (r) => {
    const [k, , mejor] = info(r), propio = r[lado], otro = r[lado === "a" ? "b" : "a"];
    const gana = propio !== otro && (mejor ? propio > otro : propio < otro);
    return h("span", { class: gana ? "mejor" : "" }, FMT_RADAR[k](propio));
  };
  const filas = EJES_RADAR.map(([k, l], i) => ({ eje: l, a: va[i], b: vb[i] }));
  cont.append(tabla({ cols: [{ key: "eje", label: "Métrica", render: (r) => conAyuda(r.eje, AYUDA[info(r)[0]], r.eje) },
    { key: "a", label: A, num: true, fmt: null, render: celda("a") }, { key: "b", label: nomB, num: true, fmt: null, render: celda("b") }], filas, orden: { col: "eje", dir: 0 }, onOrden: () => {} }),
    h("p", { class: "nota-kpi", text: "En verde, el mejor valor de cada métrica." }));
  return cont;
}

function panelReglas() {
  return h("div", { class: "explica" }, h("h2", { text: "Reglas FIBA 2026 que afectan a los datos" }),
    ...REGLAS.flatMap((g) => [h("h3", { text: g.titulo }), h("ul", null, ...g.items.map((x) => h("li", { text: x })))]),
    h("p", { class: "claro", text: "Resumen de las Reglas Oficiales de Baloncesto FIBA 2026 (vigentes desde el 1-10-2026). La competición puede aplicar su propio reglamento." }));
}

function explicacionEquipo() {
  const li = (a, b) => h("li", null, h("strong", { text: a }), " — " + b);
  return h("div", { class: "explica" }, h("h2", { text: "Qué significan estas métricas" }),
    h("p", null, "Contar solo puntos engaña: un equipo que juega rápido anota más sin ser mejor. Por eso se normaliza por ", h("strong", { text: "posesiones" }), " (cada vez que un equipo tiene el balón hasta que lo pierde o tira)."),
    h("ul", null,
      li("Posesiones", AYUDA.pos.replace(/^Posesiones: /, "tiros de campo + 0,44 × tiros libres + pérdidas − rebotes ofensivos (el rebote ofensivo no cuenta: la posesión continúa).")),
      li("Ritmo", "posesiones por partido. Alto = partidos rápidos."),
      li("Ataque / Defensa", "puntos anotados / recibidos por cada 100 posesiones. Mejor ataque = más alto; mejor defensa = más bajo. Neto = ataque − defensa."),
      li("PPT2 / PPT3 / PPT", "puntos por tiro de 2, por triple y por tiro de campo. Un 40 % en triples (1,20) rinde más que un 55 % en T2 (1,10): con porcentajes no se pueden comparar, con puntos por tiro sí."),
      li("% T3", "peso del triple en el ataque del equipo."),
      li("TS%", "eficiencia total contando tiros libres.")),
    h("p", { class: "claro", text: "Radar: cada eje se coloca entre el peor (centro) y el mejor (borde) equipo del grupo, así ejes con unidades distintas son comparables. La defensa se invierte: borde = pocos puntos encajados." }));
}

function progresion(f, foco) {
  const D = S.data, card = h("div", { class: "card" });
  // Gráfico + botones de exportación (PNG del gráfico y CSV con sus datos)
  const grafico = (titulo, series, etiquetas, archivo) => {
    const ch = lineChart({ series, etiquetas });
    card.append(ch); // los botones de exportar (PNG/CSV) los añade exportar-auto.js, solo en la app del Mac
  };
  const vacio = (t) => card.append(vacioMsg(t));
  if (f.ju) {
    const nom = nombreDeKey(f.ju), eq = equipoDeKey(f.ju);
    card.append(h("h2", { text: `Progresión de la temporada — ${nom}` }));
    const por = new Map(D.partidosJugador.filter((r) => r.jugador === nom && r.equipo === eq).map((r) => [r.partido_id, { ...r, minutos: minutos(r.minutos) }]));
    const jugados = partidosDeEquipo(eq).filter((p) => por.has(p.partido_id));
    card.append(h("div", { class: "chips", style: { marginBottom: "10px" } }, VARS.map(([k, l, c]) =>
      h("button", { type: "button", class: "chip", "aria-pressed": String(V.vars.includes(k)), style: { "--c": c },
        onclick: () => { V.vars = V.vars.includes(k) ? V.vars.filter((x) => x !== k) : [...V.vars, k]; ir({}); } }, l))));
    const sel = VARS.filter(([k]) => V.vars.includes(k));
    if (!jugados.length) vacio("Sin partidos para mostrar.");
    else if (!sel.length) vacio("Elige al menos una variable.");
    else grafico(`Progresión — ${nom}`, sel.map(([k, l, c]) => ({ label: l, color: c, valores: jugados.map((p) => por.get(p.partido_id)[k] ?? 0) })), jugados.map((p) => `${p.local ? "vs" : "@"} ${p.rival}`), nombreArchivo("progresion", nom, D.temporada));
  } else if (foco) {
    card.append(h("h2", { text: `Progresión de la temporada — ${foco}` }));
    const l = partidosDeEquipo(foco);
    if (!l.length) vacio("Sin partidos para mostrar.");
    else grafico(`Progresión — ${foco}`, [{ label: "Puntos a favor", color: "#d9480f", valores: l.map((p) => p.pts_propios) }, { label: "Puntos en contra", color: "#6b7280", valores: l.map((p) => p.pts_rival) }], l.map((p) => `${p.local ? "vs" : "@"} ${p.rival}`), nombreArchivo("progresion", foco, D.temporada));
  } else {
    card.append(h("h2", { text: "Progresión de la temporada — puntos totales por día de partido (todo el grupo)" }));
    const por = new Map();
    for (const p of D.partidos) { const d = (p.fecha || "?").slice(0, 10); por.set(d, (por.get(d) || 0) + p.pts_local + p.pts_visitante); }
    const dias = [...por.keys()].sort();
    grafico("Puntos totales por día de partido", [{ label: "Puntos totales", color: "#d9480f", valores: dias.map((d) => por.get(d)) }], dias.map(fechaCorta), nombreArchivo("progresion_grupo", D.temporada));
  }
  return card;
}
