// Paleta de dibujo del Playbook: cada botón enseña con un dibujo (el mismo trazo que aparece en la pista) y su nombre lo que
// hace, y una línea sobre la pista explica cómo usar la herramienta elegida.
import { h, s } from "../util.js";

const L = { fill: "none", stroke: "currentColor", "stroke-width": 2, "stroke-linecap": "round", "stroke-linejoin": "round" };
const linea = (d, extra = {}) => s("path", { ...L, d, ...extra });
const punta = (color = "currentColor") => s("path", { d: "M44 12 35 7v10Z", fill: color });
const letra = (x, t, fill) => s("text", { x, y: 12.5, "text-anchor": "middle", "dominant-baseline": "central", "font-size": 12, "font-weight": 700, fill, "font-family": "system-ui,sans-serif" }, t);
const balon = (x, y, r) => [s("circle", { cx: x, cy: y, r, fill: "#f4571d", stroke: "#7a2a08", "stroke-width": 1.2 }), s("path", { d: `M${x - r} ${y}h${2 * r}M${x} ${y - r}v${2 * r}`, stroke: "#7a2a08", "stroke-width": 0.9 })];
const DIBUJOS = {
  mover: () => [s("path", { d: "M18 3v17l4.5-4 3 7 3.5-1.5-3-6.8h6Z", fill: "currentColor" })],
  of: () => [s("circle", { cx: 24, cy: 12, r: 10, fill: "#2a5fd0" }), letra(24, "1", "#fff")],
  df: () => [s("circle", { cx: 24, cy: 12, r: 9.5, fill: "#fff", stroke: "#c2332b", "stroke-width": 2 }), letra(24, "X", "#c2332b")],
  balon: () => balon(24, 12, 8),
  corte: () => [linea("M4 12H37"), punta()],
  bote: () => [linea("M4 12l4-5 6 10 6-10 6 10 6-10 4 5h2"), punta()],
  pase: () => [linea("M4 12H36", { "stroke-dasharray": "6 4", "stroke-linecap": "butt" }), punta()],
  entrega: () => [linea("M4 12H34", { "stroke-dasharray": "0.1 6", "stroke-width": 3 }), punta()],
  bloqueo: () => [linea("M4 12H40M41 4v16", { "stroke-width": 2.6 })],
  tiro: () => [linea("M3 18Q16 2 31 10", { stroke: "#f4571d", "stroke-dasharray": "2 4" }), s("circle", { cx: 38, cy: 13, r: 6, fill: "none", stroke: "#f4571d", "stroke-width": 2 })],
  zona: () => [s("ellipse", { cx: 24, cy: 12, rx: 18, ry: 9, fill: "rgba(244,163,29,.25)", stroke: "#f4a31d", "stroke-width": 1.8, "stroke-dasharray": "5 3" })],
  texto: () => [letra(24, "Abc", "currentColor")],
  borrar: () => [linea("M17 7h14M21 7V4h6v3M19 7l1 14h8l1-14M22.5 11v6M25.5 11v6")],
};

const GRUPOS = [
  [null, [["mover", "Mover", "arrastra jugadores; pulsa una línea para curvarla."]]],
  ["Poner", [["of", "Atacante", "pulsa en la pista para colocarlo."], ["df", "Defensor", "pulsa en la pista para colocarlo."], ["balon", "Dar balón", "pulsa el jugador que tiene el balón."]]],
  ["Movimientos", [["corte", "Corte", "arrastra desde un jugador hasta donde corre sin balón.", "Jugador que corre sin balón"], ["bote", "Bote", "arrastra desde un jugador hasta donde avanza botando.", "Jugador que avanza botando"],
    ["pase", "Pase", "arrastra desde quien pasa y suelta encima de quien recibe.", "El balón cambia de jugador"], ["entrega", "Mano a mano", "arrastra desde quien entrega y suelta encima de quien recibe.", "Entrega del balón en mano"],
    ["bloqueo", "Bloqueo", "arrastra desde el bloqueador hasta donde pone el bloqueo.", "El jugador va a bloquear"], ["tiro", "Tiro", "arrastra desde el tirador hasta el aro.", "Lanzamiento a canasta"]]],
  ["Anotar", [["zona", "Zona", "arrastra sobre la pista para señalar un área.", "Señalar un área"], ["texto", "Texto", "pulsa en la pista donde quieras escribir.", "Escribir en la pista"]]],
  [null, [["borrar", "Borrar", "pulsa un jugador (se quita de todos los pasos) o una línea."]]],
];
const TODAS = new Map(GRUPOS.flatMap(([, hs]) => hs).map((x) => [x[0], x]));
const NECESITA_JUGADOR = ["balon", "corte", "bote", "pase", "entrega", "bloqueo", "tiro"];

/** `elegir(id)` activa la herramienta en la pizarra. Devuelve {paleta, ayuda, aviso()}. */
export function crearPaleta(elegir) {
  let actual = "mover", t = null;
  const ayuda = h("p", { class: "jg-ayuda", role: "status" });
  const explicar = () => { const [, nombre, como] = TODAS.get(actual); ayuda.classList.remove("mal"); ayuda.replaceChildren(h("b", { text: `${nombre}: ` }), como,
    ""); ayuda.title = ayuda.textContent; };
  const activar = (id) => { actual = id; paleta.querySelectorAll(".jg-h").forEach((b) => { b.classList.toggle("on", b.dataset.h === id); b.setAttribute("aria-pressed", String(b.dataset.h === id)); }); clearTimeout(t); explicar(); elegir(id); };
  const boton = ([id, nombre, como, corto]) => h("button", { type: "button", class: "jg-h" + (id === actual ? " on" : ""), "data-h": id, "aria-pressed": String(id === actual), title: `${corto ? corto + ". " : ""}Cómo: ${como}`, onclick: () => activar(id) },
    s("svg", { viewBox: "0 0 48 24", width: 48, height: 24, "aria-hidden": "true" }, DIBUJOS[id]()), h("span", { text: nombre }));
  const paleta = h("div", { class: "jg-paleta", role: "toolbar", "aria-label": "Herramientas de dibujo" },
    GRUPOS.map(([titulo, hs]) => h("div", { class: "jg-hgrupo" + (hs.length === 1 ? " solo" : "") }, titulo ? h("small", { text: titulo }) : null, hs.map(boton))));
  explicar();
  /** Se pulsó fuera de un jugador con una herramienta que parte de uno. */
  const aviso = () => { if (!NECESITA_JUGADOR.includes(actual)) return; clearTimeout(t); ayuda.classList.add("mal");
    ayuda.textContent = ayuda.title = "Empieza encima de un jugador."; t = setTimeout(explicar, 4000); };
  return { paleta, ayuda, aviso };
}
