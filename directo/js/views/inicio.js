// Inicio: importar el paquete de datos, grupos, partidos en directo y finalizados.
import { h, limpiar, btn, icono, toast, dialogo, confirmar, fechaCorta, jornadaTexto, mmss, guardarArchivo } from "../util.js";
import { app, cargarTodo, abrirGrupo, guardarGrupoEnIDB, cargarSesion, borrarSesion, hacerCopia, estadoCopia, etiquetaPeriodo, crearGrupoSinDatos } from "../estado.js";
import { normalizarPaquete, crearGrupoDesdePayload } from "../grupo.js";
import { sembrarNotasPaquete } from "../notas-modelo.js";
import { idb } from "../idb.js";
import { navegar } from "../app.js";

export function vistaInicio(cont) {
  pintar(cont);
  return null;
}

function pintar(cont) {
  limpiar(cont);
  const sinDatos = !app.grupos.length;
  cont.append(h("section", { class: "inicio" },
    h("div", { class: "inicio-cab" },
      h("div", null,
        h("h1", { text: "Pista, reloj y boxscore" }),
        h("p", { class: "sub", text: "Anotación en directo para Segunda y Tercera FEB. Todo se guarda en el iPad; sin red." })),
      h("div", { class: "inicio-acciones" },
        botonImportar(cont),
        botonExportar(cont),
        sinDatos ? btn("Partido sin datos", empezarSinDatos, { clase: "btn", icon: "partido" }) : null)),
    sinDatos ? tarjetaImportar(cont) : null,
    app.grupos.length ? seccionGrupos(cont) : null,
    seccionPartidos(cont),
    h("p", { class: "nota-pie" },
      "Los datos viven solo en este iPad. El botón Exportar solo genera el .db de los partidos finalizados.",
      h("br"),
      "Formato admitido: FEBstats-iPad.json (paquete v3)."),
  ));
}

async function empezarSinDatos() {
  try { await crearGrupoSinDatos(); navegar("nuevo"); }
  catch (e) { toast("No se pudo crear el partido: " + e.message, "error"); }
}

function botonImportar(cont) {
  const input = h("input", { type: "file", accept: ".json,application/json", hidden: true, onchange: (e) => { const f = e.target.files?.[0]; if (f) importar(f, cont); e.target.value = ""; } });
  const b = btn("Importar datos", () => input.click(), { clase: "btn", icon: "importar" });
  // El input NO va dentro del botón: su click burbujearía y volvería a abrir el selector.
  return h("span", { class: "importar-wrap" }, b, input);
}

function botonExportar(cont) {
  const hay = app.sesiones.length > 0;
  return btn("Copia de seguridad .db", () => abrirExportar(cont), {
    clase: "btn",
    icon: "exportar",
    disabled: !hay,
    title: hay ? "Guardar una copia de un partido, terminado o en curso" : "No hay partidos",
  });
}

function abrirExportar(cont) {
  if (!app.sesiones.length) { toast("No hay partidos para copiar.", "aviso"); return; }
  const d = dialogo("Copia de seguridad", h("div", { class: "exportar-lista" },
    h("p", { class: "sub", text: "Guarda el partido en Archivos o por AirDrop. Sirve para un partido en curso y para uno terminado; el Mac lo incorpora con Datos → Importar." }),
    app.sesiones.map((s) => {
      const r = s.resumen || {};
      const c = estadoCopia(s);
      return h("button", {
        type: "button", class: "exportar-fila",
        onclick: async () => { d.close(); await exportarPartido(s, cont); },
      },
        h("span", { class: "ef-eq", text: `${s.local.nombre} ${r.ptsLocal ?? 0}–${r.ptsVisitante ?? 0} ${s.visitante.nombre}` }),
        h("span", { class: "sub", text: [s.estado === "final" ? "Finalizado" : "En curso", s.competicion, s.fecha ? fechaCorta(s.fecha) : "", c.hay ? `última copia hace ${c.minutos} min` : "sin copia"].filter(Boolean).join(" · ") }));
    })));
}

async function exportarPartido(s, cont) {
  const previa = app.sesion?.id || null;
  try {
    if (app.sesion?.id !== s.id) await cargarSesion(s.id);
    const modo = await hacerCopia();
    if (modo !== "cancelado") toast(modo === "compartido" ? "Elige «Guardar en Archivos»." : "Copia hecha: busca el .db en Archivos o en Descargas.", "ok");
  } catch (e) {
    console.error(e);
    toast("No se pudo guardar la copia: " + e.message, "error");
  } finally {
    if (previa && previa !== s.id) {
      try { await cargarSesion(previa); } catch { /* sesión anterior ya no existe */ }
    }
    pintar(cont);
  }
}

function tarjetaImportar(cont) {
  const zona = h("div", { class: "drop", tabindex: 0, onclick: () => cont.querySelector("input[type=file]")?.click() },
    h("div", { class: "drop-icono" }, icono("importar")),
    h("strong", { text: "Arrastra aquí FEBstats-iPad.json" }),
    h("span", { text: "o pulsa para elegirlo. También puedes importar varias divisiones." }));
  zona.addEventListener("dragover", (e) => { e.preventDefault(); zona.classList.add("encima"); });
  zona.addEventListener("dragleave", () => zona.classList.remove("encima"));
  zona.addEventListener("drop", (e) => {
    e.preventDefault(); zona.classList.remove("encima");
    const f = e.dataTransfer.files?.[0]; if (f) importar(f, cont);
  });
  return zona;
}

async function importar(file, cont) {
  const d = dialogo("Importando datos", h("div", { class: "cargando" }, h("div", { class: "spinner" }), h("p", { text: file.name })));
  try {
    await new Promise((r) => setTimeout(r, 40));
    const texto = await file.text();
    let json;
    try { json = JSON.parse(texto); } catch { throw new Error("El archivo no es JSON válido."); }
    const paquete = normalizarPaquete(json);
    const resumenes = [];
    for (const g of paquete.grupos) {
      const ya = app.grupos.find((x) => x.id === g.db);
      if (ya) {
        const ok = await confirmar("Reemplazar grupo", `Ya tienes «${ya.resumen?.competicion} · ${ya.resumen?.grupo}». ¿Sustituirlo por la versión del archivo?`, { ok: "Reemplazar" });
        if (!ok) continue;
      }
      const { db, resumen } = await crearGrupoDesdePayload(g.payload, paquete, { dbId: g.db });
      await guardarGrupoEnIDB(g.db, db, resumen, paquete.generado);
      resumenes.push({ id: g.db, resumen });
      await new Promise((r) => setTimeout(r, 10));
    }
    if (resumenes.length) {
      await abrirGrupo(resumenes[0].id);
      await sembrarNotasPaquete(paquete.notas, { grupo: resumenes[0].id, temporada: resumenes[0].resumen?.temporada });
      d.close();
      const r = resumenes[0].resumen;
      toast(`Importado: ${r.competicion} · ${r.grupo} · ${r.partidos} partidos, ${r.tiros} tiros.`, "ok");
      pintar(cont);
    } else {
      d.close();
    }
  } catch (e) {
    console.error(e);
    d.close();
    dialogo("No se pudo importar", h("div", null, h("p", { text: e.message }), h("p", { class: "sub", text: "Comprueba que es el archivo que exporta FEBstats en «Llevar los datos al iPad»." })));
  }
}

function seccionGrupos(cont) {
  const cards = app.grupos.map((g) => {
    const r = g.resumen || {};
    const sinD = r.sinDatos || (r.competicion === "AMISTOSO" && r.grupo === "Sin datos");
    const activo = app.grupoId === g.id;
    return h("article", { class: "card grupo" + (activo ? " activo" : "") },
      h("div", { class: "grupo-cab" },
        h("div", null,
          h("h3", { text: r.competicion || "Grupo" }),
          h("p", { class: "sub", text: sinD ? "Sin datos FEB · partidos libres" : `${r.grupo || ""} · ${r.temporada || ""}` })),
        h("span", { class: "pill", text: sinD ? "Sin datos" : `${r.equipos || 0} equipos` })),
      h("dl", { class: "mini-datos" },
        h("div", null, h("dt", { text: "Partidos" }), h("dd", { text: r.partidos ?? 0 })),
        h("div", null, h("dt", { text: "Jugadores" }), h("dd", { text: r.jugadores ?? 0 })),
        h("div", null, h("dt", { text: "Tiros" }), h("dd", { text: r.tiros ?? 0 })),
        h("div", null, h("dt", { text: "Notas" }), h("dd", { text: r.notas ?? 0 }))),
      h("div", { class: "acciones" },
        btn("Nuevo partido", async () => { await abrirGrupo(g.id); navegar("nuevo"); }, { clase: "btn primario", icon: "mas" }),
        btn(activo ? "Activo" : "Usar", async () => { await abrirGrupo(g.id); toast(`Grupo activo: ${r.competicion}`, "ok"); pintar(cont); }, { clase: "btn" }),
        btn("", async () => {
          const ok = await confirmar("Quitar grupo", `Se borrarán de este iPad los datos de «${r.competicion} · ${r.grupo}». Los partidos no se borran.`, { ok: "Quitar", peligro: true });
          if (!ok) return;
          await idb.del("grupos", g.id);
          if (app.grupoId === g.id) { app.grupo = null; app.grupoId = null; }
          await cargarTodo(); pintar(cont);
        }, { clase: "btn fantasma peligro-txt", icon: "cerrar", "aria-label": "Quitar grupo" })));
  });
  return h("section", { class: "seccion" }, h("div", { class: "seccion-cab" }, h("h2", { text: "Datos en este iPad" })), h("div", { class: "rejilla" }, cards));
}

function seccionPartidos(cont) {
  const enDirecto = app.sesiones.filter((s) => s.estado !== "final");
  const finalizados = app.sesiones.filter((s) => s.estado === "final");
  const bloque = (titulo, lista, vivo) => h("div", { class: "sesiones-grupo" },
    h("div", { class: "seccion-cab" },
      h("h3", { text: titulo }),
      h("span", { class: "pill" + (vivo ? " ok" : ""), text: `${lista.length}` })),
    lista.length
      ? h("div", { class: "rejilla" }, lista.map((s) => tarjetaSesion(s, cont)))
      : h("p", { class: "sub vacio-lista", text: vivo ? "No hay partidos en directo." : "No hay partidos finalizados." }));

  return h("section", { class: "seccion" },
    h("div", { class: "seccion-cab" },
      h("h2", { text: "Partidos" }),
      h("span", { class: "pill", text: `${enDirecto.length} en directo · ${finalizados.length} finalizados` })),
    bloque("En directo", enDirecto, true),
    bloque("Finalizados", finalizados, false));
}

function tarjetaSesion(s, cont) {
  const enCurso = s.estado !== "final";
  const esActual = app.sesion?.id === s.id;
  const r = esActual && app.proy
    ? { ptsLocal: app.proy.pts.local, ptsVisitante: app.proy.pts.visitante, cuarto: s.reloj.cuarto, tipoPeriodo: s.reloj.tipoPeriodo, reloj: relojActualSesion(s) }
    : (s.resumen || {});
  return h("article", {
    class: "card sesion clickable" + (enCurso ? " viva" : "") + (esActual ? " actual" : ""),
    tabindex: 0,
    role: "button",
    title: "Abrir el partido",
    onclick: (e) => { if (e.target.closest("button")) return; abrirSesion(s, cont); },
    onkeydown: (e) => {
      if (e.target.closest("button")) return;
      if (e.key === "Enter" || e.key === " ") { e.preventDefault(); abrirSesion(s, cont); }
    },
  },
    h("div", { class: "sesion-cab" },
      h("div", { class: "sesion-eq" },
        h("span", { text: s.local.nombre }),
        h("b", { text: `${r.ptsLocal ?? 0}` }),
        h("i", { text: "–" }),
        h("b", { text: `${r.ptsVisitante ?? 0}` }),
        h("span", { class: "der", text: s.visitante.nombre })),
      h("span", { class: "pill " + (enCurso ? "ok" : ""), text: enCurso ? `${etiquetaPeriodo({ cuarto: r.cuarto, tipoPeriodo: r.tipoPeriodo })} · ${mmss(r.reloj ?? 0)}` : "Final" })),
    h("p", { class: "sub", text: [s.competicion, jornadaTexto(s.jornada), s.fecha ? fechaCorta(s.fecha) : ""].filter(Boolean).join(" · ") + ` · ${s.local.nombre} vs ${s.visitante.nombre}` }),
    h("div", { class: "acciones" },
      btn("Eliminar", async (e) => { e.stopPropagation(); await eliminarSesion(s, cont); }, { clase: "btn pequeno fantasma peligro-txt", icon: "cerrar" })));
}

function relojActualSesion(s) {
  if (s.reloj?.corriendo) {
    const transcurrido = (Date.now() - (s.reloj.desde || Date.now())) / 1000;
    return Math.max(0, (Number(s.reloj.reloj) || 0) - transcurrido);
  }
  return s.reloj?.reloj || 0;
}

async function abrirSesion(s, cont) {
  try {
    await cargarSesion(s.id);
    navegar("partido");
  } catch (e) {
    toast("No se pudo abrir el partido: " + e.message, "error");
    pintar(cont);
  }
}

async function eliminarSesion(s, cont) {
  const ok = await confirmar("Eliminar partido",
    `Se borrará definitivamente «${s.local.nombre} vs ${s.visitante.nombre}» y todo su registro de acciones. Esta acción es irreversible.`,
    { ok: "Eliminar", peligro: true });
  if (!ok) return;
  await borrarSesion(s.id);
  pintar(cont);
}
