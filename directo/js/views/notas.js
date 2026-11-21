// Notas del entrenador importadas del paquete: Markdown, imágenes y enlaces al playbook.
import { h, limpiar, btn, icono, md } from "../util.js";
import { app } from "../estado.js";
import { notasDe, imagenDe } from "../grupo.js";
import { navegar } from "../app.js";

export function vistaNotas(cont, params = []) {
  if (!app.grupo) {
    cont.append(h("div", { class: "vacio" }, h("strong", { text: "Sin notas" }), h("p", { text: "Importa un paquete de FEBstats con notas." }),
      btn("Ir a importar", () => navegar("inicio"), { clase: "btn primario", icon: "importar" })));
    return null;
  }
  const st = { texto: "", notas: notasDe(app.grupo), sel: null };
  const urls = [];
  const raiz = h("div", { class: "notas" });
  cont.append(raiz);
  const pintar = () => { limpiar(raiz); destruirUrls(); construir(); };
  if (params[0]) {
    const n = st.notas.find((x) => String(x.id) === String(params[0]));
    if (n) st.sel = n;
  }
  if (!st.sel && st.notas.length) st.sel = st.notas[0];
  pintar();
  return () => destruirUrls();

  function destruirUrls() { for (const u of urls.splice(0)) URL.revokeObjectURL(u); }

  function construir() {
    const filtradas = st.notas.filter((n) => !st.texto || `${n.titulo} ${n.cuerpo} ${n.equipo_txt} ${n.jugador_txt}`.toLowerCase().includes(st.texto.toLowerCase()));
    const lista = h("aside", { class: "notas-lista" },
      h("div", { class: "lista-cab compacta" },
        h("div", null, h("h1", { text: "Notas" }), h("p", { class: "sub", text: `${st.notas.length} nota${st.notas.length === 1 ? "" : "s"}` })),
        h("div", { class: "buscador" }, icono("buscar"), h("input", { type: "search", placeholder: "Buscar…", value: st.texto, oninput: (e) => { st.texto = e.target.value; st.sel = null; pintar(); } }))),
      filtradas.map((n) => h("button", { type: "button", class: "nota-fila" + (st.sel?.id === n.id ? " sel" : ""), onclick: () => { st.sel = n; pintar(); } },
        h("b", { text: n.titulo || "Sin título" }),
        h("span", { class: "sub", text: [n.equipo_txt, n.jugador_txt, n.partido_txt].filter(Boolean).join(" · ") || "Sin vínculo" }),
        h("span", { class: "sub", text: (n.cuerpo || "").replace(/[#*_`>\[\]]/g, "").slice(0, 90) }))),
      filtradas.length ? null : h("p", { class: "sub vacio-lista", text: "Ninguna nota con ese filtro." }));
    const detalle = h("article", { class: "nota-detalle card" });
    if (st.sel) {
      detalle.append(
        h("div", { class: "nd-cab" },
          h("div", null, h("h2", { text: st.sel.titulo || "Sin título" }),
            h("p", { class: "sub", text: [st.sel.temporada, st.sel.grupo, st.sel.equipo_txt, st.sel.jugador_txt, st.sel.partido_txt].filter(Boolean).join(" · ") })),
          h("span", { class: "pill", text: st.sel.modificada ? new Date(st.sel.modificada).toLocaleDateString("es-ES") : "" })),
        h("div", { class: "md", html: md(st.sel.cuerpo).replace(/src="(?!data:|https?:)([^"]+)"/g, 'src="data:image/gif;base64,R0lGODlhAQABAAAAACw=" data-img="$1"') }));
      resolverImagenes(detalle);
    } else {
      detalle.append(h("div", { class: "vacio" }, h("strong", { text: "Elige una nota" })));
    }
    raiz.append(lista, detalle);
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
