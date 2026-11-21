// Playbook importado: lista, visor paso a paso y uso durante el partido.
import { h, limpiar, btn, icono, dialogo, md, toast } from "../util.js";
import { app, agregar } from "../estado.js";
import { jugadasDe } from "../grupo.js";
import { svgJugada, reproductor } from "../pizarra.js";
import { navegar } from "../app.js";

export function vistaPlaybook(cont, params = []) {
  if (!app.grupo) {
    cont.append(h("div", { class: "vacio" }, h("strong", { text: "Sin playbook" }), h("p", { text: "Importa un paquete de FEBstats con jugadas." }),
      btn("Ir a importar", () => navegar("inicio"), { clase: "btn primario", icon: "importar" })));
    return null;
  }
  const st = { texto: "", equipo: "", jugadas: jugadasDe(app.grupo) };
  const raiz = h("div", { class: "playbook" });
  cont.append(raiz);
  const pintar = () => { limpiar(raiz); construir(); };
  construir();
  if (params[0]) {
    const j = st.jugadas.find((x) => String(x.id) === String(params[0]));
    if (j) setTimeout(() => abrir(j), 60);
  }
  return null;

  function construir() {
    const equipos = [...new Set(st.jugadas.map((j) => j.equipo_txt).filter(Boolean))].sort();
    const filtradas = st.jugadas.filter((j) => {
      if (st.equipo && j.equipo_txt !== st.equipo) return false;
      if (!st.texto) return true;
      const t = `${j.titulo} ${j.descripcion} ${j.texto} ${j.equipo_txt} ${j.jugador_txt}`.toLowerCase();
      return t.includes(st.texto.toLowerCase());
    });
    raiz.append(
      h("div", { class: "lista-cab" },
        h("div", null, h("h1", { text: "Playbook" }), h("p", { class: "sub", text: `${st.jugadas.length} jugada${st.jugadas.length === 1 ? "" : "s"} · ${equipos.length} equipo${equipos.length === 1 ? "" : "s"}` })),
        h("div", { class: "filtros" },
          h("div", { class: "buscador" }, icono("buscar"), h("input", { type: "search", placeholder: "Buscar jugada…", value: st.texto, oninput: (e) => { st.texto = e.target.value; pintar(); } })),
          h("select", { onchange: (e) => { st.equipo = e.target.value; pintar(); } },
            h("option", { value: "", text: "Todos los equipos" }),
            equipos.map((e) => h("option", { value: e, selected: e === st.equipo, text: e }))))),
      filtradas.length ? h("div", { class: "rejilla jugadas" }, filtradas.map(tarjeta)) : h("div", { class: "vacio" }, h("strong", { text: "Ninguna jugada" }), h("p", { text: "Prueba con otro filtro." })),
    );
  }

  function tarjeta(j) {
    return h("button", { type: "button", class: "card jugada-card", onclick: () => abrir(j) },
      h("div", { class: "jc-mini" }, svgJugada(j.datos, { k: 0, mini: true })),
      h("div", { class: "jc-txt" },
        h("b", { text: j.titulo || "Sin título" }),
        h("span", { class: "sub", text: [j.equipo_txt, j.jugador_txt].filter(Boolean).join(" · ") || "Sin vínculo" }),
        h("span", { class: "pill", text: `${(j.datos?.pasos || []).length} pasos` })));
  }

  function abrir(j) {
    const rep = reproductor(j.datos, { auto: false });
    const d = dialogo(j.titulo || "Jugada", h("div", { class: "jugada-ver" },
      rep.el,
      j.descripcion ? h("div", { class: "md", html: md(j.descripcion) }) : null,
      j.texto ? h("details", { class: "texto-jugada" }, h("summary", { text: "Pasos en palabras" }), h("p", { text: j.texto })) : null,
      app.sesion && app.sesion.estado !== "final" ? h("div", { class: "acciones" },
        btn("Marcar como usada en este partido", async () => {
          await agregar("jugada", { datos: { uid: j.uid, titulo: j.titulo, jugadaId: j.id } });
          toast("Jugada registrada en el partido.", "ok");
          d.close();
        }, { clase: "btn primario", icon: "playbook" })) : null),
      { sub: [j.equipo_txt, j.jugador_txt, j.coleccion, j.seccion].filter(Boolean).join(" · "), ancho: "ancho" });
  }
}
