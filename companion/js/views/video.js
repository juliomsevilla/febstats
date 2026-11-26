// Sección «Vídeo»: portada con la biblioteca (#/video), editor de un vídeo (#/video?v=ID[&t=SEG]) y listas de
// reproducción con las jugadas de todos los vídeos (#/video?lista=1). La IA nunca ve el vídeo: solo el texto de las marcas.
import { h, vacioMsg } from "../util.js";
import { invoke, enEscritorio } from "../api.js";
import { paramHash } from "../state.js";
import { idTecla, RESERVADAS } from "./video-teclas.js";
import { vistaBiblioteca } from "./video-biblioteca.js";
import { vistaEditor } from "./video-editor.js";
import { vistaLista } from "./video-lista.js";

export async function vistaVideo(root) {
  if (!enEscritorio) { root.replaceChildren(vacioMsg("Solo en la app de escritorio", "El análisis de vídeo necesita la versión de escritorio de FEBstats.")); return; }
  const id = paramHash("v");
  if (id) return vistaEditor(root, id);
  if (paramHash("lista")) return vistaLista(root);
  return vistaBiblioteca(root);
}

// Editor de botones (pestaña «Botones de vídeo» de Ajustes): crear, editar y borrar sin límite; cada botón puede tener su atajo.
export async function panelBotones(cuerpo) {
  cuerpo.classList.add("vid-edit");
  const msg = h("p", { class: "vid-ayuda" });
  let botones = [];
  const pintarEd = async () => {
    botones = await invoke("listar_botones");
    const ETQ = { nombre: "Nombre", categoria: "Categoría", pre_s: "Antes (s)", post_s: "Después (s)", color: "Color" };
    const campo = (b, k, tipo, attrs = {}) => h("input", { type: tipo, value: b[k] ?? "", "aria-label": ETQ[k] || k, title: ETQ[k] || k, placeholder: ETQ[k] || null, ...attrs, onchange: async (e) => { b[k] = tipo === "number" ? Number(e.target.value) : e.target.value; await invoke("guardar_boton", { boton: b }); } });
    const atajo = (b) => h("input", { class: "corto vid-atajo", readonly: true, value: b.atajo || "", placeholder: "pulsa tecla", title: "Haz clic y pulsa la tecla (Supr/Retroceso la quita)",
      onkeydown: async (ev) => {
        if (ev.key === "Tab") return;
        ev.preventDefault();
        if (ev.key === "Backspace" || ev.key === "Delete") { b.atajo = null; await invoke("guardar_boton", { boton: b }); ev.target.value = ""; msg.textContent = ""; return; }
        const id = idTecla(ev);
        if (!id) return;
        if (RESERVADAS.has(id)) { msg.textContent = `«${id}» está reservada (pausa, saltos, captura, inicio y fin).`; return; }
        const otro = botones.find((x) => x.id !== b.id && x.atajo === id);
        if (otro) { msg.textContent = `«${id}» ya la usa «${otro.nombre}».`; return; }
        b.atajo = id; await invoke("guardar_boton", { boton: b }); ev.target.value = id; msg.textContent = "";
      } });
    cuerpo.replaceChildren(
      h("p", { class: "vid-ayuda", text: "Crea todos los botones que necesites y asígnales una tecla (haz clic en «Atajo» y pulsa la tecla). «Antes/Después» = segundos de clip alrededor de la marca. Los botones se agrupan por categoría en la vista Vídeo." }),
      h("div", { class: "vid-edit-fila vid-edit-cab" }, ["Nombre", "Color", "Atajo", "Categoría", "Antes (s)", "Después (s)", ""].map((t) => h("span", { text: t }))),
      ...botones.map((b) => h("div", { class: "vid-edit-fila" },
        campo(b, "nombre", "text"), campo(b, "color", "color"), atajo(b), campo(b, "categoria", "text"),
        campo(b, "pre_s", "number", { min: 0, step: 1, class: "corto" }), campo(b, "post_s", "number", { min: 0, step: 1, class: "corto" }),
        h("button", { type: "button", class: "btn fantasma", "aria-label": "Borrar botón", onclick: async () => { await invoke("borrar_boton", { id: b.id }); pintarEd(); } }, "✕"))),
      h("button", { type: "button", class: "btn primario", onclick: async () => { await invoke("guardar_boton", { boton: { nombre: "Nuevo botón", color: "#3a7ca5", pre_s: 5, post_s: 5 } }); pintarEd(); } }, "+ Añadir botón"), msg);
  };
  await pintarEd();
}
