// Listas de reproducción: las jugadas guardadas de todos los vídeos, filtradas (p. ej. todos los pick and roll),
// reproducidas una tras otra saltando entre archivos.
import { h, vacioMsg } from "../util.js";
import { invoke, urlVideo } from "../api.js";
import { fmt, fmtJuego, videoEl, activarAtajos } from "./video-comun.js";

const F = { etiquetas: new Set(), video: "", equipo: "", jugador: "", texto: "", seguido: true, repetir: false };
const plegar = (x) => String(x || "").normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLowerCase();

export async function vistaLista(root) {
  const [videos, marcas] = await Promise.all([invoke("listar_videos"), invoke("listar_marcas")]);
  const porId = new Map(videos.map((v) => [v.id, v]));
  const disponible = (m) => porId.get(m.video_id)?.existe !== false;
  const cab = h("div", { class: "vid-cab" }, h("a", { class: "btn peq", href: "#/video" }, "← Vídeos"), h("b", { class: "vid-h", text: "Listas de reproducción" }));
  if (window.__quitarAtajos) window.__quitarAtajos();
  if (!marcas.length) { root.replaceChildren(cab, vacioMsg("Aún no hay jugadas", "Abre un vídeo y guarda jugadas: aparecerán aquí para verlas todas seguidas.")); return; }

  let lista = [], actual = null;
  const vid = videoEl(porId.get(marcas[0].video_id), { controls: true });
  vid.removeAttribute("src");
  const ficha = h("div", { class: "vlis-ficha" });
  const ol = h("ol", { class: "vlis-items" });
  const cuenta = h("b");

  const reproducir = (m) => {
    actual = m;
    const v = porId.get(m.video_id);
    const empezar = () => { if (actual !== m) return; vid.currentTime = m.t_ini; vid.play().catch(() => {}); };
    if (vid.dataset.id !== String(v.id)) { vid.pause(); vid.dataset.id = String(v.id); vid.addEventListener("loadedmetadata", empezar, { once: true }); vid.src = urlVideo(v); }
    else if (vid.readyState >= 1) empezar(); else vid.addEventListener("loadedmetadata", empezar, { once: true });
    marcarActual();
  };
  /** Avanza `d` puestos saltando las jugadas cuyo archivo no está. */
  const mover = (d) => {
    const posibles = lista.filter(disponible); if (!posibles.length) return;
    let i = posibles.findIndex((m) => m.id === actual?.id);
    i = i < 0 ? 0 : i + d;
    if (i >= posibles.length) { if (!F.repetir) { vid.pause(); return; } i = 0; }
    reproducir(posibles[Math.max(0, i)]);
  };
  let terminada = null; // evita avanzar dos veces por la misma jugada (timeupdate + ended)
  const acabar = () => {
    const m = actual; if (!m || terminada === m) return;
    terminada = m;
    if (F.seguido) mover(1); else vid.pause();
  };
  vid.addEventListener("timeupdate", () => { const m = actual; if (!m || vid.dataset.id !== String(m.video_id) || vid.seeking || vid.readyState < 2) return;
    if (vid.currentTime < m.t_fin) { if (terminada === m && vid.currentTime < m.t_fin - 0.3) terminada = null; } else if (!vid.paused) acabar(); });
  vid.addEventListener("ended", acabar);
  vid.addEventListener("error", () => { if (actual) ficha.replaceChildren(h("p", { class: "vid-falta", text: `No se puede reproducir «${actual.video}».` })); });

  const marcarActual = () => {
    ol.querySelectorAll("li").forEach((li) => li.classList.toggle("sel", li.dataset.id === String(actual?.id)));
    ol.querySelector("li.sel")?.scrollIntoView({ block: "nearest" });
    const m = actual && lista.find((x) => x.id === actual.id);
    ficha.replaceChildren(...(m ? [h("div", { class: "vlis-tit" }, h("span", { class: "vid-chip", style: `background:${m.color || "#888"}`, text: m.boton || "Sin etiqueta" }),
      h("b", { text: [m.jugador, m.equipo].filter(Boolean).join(" · ") || m.video }), h("a", { class: "btn peq fantasma", href: `#/video?v=${m.video_id}&t=${Math.floor(m.t_ini)}` }, "✂️ Abrir en el editor")),
      h("p", { class: "vid-ayuda", text: [m.video, `${fmt(m.t_ini)}–${fmt(m.t_fin)}`, fmtJuego(m.cuarto, m.reloj_s)].filter(Boolean).join(" · ") }),
      m.nota ? h("p", { class: "vlis-nota", text: m.nota }) : null].filter(Boolean) : []));
  };

  const filtrar = () => {
    const t = plegar(F.texto);
    lista = marcas.filter((m) => (!F.etiquetas.size || F.etiquetas.has(m.boton_id ?? 0)) && (!F.video || String(m.video_id) === F.video)
      && (!F.equipo || m.equipo === F.equipo) && (!F.jugador || m.jugador === F.jugador) && (!t || plegar(`${m.nota} ${m.video} ${m.boton || ""}`).includes(t)));
    const total = lista.reduce((s, m) => s + (m.t_fin - m.t_ini), 0);
    cuenta.textContent = `${lista.length} ${lista.length === 1 ? "jugada" : "jugadas"} · ${fmt(total)}`;
    ol.replaceChildren(...(lista.length ? lista.map((m) => h("li", { "data-id": m.id, class: disponible(m) ? "" : "falta" },
      h("button", { type: "button", disabled: !disponible(m) || null, title: disponible(m) ? "" : "Archivo de vídeo no encontrado", onclick: () => { terminada = null; reproducir(m); } },
        h("span", { class: "vlis-punto", style: `background:${m.color || "#888"}` }),
        h("span", { class: "vlis-txt" }, h("b", { text: [m.boton || "Sin etiqueta", m.jugador].filter(Boolean).join(" · ") }), h("small", { text: `${m.video} · ${fmt(m.t_ini)}${m.nota ? " · " + m.nota : ""}` })),
        h("i", { text: `${Math.round(m.t_fin - m.t_ini)} s` })))) : [h("li", { class: "vid-vacio", text: "Ninguna jugada con estos filtros." })]));
    marcarActual();
  };

  // etiquetas presentes en alguna jugada, con su número (selección múltiple)
  const etiquetas = new Map();
  for (const m of marcas) { const k = m.boton_id ?? 0; const e = etiquetas.get(k) || { nombre: m.boton || "Sin etiqueta", color: m.color || "#888", n: 0 }; e.n++; etiquetas.set(k, e); }
  for (const k of F.etiquetas) if (!etiquetas.has(k)) F.etiquetas.delete(k);
  const chips = h("div", { class: "vlis-chips" });
  const pintarChips = () => chips.replaceChildren(...[...etiquetas].sort((a, b) => a[1].nombre.localeCompare(b[1].nombre, "es")).map(([k, e]) =>
    h("button", { type: "button", class: "vlis-chip", style: `--c:${e.color}`, "aria-pressed": String(F.etiquetas.has(k)), onclick: () => { F.etiquetas.has(k) ? F.etiquetas.delete(k) : F.etiquetas.add(k); pintarChips(); filtrar(); } }, `${e.nombre} (${e.n})`)));
  const sel = (clave, vacio, opciones) => { if (!opciones.some(([v]) => v === F[clave])) F[clave] = "";
    return h("select", { class: "peq", "aria-label": vacio, onchange: (ev) => { F[clave] = ev.target.value; filtrar(); } }, [["", vacio], ...opciones].map(([v, t]) => h("option", { value: v, selected: v === F[clave] || null, text: t }))); };
  const unicos = (k) => [...new Set(marcas.map((m) => m[k]).filter(Boolean))].sort((a, b) => a.localeCompare(b, "es")).map((x) => [x, x]);
  const buscar = h("input", { type: "search", placeholder: "Buscar en las notas…", value: F.texto, oninput: () => { F.texto = buscar.value; filtrar(); } });
  const casilla = (clave, texto) => h("label", { class: "vlis-casilla" }, h("input", { type: "checkbox", checked: F[clave] || null, onchange: (ev) => { F[clave] = ev.target.checked; } }), texto);

  activarAtajos((ev) => {
    if (ev.key === " ") { ev.preventDefault(); if (!actual) mover(0); else vid.paused ? vid.play() : vid.pause(); }
    else if (ev.key === "ArrowUp") { ev.preventDefault(); terminada = null; mover(-1); }
    else if (ev.key === "ArrowDown") { ev.preventDefault(); terminada = null; mover(1); }
    else if (ev.key === "ArrowLeft") { ev.preventDefault(); vid.currentTime -= 3; }
    else if (ev.key === "ArrowRight") { ev.preventDefault(); vid.currentTime += 3; }
  }, vid);

  const boton = (texto, accion, clase = "") => h("button", { type: "button", class: `btn peq ${clase}`, onclick: accion }, texto);
  root.replaceChildren(cab,
    h("div", { class: "card vlis-filtros" }, chips, h("div", { class: "vlis-campos" },
      sel("video", "Todos los vídeos", videos.map((v) => [String(v.id), v.titulo])), sel("equipo", "Todos los equipos", unicos("equipo")), sel("jugador", "Todos los jugadores", unicos("jugador")), buscar)),
    h("div", { class: "vlis" },
      h("div", { class: "vid-izq" }, vid,
        h("div", { class: "vlis-mandos" }, boton("▶ Reproducir lista", () => { actual = terminada = null; mover(0); }, "primario"), boton("⏮ Anterior", () => { terminada = null; mover(-1); }), boton("Siguiente ⏭", () => { terminada = null; mover(1); }),
          casilla("seguido", "Seguido"), casilla("repetir", "Repetir")),
        ficha, h("p", { class: "vid-ayuda", text: "Espacio: pausa · ↑/↓: jugada anterior o siguiente · ←/→: ±3 s" })),
      h("div", { class: "card vlis-lat" }, cuenta, ol)));
  pintarChips(); filtrar();
}
