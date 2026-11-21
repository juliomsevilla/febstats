// Proyección del registro de eventos a boxscore, posesiones y tiros. Funciones puras.
//
// El registro es append-only: la verdad es la lista de eventos. Aquí se filtra lo anulado y se
// reconstruye todo. Rejugar 3.000 eventos es instantáneo; no hace falta guardar el estado.
import { DURACION, puntosDeTiro, valoracion, statsVacias } from "./grupo.js";

export const LADOS = ["local", "visitante"];

export function relojAhora(reloj) {
  if (!reloj) return DURACION.regular;
  if (!reloj.corriendo) return Number(reloj.reloj) || 0;
  const transcurrido = (Date.now() - (reloj.desde || Date.now())) / 1000;
  return Math.max(0, (Number(reloj.reloj) || 0) - transcurrido);
}

export function eventoBase(tipo, datos = {}) {
  return {
    uid: datos.uid, t: tipo, ts: Date.now(), n: datos.n,
    cuarto: datos.cuarto, tipoPeriodo: datos.tipoPeriodo, reloj: datos.reloj,
    lado: datos.lado ?? null, equipoId: datos.equipoId ?? null, equipo: datos.equipo ?? null,
    jugadorId: datos.jugadorId ?? null, jugador: datos.jugador ?? null, dorsal: datos.dorsal ?? null,
    datos: datos.datos || {},
  };
}

function crearEstado(sesion, relojInicial) {
  const jugadores = { local: {}, visitante: {} };
  const oncourt = { local: [], visitante: [] };
  const onSince = {};
  for (const lado of LADOS) {
    const titulares = (sesion.jugadores?.[lado] || []).filter((j) => j.titular);
    const cinco = (titulares.length ? titulares : sesion.jugadores?.[lado] || []).slice(0, 5);
    for (const j of sesion.jugadores?.[lado] || []) {
      jugadores[lado][j.dorsal] = { ...statsVacias(), dorsal: j.dorsal, nombre: j.nombre, jugadorId: j.jugadorId || null, titular: j.titular ? 1 : 0 };
    }
    oncourt[lado] = cinco.map((j) => j.dorsal);
    onSince[lado] = {};
    for (const d of oncourt[lado]) onSince[lado][d] = { cuarto: 1, tipoPeriodo: "regular", reloj: relojInicial };
  }
  return {
    cuarto: 1, tipoPeriodo: "regular", duracion: DURACION.regular, reloj: relojInicial, estado: "en_curso",
    pts: { local: 0, visitante: 0 }, equipos: { local: equipoVacio(), visitante: equipoVacio() },
    jugadores, oncourt, onSince,
    periodos: [{ n: 1, tipo: "regular", dur: DURACION.regular, pts: { local: 0, visitante: 0 }, faltas: { local: 0, visitante: 0 } }],
    tiros: [], posesiones: [], faltasPeriodo: { local: {}, visitante: {} }, ultimoTiro: null, ultimaJugada: null,
    posesionAbierta: null, numeroPosesion: 0, cambios: [],
  };
}

const equipoVacio = () => ({ ...statsVacias(), extra: { perdidas: 0, taponesContra: 0, rebOf: 0, rebDef: 0, faltas: 0, asistencias: 0, recuperaciones: 0 } });

function cerrarMinutos(est, lado, dorsal, cuarto, tipoPeriodo, reloj) {
  const desde = est.onSince[lado]?.[dorsal];
  if (!desde) return;
  if (desde.cuarto === cuarto && desde.tipoPeriodo === tipoPeriodo) {
    est.jugadores[lado][dorsal].segundos += Math.max(0, desde.reloj - reloj);
  } else {
    est.jugadores[lado][dorsal].segundos += Math.max(0, desde.reloj);
  }
}

function cerrarTodos(est, cuarto, tipoPeriodo, reloj) {
  // Cierra los intervalos de los que están en pista y limpia TODOS los onSince:
  // un cierre de periodo no debe volver a sumar los mismos minutos al abrir el siguiente.
  for (const lado of LADOS) {
    const enPista = new Set(est.oncourt[lado]);
    for (const d of Object.keys(est.onSince[lado] || {})) {
      if (enPista.has(d)) cerrarMinutos(est, lado, d, cuarto, tipoPeriodo, reloj);
      delete est.onSince[lado][d];
    }
  }
}

function sumarPuntos(est, lado, dorsal, puntos) {
  est.pts[lado] += puntos;
  const per = est.periodos[est.periodos.length - 1];
  if (per) per.pts[lado] += puntos;
  for (const d of est.oncourt[lado]) est.jugadores[lado][d].masMenos += puntos;
  for (const d of est.oncourt[lado === "local" ? "visitante" : "local"]) est.jugadores[lado === "local" ? "visitante" : "local"][d].masMenos -= puntos;
  if (dorsal && est.jugadores[lado][dorsal]) est.jugadores[lado][dorsal].puntos += puntos;
  const p = est.posesionAbierta;
  if (p && p.lado === lado) { p.puntos += puntos; p.resultado = "acierto"; }
}

function abrirPosesion(est, e) {
  cerrarPosesion(est, e.reloj ?? est.reloj);
  est.numeroPosesion += 1;
  est.posesionAbierta = {
    uid: `pos_${est.numeroPosesion}_${e.uid}`, numero: est.numeroPosesion, cuarto: e.cuarto ?? est.cuarto,
    tipoPeriodo: e.tipoPeriodo ?? est.tipoPeriodo, relojInicio: e.reloj ?? est.reloj, relojFin: null,
    lado: e.lado ?? null, equipoId: e.equipoId ?? null, equipo: e.equipo ?? null,
    resultado: null, puntos: 0, eventoUid: null, ts: e.ts,
  };
}

function cerrarPosesion(est, relojFin) {
  const p = est.posesionAbierta;
  if (!p) return;
  p.relojFin = relojFin;
  est.posesiones.push(p);
  est.posesionAbierta = null;
}

/** Rejuega el registro. `relojActual` cierra los minutos en el instante real del reloj. */
export function proyectar(sesion, eventos, { relojActual } = {}) {
  const relojIni = Math.round(relojAhora(sesion.reloj ?? { reloj: DURACION.regular }));
  const est = crearEstado(sesion, relojIni);
  const anulados = new Set(eventos.filter((e) => e.t === "anulacion" && e.datos?.ref).map((e) => e.datos.ref));
  const activos = eventos.filter((e) => !anulados.has(e.uid) && e.t !== "anulacion").sort((a, b) => (a.n ?? 0) - (b.n ?? 0));

  for (const e of activos) {
    const reloj = e.reloj == null ? est.reloj : e.reloj;
    if (e.cuarto != null) est.cuarto = e.cuarto;
    if (e.tipoPeriodo) est.tipoPeriodo = e.tipoPeriodo;
    const lado = e.lado;
    const jug = lado && e.dorsal != null ? est.jugadores[lado][e.dorsal] : null;

    switch (e.t) {
      case "inicio":
        est.estado = "en_curso";
        break;
      case "periodo": {
        if (e.datos?.accion === "inicio" || e.datos?.accion == null) {
          // Cierra el periodo anterior en el reloj en que se quedó (normalmente 0).
          cerrarTodos(est, est.cuarto, est.tipoPeriodo, reloj);
          est.cuarto = e.cuarto ?? est.cuarto + 1;
          est.tipoPeriodo = e.tipoPeriodo || (est.cuarto > 4 ? "prorroga" : "regular");
          est.duracion = e.datos?.duracion || DURACION[est.tipoPeriodo] || DURACION.regular;
          est.reloj = est.duracion;
          est.periodos = est.periodos.filter((p) => p.n < est.cuarto);
          est.periodos.push({ n: est.cuarto, tipo: est.tipoPeriodo, dur: est.duracion, pts: { local: 0, visitante: 0 }, faltas: { local: 0, visitante: 0 } });
          for (const l of LADOS) for (const d of est.oncourt[l]) est.onSince[l][d] = { cuarto: est.cuarto, tipoPeriodo: est.tipoPeriodo, reloj: est.duracion };
        } else if (e.datos?.accion === "fin") {
          cerrarTodos(est, est.cuarto, est.tipoPeriodo, reloj);
          cerrarPosesion(est, reloj);
          est.reloj = reloj;
        }
        break;
      }
      case "reloj":
        est.reloj = e.reloj ?? est.reloj;
        break;
      case "sustitucion": {
        const sale = e.datos?.sale, entra = e.datos?.entra;
        if (lado && sale != null && entra != null) {
          cerrarMinutos(est, lado, String(sale), e.cuarto ?? est.cuarto, e.tipoPeriodo ?? est.tipoPeriodo, reloj);
          est.oncourt[lado] = est.oncourt[lado].map((d) => (d === String(sale) ? String(entra) : d));
          est.onSince[lado][String(entra)] = { cuarto: e.cuarto ?? est.cuarto, tipoPeriodo: e.tipoPeriodo ?? est.tipoPeriodo, reloj };
          est.cambios.push({ lado, sale: String(sale), entra: String(entra), cuarto: e.cuarto ?? est.cuarto, reloj });
        }
        break;
      }
      case "tiro": {
        if (!jug) break;
        const d = e.datos || {};
        const puntos = Number(d.puntos) || 0;
        const tl = !!d.tl;
        if (tl) { jug.tli += 1; if (d.resultado === "acierto") { jug.tla += 1; sumarPuntos(est, lado, jug.dorsal, 1); } }
        else if (puntos === 3) { jug.t3i += 1; if (d.resultado === "acierto") { jug.t3a += 1; sumarPuntos(est, lado, jug.dorsal, 3); } }
        else if (puntos === 2) { jug.t2i += 1; if (d.resultado === "acierto") { jug.t2a += 1; sumarPuntos(est, lado, jug.dorsal, 2); } }
        if (d.mate && d.resultado === "acierto") jug.mates += 1;
        const tiro = {
          uid: e.uid, eventoUid: e.uid, lado, dorsal: jug.dorsal, nombre: jug.nombre, jugadorId: jug.jugadorId,
          cuarto: e.cuarto ?? est.cuarto, tiempoRestante: reloj, puntos: tl ? 1 : puntos,
          resultado: d.resultado === "acierto" ? "acierto" : "fallo", tl,
          X: d.X ?? null, Y: d.Y ?? null, Xinv: d.Xinv ?? null, Yinv: d.Yinv ?? null, mate: !!d.mate,
        };
        est.tiros.push(tiro);
        est.ultimoTiro = tiro;
        if (est.posesionAbierta && est.posesionAbierta.lado === lado) {
          est.posesionAbierta.eventoUid = e.uid;
          if (d.resultado !== "acierto") est.posesionAbierta.resultado = "fallo";
        }
        break;
      }
      case "rebote": {
        const tipo = e.datos?.tipo === "of" ? "rebOf" : "rebDef";
        if (jug) jug[tipo] += 1; else if (lado) est.equipos[lado].extra[tipo] += 1;
        break;
      }
      case "asistencia":
        if (jug) jug.asistencias += 1;
        break;
      case "robo":
        if (jug) jug.recuperaciones += 1;
        break;
      case "perdida":
        if (jug) jug.perdidas += 1; else if (lado) est.equipos[lado].extra.perdidas += 1;
        if (est.posesionAbierta && est.posesionAbierta.lado === lado) { est.posesionAbierta.resultado = "perdida"; est.posesionAbierta.eventoUid = e.uid; }
        break;
      case "tapon": {
        if (jug) jug.taponesFavor += 1;
        const otro = lado === "local" ? "visitante" : "local";
        est.equipos[otro].extra.taponesContra += 1;
        break;
      }
      case "falta": {
        const recibida = e.datos?.clase === "recibida";
        if (jug) { if (recibida) jug.faltasRecibidas += 1; else jug.faltas += 1; }
        else if (lado) est.equipos[lado].extra.faltas += 1;
        if (lado && !recibida) est.faltasPeriodo[lado][est.cuarto] = (est.faltasPeriodo[lado][est.cuarto] || 0) + 1;
        if (lado) { const per = est.periodos[est.periodos.length - 1]; if (per) per.faltas[lado] += 1; }
        break;
      }
      case "posesion":
        abrirPosesion(est, e);
        break;
      case "jugada":
        est.ultimaJugada = { uid: e.datos?.uid, titulo: e.datos?.titulo, t: e.ts };
        break;
      case "final":
        cerrarTodos(est, est.cuarto, est.tipoPeriodo, reloj);
        cerrarPosesion(est, reloj);
        est.estado = "final";
        est.reloj = reloj;
        break;
      default:
        break;
    }
  }

  // Ajuste final al reloj real (lo que ha corrido desde el último evento).
  const relojFinal = relojActual == null ? Math.round(relojAhora(sesion.reloj ?? { reloj: est.reloj })) : relojActual;
  if (est.estado !== "final") {
    cerrarTodos(est, est.cuarto, est.tipoPeriodo, relojFinal);
    for (const l of LADOS) for (const d of est.oncourt[l]) est.onSince[l][d] = { cuarto: est.cuarto, tipoPeriodo: est.tipoPeriodo, reloj: relojFinal };
    est.reloj = relojFinal;
  }

  // Totales de equipo = suma de jugadores + acciones sin jugador.
  for (const lado of LADOS) {
    const eq = est.equipos[lado];
    const base = equipoVacio();
    Object.assign(eq, base);
    for (const d of Object.keys(est.jugadores[lado])) {
      const s = est.jugadores[lado][d];
      for (const k of ["segundos", "puntos", "t2a", "t2i", "t3a", "t3i", "tla", "tli", "rebOf", "rebDef", "asistencias",
        "recuperaciones", "perdidas", "taponesFavor", "taponesContra", "mates", "faltas", "faltasRecibidas", "masMenos"]) eq[k] += s[k];
    }
    for (const k of ["rebOf", "rebDef", "perdidas", "taponesContra", "faltas"]) eq[k] += eq.extra[k] || 0;
    eq.valoracion = valoracion(eq);
  }

  if (est.estado !== "final") {
    cerrarPosesion(est, relojFinal);
    // La posesión en curso se deja abierta para poder seguir anotando en ella.
    if (est.posesionAbierta) est.posesiones.push(est.posesionAbierta);
  }
  // Un equipo sin tiros no debe romper la vista.
  est.eventosActivos = activos.length;
  est.anulados = anulados.size;
  return est;
}

/** Puntos de un tiro (2/3) a partir de coordenadas plegadas. */
export const puntosTiro = puntosDeTiro;

/** Faltas de equipo en el cuarto actual (bonus FIBA: 5). */
export function faltasCuarto(proy, lado) { return proy.faltasPeriodo?.[lado]?.[proy.cuarto] || 0; }
