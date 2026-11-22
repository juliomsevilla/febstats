// Nuevo partido: partido oficial de la FEB, o equipos libres (del JSON o creados desde cero).
import { h, limpiar, btn, icono, toast, fechaCorta, jornadaTexto, dialogo, nombreJugador } from "../util.js";
import { crearCancha } from "../court.js";
import { app, abrirGrupo, nuevaSesion, crearGrupoSinDatos } from "../estado.js";
import { listarPartidos, plantillaDe, minutosRecientes, equiposDe, scoutingEquipo } from "../grupo.js";
import { navegar } from "../app.js";

const DEF_DORSALES = "4,5,6,7,8,9,10,11,12,13,14,15";
const LADOS = ["local", "visitante"];
const NOMBRE_DEF = { local: "EQUIPO LOCAL", visitante: "EQUIPO VISITANTE" };

export function vistaNuevo(cont) {
  const st = {
    grupoId: app.grupoId || app.grupos[0]?.id || "",
    modo: "oficial",
    partido: null,
    fuente: { local: "nuevo", visitante: "nuevo" },
    ids: { local: "", visitante: "" },
    nombres: { ...NOMBRE_DEF },
    manualNombre: { ...NOMBRE_DEF },
    manual: { local: { dorsales: DEF_DORSALES, nombres: "" }, visitante: { dorsales: DEF_DORSALES, nombres: "" } },
    colores: { local: "#2a5fd0", visitante: "#c2332b" },
    entrenadores: { local: "", visitante: "" },
    staff: { local: "", visitante: "" },
    plantilla: { local: [], visitante: [] },
    titulares: new Set(),
    buscar: "",
    cargando: false,
    equipos: [],
    partidos: [],
    competicion: "",
    grupo: "",
    temporada: "",
  };
  const cuerpo = h("div", { class: "nuevo" });
  cont.append(cuerpo);

  if (!app.grupos.length) {
    const sinDatos = async () => {
      try { await crearGrupoSinDatos(); navegar("nuevo"); }
      catch (e) { toast("No se pudo empezar: " + e.message, "error"); }
    };
    cuerpo.append(h("div", { class: "vacio" },
      h("strong", { text: "Sin datos FEB" }),
      h("p", { text: "Puedes empezar a anotar ya con dos equipos nuevos. Si quieres plantillas, informes y partidos de la FEB, importa el JSON." }),
      h("div", { class: "acciones centradas" },
        btn("Empezar sin datos", sinDatos, { clase: "btn primario", icon: "partido" }),
        btn("Importar datos", () => navegar("inicio"), { clase: "btn", icon: "importar" }))));
    return null;
  }

  const pintar = () => { limpiar(cuerpo); construir(); };

  // ---------------- equipos ----------------

  function jugadoresManual(lado) {
    const ds = String(st.manual[lado].dorsales || "").split(/[,\s;]+/).map((x) => x.trim()).filter(Boolean);
    const ns = String(st.manual[lado].nombres || "").split("\n").map((x) => x.trim());
    const vistos = new Set();
    return ds.filter((d) => { if (vistos.has(d)) return false; vistos.add(d); return true; })
      .slice(0, 20)
      .map((d, i) => ({ dorsal: d, nombre: ns[i] || `#${d}`, jugadorId: null, minutos: 0 }));
  }

  function limpiarTitulares(lado) {
    for (const k of [...st.titulares]) if (k.startsWith(lado + ":")) st.titulares.delete(k);
  }

  function aplicarManual(lado) {
    st.plantilla[lado] = jugadoresManual(lado);
    const validos = new Set(st.plantilla[lado].map((j) => j.dorsal));
    const tit = new Set();
    for (const k of st.titulares) {
      if (!k.startsWith(lado + ":")) continue;
      const d = k.slice(lado.length + 1);
      if (validos.has(d)) tit.add(d);
    }
    // Al cambiar la lista se conservan los titulares que sigan existiendo y se
    // completa hasta 5 con los primeros disponibles.
    for (const j of st.plantilla[lado]) { if (tit.size >= 5) break; tit.add(j.dorsal); }
    limpiarTitulares(lado);
    for (const d of tit) st.titulares.add(`${lado}:${d}`);
  }

  async function cargarPlantilla(lado, equipoId) {
    limpiarTitulares(lado);
    if (!equipoId) { st.plantilla[lado] = []; return; }
    const db = await abrirGrupo(st.grupoId);
    const min = minutosRecientes(db, equipoId, 5);
    const filas = plantillaDe(db, equipoId).map((j) => ({
      dorsal: String(j.dorsal || ""), nombre: j.jugador || j.nombre || `#${j.dorsal}`, jugadorId: j.jugador_id || null,
      minutos: min.get(String(j.jugador_id || j.dorsal))?.seg || 0,
    })).filter((j) => j.dorsal);
    // Dorsales repetidos en la FEB: se queda el que más ha jugado (el boxscore exige dorsal único).
    const porDorsal = new Map();
    for (const j of filas.sort((a, b) => b.minutos - a.minutos)) if (!porDorsal.has(j.dorsal)) porDorsal.set(j.dorsal, j);
    st.plantilla[lado] = [...porDorsal.values()].sort((a, b) => (+a.dorsal || 999) - (+b.dorsal || 999) || a.dorsal.localeCompare(b.dorsal));
    for (const j of [...st.plantilla[lado]].sort((a, b) => b.minutos - a.minutos).slice(0, 5)) st.titulares.add(`${lado}:${j.dorsal}`);
  }

  async function elegirFuente(lado, valor) {
    if (valor === "") {
      st.fuente[lado] = "nuevo";
      st.ids[lado] = "";
      st.nombres[lado] = st.manualNombre[lado] || NOMBRE_DEF[lado];
      limpiarTitulares(lado);
      aplicarManual(lado);
      pintar();
      return;
    }
    st.fuente[lado] = "json";
    st.ids[lado] = valor;
    st.nombres[lado] = st.equipos.find((e) => e.equipo_id === valor)?.nombre || "";
    await cargarPlantilla(lado, valor);
    pintar();
  }

  function resetEquipos() {
    st.partido = null;
    st.fuente = { local: "nuevo", visitante: "nuevo" };
    st.ids = { local: "", visitante: "" };
    st.nombres = { ...NOMBRE_DEF };
    st.manualNombre = { ...NOMBRE_DEF };
    st.manual = { local: { dorsales: DEF_DORSALES, nombres: "" }, visitante: { dorsales: DEF_DORSALES, nombres: "" } };
    st.colores = { local: "#2a5fd0", visitante: "#c2332b" };
    st.entrenadores = { local: "", visitante: "" };
    st.staff = { local: "", visitante: "" };
    st.plantilla = { local: [], visitante: [] };
    st.titulares.clear();
    aplicarManual("local");
    aplicarManual("visitante");
  }

  async function cargarGrupo() {
    const db = await abrirGrupo(st.grupoId);
    st.equipos = equiposDe(db);
    st.partidos = listarPartidos(db, { soloOficiales: true });
    const r = app.grupos.find((g) => g.id === st.grupoId)?.resumen || {};
    st.competicion = r.competicion || ""; st.grupo = r.grupo || ""; st.temporada = r.temporada || "";
    // Un grupo sin datos FEB (o sin equipos) empieza directamente en equipos libres.
    if (!st.equipos.length && !st.partidos.length) st.modo = "libre";
    pintar();
  }

  async function seleccionarPartido(p) {
    try {
      st.modo = "oficial";
      st.partido = p;
      st.fuente = { local: "json", visitante: "json" };
      st.ids = { local: p.local_id ? String(p.local_id) : "", visitante: p.visitante_id ? String(p.visitante_id) : "" };
      st.nombres = { local: p.equipo_local || "", visitante: p.equipo_visitante || "" };
      st.titulares.clear();
      await cargarPlantilla("local", p.local_id);
      await cargarPlantilla("visitante", p.visitante_id);
      pintar();
    } catch (e) {
      console.error(e); toast("No se pudo cargar el partido: " + e.message, "error");
    }
  }

  // ---------------- interfaz ----------------

  function rosterConfig(lado) {
    const select = h("select", { onchange: (e) => elegirFuente(lado, e.target.value) },
      h("option", { value: "", selected: st.fuente[lado] !== "json", text: "Equipo nuevo (sin datos)" }),
      st.equipos.map((e) => h("option", { value: e.equipo_id, selected: st.fuente[lado] === "json" && st.ids[lado] === e.equipo_id, text: e.nombre })));

    const campos = st.fuente[lado] === "nuevo" ? [
      h("label", null, h("span", { text: "Nombre del equipo" }),
        h("input", { type: "text", value: st.nombres[lado], placeholder: NOMBRE_DEF[lado], oninput: (e) => { st.nombres[lado] = e.target.value; st.manualNombre[lado] = e.target.value; } })),
      h("label", null, h("span", { text: "Dorsales" }),
        h("input", { type: "text", value: st.manual[lado].dorsales, placeholder: DEF_DORSALES, oninput: (e) => { st.manual[lado].dorsales = e.target.value; } })),
      h("label", null, h("span", { text: "Nombres (opcional, uno por línea)" }),
        h("textarea", { rows: 3, value: st.manual[lado].nombres, placeholder: "En el mismo orden que los dorsales", oninput: (e) => { st.manual[lado].nombres = e.target.value; } })),
      h("div", { class: "acciones" },
        btn("Aplicar plantilla", () => { aplicarManual(lado); pintar(); }, { clase: "btn pequeno", icon: "importado" }),
        h("span", { class: "sub", text: `${st.plantilla[lado].length} jugadores` })),
    ] : [h("p", { class: "sub", text: "Plantilla cargada del JSON." })];

    return h("div", { class: "roster-config" },
      h("label", null, h("span", { text: "Equipo" }), select),
      h("div", { class: "roster-config-dos" },
        h("label", null, h("span", { text: "Color del equipo" }),
          h("input", {
            type: "color", value: st.colores[lado],
            oninput: (e) => {
              st.colores[lado] = e.target.value;
              e.target.closest(".roster")?.style.setProperty("--eq-color", e.target.value);
            },
          })),
        h("label", null, h("span", { text: "Entrenador principal (opcional)" }),
          h("input", { type: "text", value: st.entrenadores[lado], placeholder: "Nombre del entrenador", oninput: (e) => { st.entrenadores[lado] = e.target.value; } }))),
      h("label", { class: "roster-staff" }, h("span", { text: "Cuerpo técnico (opcional, uno por línea)" }),
        h("textarea", {
          rows: 2, value: st.staff[lado],
          placeholder: "Ayudante, preparador físico, delegado…",
          oninput: (e) => { st.staff[lado] = e.target.value; },
        })),
      campos);
  }

  function rosterCard(lado, editable) {
    const jugadores = st.plantilla[lado] || [];
    const nombre = st.nombres[lado] || NOMBRE_DEF[lado];
    const tit = [...st.titulares].filter((t) => t.startsWith(lado + ":")).length;
    const lista = jugadores.map((j) => {
      const on = st.titulares.has(`${lado}:${j.dorsal}`);
      const nombre = nombreJugador(j.nombre, j.dorsal);
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
          nombre ? h("span", { class: "nombre", text: nombre }) : null,
          on ? h("span", { class: "pill ok", text: "Titular" }) : null));
    });
    return h("article", { class: "card roster " + lado, style: `--eq-color:${st.colores[lado]}` },
      h("div", { class: "roster-cab" },
        h("div", null, h("h3", { text: nombre }), h("p", { class: "sub", text: `${lado === "local" ? "Local" : "Visitante"} · ${tit} titulares` })),
        h("span", { class: "pill", text: `${jugadores.length} jug.` })),
      editable ? rosterConfig(lado) : null,
      jugadores.length
        ? h("ul", { class: "roster-lista" }, lista)
        : h("p", { class: "sub", text: st.fuente[lado] === "nuevo" ? "Sin jugadores. Escribe dorsales y pulsa «Aplicar plantilla»." : "Ese equipo no tiene plantilla en el JSON." }));
  }

  function introLibre() {
    return h("section", { class: "seccion" },
      h("div", { class: "seccion-cab" }, h("h2", { text: "Equipos libres" }), h("span", { class: "pill", text: "Del JSON o nuevos" })),
      h("p", { class: "sub", text: "Para cada lado puedes elegir un equipo cargado del JSON (con su plantilla e informe) o crear uno nuevo con sus dorsales." }));
  }

  function seccionScouting() {
    const lados = LADOS.filter((l) => st.fuente[l] === "json" && st.ids[l]);
    if (!lados.length) return null;
    return h("section", { class: "seccion" },
      h("div", { class: "seccion-cab" }, h("h2", { text: "Informe de scouting" }), h("span", { class: "pill", text: "Temporada · tiros y perfiles del paquete" })),
      h("div", { class: "rejilla dos" }, lados.map((lado) => {
        try { return tarjetaScouting(lado, st.ids[lado], st.nombres[lado]); } catch (e) { console.error(e); return null; }
      })));
  }

  function tarjetaScouting(lado, equipoId, nombre) {
    const inf = scoutingEquipo(app.grupo, equipoId);
    const c = inf.clas || {};
    const cancha = crearCancha({ interactiva: false });
    cancha.pintarTiros(inf.tiros.slice(0, 900), {
      basketPorTiro: () => (lado === "local" ? "left" : "right"),
    });
    return h("article", { class: "card scouting " + lado, style: `--eq-color:${st.colores[lado]}` },
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
        inf.jugadores.slice(0, 5).map((j) => h("div", { class: "scout-jug" },
          h("span", { class: "dorsal", text: `#${j.dorsal}` }),
          h("span", { class: "nombre", text: nombreJugador(j.nombre, j.dorsal) }),
          h("span", { class: "perfil", text: j.perfil || j.rol || "" }),
          h("b", { text: j.partidos ? (j.puntos / j.partidos).toFixed(1) : "—" })))),
      h("div", { class: "scout-cancha" }, cancha.el),
      h("div", { class: "scout-tiros" },
        h("span", null, h("b", { text: `${inf.resumen.t2a}/${inf.resumen.t2i}` }), " T2 · ", h("b", { text: inf.resumen.pct2 + "%" })),
        h("span", null, h("b", { text: `${inf.resumen.t3a}/${inf.resumen.t3i}` }), " T3 · ", h("b", { text: inf.resumen.pct3 + "%" }))));
  }

  const dato = (l, v) => h("div", { class: "scout-dato" }, h("span", { text: l }), h("b", { text: v }));

  // ---------------- empezar ----------------

  async function empezar() {
    const p = st.modo === "oficial" ? st.partido : null;
    if (st.modo === "oficial" && !p) { toast("Elige un partido de la lista.", "aviso"); return; }
    for (const lado of LADOS) {
      if (st.fuente[lado] === "nuevo") aplicarManual(lado);
      st.nombres[lado] = String(st.nombres[lado] || "").trim();
      if (!st.nombres[lado]) { toast(`Pon un nombre al equipo ${lado}.`, "aviso"); return; }
      if (!st.plantilla[lado].length) { toast(`Añade dorsales al equipo ${lado}.`, "aviso"); return; }
    }
    if (st.nombres.local.toLowerCase() === st.nombres.visitante.toLowerCase()) { toast("Los dos equipos deben tener nombres distintos.", "aviso"); return; }

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
    const staff = (lado) => String(st.staff[lado] || "").split("\n").map((x) => x.trim()).filter(Boolean);
    try {
      await nuevaSesion({
        grupoId: st.grupoId, partido: p,
        local: { equipoId: st.fuente.local === "json" ? st.ids.local || null : null, nombre: st.nombres.local, color: st.colores.local, entrenador: st.entrenadores.local.trim(), staff: staff("local"), jugadores: jug("local") },
        visitante: { equipoId: st.fuente.visitante === "json" ? st.ids.visitante || null : null, nombre: st.nombres.visitante, color: st.colores.visitante, entrenador: st.entrenadores.visitante.trim(), staff: staff("visitante"), jugadores: jug("visitante") },
        competicion: p ? st.competicion : "AMISTOSO",
        grupo: p ? st.grupo : "Amistoso",
        temporada: st.temporada,
        jornada: p?.jornada || "",
        fecha: p?.fecha || new Date().toISOString().slice(0, 16).replace("T", " "),
      });
      navegar("partido");
    } catch (e) {
      console.error(e); st.cargando = false; pintar(); toast(e.message, "error");
    }
  }

  // ---------------- construir ----------------

  function construir() {
    const grupos = app.grupos.length > 1
      ? h("div", { class: "campo" }, h("label", { text: "Grupo de datos" }),
        h("select", { onchange: async (e) => { st.grupoId = e.target.value; resetEquipos(); await cargarGrupo(); } },
          app.grupos.map((g) => h("option", { value: g.id, selected: g.id === st.grupoId, text: `${g.resumen?.competicion} · ${g.resumen?.grupo} ${g.resumen?.temporada}` }))))
      : null;

    const seg = h("div", { class: "seg" },
      h("button", { type: "button", class: st.modo === "oficial" ? "on" : "", onclick: () => { st.modo = "oficial"; pintar(); } }, "Partido oficial"),
      h("button", { type: "button", class: st.modo === "libre" ? "on" : "", onclick: () => { st.modo = "libre"; st.partido = null; pintar(); } }, "Equipos libres"));

    const selector = st.modo === "oficial" ? listaPartidos() : introLibre();
    const editable = st.modo === "libre";
    const mostrarPlantillas = editable || !!st.partido;

    const plantillas = mostrarPlantillas
      ? h("section", { class: "seccion" },
        h("div", { class: "seccion-cab" }, h("h2", { text: "Plantillas y titulares" }), h("span", { class: "pill", text: "Toca para marcar los 5 iniciales" })),
        h("div", { class: "rejilla dos" }, rosterCard("local", editable), rosterCard("visitante", editable)),
        seccionScouting(),
        h("div", { class: "acciones centradas" },
          btn("Intercambiar local/visitante", () => {
            for (const k of ["fuente", "ids", "nombres", "manualNombre", "manual", "plantilla", "colores", "entrenadores", "staff"]) {
              [st[k].local, st[k].visitante] = [st[k].visitante, st[k].local];
            }
            const tits = new Set();
            for (const t of st.titulares) { const [l, d] = t.split(":"); tits.add(`${l === "local" ? "visitante" : "local"}:${d}`); }
            st.titulares = tits;
            pintar();
          }, { clase: "btn", icon: "cambiar" }),
          btn(st.cargando ? "Creando…" : "Empezar partido", empezar, { clase: "btn primario grande", icon: "play", disabled: st.cargando })))
      : h("section", { class: "seccion" },
        h("div", { class: "card" }, h("p", { class: "sub", text: "Elige un partido de la lista de arriba para cargar sus equipos y plantillas." })));

    cuerpo.append(
      h("div", { class: "nuevo-cab" },
        h("div", null,
          h("h1", { text: "Nuevo partido" }),
          h("p", { class: "sub", text: "Partido oficial de la FEB, o equipos libres: del JSON o creados desde cero." })),
        h("div", { class: "filtros" }, grupos, seg)),
      selector,
      plantillas,
      h("p", { class: "nota-pie", text: "Un equipo del JSON usa su plantilla y su informe de scouting. Un equipo nuevo se gestiona por dorsal; el nombre es obligatorio y los nombres de jugador son opcionales." }),
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
      st.partido ? h("p", { class: "sub", text: `Elegido: ${st.partido.equipo_local} vs ${st.partido.equipo_visitante}` }) : null,
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

  resetEquipos();
  cargarGrupo();
  return null;
}
