// Editor de notas Markdown con la botonera de FEBstats. Las notas se crean desde el partido:
// heredan temporada, grupo, partido y solo se vinculan (opcionalmente) a equipo y jugador.
import { h, btn, dialogo, mdNota, toast } from "./util.js";
import { app } from "./estado.js";
import { guardarNota, notaNueva, avisarCambioNotas } from "./notas-modelo.js";

const BARRA = [
  ["B", "negrita", "Negrita (Cmd+B)"], ["I", "cursiva", "Cursiva (Cmd+I)"], ["S", "tachado", "Tachado"],
  ["H1", "h1", "Título 1"], ["H2", "h2", "Título 2"], ["H3", "h3", "Título 3"],
  ["•", "lista", "Lista"], ["1.", "numerada", "Lista numerada"], ["☐", "tarea", "Lista de tareas"],
  ["❝", "cita", "Cita"], ["</>", "codigo", "Código en línea"], ["{ }", "bloque", "Bloque de código"],
  ["▦", "tabla", "Tabla"], ["🔗", "enlace", "Enlace web (Cmd+K)"], ["🖼", "imagen", "Imagen por URL"],
  ["Σ", "formula", "Fórmula ($…$)"], ["ⓘ", "aviso", "Aviso (NOTE, TIP, WARNING…)"],
  ["[^]", "pie", "Nota al pie"], ["―", "regla", "Línea horizontal"],
];

export function abrirEditorNota(nota = null, opts = {}) {
  const sesion = opts.sesion ?? app.sesion;
  if (!nota && !sesion) { toast("Abre un partido para crear una nota.", "aviso"); return; }
  const form = nota ? { ...nota } : notaNueva({
    temporada: sesion?.temporada || "",
    grupo: sesion?.grupo || "",
    partido: sesion?.partidoId || "",
    partido_txt: sesion ? `${sesion.local.nombre} vs ${sesion.visitante.nombre}` : "",
    equipo: opts.lado ? (sesion?.[opts.lado]?.equipoId || "") : "",
    equipo_txt: opts.lado ? (sesion?.[opts.lado]?.nombre || "") : "",
    jugador: opts.jugador?.jugadorId || "",
    jugador_txt: opts.jugador?.nombre || "",
  });
  const delPartido = !!(sesion && String(form.partido) === String(sesion.partidoId));

  const equipos = [];
  if (delPartido) {
    for (const lado of ["local", "visitante"]) {
      equipos.push({ value: `l:${lado}`, id: sesion[lado].equipoId || "", txt: sesion[lado].nombre });
    }
  }
  if ((form.equipo || form.equipo_txt) && !equipos.some((o) => (form.equipo && o.id === form.equipo) || (!form.equipo && o.txt === form.equipo_txt))) {
    equipos.push({ value: "edit", id: form.equipo, txt: form.equipo_txt || form.equipo });
  }
  const equipoValor = equipos.find((o) => (form.equipo && o.id === form.equipo) || (!form.equipo && form.equipo_txt && o.txt === form.equipo_txt))?.value || "";

  function jugadoresDe(valor) {
    const lista = [];
    if (delPartido && valor.startsWith("l:")) {
      const lado = valor.slice(2);
      for (const j of sesion.jugadores[lado] || []) lista.push({ value: `d:${j.dorsal}`, id: j.jugadorId || "", txt: j.nombre });
    }
    if ((form.jugador || form.jugador_txt) && !lista.some((o) => (form.jugador && o.id === form.jugador) || (!form.jugador && o.txt === form.jugador_txt))) {
      lista.push({ value: "edit", id: form.jugador, txt: form.jugador_txt || form.jugador });
    }
    return lista;
  }
  let jugadores = jugadoresDe(equipoValor);
  const jugadorValor = jugadores.find((o) => (form.jugador && o.id === form.jugador) || (!form.jugador && form.jugador_txt && o.txt === form.jugador_txt))?.value || "";

  const opciones = (lista, valor, vacio) => [h("option", { value: "", selected: !valor ? "" : null }, vacio), ...lista.map((o) => h("option", { value: o.value, selected: o.value === valor ? "" : null, "data-id": o.id, "data-txt": o.txt }, o.txt))];
  const campo = (etiqueta, el) => h("label", { class: "nota-campo" }, h("span", { text: etiqueta }), el);

  const titulo = h("input", { type: "text", value: form.titulo || "", placeholder: "Título (si lo dejas vacío se usa la primera línea)", oninput: (e) => { form.titulo = e.target.value; } });
  const equipo = h("select", { onchange: (e) => {
    const o = equipos.find((x) => x.value === e.target.value);
    form.equipo = o?.id || ""; form.equipo_txt = o?.txt || "";
    jugadores = jugadoresDe(e.target.value);
    jugador.replaceChildren(...opciones(jugadores, "", "Sin jugador"));
    form.jugador = ""; form.jugador_txt = "";
  } }, opciones(equipos, equipoValor, "Sin equipo"));
  const jugador = h("select", { onchange: (e) => {
    const o = jugadores.find((x) => x.value === e.target.value);
    form.jugador = o?.id || ""; form.jugador_txt = o?.txt || "";
  } }, opciones(jugadores, jugadorValor, "Sin jugador"));

  const contexto = [form.partido_txt || "Sin partido", form.temporada || "Sin temporada", form.grupo || ""].filter(Boolean).join(" · ");
  const ta = h("textarea", { class: "nota-cm", rows: 18, spellcheck: "true", placeholder: "Escribe en Markdown…" }, form.cuerpo || "");
  const preview = h("div", { class: "md nota-preview-pane" });
  let vista = "dividida";
  try { vista = localStorage.getItem("fd-nota-vista") || "dividida"; } catch { /* nada */ }
  if (!["editor", "dividida", "previa"].includes(vista)) vista = "dividida";

  const panes = h("div", { class: "nota-panes " + vista }, h("div", { class: "nota-pane-editor" }, ta), h("div", { class: "nota-pane-preview" }, preview));
  const sync = () => { form.cuerpo = ta.value; preview.innerHTML = mdNota(ta.value); };
  const vistaSeg = h("div", { class: "seg nota-vista", role: "radiogroup", "aria-label": "Vista" },
    [["editor", "Editor"], ["dividida", "Dividida"], ["previa", "Vista previa"]].map(([v, t]) => h("button", {
      type: "button", class: v === vista ? "on" : "", onclick: () => {
        vista = v;
        panes.className = "nota-panes " + vista;
        vistaSeg.querySelectorAll("button").forEach((b, i) => b.classList.toggle("on", ["editor", "dividida", "previa"][i] === v));
        try { localStorage.setItem("fd-nota-vista", v); } catch { /* nada */ }
      },
    }, t)));

  const ejecutar = (id) => {
    const s = ta.selectionStart, e = ta.selectionEnd, v = ta.value, sel = v.slice(s, e);
    const poner = (txt, desde = s, hasta = e) => { ta.setRangeText(txt, desde, hasta, "end"); sync(); ta.focus(); };
    const envolver = (a, b = a, texto = "texto") => poner(a + (sel || texto) + b);
    const prefijar = (fn) => {
      const ini = v.lastIndexOf("\n", s - 1) + 1;
      const fin = v.indexOf("\n", e);
      const bloque = v.slice(ini, fin < 0 ? v.length : fin);
      poner(bloque.split("\n").map((l, i) => fn(i, l)).join("\n"), ini, fin < 0 ? v.length : fin);
    };
    const bloque = (txt) => poner((s > 0 && v[s - 1] !== "\n" ? "\n" : "") + txt + (e < v.length ? "\n" : ""));
    switch (id) {
      case "negrita": return envolver("**");
      case "cursiva": return envolver("*");
      case "tachado": return envolver("~~");
      case "h1": case "h2": case "h3": return prefijar((_, l) => `${"#".repeat(+id[1])} ${l.replace(/^#{1,4}\s+/, "")}`);
      case "lista": return prefijar((_, l) => "- " + l);
      case "numerada": return prefijar((i, l) => `${i + 1}. ${l.replace(/^\d+[.)]\s+/, "")}`);
      case "tarea": return prefijar((_, l) => "- [ ] " + l.replace(/^[-*+]\s+(\[[ xX]\]\s+)?/, ""));
      case "cita": return prefijar((_, l) => "> " + l);
      case "codigo": return envolver("`", "`", "código");
      case "bloque": return bloque("```\n" + (sel || "código") + "\n```\n");
      case "tabla": return bloque("| Columna 1 | Columna 2 | Columna 3 |\n| --- | --- | --- |\n|  |  |  |\n");
      case "enlace": {
        const url = "https://";
        if (sel) return poner(`[${sel}](${url})`, s, e);
        return poner(`[texto](${url})`);
      }
      case "imagen": return bloque(`![imagen](${sel || "https://"})`);
      case "formula": return envolver("$", "$", "a^2 + b^2");
      case "aviso": return bloque("> [!NOTE]\n> Escribe el aviso…\n");
      case "pie": return poner("[^1]" + (e < v.length ? "" : "\n\n[^1]: explicación"));
      case "regla": return bloque("---\n");
      default: return;
    }
  };

  const barra = h("div", { class: "nota-toolbar", role: "toolbar", "aria-label": "Formato Markdown" },
    BARRA.map(([txt, id, title]) => h("button", { type: "button", class: "btn fantasma nota-tool", title, "aria-label": title, onmousedown: (e) => e.preventDefault(), onclick: () => ejecutar(id) }, txt)));

  ta.addEventListener("keydown", (e) => {
    if (!(e.metaKey || e.ctrlKey)) return;
    const k = e.key.toLowerCase();
    if (k === "b") { e.preventDefault(); ejecutar("negrita"); }
    else if (k === "i") { e.preventDefault(); ejecutar("cursiva"); }
    else if (k === "k") { e.preventDefault(); ejecutar("enlace"); }
  });
  ta.addEventListener("input", sync);
  sync();

  const d = dialogo(nota ? "Editar nota" : "Nueva nota", h("div", { class: "nota-editor-form" },
    campo("Título", titulo),
    h("p", { class: "sub nota-contexto", text: contexto }),
    h("div", { class: "nota-form-dos" }, campo("Equipo", equipo), campo("Jugador", jugador)),
    barra,
    h("div", { class: "nota-editor-barra2" }, vistaSeg, h("span", { class: "sub", text: "Markdown · se guarda en este iPad" })),
    panes,
    h("div", { class: "acciones" },
      btn("Cancelar", () => d.close(), { clase: "btn" }),
      btn("Guardar", async () => {
        form.cuerpo = ta.value;
        if (!String(form.titulo || "").trim() && !String(form.cuerpo || "").trim()) { toast("Escribe un título o un texto.", "aviso"); return; }
        try {
          const guardada = await guardarNota(form);
          avisarCambioNotas();
          d.close();
          opts.onGuardada?.(guardada);
        } catch (e) { console.error(e); toast("No se pudo guardar la nota: " + e.message, "error"); }
      }, { clase: "btn primario", icon: "importado" }))),
  { ancho: "ancho nota-dlg", sub: delPartido ? "Vinculada al partido actual." : "Nota de otro partido o sin partido." });
}
