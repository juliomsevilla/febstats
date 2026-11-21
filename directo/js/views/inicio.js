// Inicio: importar el paquete de datos, ver grupos y sesiones guardadas.
import { h, limpiar, btn, icono, toast, dialogo, confirmar, fechaCorta, jornadaTexto, mmss, guardarArchivo } from "../util.js";
import { app, cargarTodo, abrirGrupo, guardarGrupoEnIDB, cargarSesion, borrarSesion, exportarSesionActual, nombreArchivoExport, etiquetaPeriodo } from "../estado.js";
import { normalizarPaquete, crearGrupoDesdePayload } from "../grupo.js";
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
        h("p", { class: "sub", text: "Scouting en directo para Segunda y Tercera FEB. Todo se guarda en el iPad; sin red." })),
      h("div", { class: "inicio-acciones" },
        botonImportar(cont),
        app.sesion ? btn("Seguir en directo", () => navegar("partido"), { clase: "btn primario", icon: "partido" }) : null)),
    sinDatos ? tarjetaImportar(cont) : null,
    app.grupos.length ? seccionGrupos(cont) : null,
    app.sesiones.length ? seccionSesiones(cont) : null,
    h("p", { class: "nota-pie" },
      "Los datos viven solo en este iPad. Exporta el .db al terminar y guárdalo en Files/iCloud: iOS puede liberar espacio.",
      h("br"),
      "Formato admitido: FEBstats-iPad.json (paquete v3)."),
  ));
}

function botonImportar(cont) {
  const input = h("input", { type: "file", accept: ".json,application/json", hidden: true, onchange: (e) => { const f = e.target.files?.[0]; if (f) importar(f, cont); e.target.value = ""; } });
  const b = btn("Importar datos", () => input.click(), { clase: "btn", icon: "importar" });
  // El input NO va dentro del botón: su click burbujearía y volvería a abrir el selector.
  return h("span", { class: "importar-wrap" }, b, input);
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
    const activo = app.grupoId === g.id;
    return h("article", { class: "card grupo" + (activo ? " activo" : "") },
      h("div", { class: "grupo-cab" },
        h("div", null,
          h("h3", { text: r.competicion || "Grupo" }),
          h("p", { class: "sub", text: `${r.grupo || ""} · ${r.temporada || ""}` })),
        h("span", { class: "pill", text: `${r.equipos || 0} equipos` })),
      h("dl", { class: "mini-datos" },
        h("div", null, h("dt", { text: "Partidos" }), h("dd", { text: r.partidos ?? 0 })),
        h("div", null, h("dt", { text: "Jugadores" }), h("dd", { text: r.jugadores ?? 0 })),
        h("div", null, h("dt", { text: "Tiros" }), h("dd", { text: r.tiros ?? 0 })),
        h("div", null, h("dt", { text: "Jugadas" }), h("dd", { text: r.jugadas ?? 0 }))),
      h("div", { class: "acciones" },
        btn("Nuevo partido", async () => { await abrirGrupo(g.id); navegar("nuevo"); }, { clase: "btn primario", icon: "mas" }),
        btn(activo ? "Activo" : "Usar", async () => { await abrirGrupo(g.id); toast(`Grupo activo: ${r.competicion}`, "ok"); pintar(cont); }, { clase: "btn" }),
        btn("", async () => {
          const ok = await confirmar("Quitar grupo", `Se borrarán de este iPad los datos de «${r.competicion} · ${r.grupo}». Las sesiones no se borran.`, { ok: "Quitar", peligro: true });
          if (!ok) return;
          await idb.del("grupos", g.id);
          if (app.grupoId === g.id) { app.grupo = null; app.grupoId = null; }
          await cargarTodo(); pintar(cont);
        }, { clase: "btn fantasma peligro-txt", icon: "cerrar", "aria-label": "Quitar grupo" })));
  });
  return h("section", { class: "seccion" }, h("div", { class: "seccion-cab" }, h("h2", { text: "Datos en este iPad" }), botonImportar(cont)), h("div", { class: "rejilla" }, cards));
}

function seccionSesiones(cont) {
  const cards = app.sesiones.map((s) => {
    const enCurso = s.estado !== "final";
    const esActual = app.sesion?.id === s.id;
    const r = esActual && app.proy ? { ptsLocal: app.proy.pts.local, ptsVisitante: app.proy.pts.visitante, cuarto: s.reloj.cuarto, tipoPeriodo: s.reloj.tipoPeriodo, reloj: s.reloj.reloj } : (s.resumen || {});
    return h("article", { class: "card sesion" + (enCurso ? " viva" : "") },
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
        btn("Continuar", async () => { await cargarSesion(s.id); navegar("partido"); }, { clase: "btn primario", icon: "play" }),
        btn("Exportar .db", async () => {
          try {
            if (app.sesion?.id !== s.id) await cargarSesion(s.id);
            const bytes = await exportarSesionActual();
            await guardarArchivo(new Blob([bytes], { type: "application/vnd.sqlite3" }), nombreArchivoExport(s));
          } catch (e) { toast(e.message, "error"); }
        }, { clase: "btn", icon: "exportar" }),
        btn("", async () => {
          const ok = await confirmar("Borrar sesión", `Se borrará el registro de «${s.local.nombre} vs ${s.visitante.nombre}». Exporta antes el .db si lo necesitas.`, { ok: "Borrar", peligro: true });
          if (!ok) return;
          await borrarSesion(s.id); pintar(cont);
        }, { clase: "btn fantasma peligro-txt", icon: "cerrar", "aria-label": "Borrar sesión" })));
  });
  return h("section", { class: "seccion" },
    h("div", { class: "seccion-cab" }, h("h2", { text: "Sesiones" }), h("span", { class: "pill", text: `${app.sesiones.length}` })),
    h("div", { class: "rejilla" }, cards));
}
