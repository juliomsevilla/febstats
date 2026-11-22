// Notas del partido: lista/explorador plegable y detalle a pantalla completa.
// Se crean desde la ventana del partido (heredan temporada, grupo y partido); aquí se leen y editan.
import { h, limpiar, btn, icono, mdNota, confirmar } from "../util.js";
import { app } from "../estado.js";
import { navegar } from "../app.js";
import { listarNotas, borrarNota, tituloDeNota, suscribirNotas } from "../notas-modelo.js";
import { abrirEditorNota } from "../notas-editor.js";
import { imagenDe } from "../grupo.js";

export function vistaNotas(cont, params = []) {
  const st = {
    texto: "", notas: [], sel: null,
    lado: (() => { try { return localStorage.getItem("fd-notas-lado") !== "0" && innerWidth > 820; } catch { return innerWidth > 820; } })(),
  };
  const urls = [];
  const raiz = h("div", { class: "notas" });
  cont.append(raiz);
  const pintar = () => { limpiar(raiz); destruirUrls(); construir(); };
  const cerrar = () => { off(); destruirUrls(); };
  const off = suscribirNotas(() => cargar());
  cargar();
  return cerrar;

  async function cargar() {
    try { st.notas = await listarNotas(); } catch (e) { console.error(e); st.notas = []; }
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
    return [n.titulo, n.cuerpo, n.temporada, n.grupo, n.equipo_txt, n.jugador_txt, n.partido_txt].filter(Boolean).join(" ").toLowerCase().includes(t);
  }

  function metaLinea(n) {
    return [n.temporada, n.grupo, n.equipo_txt, n.jugador_txt, n.partido_txt].filter(Boolean).join(" · ") || "Sin vínculo";
  }

  function extracto(n) {
    const t = String(n.cuerpo || "").replace(/[#>*_`\[\]]/g, "").replace(/\s+/g, " ").trim();
    return t.slice(0, 110);
  }

  function alternarLado() {
    st.lado = !st.lado;
    try { localStorage.setItem("fd-notas-lado", st.lado ? "1" : "0"); } catch { /* nada */ }
    raiz.classList.toggle("sin-lado", !st.lado);
  }

  function agrupar(filtradas) {
    const grupos = new Map();
    for (const n of filtradas) {
      const clave = n.partido ? `p:${n.partido}` : "sin";
      if (!grupos.has(clave)) {
        grupos.set(clave, {
          clave,
          partido: n.partido ? String(n.partido) : "",
          titulo: n.partido ? (n.partido_txt || `Partido ${n.partido}`) : "Sin partido asignado",
          notas: [],
          ultima: 0,
        });
      }
      const g = grupos.get(clave);
      g.notas.push(n);
      g.ultima = Math.max(g.ultima, Number(n.modificada) || 0);
    }
    const pid = app.sesion?.partidoId ? String(app.sesion.partidoId) : "";
    return [...grupos.values()].sort((a, b) => {
      if (pid) {
        if (a.partido === pid) return -1;
        if (b.partido === pid) return 1;
      }
      if (a.clave === "sin") return 1;
      if (b.clave === "sin") return -1;
      return b.ultima - a.ultima;
    });
  }

  function construir() {
    raiz.classList.toggle("sin-lado", !st.lado);
    const filtradas = st.notas.filter(coincide);
    const pid = app.sesion?.partidoId ? String(app.sesion.partidoId) : "";

    const fila = (n) => h("button", { type: "button", class: "nota-fila" + (st.sel === n.id ? " sel" : ""), onclick: () => { st.sel = n.id; pintar(); } },
      h("b", { text: tituloDeNota(n) }),
      h("span", { class: "sub", text: metaLinea(n) }),
      h("span", { class: "sub", text: extracto(n) }));

    const toggle = (extra = "") => h("button", {
      type: "button",
      class: "btn fantasma nota-toggle " + extra,
      title: "Mostrar u ocultar la lista de notas",
      "aria-label": "Mostrar u ocultar la lista de notas",
      onclick: alternarLado,
    }, "☰ Notas");

    const grupos = agrupar(filtradas);
    const bloqueGrupo = (g) => h("div", { class: "nota-grupo" + (g.partido && g.partido === pid ? " actual" : "") },
      h("div", { class: "ng-cab" },
        h("h4", { text: g.titulo }),
        h("span", { class: "pill", text: `${g.notas.length}` })),
      g.notas.map(fila));

    const lista = h("aside", { class: "notas-lista" },
      h("div", { class: "lista-cab compacta" },
        h("div", null, h("h1", { text: "Notas" }), h("p", { class: "sub", text: `${st.notas.length} nota${st.notas.length === 1 ? "" : "s"} · editables` })),
        h("div", { class: "acciones" }, toggle()),
        h("div", { class: "buscador" }, icono("buscar"), h("input", { type: "search", placeholder: "Buscar en notas…", value: st.texto, oninput: (e) => { st.texto = e.target.value; pintar(); } }))),
      grupos.length
        ? grupos.map(bloqueGrupo)
        : h("p", { class: "sub vacio-lista", text: st.texto ? "Ninguna nota con ese filtro." : "Todavía no hay notas." }));

    const sel = st.notas.find((n) => n.id === st.sel) || null;
    const detalle = h("article", { class: "nota-detalle card" });
    // Barra siempre presente para poder reabrir el explorador incluso sin nota seleccionada.
    detalle.append(h("div", { class: "nota-detalle-barra" }, toggle("solo-plegado")));
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
            btn("Editar", () => abrirEditorNota(sel, { onGuardada: async (g) => { st.sel = g.id; await cargar(); } }), { clase: "btn pequeno primario", icon: "notas" }),
            btn("Borrar", () => borrar(sel), { clase: "btn pequeno fantasma peligro-txt", icon: "cerrar" }))),
        h("div", { class: "nota-fechas sub", text: `Creada: ${sel.creada || "—"}${sel.modificada ? " · Modificada: " + new Date(Number(sel.modificada)).toLocaleString("es-ES") : ""}` }),
        h("div", { class: "md nota-cuerpo", html: mdNota(sel.cuerpo) }));
      resolverImagenes(detalle);
    } else {
      detalle.append(h("div", { class: "vacio" },
        h("strong", { text: "No hay notas todavía" }),
        h("p", { text: "Las notas se crean desde la ventana del partido en directo; heredan temporada, grupo y partido." }),
        app.sesion ? btn("Ir al partido", () => navegar("partido"), { clase: "btn primario", icon: "partido" }) : null));
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

  function resolverImagenes(el) {
    for (const marca of el.querySelectorAll("[data-img]")) {
      const src = marca.dataset.img || "";
      const nombre = src.split("/").pop();
      const im = app.grupo ? (imagenDe(app.grupo, nombre) || imagenDe(app.grupo, decodeURIComponent(nombre))) : null;
      if (im?.datos) {
        const bytes = im.datos instanceof Uint8Array ? im.datos : new Uint8Array(im.datos);
        const url = URL.createObjectURL(new Blob([bytes], { type: im.mime || "image/png" }));
        urls.push(url);
        marca.replaceWith(h("img", { class: "md-img", src: url, alt: "" }));
      }
    }
  }
}
