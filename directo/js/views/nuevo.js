// Nuevo partido: elegir grupo, partido oficial o amistoso y confirmar plantillas/titulares.
import { h, limpiar, btn, icono, toast, fechaCorta, jornadaTexto, dialogo } from "../util.js";
import { crearCancha } from "../court.js";
import { app, abrirGrupo, nuevaSesion } from "../estado.js";
import { listarPartidos, plantillaDe, minutosRecientes, equiposDe, scoutingEquipo } from "../grupo.js";
import { navegar } from "../app.js";

export function vistaNuevo(cont) {
  const st = {
    grupoId: app.grupoId || app.grupos[0]?.id || "",
    modo: "oficial",
    partido: null,
    localId: "", localNombre: "", visitanteId: "", visitanteNombre: "",
    plantilla: { local: [], visitante: [] },
    titulares: new Set(),
    rivalManual: "4,5,6,7,8,9,10,11,12,13,14,15",
    rivalNombres: "",
    buscar: "",
    cargando: false,
    equipos: [],
    partidos: [],
  };
  const cuerpo = h("div", { class: "nuevo" });
  cont.append(cuerpo);

  if (!app.grupos.length) {
    cuerpo.append(h("div", { class: "vacio" }, h("strong", { text: "Primero importa los datos" }), h("p", { text: "Necesitas el archivo FEBstats-iPad.json para crear un partido." }),
      btn("Ir a importar", () => navegar("inicio"), { clase: "btn primario", icon: "importar" })));
    return null;
  }

  const pintar = () => { limpiar(cuerpo); construir(); };

  async function cargarGrupo() {
    const db = await abrirGrupo(st.grupoId);
    st.equipos = equiposDe(db);
    st.partidos = listarPartidos(db);
    const r = app.grupos.find((g) => g.id === st.grupoId)?.resumen || {};
    st.competicion = r.competicion; st.grupo = r.grupo; st.temporada = r.temporada;
    pintar();
  }

  async function cargarPlantillas() {
    st.plantilla = { local: [], visitante: [] };
    st.titulares = new Set();
    if (!st.localId && !st.localNombre) return;
    const db = await abrirGrupo(st.grupoId);
    for (const lado of ["local", "visitante"]) {
      const id = lado === "local" ? st.localId : st.visitanteId;
      if (!id) continue;
      const p = plantillaDe(db, id);
      const min = minutosRecientes(db, id, 5);
      const filas = p.map((j) => ({
        dorsal: String(j.dorsal || ""), nombre: j.jugador || j.nombre || `#${j.dorsal}`, jugadorId: j.jugador_id || null,
        minutos: min.get(String(j.jugador_id || j.dorsal))?.seg || 0,
      })).filter((j) => j.dorsal);
      // La FEB puede traer dos jugadores con el mismo dorsal (temporadas mezcladas).
      // Se queda el que más ha jugado: el boxscore exige dorsal único por equipo.
      const porDorsal = new Map();
      for (const j of filas.sort((a, b) => b.minutos - a.minutos)) if (!porDorsal.has(j.dorsal)) porDorsal.set(j.dorsal, j);
      st.plantilla[lado] = [...porDorsal.values()].sort((a, b) => (+a.dorsal || 999) - (+b.dorsal || 999) || a.dorsal.localeCompare(b.dorsal));
      const top = [...st.plantilla[lado]].sort((a, b) => b.minutos - a.minutos).slice(0, 5);
      for (const j of top) st.titulares.add(`${lado}:${j.dorsal}`);
    }
    pintar();
  }

  function seleccionarPartido(p) {
    st.partido = p;
    const invertir = st.invertir;
    st.localId = invertir ? p.visitante_id : p.local_id;
    st.visitanteId = invertir ? p.local_id : p.visitante_id;
    st.localNombre = invertir ? p.equipo_visitante : p.equipo_local;
    st.visitanteNombre = invertir ? p.equipo_local : p.equipo_visitante;
    cargarPlantillas();
  }

  function rosterCard(lado) {
    const jugadores = st.plantilla[lado];
    const equipo = lado === "local" ? st.localNombre : st.visitanteNombre;
    const manual = st.modo === "amistoso" && lado === "visitante" && !st.visitanteId;
    const tit = [...st.titulares].filter((t) => t.startsWith(lado + ":")).length;
    const lista = jugadores.map((j) => {
      const on = st.titulares.has(`${lado}:${j.dorsal}`);
      return h("li", { class: "jug-fila" + (on ? " titular" : "") },
        h("button", { type: "button", class: "jug-tit", "aria-pressed": on, onclick: () => {
          const k = `${lado}:${j.dorsal}`;
          if (st.titulares.has(k)) st.titulares.delete(k);
          else {
            if (tit >= 5) { toast("Cinco titulares como máximo.", "aviso"); return; }
            st.titulares.add(k);
          }
          pintar();
        } },
          h("span", { class: "dorsal", text: `#${j.dorsal}` }),
          h("span", { class: "nombre", text: j.nombre }),
          on ? h("span", { class: "pill ok", text: "Titular" }) : null),
      );
    });
    return h("article", { class: "card roster" + (lado === "local" ? " local" : " visitante") },
      h("div", { class: "roster-cab" },
        h("div", null, h("h3", { text: equipo || "Sin equipo" }), h("p", { class: "sub", text: `${lado === "local" ? "Local" : "Visitante"} · ${tit} titulares` })),
        h("span", { class: "pill", text: `${jugadores.length} jug.` })),
      manual ? rosterManual() : null,
      manual ? null : (jugadores.length
        ? h("ul", { class: "roster-lista" }, lista)
        : h("p", { class: "sub", text: "No hay plantilla en los datos. Añade dorsales abajo." })),
      manual ? null : rosterExtra(lado),
    );
  }

  function rosterManual() {
    return h("div", { class: "roster-manual" },
      h("label", null, h("span", { text: "Dorsales del rival" }),
        h("input", { type: "text", value: st.rivalManual, placeholder: "4,5,6,7,8,9,10,11,12,13,14,15", oninput: (e) => {
          st.rivalManual = e.target.value;
          st.plantilla.visitante = dorsalesManual(e.target.value, st.rivalNombres);
        } })),
      h("label", null, h("span", { text: "Nombres (opcional, uno por línea)" }),
        h("textarea", { rows: 3, value: st.rivalNombres, placeholder: "Uno por línea, en el mismo orden que los dorsales", oninput: (e) => {
          st.rivalNombres = e.target.value;
          st.plantilla.visitante = dorsalesManual(st.rivalManual, st.rivalNombres);
        } })),
      h("p", { class: "sub", text: `${st.plantilla.visitante.length} jugadores` }));
  }

  function rosterExtra(lado) {
    if (st.modo !== "amistoso" || lado !== "visitante" || st.visitanteId) return null;
    return null;
  }

  function seccionScouting() {
    if (!st.localId && !st.visitanteId) return null;
    return h("section", { class: "seccion" },
      h("div", { class: "seccion-cab" }, h("h2", { text: "Informe de scouting" }), h("span", { class: "pill", text: "Temporada · tiros y perfiles del paquete" })),
      h("div", { class: "rejilla dos" }, ["local", "visitante"].map((lado) => {
        const id = lado === "local" ? st.localId : st.visitanteId;
        const nombre = lado === "local" ? st.localNombre : st.visitanteNombre;
        if (!id) return null;
        try { return tarjetaScouting(lado, id, nombre); } catch (e) { console.error(e); return null; }
      })));
  }

  function tarjetaScouting(lado, equipoId, nombre) {
    const inf = scoutingEquipo(app.grupo, equipoId);
    const c = inf.clas || {};
    const cancha = crearCancha({ interactiva: false });
    cancha.pintarTiros(inf.tiros.slice(0, 900));
    const jug = inf.jugadores.slice(0, 5);
    return h("article", { class: "card scouting " + lado },
      h("div", { class: "bt-cab" },
        h("div", null, h("h3", { text: nombre }), h("p", { class: "sub", text: `${c.pj ?? "—"} partidos · ${c.pg ?? "—"}V ${c.pp ?? "—"}D` })),
        h("span", { class: "pill", text: c.posicion ? `#${c.posicion}` : "—" })),
      h("div", { class: "scout-datos" },
        dato("PF/PC", `${c.pf ?? "—"}/${c.pc ?? "—"}`),
        dato("Ritmo", c.ritmo != null ? Number(c.ritmo).toFixed(1) : "—"),
        dato("ORTG", c.ortg != null ? Number(c.ortg).toFixed(1) : "—"),
        dato("DRTG", c.drtg != null ? Number(c.drtg).toFixed(1) : "—"),
        dato("TS%", c.ts_pct != null ? Number(c.ts_pct).toFixed(1) + "%" : "—"),
        dato("Tiros", String(inf.resumen.n))),
      h("div", { class: "scout-jugadores" },
        jug.map((j) => h("div", { class: "scout-jug" },
          h("span", { class: "dorsal", text: `#${j.dorsal}` }),
          h("span", { class: "nombre", text: j.nombre }),
          h("span", { class: "perfil", text: j.perfil || j.rol || "" }),
          h("b", { text: j.partidos ? (j.puntos / j.partidos).toFixed(1) : "—" })))),
      h("div", { class: "scout-cancha" }, cancha.el),
      h("div", { class: "scout-tiros" },
        h("span", null, h("b", { text: `${inf.resumen.t2a}/${inf.resumen.t2i}` }), " T2 · ", h("b", { text: inf.resumen.pct2 + "%" })),
        h("span", null, h("b", { text: `${inf.resumen.t3a}/${inf.resumen.t3i}` }), " T3 · ", h("b", { text: inf.resumen.pct3 + "%" }))));
  }

  const dato = (l, v) => h("div", { class: "scout-dato" }, h("span", { text: l }), h("b", { text: v }));

  function dorsalesManual(txt, nombres) {
    const ds = String(txt || "").split(/[,\s;]+/).map((x) => x.trim()).filter(Boolean);
    const ns = String(nombres || "").split("\n").map((x) => x.trim());
    return [...new Set(ds)].slice(0, 20).map((d, i) => ({ dorsal: d, nombre: ns[i] || `#${d}`, jugadorId: null, minutos: 0 }));
  }

  async function empezar() {
    if (!st.localNombre || !st.visitanteNombre) { toast("Elige los dos equipos.", "aviso"); return; }
    if (st.modo === "amistoso" && !st.visitanteId) st.plantilla.visitante = dorsalesManual(st.rivalManual, st.rivalNombres);
    const jug = (lado) => {
      const lista = st.plantilla[lado] || [];
      const tieneTit = lista.some((j) => st.titulares.has(`${lado}:${j.dorsal}`));
      return lista.map((j, i) => ({
        dorsal: j.dorsal, nombre: j.nombre, jugadorId: j.jugadorId,
        titular: tieneTit ? st.titulares.has(`${lado}:${j.dorsal}`) : i < 5,
      }));
    };
    if (jug("local").length < 5 || jug("visitante").length < 5) {
      const ok = await new Promise((resolver) => {
        const d = dialogo("Pocos jugadores", h("div", null, h("p", { text: "Hay menos de 5 jugadores en un equipo. ¿Continuar igualmente?" }),
          h("div", { class: "acciones" }, btn("Cancelar", () => { d.close(); resolver(false); }), btn("Continuar", () => { d.close(); resolver(true); }, { clase: "btn primario" }))));
      });
      if (!ok) return;
    }
    st.cargando = true; pintar();
    try {
      const p = st.partido;
      await nuevaSesion({
        grupoId: st.grupoId, partido: p,
        local: { equipoId: st.localId || null, nombre: st.localNombre, jugadores: jug("local") },
        visitante: { equipoId: st.visitanteId || null, nombre: st.visitanteNombre, jugadores: jug("visitante") },
        competicion: st.competicion || "", grupo: st.grupo || "", temporada: st.temporada || "",
        jornada: p?.jornada || (st.modo === "amistoso" ? "Amistoso" : ""),
        fecha: p?.fecha || new Date().toISOString().slice(0, 16).replace("T", " "),
      });
      navegar("partido");
    } catch (e) {
      console.error(e); st.cargando = false; pintar(); toast(e.message, "error");
    }
  }

  function construir() {
    const grupos = app.grupos.length > 1
      ? h("div", { class: "campo" }, h("label", { text: "Grupo de datos" }),
        h("select", { onchange: async (e) => { st.grupoId = e.target.value; st.partido = null; st.localId = st.visitanteId = ""; st.localNombre = st.visitanteNombre = ""; await cargarGrupo(); } },
          app.grupos.map((g) => h("option", { value: g.id, selected: g.id === st.grupoId, text: `${g.resumen?.competicion} · ${g.resumen?.grupo} ${g.resumen?.temporada}` }))))
      : null;

    const seg = h("div", { class: "seg" },
      h("button", { type: "button", class: st.modo === "oficial" ? "on" : "", onclick: () => { st.modo = "oficial"; pintar(); } }, "Partido oficial"),
      h("button", { type: "button", class: st.modo === "amistoso" ? "on" : "", onclick: () => { st.modo = "amistoso"; st.partido = null; st.localId = ""; st.localNombre = ""; st.visitanteId = ""; st.visitanteNombre = ""; pintar(); } }, "Amistoso"));

    const selector = st.modo === "oficial" ? listaPartidos() : amistoso();

    const rosters = (st.localNombre || st.visitanteNombre) ? h("section", { class: "seccion" },
      h("div", { class: "seccion-cab" }, h("h2", { text: "Plantillas y titulares" }), h("span", { class: "pill", text: "Toca para marcar los 5 iniciales" })),
      h("div", { class: "rejilla dos" }, rosterCard("local"), rosterCard("visitante")),
      seccionScouting(),
      h("div", { class: "acciones centradas" },
        btn("Intercambiar local/visitante", async () => {
          [st.localId, st.visitanteId] = [st.visitanteId, st.localId];
          [st.localNombre, st.visitanteNombre] = [st.visitanteNombre, st.localNombre];
          [st.plantilla.local, st.plantilla.visitante] = [st.plantilla.visitante, st.plantilla.local];
          const tits = new Set();
          for (const t of st.titulares) { const [l, d] = t.split(":"); tits.add(`${l === "local" ? "visitante" : "local"}:${d}`); }
          st.titulares = tits;
          pintar();
        }, { clase: "btn", icon: "cambiar" }),
        btn(st.cargando ? "Creando…" : "Empezar partido", empezar, { clase: "btn primario grande", icon: "play", disabled: st.cargando }))) : null;

    cuerpo.append(
      h("div", { class: "nuevo-cab" },
        h("div", null, h("h1", { text: "Nuevo partido" }), h("p", { class: "sub", text: "Elige el partido, confirma las plantillas y marca los titulares." })),
        h("div", { class: "filtros" }, grupos, seg)),
      selector,
      rosters,
      h("p", { class: "nota-pie", text: "Si el partido no está en la FEB, crea un amistoso: el rival se gestiona por dorsal y el nombre es opcional." }),
    );
  }

  function listaPartidos() {
    const filtrados = st.partidos.filter((p) => !st.buscar || `${p.equipo_local} ${p.equipo_visitante} ${p.fecha}`.toLowerCase().includes(st.buscar.toLowerCase()));
    const filas = filtrados.slice(0, 60).map((p) => h("button", { type: "button", class: "partido-fila" + (st.partido?.partido_id === p.partido_id ? " sel" : ""), onclick: () => seleccionarPartido(p) },
      h("span", { class: "pf-fecha", text: fechaCorta(p.fecha) }),
      h("span", { class: "pf-eq", text: p.equipo_local }),
      h("b", { class: "pf-pts", text: `${p.pts_local}–${p.pts_visitante}` }),
      h("span", { class: "pf-eq der", text: p.equipo_visitante }),
      h("span", { class: "pf-jor", text: jornadaTexto(p.jornada) })));
    return h("section", { class: "seccion" },
      h("div", { class: "seccion-cab" },
        h("h2", { text: "Partidos" }),
        h("div", { class: "buscador" }, icono("buscar"), h("input", { type: "search", placeholder: "Equipo o fecha…", value: st.buscar, oninput: (e) => { st.buscar = e.target.value; const lista = cuerpo.querySelector(".lista-partidos"); if (lista) pintarLista(lista); } }))),
      (st.localNombre ? h("p", { class: "sub", text: `Elegido: ${st.localNombre} vs ${st.visitanteNombre}` }) : null),
      h("div", { class: "lista-partidos" }, filas.length ? filas : h("p", { class: "sub", text: "No hay partidos con ese filtro." })));
  }

  function pintarLista(lista) {
    const filtrados = st.partidos.filter((p) => !st.buscar || `${p.equipo_local} ${p.equipo_visitante} ${p.fecha}`.toLowerCase().includes(st.buscar.toLowerCase()));
    limpiar(lista);
    if (!filtrados.length) { lista.append(h("p", { class: "sub", text: "No hay partidos con ese filtro." })); return; }
    for (const p of filtrados.slice(0, 60)) {
      lista.append(h("button", { type: "button", class: "partido-fila" + (st.partido?.partido_id === p.partido_id ? " sel" : ""), onclick: () => seleccionarPartido(p) },
        h("span", { class: "pf-fecha", text: fechaCorta(p.fecha) }),
        h("span", { class: "pf-eq", text: p.equipo_local }),
        h("b", { class: "pf-pts", text: `${p.pts_local}–${p.pts_visitante}` }),
        h("span", { class: "pf-eq der", text: p.equipo_visitante }),
        h("span", { class: "pf-jor", text: jornadaTexto(p.jornada) })));
    }
  }

  function amistoso() {
    const opciones = st.equipos.map((e) => h("option", { value: e.equipo_id, text: e.nombre, selected: e.nombre === st.localNombre }));
    return h("section", { class: "seccion" },
      h("div", { class: "seccion-cab" }, h("h2", { text: "Amistoso" })),
      h("div", { class: "rejilla dos" },
        h("article", { class: "card" },
          h("h3", { text: "Mi equipo" }),
          h("select", { onchange: async (e) => {
            const eq = st.equipos.find((x) => x.equipo_id === e.target.value);
            st.localId = e.target.value; st.localNombre = eq?.nombre || "";
            st.plantilla.visitante = dorsalesManual(st.rivalManual, st.rivalNombres);
            await cargarPlantillas(); pintar();
          } }, h("option", { value: "", text: "— Elige equipo —" }), opciones)),
        h("article", { class: "card" },
          h("h3", { text: "Rival" }),
          h("input", { type: "text", placeholder: "Nombre del rival", value: st.visitanteNombre, oninput: (e) => { st.visitanteNombre = e.target.value; st.visitanteId = ""; } }),
          h("p", { class: "sub", text: "Los dorsales se configuran debajo, en la tarjeta del visitante." }))));
  }

  cargarGrupo();
  return null;
}
