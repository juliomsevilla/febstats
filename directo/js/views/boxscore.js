// Boxscore en directo de los dos equipos, con totales y mapa de tiros.
import { h, limpiar, btn, mmss, jornadaTexto, nombreJugador } from "../util.js";
import { app, etiquetaPeriodo, relojAhora } from "../estado.js";
import { statsVacias, valoracion } from "../grupo.js";
import { crearCancha } from "../court.js";
import { navegar } from "../app.js";

export function vistaBoxscore(cont) {
  if (!app.sesion || !app.proy) {
    cont.append(h("div", { class: "vacio" }, h("strong", { text: "Sin partido" }), h("p", { text: "Abre o crea un partido para ver el boxscore." }),
      btn("Ir al inicio", () => navegar("inicio"), { clase: "btn primario" })));
    return null;
  }
  const orden = { col: "segundos", dir: -1 };
  const pintar = () => { limpiar(cont); construir(); };
  construir();

  function construir() {
    const s = app.sesion, p = app.proy;
    cont.append(h("section", { class: "box" },
      h("div", { class: "box-cab" },
        h("div", null, h("h1", { text: "Boxscore" }), h("p", { class: "sub", text: [s.competicion, jornadaTexto(s.jornada), s.fecha ? s.fecha.slice(0, 16) : ""].filter(Boolean).join(" · ") })),
        h("div", { class: "marcador-mini" },
          h("span", { text: s.local.nombre }), h("b", { text: `${p.pts.local}` }), h("i", { text: "–" }), h("b", { text: `${p.pts.visitante}` }), h("span", { class: "der", text: s.visitante.nombre }),
          h("span", { class: "pill", text: `${etiquetaPeriodo(s.reloj)} · ${mmss(relojAhora(s.reloj))}` })) , 
        h("div", { class: "acciones" },
          btn("Volver al partido", () => navegar("partido"), { clase: "btn pequeno", icon: "play" }))),
      h("div", { class: "rejilla dos box-tablas" }, tablaEquipo("local"), tablaEquipo("visitante")),
      h("div", { class: "rejilla dos box-mapas" }, mapa("local"), mapa("visitante")),
      h("p", { class: "nota-pie", text: "MIN se calcula con el reloj y los cambios. VAL = fórmula FEB. El +/- suma el tanteo mientras el jugador está en pista." })));
  }

  function tablaEquipo(lado) {
    const s = app.sesion, p = app.proy;
    const vistos = new Set();
    const filas = [];
    for (const j of s.jugadores[lado]) {
      if (vistos.has(String(j.dorsal))) continue;
      vistos.add(String(j.dorsal));
      const st = p.jugadores[lado][j.dorsal] || statsVacias();
      filas.push({ ...st, dorsal: j.dorsal, nombre: nombreJugador(j.nombre, j.dorsal), enPista: p.oncourt[lado].includes(j.dorsal), titular: j.titular });
    }
    const cols = [
      { key: "dorsal", label: "#" },
      { key: "nombre", label: "Jugador" },
      { key: "titular", label: "T", fmt: (v) => (v ? "•" : "") },
      { key: "segundos", label: "MIN", num: true, fmt: (v) => mmss(v) },
      { key: "puntos", label: "PTS", num: true },
      { key: "t2", label: "T2", num: true, val: (r) => `${r.t2a}/${r.t2i}` },
      { key: "t3", label: "T3", num: true, val: (r) => `${r.t3a}/${r.t3i}` },
      { key: "tl", label: "TL", num: true, val: (r) => `${r.tla}/${r.tli}` },
      { key: "rebOf", label: "RO", num: true },
      { key: "rebDef", label: "RD", num: true },
      { key: "rebTot", label: "RT", num: true, val: (r) => r.rebOf + r.rebDef },
      { key: "asistencias", label: "AST", num: true },
      { key: "recuperaciones", label: "ROB", num: true },
      { key: "perdidas", label: "PER", num: true },
      { key: "tapones", label: "TAP", num: true, val: (r) => r.taponesFavor },
      { key: "disruptivas", label: "DI", num: true },
      { key: "faltas", label: "FC", num: true },
      { key: "faltasRecibidas", label: "FR", num: true },
      { key: "masMenos", label: "+/-", num: true, fmt: (v) => (v > 0 ? "+" + v : v) },
      { key: "val", label: "VAL", num: true, val: (r) => valoracion(r) },
    ];
    const val = (c, r) => (c.val ? c.val(r) : r[c.key]);
    const texto = (c, r) => { const v = val(c, r); return c.fmt ? c.fmt(v) : (v ?? ""); };
    const filasOrd = filas.slice().sort((a, b) => {
      const c = cols.find((x) => x.key === orden.col) || cols[3];
      const va = val(c, a), vb = val(c, b);
      if (typeof va === "string" || typeof vb === "string") return String(va ?? "").localeCompare(String(vb ?? ""), "es") * orden.dir;
      return ((+va || 0) - (+vb || 0)) * orden.dir;
    });
    const eq = p.equipos[lado];
    const head = h("thead", null, h("tr", null, cols.map((c) => h("th", {
      class: c.num ? "num" : "",
      onclick: () => { const mismo = orden.col === c.key; orden.col = c.key; orden.dir = mismo ? -orden.dir : (c.num ? -1 : 1); pintar(); },
    }, c.label))));
    const body = h("tbody", null, filasOrd.map((r) => h("tr", { class: r.enPista ? "en-pista" : "" },
      cols.map((c) => h("td", { class: c.num ? "num" : "" }, String(texto(c, r) ?? ""))))));
    const foot = h("tfoot", null, h("tr", null, cols.map((c) => {
      if (c.key === "nombre") return h("td", null, "Totales");
      if (c.key === "t2") return h("td", { class: "num" }, `${eq.t2a}/${eq.t2i}`);
      if (c.key === "t3") return h("td", { class: "num" }, `${eq.t3a}/${eq.t3i}`);
      if (c.key === "tl") return h("td", { class: "num" }, `${eq.tla}/${eq.tli}`);
      if (c.key === "rebTot") return h("td", { class: "num" }, String(eq.rebOf + eq.rebDef));
      if (c.key === "val") return h("td", { class: "num" }, String(eq.valoracion));
      if (c.key === "masMenos") return h("td", { class: "num" }, "");
      if (c.key === "tapones") return h("td", { class: "num" }, String(eq.taponesFavor ?? 0));
      if (c.key === "segundos") return h("td", { class: "num" }, mmss(eq.segundos));
      return h("td", { class: c.num ? "num" : "" }, String(eq[c.key] ?? ""));
    })));
    return h("article", { class: "card box-tabla " + lado, style: `--eq-color:${s[lado].color || (lado === "local" ? "#2a5fd0" : "#c2332b")}` },
      h("div", { class: "bt-cab" }, h("h3", { text: s[lado].nombre }), h("span", { class: "pill", text: `${p.pts[lado]} pts` })),
      h("div", { class: "tabla-wrap" }, h("table", { class: "tabla box" }, head, body, foot)));
  }

  function mapa(lado) {
    const cancha = crearCancha({ interactiva: false });
    cancha.pintarTiros(app.proy.tiros.filter((t) => t.lado === lado && t.Xinv != null), {
      basketPorTiro: (t) => t.basket || (lado === "local" ? "left" : "right"),
    });
    return h("article", { class: "card mapa-card", style: `--eq-color:${app.sesion[lado].color || (lado === "local" ? "#2a5fd0" : "#c2332b")}` },
      h("div", { class: "bt-cab" }, h("h3", { text: `Tiros · ${app.sesion[lado].nombre}` }),
        h("span", { class: "pill", text: `${app.proy.tiros.filter((t) => t.lado === lado).length} tiros` })),
      cancha.el);
  }
  return null;
}
