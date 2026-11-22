// Pantalla de partido en directo: marcador, controles, pista y acciones laterales.
import { h, limpiar, btn, toast, dialogo, confirmar, mmss, jornadaTexto, nombreJugador, etiquetaJugador } from "../util.js";
import {
  app, suscribir, agregar, deshacer, lote, anadirJugador, iniciarReloj, pararReloj, ajustarReloj, relojActual,
  iniciarPeriodo, finPeriodo, finalizar, siguientePeriodo, cambiarAtaque,
  etiquetaPeriodo, equipoDefensor, defensaIndicada, marcarDefensa, editarEvento, eliminarEvento,
} from "../estado.js";
import { crearCancha, C } from "../court.js";
import { faltasCuarto } from "../model.js";
import { statsVacias, puntosDeTiro } from "../grupo.js";
import { abrirEditorNota } from "../notas-editor.js";
import { navegar } from "../app.js";

const otroLado = (lado) => (lado === "local" ? "visitante" : "local");
const IGNORAR_EN_ACCIONES = new Set(["reloj", "posesion", "anulacion", "periodo", "inicio", "final"]);

const ACCIONES = [
  ["RO", "Rebote of.", "Rebote ofensivo", (fn) => fn("rebote", "of")],
  ["RD", "Rebote def.", "Rebote defensivo", (fn) => fn("rebote", "def")],
  ["A", "Asistencia", "Asistencia", (fn) => fn("asistencia")],
  ["R", "Robo", "Recuperación / robo", (fn) => fn("robo")],
  ["P", "Pérdida", "Pérdida", (fn) => fn("perdida")],
  ["TP", "Tapón", "Tapón (bloqueo) a un tiro rival", (fn) => fn("tapon")],
  ["FR", "F. recib.", "Falta recibida (el jugador es objeto de falta)", (fn) => fn("falta_recibida")],
];

export function vistaPartido(cont) {
  if (!app.sesion) {
    cont.append(h("div", { class: "vacio" }, h("strong", { text: "No hay partido abierto" }),
      h("p", { text: "Importa los datos y crea un partido, o continúa una sesión guardada." }),
      btn("Ir al inicio", () => navegar("inicio"), { clase: "btn primario", icon: "inicio" })));
    return null;
  }

  const raiz = h("div", { class: "directo-vista" });
  cont.append(raiz);
  let ubicacion = null;              // { xinv, yinv, basket } al tocar la pista
  let pendiente = null;              // { tipo: 1|2|3, tl, xinv, yinv, basket }
  let asistencia = null;             // { lado, tiroUid }
  let serieTL = null;                // { lado, dorsal, total, hechos, codigo }: serie de tiros libres tras una falta
  let rebote = null;                 // { ladoTirador, tiroUid }: rebote pendiente tras un tiro fallado
  let verTodos = false;
  let pidiendoDefensa = false;

  const off = suscribir(() => { if (raiz.isConnected) pintar(); });

  // ---------------- utilidades ----------------

  function equipo(lado) { return app.sesion[lado]; }
  function jugadores(lado) { return app.sesion.jugadores[lado] || []; }
  function staffDe(lado) {
    const eq = equipo(lado);
    const lista = [];
    const vistos = new Set();
    const add = (nombre, rol) => {
      const n = String(nombre || "").trim();
      if (!n || vistos.has(n)) return;
      vistos.add(n);
      lista.push({ nombre: n, rol });
    };
    add(eq?.entrenador, "Entrenador principal");
    for (const n of eq?.staff || []) add(n, "Cuerpo técnico");
    return lista;
  }
  function stats(lado, dorsal) { return app.proy?.jugadores[lado]?.[String(dorsal)] || statsVacias(); }
  const colorLado = (lado) => equipo(lado)?.color || (lado === "local" ? "#2a5fd0" : "#c2332b");
  const estiloLado = (lado) => `--eq-color:${colorLado(lado)}`;
  const jugadorEnPista = (lado, dorsal) => !!app.proy?.oncourt?.[lado]?.map(String).includes(String(dorsal));
  // El equipo que defiende la zona izquierda ataca la canasta derecha.
  const basketDe = (lado, cuarto = app.sesion.reloj.cuarto) => (lado === equipoDefensor(cuarto) ? "right" : "left");

  function nombreSel() {
    const s = app.seleccion;
    if (!s) return "";
    if (s.coach) return staffDe(s.lado)[s.staffIndex ?? 0]?.nombre || "Entrenador";
    return jugadores(s.lado).find((j) => j.dorsal === String(s.dorsal))?.nombre || `#${s.dorsal}`;
  }

  const nombreCorto = (n) => {
    const t = String(n || "").replace(/[.,]/g, " ").trim().split(/\s+/).filter(Boolean);
    const corto = t.length > 1 ? t.slice(-2).join(" ") : t[0] || "";
    return corto.length > 14 ? corto.slice(0, 13) + "…" : corto;
  };

  function rosterTiene(s) {
    if (!s) return false;
    if (s.coach) return !!staffDe(s.lado)[s.staffIndex ?? 0];
    return jugadores(s.lado).some((j) => j.dorsal === String(s.dorsal));
  }

  function expulsadoBanquillo(s = app.seleccion) {
    if (!s || jugadorEnPista(s.lado, s.dorsal)) return false;
    const clave = s.coach ? `staff:${s.staffIndex ?? 0}` : `jugador:${s.dorsal}`;
    return !!app.proy?.expulsadosBanquillo?.[s.lado]?.[clave];
  }

  function jugadorExpulsado(st) {
    return (st.faltas || 0) >= 5
      || ((st.tecnicas1 || 0) + (st.flagrantes || 0)) >= 2
      || (st.descalificantes || 0) > 0;
  }

  function personaExpulsada(s = app.seleccion) {
    if (!s) return false;
    if (expulsadoBanquillo(s)) return true;
    if (s.coach) return false;
    return jugadorExpulsado(stats(s.lado, s.dorsal));
  }

  function seleccionar(lado, dorsal) {
    app.seleccion = { lado, dorsal: String(dorsal) };
    pendiente = null;
    ubicacion = null;
    pintar();
  }

  function seleccionarStaff(lado, index) {
    app.seleccion = { lado, coach: true, staffIndex: Number(index) || 0 };
    pendiente = null;
    ubicacion = null;
    pintar();
  }

  async function eventoJugador(tipo, datos = {}) {
    const s = app.seleccion;
    if (!s) throw new Error("Sin jugador seleccionado.");
    pendiente = null;
    ubicacion = null;
    const deseleccionar = !s.coach && jugadorEnPista(s.lado, s.dorsal);
    const base = { lado: s.lado, datos };
    if (s.coach) {
      base.dorsal = null;
      base.jugador = nombreSel();
      base.datos = { ...datos, entrenador: true, staffIndex: s.staffIndex ?? 0 };
    } else {
      base.dorsal = s.dorsal;
    }
    const ev = await agregar(tipo, base);
    if (deseleccionar) app.seleccion = null;
    return ev;
  }

  // ---------------- pintura ----------------

  function pintar() {
    if (!app.sesion) return;
    if (asistencia) {
      const anul = new Set(app.eventos.filter((e) => e.t === "anulacion").map((e) => e.datos?.ref));
      const ult = [...app.eventos].reverse().find((e) => !["reloj", "posesion", "anulacion"].includes(e.t) && !anul.has(e.uid));
      if (!ult || ult.uid !== asistencia.tiroUid) asistencia = null;
    }
    const enPistaSel = app.seleccion && jugadorEnPista(app.seleccion.lado, app.seleccion.dorsal);
    if (app.seleccion && (!rosterTiene(app.seleccion) || (!enPistaSel && personaExpulsada(app.seleccion)))) {
      app.seleccion = null; asistencia = null; pendiente = null; ubicacion = null;
    }
    limpiar(raiz);
    raiz.classList.toggle("finalizado", app.sesion.estado === "final");
    if (app.sesion.estado === "final") {
      raiz.append(pantallaFinal());
      return;
    }
    raiz.append(
      h("div", { class: "directo" },
        h("div", { class: "directo-cab" },
          marcador(),
          controles()),
        h("div", { class: "directo-lienzo" },
          ladoPanel("izquierda"),
          centroPista(),
          ladoPanel("derecha"))),
    );
    pedirDefensaSiFalta();
  }

  // ---------------- marcador y controles ----------------

  function marcador() {
    return h("div", { class: "marcador" },
      bloqueEquipo("local"),
      h("div", { class: "reloj-central" },
        h("div", { class: "reloj-periodo" },
          h("span", { class: "pill", text: etiquetaPeriodo(app.sesion.reloj) }),
          app.sesion.estado === "descanso" ? h("span", { class: "pill aviso", text: "Descanso" }) : null),
        h("button", {
          type: "button", class: "reloj-digital " + (app.sesion.reloj.corriendo ? "corriendo" : ""),
          onclick: alternarReloj, "aria-label": app.sesion.reloj.corriendo ? "Parar reloj" : "Iniciar reloj",
        },
          h("b", { "data-reloj": "principal", text: mmss(relojActual()) }),
          h("span", { class: "reloj-sub", text: app.sesion.reloj.corriendo ? "EN MARCHA" : "PARADO" }))),
      bloqueEquipo("visitante"));
  }

  function bloqueEquipo(lado) {
    const faltas = faltasCuarto(app.proy, lado);
    // El equipo entra en situación de penalización al llegar a 4 faltas de equipo.
    const bonus = faltas >= 4;
    const tmInfo = tmTramo(lado);
    const tmQuedan = Math.max(0, tmInfo.limite - tmInfo.usados.length);
    return h("div", { class: "marcador-eq " + lado, style: estiloLado(lado) },
      h("div", { class: "meq-nombre" },
        h("span", { class: "meq-color" }),
        h("span", { text: equipo(lado).nombre })),
      h("div", { class: "meq-puntos", text: String(app.proy.pts[lado]) }),
      h("div", { class: "meq-pie" },
        h("span", { class: "meq-faltas", text: `${faltas} faltas` }),
        bonus ? h("span", { class: "pill mal", text: "BONUS" }) : null,
        h("button", {
          type: "button", class: "tm-btn", title: "Anotar tiempo muerto",
          onclick: () => anotarTiempoMuerto(lado),
        }, h("span", { text: "TM" }), h("b", { text: String(tmQuedan) }), h("span", { class: "tm-queda", text: "quedan" }))));
  }

  function esUltimoCuarto() { return app.sesion.reloj.cuarto >= 4; }

  function controles() {
    const s = app.sesion;
    return h("div", { class: "controles-grid" },
      btn("−10", () => ajustarReloj(-10), { clase: "btn pequeno control", title: "Restar 10 segundos" }),
      btn("−1", () => ajustarReloj(-1), { clase: "btn pequeno control", title: "Restar 1 segundo" }),
      btn("+1", () => ajustarReloj(1), { clase: "btn pequeno control", title: "Sumar 1 segundo" }),
      btn("+10", () => ajustarReloj(10), { clase: "btn pequeno control", title: "Sumar 10 segundos" }),
      btn(s.reloj.corriendo ? "Parar" : "Iniciar", alternarReloj, { clase: "btn pequeno control " + (s.reloj.corriendo ? "aviso" : "primario"), icon: s.reloj.corriendo ? "pausa" : "play" }),
      btn("Deshacer", async () => { const ev = await deshacer(); toast(ev ? `Anulado: ${resumenEvento(ev)}` : "No hay nada que deshacer.", ev ? "ok" : "aviso"); }, { clase: "btn pequeno control", icon: "deshacer" }),
      btn("Fin cuarto", cerrarCuarto, { clase: "btn pequeno control" }),
      btn("Siguiente", siguiente, { clase: "btn pequeno control primario", title: esUltimoCuarto() ? "Siguiente cuarto, prórroga o final" : "Siguiente cuarto" }),
      btn("Boxscore", () => navegar("boxscore"), { clase: "btn pequeno control", icon: "boxscore", title: "Ver el boxscore del partido" }),
      btn("Nota", abrirNuevaNota, { clase: "btn pequeno control", icon: "notas", title: "Crear una nota vinculada a este partido" }),
      btn("Acciones", abrirAcciones, { clase: "btn pequeno control", title: "Ver, editar o eliminar las acciones registradas" }),
      btn("Lados", cambiarLados, { clase: "btn pequeno control", icon: "cambiar", title: "Intercambiar los lados de los equipos" }));
  }

  // ---------------- centro: pista y acciones ----------------

  function centroPista() {
    return h("section", { class: "pista-central" },
      barraTiros(),
      asistencia ? tiraAsistencia() : null,
      rebote ? tiraRebote() : null,
      canchaWrap(),
      piePista(),
      accionesFila());
  }

  function barraTiros() {
    const s = app.seleccion;
    const expulsado = !!s && personaExpulsada(s);
    const habilitado = !!s && !s.coach && jugadorEnPista(s.lado, s.dorsal) && !expulsado;
    const tipos = [[3, "Triple"], [2, "2 puntos"], [1, "Tiro libre"]];
    return h("div", { class: "tiros-barra" },
      tipos.map(([n, etiqueta]) => {
        const faltaPista = n !== 1 && !ubicacion;
        const ayuda = !s
          ? "Primero elige un jugador"
          : s.coach
            ? "Un entrenador no puede tirar"
            : expulsado
              ? "Expulsado: no puede anotar más"
              : !jugadorEnPista(s.lado, s.dorsal)
                ? "El jugador debe estar en pista"
                : faltaPista
                  ? "Toca primero la pista para situar el tiro"
                  : n === 1
                    ? "Tiro libre: no hace falta tocar la pista"
                    : etiqueta;
        return h("button", {
          type: "button",
          class: "tiro-tipo t" + n + (pendiente?.tipo === n ? " sel" : ""),
          disabled: !habilitado,
          title: ayuda,
          onclick: () => prepararTiro(n),
        }, etiqueta);
      }));
  }

  function canchaWrap() {
    const lado = app.seleccion?.lado || null;
    const cancha = crearCancha({ onTiro: alTocarPista });
    const tiros = (app.proy?.tiros || []).filter((t) => (!lado || t.lado === lado) && t.Xinv != null);
    cancha.pintarTiros(tiros, {
      soloCuarto: verTodos ? null : app.sesion.reloj.cuarto,
      basketPorTiro: (t) => t.basket || basketDe(t.lado, t.cuarto),
    });
    const conTipo = pendiente && pendiente.xinv != null;
    const marca = conTipo ? pendiente : ubicacion;
    if (marca) {
      const basket = marca.basket || (app.seleccion ? basketDe(app.seleccion.lado) : "left");
      cancha.marcar(marca.xinv, marca.yinv, {
        basket,
        color: conTipo ? (pendiente.tipo === 3 ? "#7c5cff" : "#f4a31d") : "var(--acento)",
        etiqueta: conTipo ? (pendiente.tipo === 1 ? "TL" : `${pendiente.tipo}PT`) : "",
      });
    }
    return h("div", { class: "cancha-wrap" }, cancha.el, pendiente ? tarjetaTiroFlotante() : null);
  }

  function piePista() {
    const s = app.seleccion;
    const staffSel = s?.coach ? staffDe(s.lado)[s.staffIndex ?? 0] : null;
    const nombreChip = s ? nombreCorto(s.coach ? nombreSel() : nombreJugador(nombreSel(), s.dorsal)) : "";
    const chip = s
      ? h("span", { class: "pie-sel", style: estiloLado(s.lado) },
        h("b", { text: s.coach ? (staffSel?.rol === "Entrenador principal" ? "ENT" : "TEC") : `#${s.dorsal}` }),
        nombreChip ? h("span", { text: nombreChip }) : null,
        h("button", { type: "button", class: "btn fantasma mini", "aria-label": "Quitar selección", title: "Quitar selección", onclick: () => { app.seleccion = null; pendiente = null; ubicacion = null; pintar(); } }, "✕"))
      : null;
    const pistaPendiente = s && !s.coach && jugadorEnPista(s.lado, s.dorsal) && !personaExpulsada(s) && !ubicacion && !pendiente
      ? h("span", { class: "pie-hint", text: "Toca la pista para tirar de 2/3" })
      : null;
    return h("div", { class: "pista-pie" },
      chip,
      pistaPendiente,
      h("div", { class: "leyenda" },
        h("span", { class: "punto acierto" }), "Anotado",
        h("span", { class: "punto fallo" }), "Fallado"),
      h("button", { type: "button", class: "btn pequeno fantasma", onclick: () => { verTodos = !verTodos; pintar(); } }, verTodos ? "Solo este cuarto" : "Todo el partido"));
  }

  function tarjetaTiroFlotante() {
    const p = pendiente;
    const tipo = p.tl ? (serieTL ? `Tiro libre ${serieTL.hechos + 1} de ${serieTL.total}` : "Tiro libre") : p.tipo === 3 ? "Triple" : "2 puntos";
    const dorsal = app.seleccion?.dorsal ?? "";
    const nombre = nombreJugador(nombreSel(), dorsal);
    const etiqueta = nombre ? `#${dorsal} ${nombreCorto(nombre)}` : `#${dorsal}`;
    return h("div", { class: "tarjeta-tiro-flotante" },
      h("div", { class: "ttf-cab" },
        h("b", { text: tipo }),
        h("span", { class: "sub", text: etiqueta })),
      h("p", { class: "sub" },
        p.tl
          ? "Tiro libre: no hace falta marcar coordenadas."
          : p.xinv != null
            ? `Tiro situado (${p.xinv.toFixed(1)} m · ${p.yinv.toFixed(1)} m).`
            : "Toca la pista para situar el tiro o confirma sin posición."),
      h("div", { class: "ttf-acciones" },
        h("button", { type: "button", class: "btn anota", onclick: () => registrarTiro("acierto") }, "ANOTA"),
        h("button", { type: "button", class: "btn falla", onclick: () => registrarTiro("fallo") }, "FALLA"),
        h("button", { type: "button", class: "btn fantasma", onclick: () => { pendiente = null; ubicacion = null; serieTL = null; pintar(); } }, serieTL ? "Dejar la serie" : "Cancelar")));
  }

  // Tras un tiro fallado (o el último tiro libre fallado) se pregunta quién se lleva el rebote.
  function tiraRebote() {
    const grupo = (lado) => {
      const enPista = app.proy?.oncourt[lado] || [];
      return h("div", { class: "rebote-eq", style: estiloLado(lado) },
        h("b", { text: equipo(lado).nombre }),
        enPista.map((d) => {
          const j = jugadores(lado).find((x) => x.dorsal === String(d));
          const nombre = nombreJugador(j?.nombre, d);
          return h("button", { type: "button", class: "chip-asistencia", onclick: () => elegirRebote(lado, d) }, nombre ? `#${d} ${nombreCorto(nombre)}` : `#${d}`);
        }),
        h("button", { type: "button", class: "chip-asistencia", onclick: () => elegirRebote(lado, null) }, "Equipo"));
    };
    return h("div", { class: "tira-asistencia tira-rebote" },
      h("div", { class: "tt-cab" }, h("b", { text: "¿Rebote?" }), h("span", { class: "sub", text: "Toca quién lo coge, «Equipo» si no hay un jugador claro, o «Nadie» si sale fuera" })),
      grupo(rebote.ladoTirador), grupo(otroLado(rebote.ladoTirador)),
      h("button", { type: "button", class: "btn fantasma", onclick: () => { rebote = null; pintar(); } }, "Nadie"));
  }

  async function elegirRebote(lado, dorsal) {
    const r = rebote;
    rebote = null;
    if (!r) return;
    const tipo = lado === r.ladoTirador ? "of" : "def";
    await lote(async () => {
      await agregar("rebote", { lado, dorsal: dorsal == null ? undefined : String(dorsal), datos: { tipo, equipo: dorsal == null } });
      if (tipo === "def") await cambiarAtaque(lado);
    });
    pintar();
  }

  function tiraAsistencia() {
    const lado = asistencia.lado;
    const tiro = app.proy?.tiros.find((t) => t.uid === asistencia.tiroUid);
    const enPista = (app.proy?.oncourt[lado] || []).filter((d) => String(d) !== String(tiro?.dorsal));
    return h("div", { class: "tira-asistencia" },
      h("div", { class: "tt-cab" }, h("b", { text: "¿Asistencia?" }), h("span", { class: "sub", text: "Toca el pasador o «No»" })),
      h("div", { class: "chips-asistencia" },
        enPista.map((d) => {
          const j = jugadores(lado).find((x) => x.dorsal === String(d));
          const nombre = nombreJugador(j?.nombre, d);
          return h("button", { type: "button", class: "chip-asistencia", onclick: () => darAsistencia(lado, d) }, nombre ? `#${d} ${nombreCorto(nombre)}` : `#${d}`);
        }),
        h("button", { type: "button", class: "btn fantasma", onclick: () => { asistencia = null; pintar(); } }, "No")));
  }

  function accionesFila() {
    const s = app.seleccion;
    const habilitado = !!s;
    const expulsado = personaExpulsada(s);
    const color = s ? colorLado(s.lado) : "var(--acento)";
    return h("div", { class: "acciones-fila", style: `--eq-color:${color}` },
      ACCIONES.map(([sigla, corto, largo, adaptador]) => h("button", {
        type: "button",
        class: "accion-mini",
        disabled: !habilitado || expulsado,
        title: largo,
        onclick: () => {
          const sel = app.seleccion;
          if (!sel) { toast("Primero toca un jugador.", "aviso"); return; }
          if (personaExpulsada(sel)) {
            toast("Está expulsado: no se le pueden asignar más acciones.", "aviso");
            return;
          }
          adaptador((accion, sub) => {
            if (accion === "rebote") return accionRebote(sub);
            if (accion === "asistencia") return accionAsistencia();
            if (accion === "robo") return accionRobo();
            if (accion === "perdida") return accionPerdida();
            if (accion === "tapon") return accionSimple("tapon", "Tapón");
            if (accion === "falta_recibida") return accionSimple("falta", "Falta recibida", { clase: "recibida", tipo: null });
          });
        },
      },
        h("b", { text: sigla }),
        h("span", { class: "am-lbl", text: corto }))),
      h("button", {
        type: "button", class: "accion-mini falta-btn",
        disabled: !habilitado || expulsado,
        title: "Registrar falta: personal, técnica Cat. 1/2, disruptiva, flagrante o descalificante.",
        onclick: abrirFalta,
      },
        h("b", { text: "Falta" }),
        h("span", { class: "am-lbl", text: "P · T · DI · FL · D" })));
  }

  // ---------------- laterales: jugadores y banquillo ----------------

  function ladoPanel(zona) {
    const defensa = equipoDefensor(app.sesion.reloj.cuarto);
    const lado = zona === "izquierda" ? defensa : otroLado(defensa);
    const on = app.proy?.oncourt[lado] || [];
    return h("aside", { class: "equipo-lado " + zona + " " + lado, style: estiloLado(lado) },
      h("div", { class: "el-cab" },
        h("div", { class: "el-nombre" }, h("span", { class: "el-color" }), h("b", { text: equipo(lado).nombre }))),
      h("div", { class: "el-jugadores" }, on.map((d) => jugadorPista(lado, d))),
      banquillo(lado),
      cuerpoTecnico(lado));
  }

  function jugadorPista(lado, dorsal) {
    const j = jugadores(lado).find((x) => x.dorsal === String(dorsal));
    const st = stats(lado, dorsal);
    const sel = app.seleccion?.lado === lado && !app.seleccion.coach && String(app.seleccion?.dorsal) === String(dorsal);
    const exp = jugadorExpulsado(st);
    const etiqueta = etiquetaJugador(j?.nombre, dorsal);
    return h("button", {
      type: "button",
      class: "jug-pista" + (sel ? " sel" : "") + (exp ? " exp" : ""),
      title: exp ? `${etiqueta} · expulsado, toca para sustituir` : etiqueta,
      "aria-label": `${etiqueta}${exp ? ", expulsado" : ""}`,
      onclick: () => seleccionar(lado, dorsal),
    },
      h("span", { class: "jp-dorsal", text: String(dorsal) }),
      h("span", { class: "jp-puntos", text: String(st.puntos) }),
      h("span", { class: "jp-faltas" + (exp ? " exp" : ""), text: String(st.faltas) }));
  }

  function banquillo(lado) {
    const enPista = new Set((app.proy?.oncourt[lado] || []).map(String));
    const banco = jugadores(lado).filter((j) => !enPista.has(String(j.dorsal)));
    const hayTitularSel = app.seleccion?.lado === lado && !app.seleccion.coach && jugadorEnPista(lado, app.seleccion.dorsal);
    return h("div", { class: "suplentes" },
      pistaIncompleta(lado),
      h("div", { class: "sup-cab" },
        h("h4", { text: "Suplentes" }),
        h("span", { class: "sub", text: hayTitularSel ? "Toca uno para cambiar" : "Toca uno para acciones" })),
      h("div", { class: "sup-herr" },
        h("button", { type: "button", class: "btn pequeno", title: "Varios cambios a la vez", onclick: () => abrirCambios(lado) }, "Cambios"),
        h("button", { type: "button", class: "btn pequeno fantasma", title: "Añadir un jugador que no está en la lista", onclick: () => abrirNuevoJugador(lado) }, "+ Jugador")),
      banco.length
        ? banco.map((j) => bancoBoton(lado, j))
        : h("p", { class: "sub", text: "Todos en pista." }));
  }

  function cuerpoTecnico(lado) {
    const staff = staffDe(lado);
    if (!staff.length) return null;
    return h("div", { class: "cuerpo-tecnico" },
      h("div", { class: "sup-cab" }, h("h4", { text: "Cuerpo técnico" })),
      staff.map((st, i) => {
        const principal = st.rol === "Entrenador principal";
        const exp = !!app.proy?.expulsadosBanquillo?.[lado]?.[`staff:${i}`];
        const sel = !exp && app.seleccion?.coach && app.seleccion.lado === lado && (app.seleccion.staffIndex ?? 0) === i;
        return h("button", {
          type: "button",
          class: "jug-banco coach" + (sel ? " sel" : "") + (exp ? " exp" : ""),
          disabled: exp,
          title: exp ? `${st.nombre} · expulsado` : `${st.nombre} · ${st.rol}`,
          "aria-label": `${st.nombre}, ${st.rol}${exp ? ", expulsado" : ""}`,
          onclick: () => seleccionarStaff(lado, i),
        },
          h("span", { class: "jb-dorsal", text: principal ? "ENT" : "TEC" }),
          h("span", { class: "jb-nombre", text: st.nombre }),
          h("span", { class: "jb-datos", text: principal ? "Principal" : "Técnico" }));
      }));
  }

  function bancoBoton(lado, j) {
    const st = stats(lado, j.dorsal);
    const expPersonal = jugadorExpulsado(st);
    const expB = !!app.proy?.expulsadosBanquillo?.[lado]?.[`jugador:${j.dorsal}`];
    const exp = expPersonal || expB;
    const sel = !exp && app.seleccion?.lado === lado && !app.seleccion.coach && String(app.seleccion?.dorsal) === String(j.dorsal);
    const etiqueta = etiquetaJugador(j.nombre, j.dorsal);
    return h("button", {
      type: "button",
      class: "jug-banco" + (sel ? " sel" : "") + (exp ? " exp" : ""),
      disabled: exp,
      title: exp ? `${etiqueta} · expulsado, no puede volver a entrar` : `${etiqueta} · tocar para seleccionar o cambiar`,
      "aria-label": `${etiqueta}${exp ? ", expulsado" : ""}`,
      onclick: () => tocarBanco(lado, j.dorsal),
    },
      h("span", { class: "jb-dorsal", text: String(j.dorsal) }),
      h("span", { class: "jb-datos" }, h("b", { text: String(st.puntos) }), h("i", { text: String(st.faltas) })));
  }

  // Control de pista: deben estar 5 jugadores de cada equipo.
  function pistaIncompleta(lado) {
    const n = (app.proy?.oncourt[lado] || []).length;
    if (n === 5) return null;
    return h("div", { class: "aviso-pista", role: "alert" },
      h("span", { text: `Hay ${n} en pista: deben ser 5.` }),
      h("button", { type: "button", class: "btn pequeno primario", onclick: () => abrirCambios(lado) }, "Completar"));
  }

  // Varios cambios a la vez: se marca quién sale y quién entra y se registran juntos (un solo «Deshacer»).
  function abrirCambios(lado) {
    const enPista = (app.proy?.oncourt[lado] || []).map(String);
    const banco = jugadores(lado).filter((j) => !enPista.includes(String(j.dorsal)));
    const salen = new Set(), entran = new Set();
    const cuerpo = h("div", { class: "cambios-dialogo" });
    const excluido = (j) => jugadorExpulsado(stats(lado, j.dorsal)) || !!app.proy?.expulsadosBanquillo?.[lado]?.[`jugador:${j.dorsal}`];
    const pintarCambios = () => {
      limpiar(cuerpo);
      const quedan = enPista.length - salen.size + entran.size;
      const valido = entran.size > 0 && quedan === 5;
      const col = (titulo, lista, set, bloquea) => h("div", { class: "cambios-col" }, h("h4", { text: titulo }),
        lista.map((j) => h("button", {
          type: "button", class: "jug-banco" + (set.has(String(j.dorsal)) ? " sel" : ""), disabled: bloquea?.(j) ? true : null,
          onclick: () => { const k = String(j.dorsal); if (set.has(k)) set.delete(k); else set.add(k); pintarCambios(); },
        }, h("span", { class: "jb-dorsal", text: String(j.dorsal) }), h("span", { class: "jb-nombre", text: nombreCorto(nombreJugador(j.nombre, j.dorsal)) }),
          h("span", { class: "jb-datos" }, h("i", { text: `${stats(lado, j.dorsal).faltas} F` })))));
      cuerpo.append(
        h("div", { class: "cambios-cols" },
          col("Sale (en pista)", enPista.map((d) => jugadores(lado).find((j) => j.dorsal === d)).filter(Boolean), salen),
          col("Entra (banquillo)", banco, entran, excluido)),
        h("p", { class: "sub", text: valido ? `Quedarán 5 en pista.` : `Quedarían ${quedan} en pista: deben ser 5.` }),
        h("div", { class: "acciones" },
          btn("Cancelar", () => dlg.close(), { clase: "btn" }),
          btn(`Hacer ${entran.size} cambio${entran.size === 1 ? "" : "s"}`, async () => {
            if (!valido) return;
            const sa = [...salen], en = [...entran];
            dlg.close();
            await lote(async () => {
              for (let i = 0; i < en.length; i++) await agregar("sustitucion", { lado, dorsal: sa[i] ?? undefined, datos: { sale: sa[i] ?? null, entra: en[i] } });
            });
            asistencia = null; pendiente = null; ubicacion = null; app.seleccion = null;
            toast(`${en.length} cambio${en.length === 1 ? "" : "s"} en ${equipo(lado).nombre}. «Deshacer» los anula.`, "ok");
            pintar();
          }, { clase: "btn primario", disabled: valido ? null : true })));
    };
    const dlg = dialogo(`Cambios · ${equipo(lado).nombre}`, cuerpo, { ancho: "ancho" });
    pintarCambios();
  }

  function abrirNuevoJugador(lado) {
    const dorsal = h("input", { type: "text", inputmode: "numeric", maxlength: 3, placeholder: "Dorsal", "aria-label": "Dorsal" });
    const nombre = h("input", { type: "text", placeholder: "Nombre (opcional)", "aria-label": "Nombre" });
    const msg = h("p", { class: "sub" });
    const guardar = async () => {
      try { await anadirJugador(lado, dorsal.value, nombre.value); dlg.close(); toast(`Añadido #${dorsal.value.trim()} a ${equipo(lado).nombre}.`, "ok"); pintar(); }
      catch (e) { msg.textContent = e.message; }
    };
    const dlg = dialogo(`Nuevo jugador · ${equipo(lado).nombre}`, h("div", { class: "nuevo-jugador" },
      h("label", { class: "nota-campo" }, h("span", { text: "Dorsal" }), dorsal),
      h("label", { class: "nota-campo" }, h("span", { text: "Nombre" }), nombre), msg,
      h("div", { class: "acciones" }, btn("Cancelar", () => dlg.close(), { clase: "btn" }), btn("Añadir", guardar, { clase: "btn primario" }))));
    setTimeout(() => dorsal.focus(), 60);
  }

  async function tocarBanco(lado, dorsal) {
    const s = app.seleccion;
    if (s && s.lado === lado && !s.coach && jugadorEnPista(lado, s.dorsal) && String(s.dorsal) !== String(dorsal)) {
      await sustituir(lado, dorsal);
      return;
    }
    seleccionar(lado, dorsal);
  }

  // ---------------- acciones registradas ----------------

  function accionesRegistradas(abierta = false) {
    const lista = accionesVisibles();
    const visibles = abierta ? lista : lista.slice(0, 14);
    return h("details", { class: "acciones-registradas", open: abierta ? true : null },
      h("summary", null,
        h("span", { text: "Acciones registradas" }),
        h("span", { class: "pill", text: `${lista.length}` })),
      lista.length
        ? h("ol", { class: "lista-acciones editable" }, visibles.map(filaAccion))
        : h("p", { class: "sub", text: "Todavía no hay acciones." }));
  }

  function accionesVisibles() {
    const anul = new Set(app.eventos.filter((e) => e.t === "anulacion").map((e) => e.datos?.ref));
    return [...app.eventos].reverse().filter((e) => !IGNORAR_EN_ACCIONES.has(e.t) && !anul.has(e.uid));
  }

  function abrirAcciones() {
    const lista = accionesVisibles();
    dialogo("Acciones registradas", h("div", { class: "acciones-dialogo" },
      h("p", { class: "sub", text: `${lista.length} ${lista.length === 1 ? "acción" : "acciones"}. Puedes corregir o eliminar cada una.` }),
      lista.length
        ? h("ol", { class: "lista-acciones editable" }, lista.map(filaAccion))
        : h("p", { class: "sub", text: "Todavía no hay acciones." })));
  }

  function filaAccion(e) {
    return h("li", { class: e.t },
      h("span", { class: "la-reloj", text: `${etiquetaPeriodo(e)} ${mmss(e.reloj || 0)}` }),
      h("span", { class: "la-txt", text: resumenEvento(e) }),
      h("span", { class: "la-botones" },
        h("button", { type: "button", class: "btn fantasma mini", title: "Editar acción", "aria-label": "Editar acción", onclick: () => abrirEditorEvento(e) }, "✎"),
        h("button", { type: "button", class: "btn fantasma mini peligro-txt", title: "Eliminar acción", "aria-label": "Eliminar acción", onclick: () => borrarEvento(e) }, "✕")));
  }

  function resumenEvento(e) {
    const quien = e.jugador || e.equipo || "Equipo";
    const d = e.datos || {};
    switch (e.t) {
      case "tiro": return `${quien} · ${d.tl ? "TL" : `${d.puntos}PT`} ${d.resultado === "acierto" ? "anotado" : "fallado"}`;
      case "rebote": return `${quien} · rebote ${d.tipo === "of" ? "ofensivo" : "defensivo"}`;
      case "asistencia": return `${quien} · asistencia`;
      case "robo": return `${quien} · robo`;
      case "perdida": return `${quien} · pérdida`;
      case "tapon": return `${quien} · tapón`;
      case "disruptiva": return `${quien} · disruptiva`;
      case "falta": {
        const nombre = { P: "personal", T1: "técnica Cat. 1", T2: "técnica Cat. 2", DI: "disruptiva", FL: "flagrante", D: "descalificante" }[d.tipo]
          || (d.flagrante ? "flagrante" : d.clase === "recibida" ? "recibida" : "personal");
        return `${quien} · falta ${nombre}`;
      }
      case "falta_banquillo": {
        const nombre = { C: "técnica del entrenador principal", B: "técnica del banquillo", BD: "técnica de acompañante", B2: "descalificante del banquillo", D: "descalificante" }[d.tipo] || "falta de banquillo";
        const extra = d.tipo === "D" && d.tecnicaEntrenador ? ` · técnica ${d.tecnicaEntrenador} al entrenador` : "";
        return `${quien} · ${nombre}${extra}`;
      }
      case "tiempo_muerto": return `Tiempo muerto · ${quien}`;
      case "sustitucion": return `Cambio en ${e.equipo}: sale #${d.sale}, entra #${d.entra}`;
      case "jugada": return `Jugada: ${d.titulo || ""}`;
      case "nota": return `Nota: ${d.texto || ""}`;
      default: return "";
    }
  }

  // ---------------- final ----------------

  function pantallaFinal() {
    const p = app.proy;
    const s = app.sesion;
    const info = [s.competicion, s.grupo, jornadaTexto(s.jornada), s.fecha ? s.fecha.slice(0, 10) : ""].filter(Boolean).join(" · ");
    return h("section", { class: "final-partido" },
      h("div", { class: "final-cab" },
        h("div", null, h("h1", { text: "Partido finalizado" }), info ? h("p", { class: "sub", text: info }) : null),
        h("span", { class: "pill", text: "Final" })),
      h("div", { class: "final-marcador" },
        h("div", { class: "fm-eq", style: estiloLado("local") },
          h("span", { text: s.local.nombre }), h("b", { text: String(p.pts.local) })),
        h("span", { class: "fm-guion", text: "–" }),
        h("div", { class: "fm-eq der", style: estiloLado("visitante") },
          h("b", { text: String(p.pts.visitante) }), h("span", { text: s.visitante.nombre }))),
      h("div", { class: "acciones centradas" },
        btn("Boxscore", () => navegar("boxscore"), { clase: "btn pequeno", icon: "boxscore" }),
        btn("Volver al inicio", () => navegar("inicio"), { clase: "btn pequeno", icon: "inicio" })),
      accionesRegistradas(true));
  }

  // ---------------- flujo de acciones ----------------

  function prepararTiro(tipo) {
    const s = app.seleccion;
    if (!s) return;
    if (s.coach || !jugadorEnPista(s.lado, s.dorsal)) {
      toast("Los tiros solo se pueden anotar para un jugador en pista.", "aviso");
      return;
    }
    if (personaExpulsada(s)) {
      toast("Ese jugador está expulsado: haz el cambio antes de anotar más.", "aviso");
      return;
    }
    if (tipo !== 1 && !ubicacion) {
      toast("Toca primero la pista para situar el tiro de 2 o 3 puntos.", "aviso");
      return;
    }
    asistencia = null;
    const u = tipo === 1 ? null : ubicacion;
    pendiente = {
      tipo, tl: tipo === 1,
      xinv: u?.xinv ?? null, yinv: u?.yinv ?? null,
      basket: u?.basket || basketDe(s.lado),
    };
    if (tipo === 1) ubicacion = null;
    pintar();
  }

  function alTocarPista(p) {
    const s = app.seleccion;
    if (!s) { toast("Primero toca un jugador.", "aviso"); return; }
    if (s.coach || !jugadorEnPista(s.lado, s.dorsal)) {
      toast("Elige un jugador en pista.", "aviso"); return;
    }
    if (personaExpulsada(s)) { toast("Ese jugador está expulsado: no puede anotar más.", "aviso"); return; }
    if (pendiente?.tl) { toast("El tiro libre no se sitúa en la pista.", "aviso"); return; }
    const basket = basketDe(s.lado);
    const mitad = C.L / 2;
    if (basket === "left" && p.x > mitad) {
      toast(`Toca en la mitad izquierda: es la que ataca ${equipo(s.lado).nombre}.`, "aviso");
      return;
    }
    if (basket === "right" && p.x < mitad) {
      toast(`Toca en la mitad derecha: es la que ataca ${equipo(s.lado).nombre}.`, "aviso");
      return;
    }
    const xinv = basket === "right" ? C.L - p.x : p.x;
    const yinv = basket === "right" ? C.W - p.y : p.y;
    ubicacion = { xinv, yinv, basket };
    if (pendiente) pendiente = { ...pendiente, xinv, yinv, basket };
    pintar();
  }

  const registrarTiro = (resultado) => lote(() => registrarTiroInterno(resultado));
  async function registrarTiroInterno(resultado) {
    const s = app.seleccion;
    const p = pendiente;
    if (!s || !p) return;
    if (s.coach || !jugadorEnPista(s.lado, s.dorsal)) {
      toast("Selecciona un jugador en pista.", "aviso"); return;
    }
    if (personaExpulsada(s)) { toast("Ese jugador está expulsado: no puede anotar más.", "aviso"); return; }
    const xinv = p.xinv, yinv = p.yinv;
    // X/Y son la posición real en pista; Xinv/Yinv, la misma plegada a media pista. Depende del aro atacado (cambia en el descanso), no del equipo.
    const derecha = (p.basket || basketDe(s.lado)) === "right";
    const X = xinv == null ? null : (derecha ? 28 - xinv : xinv);
    const Y = yinv == null ? null : (derecha ? 15 - yinv : yinv);
    const tipo = p.tipo;
    if (xinv != null && (tipo === 2 || tipo === 3) && puntosDeTiro(xinv, yinv) !== tipo) {
      const real = puntosDeTiro(xinv, yinv);
      const sigue = await confirmar("¿Seguro que es de " + tipo + "?", `El punto tocado está ${real === 3 ? "fuera" : "dentro"} de la línea de 3 puntos: sería un tiro de ${real}.`, { ok: `Registrar de ${tipo}`, });
      if (!sigue) return;
    }
    pendiente = null;
    ubicacion = null;
    const ev = await agregar("tiro", {
      lado: s.lado, dorsal: s.dorsal,
      datos: {
        puntos: tipo, resultado, X, Y, Xinv: xinv, Yinv: yinv,
        tl: tipo === 1, mate: false, basket: p.basket || basketDe(s.lado),
        tiempoRestante: Math.round(relojActual()),
      },
    });
    // En una serie de tiros libres el tirador sigue seleccionado; con 2/3 puntos se libera como siempre.
    if (!s.coach && tipo !== 1) app.seleccion = null;
    if (resultado === "acierto" && tipo !== 1) asistencia = { lado: s.lado, tiroUid: ev.uid };
    else asistencia = null;
    if (resultado === "acierto" && tipo !== 1) await cambiarAtaque(otroLado(s.lado));
    if (resultado === "fallo" && tipo !== 1) rebote = { ladoTirador: s.lado, tiroUid: ev.uid };
    if (tipo === 1 && serieTL && serieTL.lado === s.lado && String(serieTL.dorsal) === String(s.dorsal)) {
      serieTL.hechos += 1;
      if (serieTL.hechos < serieTL.total) pendiente = nuevoPendienteTL(s.lado);
      else {
        serieTL = null;
        if (resultado === "acierto") await cambiarAtaque(otroLado(s.lado)); // el último tiro libre anotado cede la posesión
        else rebote = { ladoTirador: s.lado, tiroUid: ev.uid };
      }
    }
    pintar();
  }

  async function darAsistencia(lado, dorsal) {
    if (!asistencia) return;
    const tiroUid = asistencia.tiroUid;
    asistencia = null;
    await agregar("asistencia", { lado, dorsal, datos: { tiroUid } });
    pintar();
  }

  const accionRebote = (tipo) => lote(() => accionReboteInterno(tipo));
  async function accionReboteInterno(tipo) {
    const s = app.seleccion;
    if (!s) return;
    asistencia = null;
    await eventoJugador("rebote", { tipo });
    if (tipo === "def") await cambiarAtaque(s.lado);
    pintar();
  }

  const accionRobo = () => lote(() => accionRoboInterno());
  async function accionRoboInterno() {
    const s = app.seleccion;
    if (!s) return;
    asistencia = null;
    await eventoJugador("robo");
    await agregar("perdida", { lado: otroLado(s.lado), datos: { equipo: true, causa: "robo" } });
    await cambiarAtaque(s.lado);
    pintar();
  }

  const accionPerdida = () => lote(() => accionPerdidaInterno());
  async function accionPerdidaInterno() {
    const s = app.seleccion;
    if (!s) return;
    asistencia = null;
    await eventoJugador("perdida");
    await cambiarAtaque(otroLado(s.lado));
    pintar();
  }

  const FALTA_BTN_INFO = {
    P: { nombre: "Personal", detalle: "Según tiro o bonus · suma 1 falta · no GD" },
    T1: { nombre: "Técnica Cat. 1", detalle: "1 TL + posesión · suma 1 falta · GD: 2 T1" },
    T2: { nombre: "Técnica Cat. 2", detalle: "1 TL + posesión · suma 1 falta · no GD" },
    DI: { nombre: "Disruptiva", detalle: "2 TL + pista delantera · suma 1 falta · no GD" },
    FL: { nombre: "Flagrante", detalle: "2 TL + posesión · suma 1 falta · GD: 2 FL o T1+FL" },
    D: { nombre: "Descalificante", detalle: "2 TL + posesión · expulsión inmediata" },
    C: { nombre: "Técnica principal", detalle: "1 TL + posesión · Cat. 1 · límite 2 C o 3 C+B+BD" },
    B: { nombre: "Técnica banquillo", detalle: "1 TL + posesión · Cat. 1 · límite 3 C+B+BD" },
    BD: { nombre: "Técnica acompañante", detalle: "1 TL + posesión · Cat. 1 · límite 3 C+B+BD" },
  };

  function opcionesFalta(s, enPista) {
    if (enPista) {
      return [
        ["P", "P · Falta personal"],
        ["T1", "T1 · Técnica Cat. 1"],
        ["T2", "T2 · Técnica Cat. 2"],
        ["DI", "DI · Disruptiva"],
        ["FL", "FL · Flagrante"],
        ["D", "D · Descalificante"],
      ];
    }
    if (s.coach) {
      const principal = staffDe(s.lado)[s.staffIndex ?? 0]?.rol === "Entrenador principal";
      return principal
        ? [["C", "C · Técnica del entrenador principal"], ["D", "D · Descalificante"]]
        : [["B", "B · Técnica del banquillo"], ["BD", "BD · Técnica de acompañante"], ["D", "D · Descalificante"]];
    }
    return [["B", "B · Técnica del banquillo"], ["D", "D · Descalificante"]];
  }

  function estadoFalta(s, enPista, codigo) {
    if (enPista) {
      const st = stats(s.lado, s.dorsal);
      const f = st.faltas || 0, t1a = st.tecnicas1 || 0, t2a = st.tecnicas2 || 0, dia = st.disruptivas || 0, fla = st.flagrantes || 0, da = st.descalificantes || 0;
      const total = f + 1;
      const t1 = t1a + (codigo === "T1" ? 1 : 0);
      const fl = fla + (codigo === "FL" ? 1 : 0);
      const d = da + (codigo === "D" ? 1 : 0);
      const gd = t1 + fl;
      const expulsa = d > 0 || total >= 5 || gd >= 2;
      return {
        actual: `Faltas: ${f}/5 · T1: ${t1a} · T2: ${t2a} · DI: ${dia} · FL: ${fla} · GD: ${t1a + fla}/2`,
        aviso: expulsa
          ? (d > 0 ? "Con esta falta queda expulsado inmediatamente." : total >= 5 ? "Con esta falta llega a 5 faltas: queda expulsado." : "Con esta falta alcanza 2 T1/FL: queda expulsado.")
          : "Con esta falta no queda expulsado por acumulación.",
        expulsa,
      };
    }
    const bq = app.proy?.banquillo?.[s.lado] || { c: 0, b: 0, bd: 0, d: 0 };
    const esPrincipal = !!s.coach && staffDe(s.lado)[s.staffIndex ?? 0]?.rol === "Entrenador principal";
    const cargaTecnica = codigo === "D" && !enPista && !esPrincipal;
    const c = bq.c + (codigo === "C" ? 1 : 0);
    const b = bq.b + (codigo === "B" || cargaTecnica ? 1 : 0);
    const bd = bq.bd + (codigo === "BD" ? 1 : 0);
    const expPrincipal = c >= 2 || c + b + bd >= 3;
    const expMiembro = codigo === "D";
    let aviso;
    if (expMiembro && cargaTecnica) {
      aviso = "Expulsión inmediata del miembro y técnica B al entrenador principal." + (expPrincipal && !esPrincipal ? " El entrenador principal también alcanza el límite." : "");
    } else if (expMiembro) {
      aviso = "Expulsión inmediata.";
    } else if (expPrincipal) {
      aviso = "Con esta falta queda expulsado el entrenador principal.";
    } else {
      aviso = "No se alcanza el límite de expulsión del entrenador.";
    }
    return {
      actual: `C: ${bq.c}/2 · C+B+BD: ${bq.c + bq.b + bq.bd}/3`,
      aviso,
      expulsa: expMiembro || expPrincipal,
    };
  }

  function abrirFalta() {
    const s = app.seleccion;
    if (!s) return;
    if (personaExpulsada(s)) {
      toast("Está expulsado: no se le pueden asignar más acciones.", "aviso");
      return;
    }
    const enPista = jugadorEnPista(s.lado, s.dorsal);
    const opciones = opcionesFalta(s, enPista);
    const staff = s.coach ? staffDe(s.lado)[s.staffIndex ?? 0] : null;
    const principal = !!s.coach && staff?.rol === "Entrenador principal";
    const etiqueta = etiquetaJugador(nombreSel(), s.dorsal);
    const contexto = s.coach
      ? `${nombreSel()} (${staff?.rol || "cuerpo técnico"})`
      : enPista
        ? etiqueta
        : `${etiqueta} (banquillo)`;
    const actual = estadoFalta(s, enPista, opciones[0][0]).actual;
    const d = dialogo("Falta", h("div", { class: "falta-dialogo" },
      h("p", { class: "sub", text: contexto }),
      h("p", { class: "falta-estado", text: actual }),
      h("div", { class: "falta-botones" },
        opciones.map(([codigo]) => {
          const info = FALTA_BTN_INFO[codigo] || { nombre: codigo, detalle: "" };
          const detalle = codigo === "D" && !enPista && !principal
            ? "2 TL + posesión · expulsa al miembro y carga técnica B al entrenador"
            : info.detalle;
          const estado = estadoFalta(s, enPista, codigo);
          return h("button", {
            type: "button",
            class: "falta-opcion" + (estado.expulsa ? " peligro" : ""),
            title: detalle,
            onclick: async () => {
              await aplicarFalta(s, enPista, codigo);
              d.close();
            },
          },
            h("span", { class: "fo-codigo", text: codigo }),
            h("span", { class: "fo-nombre", text: info.nombre }),
            h("span", { class: "fo-detalle", text: detalle }),
            estado.expulsa ? h("span", { class: "fo-aviso", text: "EXPULSA" }) : null);
        })),
      h("div", { class: "acciones" }, btn("Cancelar", () => d.close(), { clase: "btn" }))));
  }

  const nuevoPendienteTL = (lado) => ({ tipo: 1, tl: true, xinv: null, yinv: null, basket: basketDe(lado) });

  // Tiros libres que suele dar cada falta (art. 34-39 y 42): técnicas 1; disruptiva, flagrante y descalificante 2; personal 2 si hay bonus.
  function abrirTiroslibres(ladoFalta, codigo) {
    const rival = otroLado(ladoFalta);
    const bonus = faltasCuarto(app.proy, ladoFalta) >= 5;
    const sugerido = codigo === "P" ? (bonus ? 2 : 0) : ["DI", "FL", "D"].includes(codigo) ? 2 : 1;
    const nota = codigo === "P"
      ? (bonus ? "El equipo está en bonus: 2 tiros libres si no era acción de tiro." : "Sin bonus: saque, salvo que fuera una acción de tiro (2 o 3 tiros libres; solo 1 si el tiro entró).")
      : "Los tiros libres de esta falta se lanzan de inmediato.";
    const d = dialogo("Tiros libres", h("div", { class: "tl-dialogo" },
      h("p", { class: "sub", text: `Falta ${codigo} de ${equipo(ladoFalta).nombre}. ¿Cuántos tiros libres lanza ${equipo(rival).nombre}?` }),
      h("p", { class: "sub", text: nota }),
      h("div", { class: "tl-opciones" }, [0, 1, 2, 3].map((n) => h("button", {
        type: "button", class: "btn " + (n === sugerido ? "primario" : ""),
        onclick: () => { d.close(); if (n > 0) elegirTirador(rival, n, codigo); },
      }, n === 0 ? "Sin tiros" : `${n} TL`)))));
  }

  function elegirTirador(rival, n, codigo) {
    const enPista = (app.proy?.oncourt[rival] || []).filter((dd) => !jugadorExpulsado(stats(rival, dd)));
    const d = dialogo("¿Quién tira?", h("div", { class: "tl-dialogo" },
      h("p", { class: "sub", text: `${n} tiro${n > 1 ? "s" : ""} libre${n > 1 ? "s" : ""} para ${equipo(rival).nombre}. Elige al que los lanza (quien recibió la falta).` }),
      h("div", { class: "chips-asistencia" }, enPista.map((dd) => {
        const j = jugadores(rival).find((x) => x.dorsal === String(dd));
        const nombre = nombreJugador(j?.nombre, dd);
        return h("button", { type: "button", class: "chip-asistencia", onclick: () => { d.close(); empezarSerie(rival, String(dd), n, codigo); } }, nombre ? `#${dd} ${nombreCorto(nombre)}` : `#${dd}`);
      })),
      h("div", { class: "acciones" }, btn("Cancelar", () => d.close(), { clase: "btn" }))));
  }

  async function empezarSerie(lado, dorsal, total, codigo) {
    // Si la falta fue con contacto, el tirador es quien la recibió: se anota como falta recibida.
    if (["P", "DI", "FL", "D"].includes(codigo)) await agregar("falta", { lado, dorsal, datos: { clase: "recibida", tipo: null } });
    app.seleccion = { lado, dorsal };
    serieTL = { lado, dorsal, total, hechos: 0, codigo };
    pendiente = nuevoPendienteTL(lado);
    ubicacion = null;
    asistencia = null;
    pintar();
  }

  async function aplicarFalta(s, enPista, codigo) {
    const quien = s.coach ? nombreSel() : etiquetaJugador(nombreSel(), s.dorsal);
    if (enPista) {
      await agregar("falta", { lado: s.lado, dorsal: s.dorsal, datos: { tipo: codigo, clase: "cometida" } });
      const st = stats(s.lado, s.dorsal);
      if (!jugadorExpulsado(st)) app.seleccion = null;
    } else {
      const principal = !!s.coach && staffDe(s.lado)[s.staffIndex ?? 0]?.rol === "Entrenador principal";
      await agregar("falta_banquillo", {
        lado: s.lado,
        dorsal: s.coach ? null : s.dorsal,
        jugador: s.coach ? quien : undefined,
        datos: {
          tipo: codigo,
          staffIndex: s.coach ? (s.staffIndex ?? 0) : null,
          tecnicaEntrenador: codigo === "D" && !principal ? "B" : null,
        },
      });
    }
    toast(`Falta registrada: ${quien} (${codigo}).`, "ok");
    pintar();
    const ladoFalta = s.lado;
    setTimeout(() => abrirTiroslibres(ladoFalta, codigo), 80); // tras cerrarse el cuadro de la falta
  }

  async function accionSimple(tipo, nombre, datos = {}) {
    const s = app.seleccion;
    if (!s) return;
    asistencia = null;
    await eventoJugador(tipo, datos);
    toast(`${nombre}: ${nombreSel()}.`, "ok");
    pintar();
  }

  async function accionAsistencia() {
    const s = app.seleccion;
    if (!s) return;
    let tiro = asistencia;
    if (!tiro) {
      const ultimo = [...(app.proy?.tiros || [])].reverse().find((t) => t.lado === s.lado && t.resultado === "acierto" && t.puntos !== 1);
      if (!ultimo) { toast("Primero registra un tiro anotado.", "aviso"); return; }
      tiro = { lado: s.lado, tiroUid: ultimo.uid };
    }
    if (tiro.lado !== s.lado) { toast("La asistencia debe ser del mismo equipo que anotó.", "aviso"); return; }
    const t = app.proy?.tiros.find((x) => x.uid === tiro.tiroUid);
    if (t && !s.coach && String(t.dorsal) === String(s.dorsal)) { toast("El pasador no puede ser el anotador.", "aviso"); return; }
    asistencia = null;
    await eventoJugador("asistencia", { tiroUid: tiro.tiroUid });
    pintar();
  }

  async function sustituir(lado, entra) {
    const s = app.seleccion;
    if (!s || s.lado !== lado || s.coach || !jugadorEnPista(lado, s.dorsal)) {
      toast(`Primero toca el titular del ${equipo(lado).nombre} que sale.`, "aviso");
      return;
    }
    if (stats(lado, entra).faltas >= 5) {
      toast("Ese jugador tiene 5 faltas y no puede volver a entrar.", "aviso");
      return;
    }
    const sale = s.dorsal;
    const saleJ = jugadores(lado).find((j) => j.dorsal === String(sale));
    const entraJ = jugadores(lado).find((j) => j.dorsal === String(entra));
    asistencia = null;
    pendiente = null;
    ubicacion = null;
    await agregar("sustitucion", { lado, dorsal: sale, datos: { sale, entra: String(entra) } });
    app.seleccion = { lado, dorsal: String(entra) };
    toast(`Cambio en ${equipo(lado).nombre}: sale ${etiquetaJugador(saleJ?.nombre, sale)}, entra ${etiquetaJugador(entraJ?.nombre, entra)}. «Deshacer» lo anula.`, "ok");
    pintar();
  }

  // ---------------- notas y edición de eventos ----------------

  function abrirNuevaNota() {
    const s = app.seleccion;
    const lado = s?.lado || null;
    const jugador = s && !s.coach ? jugadores(s.lado).find((j) => j.dorsal === String(s.dorsal)) : null;
    abrirEditorNota(null, {
      sesion: app.sesion, lado, jugador,
      onGuardada: () => toast("Nota guardada. Puedes editarla en Notas.", "ok"),
    });
  }

  function abrirEditorEvento(ev) {
    if (ev.t === "tiempo_muerto") { abrirEditorTiempoMuerto(ev); return; }
    const lado = ev.lado;
    if (!lado) return;
    const roster = jugadores(lado);
    const staff = staffDe(lado);
    const staffEvento = ev.datos?.entrenador && ev.jugador && !staff.some((x) => x.nombre === ev.jugador)
      ? [...staff, { nombre: ev.jugador, rol: ev.datos?.rol || "Cuerpo técnico" }]
      : staff;
    const staffIndexEvento = (() => {
      if (!ev.datos?.entrenador) return 0;
      const i = staffEvento.findIndex((x) => x.nombre === ev.jugador);
      return i >= 0 ? i : Math.max(0, staffEvento.length - 1);
    })();
    const form = { ...ev, datos: { ...(ev.datos || {}) }, coach: !!ev.datos?.entrenador, staffIndex: staffIndexEvento };

    const selectJugador = h("select", {
      onchange: (e) => {
        if (String(e.target.value).startsWith("staff:")) {
          form.coach = true;
          form.dorsal = null;
          form.staffIndex = Number(e.target.value.slice(6)) || 0;
          form.datos.entrenador = true;
          form.datos.staffIndex = form.staffIndex;
        } else {
          form.coach = false;
          form.dorsal = e.target.value || null;
          form.datos.entrenador = false;
          form.datos.staffIndex = null;
        }
      },
    },
      h("option", { value: "", selected: ev.dorsal == null && !ev.datos?.entrenador, text: "Sin jugador (equipo)" }),
      roster.map((j) => h("option", { value: j.dorsal, selected: String(ev.dorsal) === String(j.dorsal) && !ev.datos?.entrenador, text: etiquetaJugador(j.nombre, j.dorsal) })),
      staffEvento.map((st, i) => h("option", { value: `staff:${i}`, selected: !!ev.datos?.entrenador && form.staffIndex === i, text: `${st.rol}: ${st.nombre}` })));

    const campos = [];
    if (ev.t === "sustitucion") {
      const opciones = (valor) => roster.map((j) => h("option", { value: j.dorsal, selected: String(valor) === String(j.dorsal), text: etiquetaJugador(j.nombre, j.dorsal) }));
      const sale = h("select", { onchange: (e) => { form.datos.sale = e.target.value; form.dorsal = e.target.value; } }, opciones(form.datos.sale));
      const entra = h("select", { onchange: (e) => { form.datos.entra = e.target.value; } }, opciones(form.datos.entra));
      campos.push(
        h("label", { class: "nota-campo" }, h("span", { text: "Sale" }), sale),
        h("label", { class: "nota-campo" }, h("span", { text: "Entra" }), entra));
    } else {
      campos.push(h("label", { class: "nota-campo" }, h("span", { text: "Jugador" }), selectJugador));
      if (ev.t === "tiro") {
        const tipo = h("select", { onchange: (e) => { form.datos.puntos = +e.target.value; form.datos.tl = +e.target.value === 1; } },
          [[1, "Tiro libre"], [2, "2 puntos"], [3, "Triple"]].map(([v, t]) => h("option", { value: v, selected: Number(form.datos.puntos) === v, text: t })));
        const res = h("select", { onchange: (e) => { form.datos.resultado = e.target.value; } },
          [["acierto", "Anotado"], ["fallo", "Fallado"]].map(([v, t]) => h("option", { value: v, selected: form.datos.resultado === v, text: t })));
        campos.push(
          h("label", { class: "nota-campo" }, h("span", { text: "Tipo" }), tipo),
          h("label", { class: "nota-campo" }, h("span", { text: "Resultado" }), res));
      } else if (ev.t === "rebote") {
        const tipo = h("select", { onchange: (e) => { form.datos.tipo = e.target.value; } },
          [["of", "Ofensivo"], ["def", "Defensivo"]].map(([v, t]) => h("option", { value: v, selected: form.datos.tipo === v, text: t })));
        campos.push(h("label", { class: "nota-campo" }, h("span", { text: "Rebote" }), tipo));
      } else if (ev.t === "falta") {
        const tipoActual = form.datos.tipo || (form.datos.flagrante ? "FL" : "P");
        const tipo = h("select", { onchange: (e) => { form.datos.tipo = e.target.value; } },
          [["P", "P · Falta personal"], ["T1", "T1 · Técnica Cat. 1"], ["T2", "T2 · Técnica Cat. 2"], ["DI", "DI · Disruptiva"], ["FL", "FL · Flagrante"], ["D", "D · Descalificante"]]
            .map(([v, t]) => h("option", { value: v, selected: tipoActual === v, text: t })));
        campos.push(h("label", { class: "nota-campo" }, h("span", { text: "Tipo" }), tipo));
      } else if (ev.t === "falta_banquillo") {
        if (form.datos.tipo === "B2") form.datos.tipo = "D";
        const tipo = h("select", { onchange: (e) => { form.datos.tipo = e.target.value; } },
          [["C", "C · Técnica del entrenador principal"], ["B", "B · Técnica del banquillo"], ["BD", "BD · Técnica de acompañante"], ["D", "D · Descalificante"]]
            .map(([v, t]) => h("option", { value: v, selected: form.datos.tipo === v, text: t })));
        campos.push(h("label", { class: "nota-campo" }, h("span", { text: "Tipo" }), tipo));
      }
    }

    const d = dialogo("Editar acción", h("div", { class: "nota-form" },
      h("p", { class: "sub", text: `${resumenEvento(ev)} · ${etiquetaPeriodo(ev)} ${mmss(ev.reloj || 0)}` }),
      ...campos,
      h("div", { class: "acciones" },
        btn("Cancelar", () => d.close(), { clase: "btn" }),
        btn("Guardar", async () => {
          const cambios = { datos: form.datos };
          if (ev.t === "sustitucion") {
            cambios.dorsal = form.datos.sale;
            cambios.jugador = roster.find((j) => j.dorsal === String(form.datos.sale))?.nombre || null;
          } else if (form.coach) {
            const st = staffEvento[form.staffIndex] || staffEvento[0];
            cambios.dorsal = null;
            cambios.jugador = st?.nombre || ev.jugador || null;
            cambios.datos.entrenador = true;
            cambios.datos.staffIndex = form.staffIndex;
            cambios.datos.rol = st?.rol || null;
          } else {
            cambios.dorsal = form.dorsal;
            cambios.jugador = roster.find((j) => j.dorsal === String(form.dorsal))?.nombre || null;
            cambios.datos.entrenador = false;
            cambios.datos.staffIndex = null;
          }
          await editarEvento(ev.uid, cambios);
          d.close();
          toast("Acción corregida.", "ok");
        }, { clase: "btn primario", icon: "importado" }))));
  }

  function abrirEditorTiempoMuerto(ev) {
    const form = { lado: ev.lado };
    const equipoSel = h("select", { onchange: (e) => { form.lado = e.target.value; } },
      ["local", "visitante"].map((l) => h("option", { value: l, selected: ev.lado === l, text: equipo(l).nombre })));
    const d = dialogo("Editar tiempo muerto", h("div", { class: "nota-form" },
      h("p", { class: "sub", text: "Tiempo muerto" }),
      h("label", { class: "nota-campo" }, h("span", { text: "Equipo" }), equipoSel),
      h("div", { class: "acciones" },
        btn("Cancelar", () => d.close(), { clase: "btn" }),
        btn("Guardar", async () => {
          await editarEvento(ev.uid, { lado: form.lado });
          d.close();
          toast("Tiempo muerto corregido.", "ok");
        }, { clase: "btn primario", icon: "importado" }))));
  }

  async function borrarEvento(ev) {
    const ok = await confirmar("Eliminar acción", `Se quitará «${resumenEvento(ev)}» del partido. Esta acción es irreversible.`, { ok: "Eliminar", peligro: true });
    if (!ok) return;
    await eliminarEvento(ev.uid);
    toast("Acción eliminada.", "ok");
  }

  // ---------------- reloj y periodos ----------------

  async function alternarReloj() {
    if (app.sesion.reloj.corriendo) await pararReloj(); else await iniciarReloj();
  }

  async function cerrarCuarto() {
    await finPeriodo();
    toast("Cuarto cerrado. Elige «Siguiente cuarto» cuando toque.", "ok");
  }

  async function cambiarLados() {
    const cuarto = app.sesion.reloj.cuarto;
    const nuevo = otroLado(equipoDefensor(cuarto));
    pendiente = null;
    ubicacion = null;
    await marcarDefensa(cuarto, nuevo);
    toast(`Lados cambiados: ${equipo(nuevo).nombre} defiende la zona izquierda.`, "ok");
    pintar();
  }

  // Tiempos muertos FIBA (art. 18): 2 en la 1.ª parte, 3 en la 2.ª (máx. 2 con 2:00 o menos en el 4.º) y 1 por prórroga.
  const tramoTM = (cuarto) => (cuarto <= 2 ? "H1" : cuarto <= 4 ? "H2" : "P" + cuarto);
  const limiteTM = (tramo) => (tramo === "H1" ? 2 : tramo === "H2" ? 3 : 1);
  function tmTramo(lado) {
    const tramo = tramoTM(app.sesion.reloj.cuarto);
    const anul = new Set(app.eventos.filter((e) => e.t === "anulacion").map((e) => e.datos?.ref));
    const usados = app.eventos.filter((e) => e.t === "tiempo_muerto" && e.lado === lado && !anul.has(e.uid) && tramoTM(e.cuarto) === tramo);
    return { usados, tramo, limite: limiteTM(tramo) };
  }
  async function anotarTiempoMuerto(lado) {
    const { usados, tramo, limite } = tmTramo(lado);
    if (usados.length >= limite) {
      const ok = await confirmar("Sin tiempos muertos", `${equipo(lado).nombre} ya ha usado los ${limite} tiempos muertos ${tramo === "H1" ? "de la primera parte" : tramo === "H2" ? "de la segunda parte" : "de esta prórroga"}. ¿Anotar otro igualmente?`, { ok: "Anotar", peligro: true });
      if (!ok) return;
    } else if (tramo === "H2" && app.sesion.reloj.cuarto === 4 && relojActual() <= 120 && usados.filter((e) => e.cuarto === 4 && e.reloj <= 120).length >= 2) {
      const ok = await confirmar("Límite en los últimos 2:00", "Solo se pueden pedir 2 tiempos muertos con 2:00 o menos en el 4.º cuarto. ¿Anotarlo igualmente?", { ok: "Anotar", peligro: true });
      if (!ok) return;
    }
    await agregar("tiempo_muerto", { lado });
    await pararReloj();
    const n = tmTramo(lado).usados.length;
    toast(`Tiempo muerto de ${equipo(lado).nombre} (${n} de ${limite}).`, "ok");
    pintar();
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
        const r = await elegir("Empate", `El partido está empatado. ¿${yaPr ? "Otra prórroga" : "Prórroga"} de 5:00 o finalizar?`,
          [["prorroga", yaPr ? "Otra prórroga" : "Prórroga 5:00", "primario"], ["final", "Finalizar", "peligro"], ["nada", "Cancelar", ""]]);
        if (r === "prorroga") { await cerrarSiHaceFalta(); await iniciarPeriodo(s.reloj.cuarto + 1, "prorroga"); return; }
        if (r === "final") { await acabar(); return; }
        return;
      }
      const r = await elegir("Final del partido", "Ya no queda tiempo. ¿Finalizar el partido?", [["final", "Finalizar", "primario"], ["nada", "Cancelar", ""]]);
      if (r === "final") await acabar();
      return;
    }
    const sig = siguientePeriodo();
    await cerrarSiHaceFalta();
    await iniciarPeriodo(sig.cuarto, sig.tipoPeriodo);
  }

  async function acabar() {
    await finalizar();
    pintar();
  }

  function elegir(titulo, texto, opciones) {
    return new Promise((resolver) => {
      const d = dialogo(titulo, h("div", null, h("p", { text: texto }), h("div", { class: "acciones" },
        opciones.map(([v, t, c]) => btn(t, () => { d.close(); resolver(v); }, { clase: "btn " + (c || "") })))));
      d.addEventListener("close", () => resolver("nada"), { once: true });
    });
  }

  // ---------------- defensa de zona ----------------

  function pedirDefensaSiFalta() {
    const s = app.sesion;
    if (!s || s.estado === "final" || defensaIndicada(s.reloj.cuarto) || pidiendoDefensa) return;
    if (document.querySelector("dialog[open]")) {
      setTimeout(() => { if (raiz.isConnected) pedirDefensaSiFalta(); }, 500);
      return;
    }
    pidiendoDefensa = true;
    setTimeout(async () => {
      try {
        if (!app.sesion || app.sesion.id !== s.id || defensaIndicada(s.reloj.cuarto)) return;
        const c = s.reloj.cuarto;
        const r = await elegir("Defensa de zona", `Cuarto ${c}: elige qué equipo defiende la zona izquierda de la pista; el otro defenderá la derecha.`,
          [["local", equipo("local").nombre, "primario"], ["visitante", equipo("visitante").nombre, "primario"]]);
        await marcarDefensa(c, r === "nada" ? equipoDefensor(c) : r);
        pintar();
      } finally {
        pidiendoDefensa = false;
      }
    }, 40);
  }

  pintar();
  return () => { off(); };
}
