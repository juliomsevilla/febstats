// Notas: las del partido en directo (se guardan como eventos) y las importadas del paquete.
import { h, limpiar, btn, icono, md, toast, confirmar, pedirTexto, mmss } from "../util.js";
import { app, agregar, anularEvento, notasDelPartido, etiquetaPeriodo } from "../estado.js";
import { notasDe, imagenDe } from "../grupo.js";
import { navegar } from "../app.js";

export function vistaNotas(cont, params = []) {
  const hayDatos = !!app.grupo || !!app.sesion;
  if (!hayDatos) {
    cont.append(h("div", { class: "vacio" }, h("strong", { text: "Sin notas" }),
      h("p", { text: "Importa un paquete o empieza un partido para anotar cosas del partido." }),
      h("div", { class: "acciones centradas" },
        btn("Ir a importar", () => navegar("inicio"), { clase: "btn primario", icon: "importar" }),
        btn("Nuevo partido", () => navegar("nuevo"), { clase: "btn", icon: "partido" }))));
    return null;
  }

  const st = { texto: "", sel: null, importadas: app.grupo ? notasDe(app.grupo) : [], partido: notasDelPartido() };
  const urls = [];
  const raiz = h("div", { class: "notas" });
  cont.append(raiz);
  const pintar = () => { limpiar(raiz); destruirUrls(); construir(); };
  const cerrar = () => destruirUrls();

  if (params[0]) {
    const n = st.importadas.find((x) => String(x.id) === String(params[0]));
    if (n) st.sel = { tipo: "importada", id: n.id };
  }
  if (!st.sel && st.partido.length) st.sel = { tipo: "partido", uid: st.partido[0].uid };
  if (!st.sel && st.importadas.length) st.sel = { tipo: "importada", id: st.importadas[0].id };
  pintar();
  return cerrar;

  function destruirUrls() { for (const u of urls.splice(0)) URL.revokeObjectURL(u); }

  function textoImportada(n) { return `${n.titulo} ${n.cuerpo} ${n.equipo_txt} ${n.jugador_txt} ${n.partido_txt}`.toLowerCase(); }
  function coincideTexto(t) { return !st.texto || String(t).toLowerCase().includes(st.texto.toLowerCase()); }

  function construir() {
    st.partido = notasDelPartido();
    const partido = st.partido.filter((n) => coincideTexto(n.texto));
    const importadas = st.importadas.filter((n) => coincideTexto(textoImportada(n)));
    const existeSeleccion = st.sel?.tipo === "partido"
      ? partido.some((n) => n.uid === st.sel.uid)
      : st.sel?.tipo === "importada" ? importadas.some((n) => n.id === st.sel.id) : false;
    if (st.sel && !existeSeleccion) st.sel = null;
    if (!st.sel) {
      if (partido.length) st.sel = { tipo: "partido", uid: partido[0].uid };
      else if (importadas.length) st.sel = { tipo: "importada", id: importadas[0].id };
    }
    const seleccionadaPartido = st.sel?.tipo === "partido" ? st.partido.find((n) => n.uid === st.sel.uid) : null;
    const seleccionadaImportada = st.sel?.tipo === "importada" ? st.importadas.find((n) => n.id === st.sel.id) : null;

    const lista = h("aside", { class: "notas-lista" },
      h("div", { class: "lista-cab compacta" },
        h("div", null, h("h1", { text: "Notas" }), h("p", { class: "sub", text: app.sesion ? "Del partido y del paquete" : "Del paquete" })),
        h("div", { class: "acciones" },
          app.sesion ? btn("Nueva nota", nuevaNota, { clase: "btn pequeno primario", icon: "mas" }) : null),
        h("div", { class: "buscador" }, icono("buscar"), h("input", { type: "search", placeholder: "Buscar…", value: st.texto, oninput: (e) => { st.texto = e.target.value; pintar(); } }))),
      app.sesion ? h("div", { class: "nota-seccion" },
        h("h4", { text: `Del partido (${partido.length})` }),
        partido.length ? partido.map((n) => h("button", { type: "button", class: "nota-fila partido" + (st.sel?.tipo === "partido" && st.sel.uid === n.uid ? " sel" : ""), onclick: () => { st.sel = { tipo: "partido", uid: n.uid }; pintar(); } },
          h("b", { text: `${etiquetaPeriodo({ cuarto: n.cuarto, tipoPeriodo: n.tipoPeriodo })} · ${mmss(n.reloj || 0)}` }),
          h("span", { class: "sub", text: n.texto.slice(0, 120) }))) : h("p", { class: "sub vacio-lista", text: "Sin notas del partido." })) : null,
      st.importadas.length ? h("div", { class: "nota-seccion" },
        h("h4", { text: `Importadas (${importadas.length})` }),
        importadas.length ? importadas.map((n) => h("button", { type: "button", class: "nota-fila" + (st.sel?.tipo === "importada" && st.sel.id === n.id ? " sel" : ""), onclick: () => { st.sel = { tipo: "importada", id: n.id }; pintar(); } },
          h("b", { text: n.titulo || "Sin título" }),
          h("span", { class: "sub", text: [n.equipo_txt, n.jugador_txt, n.partido_txt].filter(Boolean).join(" · ") || "Sin vínculo" }),
          h("span", { class: "sub", text: (n.cuerpo || "").replace(/[#*_`>\[\]]/g, "").slice(0, 80) }))) : h("p", { class: "sub vacio-lista", text: "Ninguna nota con ese filtro." })) : null,
      (!app.sesion && !st.importadas.length) ? h("p", { class: "sub vacio-lista", text: "No hay notas." }) : null);

    const detalle = h("article", { class: "nota-detalle card" });
    if (seleccionadaPartido) {
      detalle.append(
        h("div", { class: "nd-cab" },
          h("div", null, h("h2", { text: "Nota del partido" }),
            h("p", { class: "sub", text: `${etiquetaPeriodo({ cuarto: seleccionadaPartido.cuarto, tipoPeriodo: seleccionadaPartido.tipoPeriodo })} · ${mmss(seleccionadaPartido.reloj || 0)} · ${new Date(seleccionadaPartido.ts).toLocaleString("es-ES")}` })),
          h("div", { class: "acciones" },
            btn("Borrar", () => borrarNota(seleccionadaPartido), { clase: "btn pequeno fantasma peligro-txt", icon: "cerrar" }))),
        h("div", { class: "nota-texto", text: seleccionadaPartido.texto }));
    } else if (seleccionadaImportada) {
      detalle.append(
        h("div", { class: "nd-cab" },
          h("div", null, h("h2", { text: seleccionadaImportada.titulo || "Sin título" }),
            h("p", { class: "sub", text: [seleccionadaImportada.temporada, seleccionadaImportada.grupo, seleccionadaImportada.equipo_txt, seleccionadaImportada.jugador_txt, seleccionadaImportada.partido_txt].filter(Boolean).join(" · ") })),
          h("span", { class: "pill", text: seleccionadaImportada.modificada ? new Date(seleccionadaImportada.modificada).toLocaleDateString("es-ES") : "" })),
        h("div", { class: "md", html: md(seleccionadaImportada.cuerpo).replace(/src="(?!data:|https?:)([^"]+)"/g, 'src="data:image/gif;base64,R0lGODlhAQABAAAAACw=" data-img="$1"') }));
      resolverImagenes(detalle);
    } else {
      detalle.append(h("div", { class: "vacio" }, h("strong", { text: app.sesion ? "Escribe una nota del partido" : "Elige una nota" }),
        app.sesion ? h("p", { text: "Sirve para anotar ajustes, avisos o detalles que quieras recordar al terminar." }) : null,
        app.sesion ? btn("Nueva nota", nuevaNota, { clase: "btn primario", icon: "mas" }) : null));
    }
    raiz.append(lista, detalle);
  }

  async function nuevaNota() {
    if (!app.sesion) { toast("No hay partido abierto.", "aviso"); return; }
    const texto = await pedirTexto("Nota del partido", "Ej.: cambios en defensa, detalle técnico, aviso para el descanso…");
    if (!texto) return;
    await agregar("nota", { datos: { texto } });
    st.partido = notasDelPartido();
    const ultima = st.partido[st.partido.length - 1];
    st.sel = ultima ? { tipo: "partido", uid: ultima.uid } : null;
    pintar();
  }

  async function borrarNota(n) {
    const ok = await confirmar("Borrar nota", "Se anulará esta nota del partido. El registro conserva la anulación.", { ok: "Borrar", peligro: true });
    if (!ok) return;
    await anularEvento(n.uid);
    st.partido = notasDelPartido();
    st.sel = null;
    pintar();
  }

  function resolverImagenes(el) {
    for (const img of el.querySelectorAll("img")) {
      const src = img.dataset.img || img.getAttribute("src") || "";
      const nombre = src.split("/").pop();
      const im = imagenDe(app.grupo, nombre) || imagenDe(app.grupo, decodeURIComponent(nombre));
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
