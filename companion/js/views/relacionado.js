// Componente único «Relacionado»: notas, jugadas, vídeos y marcas enlazados con un elemento (por contexto común y por menciones).
// Se usa en el editor de notas, el de jugadas, el de vídeo y las pantallas de Equipo, Jugadores y Partidos.
import { h, dialogo } from "../util.js";
import { cargarDocs, relacionados, citadoPor, conteo, hashDeDoc } from "../relaciones.js";

const NOMBRE = { nota: "Notas", jugada: "Jugadas", video: "Vídeos", marca: "Marcas de vídeo" };
const ORDEN = ["nota", "jugada", "video", "marca"];
const seg = (s) => `${Math.floor(s / 60)}:${String(Math.round(s % 60)).padStart(2, "0")}`;

/** Lista agrupada por tipo. `obj`: {doc} (un documento) o {ctx} (un contexto, p. ej. el jugador en foco). */
export async function panelRelacionado(obj, { titulo = "Relacionado", tipos } = {}) {
  const docs = await cargarDocs();
  const rel = relacionados(obj, docs, { tipos });
  const cita = obj.doc ? citadoPor(obj.doc, docs) : [];
  const raiz = h("div", { class: "rel" }, titulo ? h("b", { class: "rel-tit", text: titulo }) : null);
  if (!rel.length) { raiz.append(h("p", { class: "nt-vacio", text: "Nada relacionado todavía: vincula notas, jugadas o vídeos a este partido, jugador o equipo, o menciónalos con [[ ]]." })); return raiz; }
  for (const t of ORDEN) {
    const g = rel.filter((r) => r.doc.tipo === t); if (!g.length) continue;
    raiz.append(h("div", { class: "rel-grupo" }, h("small", { text: `${NOMBRE[t]} (${g.length})` }),
      g.slice(0, 12).map((r) => h("a", { class: "rel-item", href: hashDeDoc(r.doc), title: r.motivos.join(" · "), onclick: () => document.getElementById("dlg")?.close?.() },
        h("span", { text: r.doc.titulo }), t === "marca" ? h("i", { text: seg(r.doc.ref?.t_ini || 0) }) : null, h("i", { class: "rel-m", text: r.motivos.join(" · ") })))));
  }
  if (cita.length && !rel.some((r) => cita.some((c) => c.tipo === r.doc.tipo && c.id === r.doc.id))) raiz.append(h("small", { text: `Citada por ${cita.length}` }));
  return raiz;
}

/** Botón-resumen «Notas 2 · Jugadas 1 · Vídeos 1» que abre la lista. null si no hay nada. */
export async function chipRelacionado(ctx, titulo = "Relacionado") {
  if (!ctx || (!ctx.partido && !ctx.equipo && !ctx.jugador)) return null;
  const docs = await cargarDocs(); const c = conteo(relacionados({ ctx }, docs));
  if (!c.nota && !c.jugada && !c.video) return null;
  const txt = [c.nota && `Notas ${c.nota}`, c.jugada && `Jugadas ${c.jugada}`, c.video && `Vídeos ${c.video}`].filter(Boolean).join(" · ");
  return h("button", { type: "button", class: "btn rel-chip", title: "Notas, jugadas y vídeos relacionados", onclick: async () => dialogo(titulo, await panelRelacionado({ ctx }, { titulo: "" })) }, "🔗 ", txt);
}

/** Diálogo para elegir una nota o jugada y devolver su mención lista para pegar en un texto: «[[Título]]» o «[[jugada:12|Título]]». */
export function elegirDocumento({ tipos = ["nota", "jugada"], excluir } = {}) {
  return new Promise(async (res) => {
    const docs = (await cargarDocs()).filter((d) => tipos.includes(d.tipo) && !(excluir && d.tipo === excluir.tipo && d.id === excluir.id));
    const q = h("input", { type: "search", placeholder: "Buscar nota o jugada…", style: { width: "100%" } }); const lista = h("div", { class: "rel-lista" });
    const plegar = (x) => String(x || "").normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLowerCase();
    const pintar = () => { const t = plegar(q.value); const v = docs.filter((d) => !t || plegar(d.titulo).includes(t) || plegar(d.texto).includes(t)).slice(0, 60);
      lista.replaceChildren(...(v.length ? v.map((d) => h("button", { type: "button", class: "rel-item", onclick: () => { const dup = docs.filter((x) => x.tipo === "nota" && plegar(x.titulo) === plegar(d.titulo)).length > 1;
        const m = d.tipo === "jugada" ? `[[jugada:${d.id}|${d.titulo.replace(/[\[\]|]/g, "")}]]` : `[[${dup ? `nota:${d.id}|${d.titulo.replace(/[\[\]|]/g, "")}` : d.titulo.replace(/[\[\]|]/g, "")}]]`; ok = true; dlg.close(); res(m); } }, h("span", { text: d.titulo }), h("i", { class: "rel-m", text: d.tipo === "jugada" ? "Jugada" : "Nota" }))) : [h("p", { class: "nt-vacio", text: "Nada que coincida." })])); };
    let ok = false; const dlg = dialogo("Enlazar", h("div", { class: "rel" }, q, lista)); q.addEventListener("input", pintar); pintar(); dlg.addEventListener("close", () => { if (!ok) res(null); }, { once: true }); setTimeout(() => q.focus(), 50);
  });
}
