// Pantalla de partido en directo: reloj, cancha de tiro, acciones y boxscore instantáneo.
import { h, limpiar, btn, toast, dialogo, mmss, guardarArchivo } from "../util.js";
import {
  app, suscribir, agregar, deshacer, iniciarReloj, pararReloj, ajustarReloj, relojActual,
  iniciarPeriodo, finPeriodo, finalizar, siguientePeriodo, cambiarAtaque,
  exportarSesionActual, nombreArchivoExport, etiquetaPeriodo,
} from "../estado.js";
import { crearCancha, puntosDeTiro } from "../court.js";
import { faltasCuarto } from "../model.js";
import { statsVacias } from "../grupo.js";
import { abrirEditorNota } from "../notas-editor.js";
import { navegar } from "../app.js";

export function vistaPartido(cont) {
  if (!app.sesion) {
    cont.append(h("div", { class: "vacio" }, h("strong", { text: "No hay partido abierto" }),
      h("p", { text: "Importa los datos y crea un partido, o continúa una sesión guardada." }),
      btn("Ir al inicio", () => navegar("inicio"), { clase: "btn primario", icon: "inicio" })));
    return null;
  }
  if (app.sesion.estado === "final") {
    cont.append(h("div", { class: "vacio" }, h("strong", { text: "Partido finalizado" }),
      h("p", { text: "Puedes revisar el boxscore o exportar el .db." }),
      h("div", { class: "acciones centradas" },
        btn("Ver boxscore", () => navegar("boxscore"), { clase: "btn primario", icon: "boxscore" }),
        btn("Exportar .db", exportarYDescargar, { clase: "btn", icon: "exportar" }),
        btn("Volver al inicio", () => navegar("inicio"), { clase: "btn" }))));
    return null;
  }

  const raiz = h("div", { class: "directo" });
  cont.append(raiz);
  let pendiente = null;              // tiro por confirmar
  let asistencia = null;             // {lado, tiroUid}
  let verTodos = false;
  let exportando = false;

  const off = suscribir(() => { if (raiz.isConnected) pintar(); });

  function pintar() {
    if (!app.sesion) return;
    // La asistencia solo vale mientras el último evento sea ese tiro anotado.
    if (asistencia) {
      const anul = new Set(app.eventos.filter((e) => e.t === "anulacion").map((e) => e.datos?.ref));
    const ult = [...app.eventos].reverse().find((e) => !["reloj", "posesion", "anulacion"].includes(e.t) && !anul.has(e.uid));
      if (!ult || ult.uid !== asistencia.tiroUid || ult.t !== "tiro" || ult.datos?.resultado !== "acierto") asistencia = null;
    }
    const sel = app.seleccion;
    if (sel && !jugadorEnPista(sel.lado, sel.dorsal)) { app.seleccion = null; asistencia = null; }
    limpiar(raiz);
    raiz.append(columnaPista(), panel());
  }

  function jugadorEnPista(lado, dorsal) { return app.proy?.oncourt[lado]?.includes(String(dorsal)); }
  function equipo(lado) { return app.sesion[lado]; }
  function jugadores(lado) { return app.sesion.jugadores[lado]; }
  function stats(lado, dorsal) { return app.proy?.jugadores[lado]?.[String(dorsal)] || statsVacias(); }
  function nombreSel() {
    const s = app.seleccion; if (!s) return "";
    return jugadores(s.lado).find((j) => j.dorsal === String(s.dorsal))?.nombre || `#${s.dorsal}`;
  }
  const nombreCorto = (n) => {
    const t = String(n || "").replace(/[.,]/g, " ").trim().split(/\s+/).filter(Boolean);
    const corto = t.length > 1 ? t.slice(-2).join(" ") : t[0] || "";
    return corto.length > 14 ? corto.slice(0, 13) + "…" : corto;
  };

  // ---------------- columna izquierda ----------------

  function columnaPista() {
    return h("section", { class: "pista-col" },
      marcador(),
      barraReloj(),
      h("div", { class: "cancha-wrap" }, canchaEl()),
      piePista());
  }

  function marcador() {
    const p = app.proy;
    const ataque = app.ladoAtaque;
    return h("div", { class: "marcador" },
      bloqueEquipo("local", ataque),
      h("div", { class: "reloj-central" },
        h("div", { class: "reloj-periodo" }, h("span", { class: "pill", text: etiquetaPeriodo(app.sesion.reloj) }),
          app.sesion.estado === "descanso" ? h("span", { class: "pill aviso", text: "Descanso" }) : null),
        h("button", { type: "button", class: "reloj-digital " + (app.sesion.reloj.corriendo ? "corriendo" : ""), onclick: alternarReloj, "aria-label": app.sesion.reloj.corriendo ? "Parar reloj" : "Iniciar reloj" },
          h("b", { "data-reloj": "principal", text: mmss(relojActual()) }),
          h("span", { class: "reloj-sub", text: app.sesion.reloj.corriendo ? "EN MARCHA" : "PARADO" })),
        h("div", { class: "posesion-linea" },
          h("button", { type: "button", class: "posesion-btn", onclick: () => cambiarAtaque(app.ladoAtaque === "local" ? "visitante" : "local") },
            h("span", { class: "flecha-ataque", text: ataque === "local" ? "◀" : "▶" }),
            h("span", { text: `Ataca ${equipo(ataque).nombre}` })))),
      bloqueEquipo("visitante", ataque));
  }

  function bloqueEquipo(lado, ataque) {
    const p = app.proy;
    const faltas = faltasCuarto(p, lado);
    return h("div", { class: "marcador-eq " + lado + (ataque === lado ? " ataca" : "") },
      h("div", { class: "meq-nombre" }, h("span", { text: equipo(lado).nombre }), ataque === lado ? h("i", { class: "punto-ataque", title: "Posesión" }) : null),
      h("div", { class: "meq-puntos", text: String(p.pts[lado]) }),
      h("div", { class: "meq-pie" },
        h("span", { text: `Faltas ${faltas}` }),
        faltas >= 5 ? h("span", { class: "pill mal", text: "BONUS" }) : null,
        h("span", { text: `Tiros ${p.tiros.filter((t) => t.lado === lado).length}` })));
  }

  function barraReloj() {
    const s = app.sesion;
    return h("div", { class: "barra-reloj" },
      h("div", { class: "grupo-botones" },
        btn("−10", () => ajustarReloj(-10), { clase: "btn pequeno", title: "Restar 10 segundos" }),
        btn("−1", () => ajustarReloj(-1), { clase: "btn pequeno", title: "Restar 1 segundo" }),
        btn(s.reloj.corriendo ? "Parar" : "Iniciar", alternarReloj, { clase: "btn " + (s.reloj.corriendo ? "aviso" : "primario"), icon: s.reloj.corriendo ? "pausa" : "play" }),
        btn("+1", () => ajustarReloj(1), { clase: "btn pequeno", title: "Sumar 1 segundo" }),
        btn("+10", () => ajustarReloj(10), { clase: "btn pequeno", title: "Sumar 10 segundos" })),
      h("div", { class: "barra-reloj-medio" },
        h("span", { class: "barra-pista" }, h("i", { "data-barra-reloj": "1" })),
        h("span", { class: "pill", text: `Cuarto ${s.reloj.cuarto}${s.reloj.tipoPeriodo === "prorroga" ? " · prórroga" : ""}` })),
      h("div", { class: "grupo-botones" },
        btn("Deshacer", async () => { const ok = await deshacer(); toast(ok ? "Última acción anulada." : "No hay nada que deshacer.", ok ? "ok" : "aviso"); }, { clase: "btn", icon: "deshacer" }),
        btn("Fin cuarto", cerrarCuarto, { clase: "btn" }),
        btn(esUltimoCuarto() ? "Prórroga / final" : "Siguiente cuarto", siguiente, { clase: "btn primario" }),
        btn("Exportar", exportarYDescargar, { clase: "btn", icon: "exportar", disabled: exportando })),
    );
  }

  function esUltimoCuarto() { return app.sesion.reloj.cuarto >= 4; }

  function canchaEl() {
    const lado = app.ladoAtaque;
    const cancha = crearCancha({
      onTiro: (p) => {
        if (!app.seleccion) { toast("Primero toca un jugador.", "aviso"); return; }
        pendiente = { tipo: puntosDeTiro(p.x, p.y), x: p.x, y: p.y, xinv: p.x, yinv: p.y, tl: false };
        pintar();
      },
    });
    const tiros = (app.proy?.tiros || []).filter((t) => t.lado === lado && t.Xinv != null && (verTodos || t.cuarto === app.sesion.reloj.cuarto));
    cancha.pintarTiros(tiros);
    if (pendiente) cancha.marcar(pendiente.xinv, pendiente.yinv, { color: pendiente.tipo === 3 ? "#7c5cff" : "#f4a31d", etiqueta: pendiente.tipo === 1 ? "TL" : `${pendiente.tipo}PT` });
    return cancha.el;
  }

  function piePista() {
    const anul = new Set(app.eventos.filter((e) => e.t === "anulacion").map((e) => e.datos?.ref));
    const ult = [...app.eventos].reverse().find((e) => !["reloj", "posesion", "anulacion"].includes(e.t) && !anul.has(e.uid));
    return h("div", { class: "pie-pista" },
      h("div", { class: "leyenda" },
        h("span", { class: "punto acierto" }), "Anotado",
        h("span", { class: "punto fallo" }), "Fallado",
        h("button", { type: "button", class: "btn pequeno", onclick: () => { verTodos = !verTodos; pintar(); } }, verTodos ? "Solo este cuarto" : "Todo el partido")),
      h("div", { class: "ultimo-evento", text: resumenEvento(ult) }));
  }

  function resumenEvento(e) {
    if (!e) return "Sin acciones todavía.";
    const quien = e.jugador || e.equipo || "";
    const d = e.datos || {};
    const map = {
      tiro: `${quien} · ${d.tl ? "TL" : d.puntos + "PT"} ${d.resultado === "acierto" ? "anotado" : "fallado"}${e.cuarto ? ` (${e.cuarto}C)` : ""}`,
      rebote: `${quien} · rebote ${d.tipo === "of" ? "ofensivo" : "defensivo"}`,
      asistencia: `${quien} · asistencia`,
      robo: `${quien} · recuperación`,
      perdida: `${quien || e.equipo} · pérdida`,
      tapon: `${quien} · tapón`,
      falta: `${quien} · falta ${d.clase === "recibida" ? "recibida" : "cometida"}`,
      sustitucion: `Cambio en ${e.equipo}: sale #${d.sale}, entra #${d.entra}`,
      jugada: `Jugada: ${d.titulo || ""}`,
      nota: `Nota: ${d.texto || ""}`,
      periodo: d.accion === "fin" ? `Fin del ${etiquetaPeriodo(e)}` : `Empieza el ${etiquetaPeriodo(e)}`,
      final: "Final del partido",
      inicio: "Partido iniciado",
    };
    return map[e.t] || "";
  }

  // ---------------- panel derecho ----------------

  function panel() {
    return h("aside", { class: "panel-directo" },
      h("div", { class: "panel-cab" },
        h("div", null, h("h2", { text: "Scouting" }), h("p", { class: "sub", text: "Toca jugador → cancha → anota/falla" })),
        h("div", { class: "panel-cab-der" },
          btn("Nueva nota", abrirNuevaNota, { clase: "btn pequeno primario", icon: "mas", title: "Crear una nota vinculada a este partido" }),
          btn("Notas", abrirNotas, { clase: "btn pequeno", icon: "notas", title: "Abrir las notas en otra pestaña" }))),
      seleccionCab(),
      pendiente ? tarjetaTiro() : null,
      asistencia ? tiraAsistencia() : null,
      equipoPanel("local"),
      equipoPanel("visitante"),
      acciones(),
      banquillos(),
      ultimasAcciones());
  }

  function seleccionCab() {
    if (!app.seleccion) return h("div", { class: "seleccion-vacia" }, "Ningún jugador seleccionado");
    const s = app.seleccion;
    const st = stats(s.lado, s.dorsal);
    return h("div", { class: "seleccion-cab " + s.lado },
      h("div", null, h("span", { class: "pill", text: `#${s.dorsal}` }), h("b", { text: nombreSel() })),
      h("div", { class: "seleccion-mini" },
        h("span", { text: `${st.puntos} pts` }), h("span", { text: `${st.t2a}/${st.t2i} T2` }),
        h("span", { text: `${st.t3a}/${st.t3i} T3` }), h("span", { text: `${st.tla}/${st.tli} TL` }),
        h("span", { text: `${st.rebOf + st.rebDef} reb` }), h("span", { text: `${st.faltas} faltas` })),
      h("button", { type: "button", class: "btn fantasma", "aria-label": "Quitar selección", onclick: () => { app.seleccion = null; pendiente = null; pintar(); } }, "✕"));
  }

  function tarjetaTiro() {
    const p = pendiente;
    const tipo = p.tl ? "Tiro libre" : `Tiro de ${p.tipo}`;
    return h("div", { class: "tarjeta-tiro" },
      h("div", { class: "tt-cab" }, h("b", { text: tipo }), p.xinv != null ? h("span", { class: "sub", text: `${p.xinv.toFixed(1)} m · ${p.yinv.toFixed(1)} m` }) : h("span", { class: "sub", text: "sin posición" })),
      h("div", { class: "tt-jugador" }, h("span", { class: "pill", text: `#${app.seleccion.dorsal}` }), h("b", { text: nombreSel() })),
      h("div", { class: "tt-acciones" },
        h("button", { type: "button", class: "btn anota grande", onclick: () => registrarTiro("acierto") }, "ANOTA"),
        h("button", { type: "button", class: "btn falla grande", onclick: () => registrarTiro("fallo") }, "FALLA")),
      h("div", { class: "tt-pie" },
        !p.tl ? h("div", { class: "seg" },
          [2, 3].map((n) => h("button", { type: "button", class: p.tipo === n ? "on" : "", onclick: () => { pendiente = { ...p, tipo: n }; pintar(); } }, `${n} puntos`))) : null,
        h("button", { type: "button", class: "btn fantasma", onclick: () => { pendiente = null; pintar(); } }, "Cancelar")));
  }

  function tiraAsistencia() {
    const lado = asistencia.lado;
    const tiro = app.proy?.tiros.find((t) => t.uid === asistencia.tiroUid);
    const enPista = (app.proy?.oncourt[lado] || []).filter((d) => d !== tiro?.dorsal);
    return h("div", { class: "tira-asistencia" },
      h("div", { class: "tt-cab" }, h("b", { text: "¿Asistencia?" }), h("span", { class: "sub", text: "Toca el pasador o «No»" })),
      h("div", { class: "chips-asistencia" },
        enPista.map((d) => {
          const j = jugadores(lado).find((x) => x.dorsal === d);
          return h("button", { type: "button", class: "chip-asistencia", onclick: () => darAsistencia(lado, d) }, `#${d} ${nombreCorto(j?.nombre)}`);
        }),
        h("button", { type: "button", class: "btn fantasma", onclick: () => { asistencia = null; pintar(); } }, "No")));
  }

  function equipoPanel(lado) {
    const on = app.proy?.oncourt[lado] || [];
    const ataca = app.ladoAtaque === lado;
    return h("div", { class: "equipo-panel " + lado + (ataca ? " ataca" : "") },
      h("div", { class: "ep-cab" },
        h("button", { type: "button", class: "ep-nombre", onclick: () => cambiarAtaque(lado), title: "Poner en posesión" },
          h("span", { class: "ep-color" }), h("b", { text: equipo(lado).nombre }), ataca ? h("span", { class: "pill ok", text: "ataca" }) : null),
        h("span", { class: "pill", text: `${app.proy.pts[lado]} pts` })),
      h("div", { class: "chips-jugadores" },
        on.map((d) => {
          const j = jugadores(lado).find((x) => x.dorsal === d);
          const st = stats(lado, d);
          const sel = app.seleccion?.lado === lado && app.seleccion?.dorsal === d;
          return h("button", { type: "button", class: "chip-jug" + (sel ? " sel" : "") + (st.faltas >= 5 ? " expulsado" : ""), onclick: () => { app.seleccion = { lado, dorsal: d }; pendiente = null; pintar(); } },
            h("span", { class: "cj-dorsal", text: `#${d}` }),
            h("span", { class: "cj-nombre", text: nombreCorto(j?.nombre) }),
            h("span", { class: "cj-datos" },
              h("b", { text: String(st.puntos) }),
              h("i", { text: `${st.faltas}F` })));
        })),
      h("div", { class: "ep-pie" }, h("span", { text: `Rebotes ${app.proy.equipos[lado].rebOf + app.proy.equipos[lado].rebDef}` }), h("span", { text: `Pérdidas ${app.proy.equipos[lado].perdidas}` }), h("span", { text: `Faltas ${faltasCuarto(app.proy, lado)}` })));
  }

  function acciones() {
    if (pendiente) return h("div", { class: "acciones-panel" }, h("p", { class: "sub", text: "Confirma el tiro en la tarjeta de arriba." }));
    const sel = app.seleccion;
    const sinSel = !sel;
    const b = (txt, fn, { clase = "", icono: ic = "", disabled = sinSel, title = "" } = {}) =>
      btn(txt, fn, { clase: `accion ${clase}`, icon: ic, disabled, title });
    return h("div", { class: "acciones-panel" },
      h("div", { class: "acciones-cab" }, h("h3", { text: "Acciones" }), sel ? h("span", { class: "sub", text: `#${sel.dorsal} ${nombreCorto(nombreSel())}` }) : h("span", { class: "sub", text: "Elige jugador" })),
      h("div", { class: "acciones-grid" },
        b("T2", () => prepararTiro(2), { clase: "tiro2" }),
        b("T3", () => prepararTiro(3), { clase: "tiro3" }),
        b("TL", () => prepararTiro(1), { clase: "tl" }),
        b("Mate", () => accionMate(), { clase: "mate" }),
        b("Rebote O", () => accionRebote("of"), { clase: "reb" }),
        b("Rebote D", () => accionRebote("def"), { clase: "reb" }),
        b("Asistencia", accionAsistencia, { clase: "ast", disabled: sinSel || !asistencia }),
        b("Recuperación", accionRobo, { clase: "rob" }),
        b("Pérdida", accionPerdida, { clase: "per" }),
        b("Tapón", accionTapon, { clase: "tap" }),
        b("Falta C", () => accionFalta("cometida"), { clase: "falta" }),
        b("Falta R", () => accionFalta("recibida"), { clase: "falta" }),
        b("Nota", accionNota, { clase: "nota", disabled: false, icono: "notas" })),
      h("p", { class: "pista-ayuda", text: "También puedes tocar directamente la cancha con un jugador elegido." }));
  }

  function banquillos() {
    return h("details", { class: "banquillos" },
      h("summary", null, h("span", { text: "Banquillo y cambios" }), h("span", { class: "pill", text: `${jugadores("local").length + jugadores("visitante").length} jug.` })),
      h("div", { class: "rejilla dos banquillo-listas" }, ["local", "visitante"].map((lado) => {
        const enPista = new Set(app.proy?.oncourt[lado] || []);
        const banco = jugadores(lado).filter((j) => !enPista.has(j.dorsal));
        return h("div", { class: "banquillo " + lado },
          h("h4", { text: `${equipo(lado).nombre} · banquillo` }),
          banco.length ? banco.map((j) => h("div", { class: "banco-fila" },
            h("span", { class: "dorsal", text: `#${j.dorsal}` }),
            h("span", { class: "nombre", text: j.nombre }),
            h("button", { type: "button", class: "btn pequeno", onclick: () => sustituir(lado, j.dorsal) }, "Entra")))
            : h("p", { class: "sub", text: "Todos en pista." }));
      })));
  }

  function ultimasAcciones() {
    const anul = new Set(app.eventos.filter((e) => e.t === "anulacion").map((e) => e.datos?.ref));
    const lista = [...app.eventos].reverse().filter((e) => !["reloj", "posesion", "anulacion"].includes(e.t) && !anul.has(e.uid)).slice(0, 6);
    return h("details", { class: "ultimas" },
      h("summary", null, h("span", { text: "Últimas acciones" }), h("span", { class: "pill", text: `${app.eventos.length}` })),
      h("ol", { class: "lista-acciones" },
        lista.map((e) => h("li", { class: e.t },
          h("span", { class: "la-reloj", text: `${etiquetaPeriodo(e)} ${mmss(e.reloj || 0)}` }),
          h("span", { class: "la-txt", text: resumenEvento(e) })))));
  }

  // ---------------- acciones ----------------

  function prepararTiro(tipo) {
    if (!app.seleccion) return;
    asistencia = null;
    pendiente = { tipo, tl: tipo === 1, x: null, y: null, xinv: null, yinv: null };
    pintar();
  }

  async function registrarTiro(resultado) {
    if (!pendiente || !app.seleccion) return;
    const p = pendiente;
    const lado = app.seleccion.lado;
    const dorsal = app.seleccion.dorsal;
    const xinv = p.xinv, yinv = p.yinv;
    const X = xinv == null ? null : (lado === "local" ? xinv : 28 - xinv);
    const Y = yinv == null ? null : (lado === "local" ? yinv : 15 - yinv);
    pendiente = null;
    await agregar("tiro", { lado, dorsal, datos: { puntos: p.tl ? 1 : p.tipo, resultado, X, Y, Xinv: xinv, Yinv: yinv, tl: !!p.tl, mate: false, tiempoRestante: Math.round(relojActual()) } });
    if (resultado === "acierto" && !p.tl) {
      const ev = [...app.eventos].reverse().find((e) => e.t === "tiro");
      asistencia = { lado, tiroUid: ev?.uid };
    }
    if (resultado === "acierto") app.seleccion = null;
    if (resultado === "acierto" && !p.tl) await cambiarAtaque(lado === "local" ? "visitante" : "local");
    pintar();
  }

  async function darAsistencia(lado, dorsal) {
    if (!asistencia) return;
    const tiroUid = asistencia.tiroUid;
    asistencia = null;
    await agregar("asistencia", { lado, dorsal, datos: { tiroUid } });
  }

  async function accionRebote(tipo) {
    if (!app.seleccion) return;
    asistencia = null;
    const lado = app.seleccion.lado;
    await agregar("rebote", { lado, dorsal: app.seleccion.dorsal, datos: { tipo } });
    if (tipo === "def") await cambiarAtaque(lado);
    pintar();
  }

  async function accionRobo() {
    if (!app.seleccion) return;
    asistencia = null;
    const lado = app.seleccion.lado;
    const otro = lado === "local" ? "visitante" : "local";
    await agregar("robo", { lado, dorsal: app.seleccion.dorsal });
    await agregar("perdida", { lado: otro, datos: { equipo: true, causa: "robo" } });
    await cambiarAtaque(lado);
    pintar();
  }

  async function accionPerdida() {
    if (!app.seleccion) return;
    asistencia = null;
    const lado = app.seleccion.lado;
    await agregar("perdida", { lado, dorsal: app.seleccion.dorsal });
    await cambiarAtaque(lado === "local" ? "visitante" : "local");
    pintar();
  }

  async function accionTapon() {
    if (!app.seleccion) return;
    asistencia = null;
    await agregar("tapon", { lado: app.seleccion.lado, dorsal: app.seleccion.dorsal });
  }

  async function accionFalta(clase) {
    if (!app.seleccion) return;
    asistencia = null;
    await agregar("falta", { lado: app.seleccion.lado, dorsal: app.seleccion.dorsal, datos: { clase } });
  }

  async function accionMate() {
    if (!app.seleccion) return;
    asistencia = null;
    const lado = app.seleccion.lado;
    await agregar("tiro", { lado, dorsal: app.seleccion.dorsal, datos: { puntos: 2, resultado: "acierto", mate: true, tl: false, tiempoRestante: Math.round(relojActual()) } });
    await cambiarAtaque(lado === "local" ? "visitante" : "local");
    pintar();
  }

  async function accionAsistencia() {
    if (!app.seleccion || !asistencia) { toast("Primero registra un tiro anotado.", "aviso"); return; }
    if (asistencia.lado !== app.seleccion.lado) { toast("La asistencia debe ser del mismo equipo que anotó.", "aviso"); return; }
    const tiro = app.proy?.tiros.find((t) => t.uid === asistencia.tiroUid);
    if (tiro && tiro.dorsal === app.seleccion.dorsal) { toast("El pasador no puede ser el anotador.", "aviso"); return; }
    await darAsistencia(app.seleccion.lado, app.seleccion.dorsal);
  }

  function abrirNuevaNota() {
    const lado = app.seleccion?.lado || null;
    const jugador = lado ? jugadores(lado).find((j) => j.dorsal === String(app.seleccion.dorsal)) : null;
    abrirEditorNota(null, {
      sesion: app.sesion, lado, jugador,
      onGuardada: () => toast("Nota guardada. Puedes editarla en Notas.", "ok"),
    });
  }

  async function accionNota() { abrirNuevaNota(); }

  function abrirNotas() {
    const url = new URL(location.href);
    url.searchParams.set("notas", "1");
    url.hash = "#/notas";
    const w = window.open(url.href, "_blank");
    if (!w) {
      url.searchParams.delete("notas");
      toast("No se pudo abrir otra pestaña; se abre aquí.", "aviso");
      location.href = url.href;
    }
  }

  async function sustituir(lado, entra) {
    if (!app.seleccion || app.seleccion.lado !== lado) { toast(`Primero toca el jugador del ${lado === "local" ? "local" : "visitante"} que sale.`, "aviso"); return; }
    const sale = app.seleccion.dorsal;
    asistencia = null;
    pendiente = null;
    await agregar("sustitucion", { lado, dorsal: sale, datos: { sale, entra } });
    app.seleccion = { lado, dorsal: String(entra) };
    pintar();
  }

  async function alternarReloj() {
    if (app.sesion.reloj.corriendo) await pararReloj(); else await iniciarReloj();
  }

  async function cerrarCuarto() {
    await finPeriodo();
    toast("Cuarto cerrado. Elige «Siguiente cuarto» cuando toque.", "ok");
  }

  async function cerrarSiHaceFalta() {
    const s = app.sesion;
    const ult = [...app.eventos].reverse().find((e) => e.t === "periodo");
    if (ult && ult.datos?.accion === "fin" && ult.cuarto === s.reloj.cuarto) return;
    await finPeriodo();
  }

  async function siguiente() {
    const s = app.sesion;
    if (s.estado === "descanso") {
      await cerrarSiHaceFalta();
      await iniciarPeriodo(3, "regular");
      return;
    }
    const p = app.proy;
    if (esUltimoCuarto()) {
      if (p.pts.local === p.pts.visitante) {
        const yaPr = s.reloj.tipoPeriodo === "prorroga";
        const r = await elegir("Empate", `El partido está empatado. ¿${yaPr ? "Otra prórroga" : "Prórroga"} de 5:00 o finalizar?`, [["prorroga", `Prórroga 5:00`, "primario"], ["final", "Finalizar", "peligro"], ["nada", "Cancelar", ""]]);
        if (r === "prorroga") { await cerrarSiHaceFalta(); await iniciarPeriodo(s.reloj.cuarto + 1, "prorroga"); return; }
        if (r === "final") { await acabar(); return; }
        return;
      }
      const r = await elegir("Final del partido", "Ya no queda tiempo. ¿Finalizar y exportar?", [["final", "Finalizar", "primario"], ["nada", "Cancelar", ""]]);
      if (r === "final") await acabar();
      return;
    }
    const sig = siguientePeriodo();
    if (sig.cuarto === 3) {
      const r = await elegir("Descanso", "Empieza el tercer cuarto. ¿Quieres exportar una copia del .db antes?", [["exportar", "Exportar y seguir", "primario"], ["seguir", "Seguir sin exportar", ""], ["nada", "Cancelar", ""]]);
      if (r === "nada") return;
      if (r === "exportar") await exportarYDescargar();
    }
    await cerrarSiHaceFalta();
    await iniciarPeriodo(sig.cuarto, sig.tipoPeriodo);
  }

  async function acabar() {
    await finalizar();
    await exportarYDescargar();
    navegar("boxscore");
  }

  async function exportarYDescargar() {
    if (exportando) return;
    exportando = true;
    try {
      const bytes = await exportarSesionActual();
      const modo = await guardarArchivo(new Blob([bytes], { type: "application/vnd.sqlite3" }), nombreArchivoExport());
      toast(modo === "compartido" ? "Elige «Guardar en Archivos»." : "Exportado: busca el .db en Archivos o en Descargas.", "ok");
    } catch (e) {
      console.error(e); toast("No se pudo exportar: " + e.message, "error");
    } finally { exportando = false; }
  }

  function elegir(titulo, texto, opciones) {
    return new Promise((resolver) => {
      const d = dialogo(titulo, h("div", null, h("p", { text: texto }), h("div", { class: "acciones" },
        opciones.map(([v, t, c]) => btn(t, () => { d.close(); resolver(v); }, { clase: "btn " + (c || "") })))));
      d.addEventListener("close", () => resolver("nada"), { once: true });
    });
  }

  pintar();
  return () => { off(); };
}
