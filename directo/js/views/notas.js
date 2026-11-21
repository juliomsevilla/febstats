// Notas editables, como en FEBstats: título, cuerpo Markdown y vínculo con temporada,
// grupo, partido, equipo y jugador. Se guardan en IndexedDB y se exportan a directo_notas.
import { h, limpiar, btn, icono, md, toast, confirmar, dialogo, fechaCorta } from "../util.js";
import { app, abrirGrupo } from "../estado.js";
import { listarNotas, guardarNota, borrarNota, notaNueva, tituloDeNota } from "../notas-modelo.js";
import { equiposDe, plantillaDe, listarPartidos, imagenDe } from "../grupo.js";

const LADOS = ["local", "visitante"];
const GIF = "data:image/gif;base64,R0lGODlhAQABAAAAACw=";
const mdNota = (t) => md(t).replace(/src="(?!data:|https?:)([^"]+)"/g, `src="${GIF}" data-img="$1"`);

export function vistaNotas(cont, params = []) {
  const st = { texto: "", notas: [], sel: null };
  const urls = [];
  const raiz = h("div", { class: "notas" });
  cont.append(raiz);
  const pintar = () => { limpiar(raiz); destruirUrls(); construir(); };
  const cerrar = () => destruirUrls();
  cargar();
  return cerrar;

  async function cargar() {
    try {
      st.notas = await listarNotas();
    } catch (e) {
      console.error(e);
      st.notas = [];
    }
    if (params[0]) {
      const n = st.notas.find((x) => x.id === params[0] || x.id === `pkg:${params[0]}`);
      if (n) st.sel = n.id;
    }
    if (!st.sel || !st.notas.some((n) => n.id === st.sel)) {
      const delPartido = notasDelPartido();
      st.sel = delPartido[0]?.id || st.notas[0]?.id || null;
    }
    pintar();
  }

  function destruirUrls() { for (const u of urls.splice(0)) URL.revokeObjectURL(u); }

  function notasDelPartido() {
    const pid = app.sesion?.partidoId;
    return pid ? st.notas.filter((n) => String(n.partido) === String(pid)) : [];
  }

  function coincide(n) {
    if (!st.texto) return true;
    const t = st.texto.toLowerCase();
    return [n.titulo, n.cuerpo, n.temporada, n.grupo, n.equipo_txt, n.jugador_txt, n.partido_txt]
      .filter(Boolean).join(" ").toLowerCase().includes(t);
  }

  function metaLinea(n) {
    return [n.temporada, n.grupo, n.equipo_txt, n.jugador_txt, n.partido_txt].filter(Boolean).join(" · ") || "Sin vínculo";
  }

  function extracto(n) {
    const t = String(n.cuerpo || "").replace(/[#>*_`\[\]]/g, "").replace(/\s+/g, " ").trim();
    return t.slice(0, 100);
  }

  function construir() {
    const filtradas = st.notas.filter(coincide);
    const pid = app.sesion?.partidoId;
    const delPartido = pid ? filtradas.filter((n) => String(n.partido) === String(pid)) : [];
    const otras = pid ? filtradas.filter((n) => String(n.partido) !== String(pid)) : filtradas;

    const fila = (n) => h("button", { type: "button", class: "nota-fila" + (st.sel === n.id ? " sel" : ""), onclick: () => { st.sel = n.id; pintar(); } },
      h("b", { text: tituloDeNota(n) }),
      h("span", { class: "sub", text: metaLinea(n) }),
      h("span", { class: "sub", text: extracto(n) }));

    const lista = h("aside", { class: "notas-lista" },
      h("div", { class: "lista-cab compacta" },
        h("div", null, h("h1", { text: "Notas" }), h("p", { class: "sub", text: `${st.notas.length} nota${st.notas.length === 1 ? "" : "s"} · editables` })),
        h("div", { class: "acciones" },
          btn("Nueva nota", () => abrirEditor(null), { clase: "btn pequeno primario", icon: "mas" })),
        h("div", { class: "buscador" }, icono("buscar"), h("input", { type: "search", placeholder: "Buscar en notas…", value: st.texto, oninput: (e) => { st.texto = e.target.value; pintar(); } }))),
      app.sesion ? h("div", { class: "nota-seccion" },
        h("h4", { text: `Del partido (${delPartido.length})` }),
        delPartido.length ? delPartido.map(fila) : h("p", { class: "sub vacio-lista", text: "Sin notas de este partido." })) : null,
      h("div", { class: "nota-seccion" },
        h("h4", { text: pid ? `Otras notas (${otras.length})` : `Notas (${otras.length})` }),
        otras.length ? otras.map(fila) : h("p", { class: "sub vacio-lista", text: st.texto ? "Ninguna nota con ese filtro." : "Todavía no hay notas." })));

    const sel = st.notas.find((n) => n.id === st.sel) || null;
    const detalle = h("article", { class: "nota-detalle card" });
    if (sel) {
      detalle.append(
        h("div", { class: "nd-cab" },
          h("div", null,
            h("h2", { text: tituloDeNota(sel) }),
            h("p", { class: "sub", text: metaLinea(sel) }),
            h("div", { class: "nota-meta-pills" },
              sel.temporada ? h("span", { class: "pill", text: sel.temporada }) : null,
              sel.grupo ? h("span", { class: "pill", text: sel.grupo }) : null,
              sel.partido_txt ? h("span", { class: "pill", text: sel.partido_txt }) : null,
              sel.equipo_txt ? h("span", { class: "pill", text: `Equipo: ${sel.equipo_txt}` }) : null,
              sel.jugador_txt ? h("span", { class: "pill", text: `Jugador: ${sel.jugador_txt}` }) : null)),
          h("div", { class: "acciones" },
            btn("Editar", () => abrirEditor(sel), { clase: "btn pequeno primario", icon: "notas" }),
            btn("Borrar", () => borrar(sel), { clase: "btn pequeno fantasma peligro-txt", icon: "cerrar" }))),
        h("div", { class: "nota-fechas sub", text: `Creada: ${sel.creada || "—"}${sel.modificada ? " · Modificada: " + new Date(Number(sel.modificada)).toLocaleString("es-ES") : ""}` }),
        h("div", { class: "md", html: mdNota(sel.cuerpo) }));
      resolverImagenes(detalle);
    } else {
      detalle.append(h("div", { class: "vacio" },
        h("strong", { text: "Elige una nota" }),
        h("p", { text: "Crea una nota para guardar ajustes, informes o detalles de un partido, equipo o jugador." }),
        btn("Nueva nota", () => abrirEditor(null), { clase: "btn primario", icon: "mas" })));
    }
    raiz.append(lista, detalle);
  }

  async function borrar(n) {
    const ok = await confirmar("Borrar nota", `Se borrará «${tituloDeNota(n)}» de este iPad.`, { ok: "Borrar", peligro: true });
    if (!ok) return;
    await borrarNota(n.id);
    st.sel = null;
    await cargar();
  }

  // ---------------- editor ----------------

  function datosBase() {
    const gid = app.sesion?.grupoId || app.grupoId;
    const r = app.grupos.find((g) => g.id === gid)?.resumen || {};
    const lado = app.seleccion?.lado;
    const eq = lado && app.sesion ? app.sesion[lado] : null;
    const jug = lado && app.sesion ? app.sesion.jugadores[lado].find((j) => j.dorsal === String(app.seleccion.dorsal)) : null;
    return {
      temporada: app.sesion?.temporada || r.temporada || "",
      grupo: app.sesion?.grupo || r.grupo || "",
      partido: app.sesion?.partidoId || "",
      partido_txt: app.sesion ? `${app.sesion.local.nombre} vs ${app.sesion.visitante.nombre}` : "",
      equipo: eq?.equipoId || "",
      equipo_txt: eq?.nombre || "",
      jugador: jug?.jugadorId || "",
      jugador_txt: jug?.nombre || "",
    };
  }

  function partidosDisponibles() {
    const ps = app.grupo ? listarPartidos(app.grupo, { soloOficiales: true }) : [];
    if (app.sesion && !ps.some((p) => String(p.partido_id) === String(app.sesion.partidoId))) {
      ps.unshift({ partido_id: app.sesion.partidoId, equipo_local: app.sesion.local.nombre, equipo_visitante: app.sesion.visitante.nombre, fecha: app.sesion.fecha, jornada: app.sesion.jornada });
    }
    return ps;
  }
  function textoPartido(p) {
    const eq = p.equipo_visitante ? `${p.equipo_local} vs ${p.equipo_visitante}` : (p.equipo_local || p.partido_txt || String(p.partido_id || ""));
    return [p.fecha ? fechaCorta(p.fecha) : "", eq].filter(Boolean).join(" · ");
  }

  function equiposDisponibles() {
    const arr = [];
    for (const e of app.grupo ? equiposDe(app.grupo) : []) arr.push({ value: `id:${e.equipo_id}`, id: e.equipo_id, txt: e.nombre });
    if (app.sesion) for (const lado of LADOS) {
      const eq = app.sesion[lado];
      if (eq.equipoId && arr.some((x) => x.id === eq.equipoId)) continue;
      if (arr.some((x) => x.txt === eq.nombre)) continue;
      arr.push({ value: `ses:${lado}`, id: eq.equipoId || "", txt: eq.nombre });
    }
    return arr;
  }

  function jugadoresDelEquipo(opcion) {
    const arr = [];
    if (!opcion) return arr;
    if (opcion.value.startsWith("ses:")) {
      const lado = opcion.value.slice(4);
      for (const j of app.sesion?.jugadores[lado] || []) arr.push({ value: `d:${j.dorsal}`, id: j.jugadorId || "", txt: j.nombre });
    } else if (opcion.value.startsWith("id:") && app.grupo) {
      for (const j of plantillaDe(app.grupo, opcion.id)) arr.push({ value: `j:${j.jugador_id || j.dorsal}`, id: j.jugador_id || "", txt: j.nombre || j.jugador || "" });
    }
    const vistos = new Set();
    return arr.filter((x) => { if (vistos.has(x.value)) return false; vistos.add(x.value); return true; });
  }

  async function abrirEditor(nota) {
    if (nota) await abrirGrupoDeNota(nota);
    const form = nota ? { ...nota } : { ...notaNueva(), ...datosBase() };
    const ps = partidosDisponibles();
    if (form.partido && !ps.some((p) => String(p.partido_id) === String(form.partido))) {
      ps.unshift({ partido_id: form.partido, equipo_local: form.partido_txt || String(form.partido), equipo_visitante: "" });
    }
    const eqs = equiposDisponibles();
    const eqValor = (() => {
      if (form.equipo) return eqs.find((x) => x.id === form.equipo)?.value || `edit:${form.equipo}`;
      if (form.equipo_txt) return eqs.find((x) => x.txt === form.equipo_txt)?.value || "";
      return "";
    })();
    if (form.equipo && !eqs.some((x) => x.id === form.equipo)) eqs.push({ value: `edit:${form.equipo}`, id: form.equipo, txt: form.equipo_txt || form.equipo });
    let jugs = jugadoresDelEquipo(eqs.find((x) => x.value === eqValor));
    if (form.jugador && !jugs.some((x) => x.id === form.jugador)) jugs.push({ value: `edit:${form.jugador}`, id: form.jugador, txt: form.jugador_txt || form.jugador });

    const opciones = (lista, valor, vacio) => [h("option", { value: "", selected: !valor ? "" : null }, vacio), ...lista.map((o) => h("option", { value: o.value, selected: o.value === valor ? "" : null, "data-id": o.id, "data-txt": o.txt }, o.txt))];
    const opcionesPartido = (valor) => [h("option", { value: "", selected: !valor ? "" : null }, "Sin partido"), ...ps.map((p) => h("option", { value: String(p.partido_id), selected: String(p.partido_id) === String(valor) ? "" : null, "data-txt": textoPartido(p) }, textoPartido(p)))];

    const campo = (etiqueta, el) => h("label", { class: "nota-campo" }, h("span", { text: etiqueta }), el);
    const titulo = h("input", { type: "text", value: form.titulo || "", placeholder: "Título (si lo dejas vacío se usa la primera línea)", oninput: (e) => { form.titulo = e.target.value; } });
    const temporada = h("input", { type: "text", value: form.temporada || "", placeholder: "2026/2027", oninput: (e) => { form.temporada = e.target.value; } });
    const grupo = h("input", { type: "text", value: form.grupo || "", placeholder: "Liga Regular «D-B»", oninput: (e) => { form.grupo = e.target.value; } });
    const partido = h("select", { onchange: (e) => { form.partido = e.target.value; form.partido_txt = e.target.selectedOptions[0]?.dataset.txt || ""; } }, opcionesPartido(form.partido));
    const equipo = h("select", { onchange: (e) => {
      const o = eqs.find((x) => x.value === e.target.value);
      form.equipo = o?.id || ""; form.equipo_txt = o?.txt || "";
      jugs = jugadoresDelEquipo(o);
      jugador.replaceChildren(...opciones(jugs, "", "Sin jugador"));
      form.jugador = ""; form.jugador_txt = "";
    } }, opciones(eqs, eqValor, "Sin equipo"));
    const jugValor = form.jugador
      ? (jugs.find((x) => x.id === form.jugador)?.value || `edit:${form.jugador}`)
      : (form.jugador_txt ? (jugs.find((x) => x.txt === form.jugador_txt)?.value || "") : "");
    const jugador = h("select", { onchange: (e) => {
      const o = jugs.find((x) => x.value === e.target.value);
      form.jugador = o?.id || ""; form.jugador_txt = o?.txt || "";
    } }, opciones(jugs, jugValor, "Sin jugador"));
    const cuerpo = h("textarea", { rows: 12, placeholder: "Escribe en Markdown…", oninput: (e) => { form.cuerpo = e.target.value; preview.innerHTML = mdNota(form.cuerpo); } }, form.cuerpo || "");
    const preview = h("div", { class: "md nota-preview", html: mdNota(form.cuerpo || "") });

    const d = dialogo(nota ? "Editar nota" : "Nueva nota", h("div", { class: "nota-form" },
      campo("Título", titulo),
      h("div", { class: "nota-form-dos" }, campo("Temporada", temporada), campo("Grupo", grupo)),
      campo("Partido", partido),
      h("div", { class: "nota-form-dos" }, campo("Equipo", equipo), campo("Jugador", jugador)),
      campo("Texto (Markdown)", cuerpo),
      h("details", { class: "nota-preview-box" }, h("summary", { text: "Vista previa" }), preview),
      h("div", { class: "acciones" },
        btn("Cancelar", () => d.close(), { clase: "btn" }),
        btn("Guardar", async () => {
          form.cuerpo = cuerpo.value;
          if (!String(form.titulo || "").trim() && !String(form.cuerpo || "").trim()) { toast("Escribe un título o un texto.", "aviso"); return; }
          const guardada = await guardarNota({ ...nota, ...form, id: nota?.id || form.id || "" });
          d.close();
          st.sel = guardada.id;
          await cargar();
        }, { clase: "btn primario", icon: "importado" }))), { ancho: "ancho", sub: "Se puede vincular a temporada, partido, equipo y/o jugador." });
  }

  /** Si la nota pertenece a otro grupo/temporada, abre ese grupo para tener sus partidos, equipos y jugadores. */
  async function abrirGrupoDeNota(nota) {
    try {
      if (nota.partido && app.sesion && String(nota.partido) === String(app.sesion.partidoId)) {
        if (app.grupoId !== app.sesion.grupoId) await abrirGrupo(app.sesion.grupoId);
        return;
      }
      const norm = (t) => String(t || "").toLowerCase().normalize("NFD").replace(/[\u0300-\u036f]/g, "").replace(/[^a-z0-9]/g, "");
      const cand = app.grupos.filter((g) => {
        const r = g.resumen || {};
        return (nota.temporada && norm(r.temporada) === norm(nota.temporada)) || (nota.grupo && norm(r.grupo) === norm(nota.grupo));
      });
      const exacto = cand.find((g) => {
        const r = g.resumen || {};
        return norm(r.temporada) === norm(nota.temporada) && norm(r.grupo) === norm(nota.grupo);
      });
      const elegido = exacto || cand[0];
      if (elegido && elegido.id !== app.grupoId) await abrirGrupo(elegido.id);
    } catch (e) { console.error(e); }
  }

  function resolverImagenes(el) {
    for (const img of el.querySelectorAll("img")) {
      const src = img.dataset.img || img.getAttribute("src") || "";
      const nombre = src.split("/").pop();
      const im = app.grupo ? (imagenDe(app.grupo, nombre) || imagenDe(app.grupo, decodeURIComponent(nombre))) : null;
      if (im?.datos) {
        const bytes = im.datos instanceof Uint8Array ? im.datos : new Uint8Array(im.datos);
        const url = URL.createObjectURL(new Blob([bytes], { type: im.mime || "image/png" }));
        urls.push(url);
        img.src = url;
      } else {
        img.replaceWith(h("span", { class: "img-falta", text: `Imagen no incluida: ${nombre}` }));
      }
    }
  }
}
