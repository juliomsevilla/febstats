// Helpers de DOM y formato. Sin dependencias.
import { ayudaKpi } from "./ayuda.js";
const SVG_NS = "http://www.w3.org/2000/svg";

function aplicar(e, attrs) {
  for (const [k, v] of Object.entries(attrs || {})) {
    if (v == null || v === false) continue;
    if (k === "class") e.setAttribute("class", v);
    else if (k === "text") e.textContent = v;
    else if (k.startsWith("on")) e.addEventListener(k.slice(2), v);
    else if (k === "style" && typeof v === "object") Object.assign(e.style, v);
    else e.setAttribute(k, v === true ? "" : v);
  }
}
function hijos(e, kids) {
  for (const c of kids.flat(Infinity)) {
    if (c == null || c === false) continue;
    e.append(c.nodeType ? c : document.createTextNode(String(c)));
  }
  return e;
}
export const h = (tag, attrs, ...kids) => { const e = document.createElement(tag); aplicar(e, attrs); return hijos(e, kids); };
export const s = (tag, attrs, ...kids) => { const e = document.createElementNS(SVG_NS, tag); aplicar(e, attrs); return hijos(e, kids); };

const nf = (d) => new Intl.NumberFormat("es-ES", { maximumFractionDigits: d, minimumFractionDigits: 0 });
const N0 = nf(0), N1 = nf(1), N2 = new Intl.NumberFormat("es-ES", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
const vacio = (v) => v == null || Number.isNaN(v);
export const f0 = (v) => (vacio(v) ? "—" : N0.format(v));
export const f1 = (v) => (vacio(v) ? "—" : N1.format(v));
export const f2 = (v) => (vacio(v) ? "—" : N2.format(v));
export const fpct = (v) => (vacio(v) ? "—" : N1.format(v) + "%");
export const fsigno = (v) => (vacio(v) ? "—" : (v > 0 ? "+" : "") + N1.format(v));

export function minutos(txt) {
  if (!txt) return 0;
  const [m, sg] = String(txt).split(":");
  return (parseInt(m, 10) || 0) + (parseInt(sg, 10) || 0) / 60;
}
export const fechaCorta = (f) => (f ? f.slice(0, 10).split("-").reverse().join("/") : "?");
export const clamp = (v, a, b) => Math.max(a, Math.min(b, v));

// Tooltip HTML global (reemplaza a los <title> nativos, lentos y sin formato).
const tipEl = () => document.getElementById("tip");
const tactil = () => matchMedia("(hover: none)").matches;
let tipTimer = 0;
export const tip = {
  show(html, ev) {
    const t = tipEl();
    t.replaceChildren(html);
    t.hidden = false;
    this.move(ev);
    clearTimeout(tipTimer);
    if (tactil()) tipTimer = setTimeout(() => this.hide(), 3500); // en el móvil no hay «salir con el ratón»: se cierra solo
  },
  move(ev) {
    const t = tipEl();
    const pad = 14, w = t.offsetWidth, hh = t.offsetHeight;
    let x = ev.clientX + pad, y = ev.clientY + pad;
    if (x + w > innerWidth - 8) x = ev.clientX - w - pad;
    if (y + hh > innerHeight - 8) y = ev.clientY - hh - pad;
    t.style.transform = `translate(${Math.max(8, x)}px, ${Math.max(8, y)}px)`;
  },
  hide() { clearTimeout(tipTimer); tipEl().hidden = true; },
};
// El tooltip es fijo en pantalla: al desplazarse o tocar fuera debe cerrarse, si no se queda flotando.
window.addEventListener("scroll", () => tip.hide(), { passive: true, capture: true });
window.addEventListener("touchmove", () => tip.hide(), { passive: true });
document.addEventListener("pointerdown", (e) => { if (!e.target.closest(".kpi.con-ayuda, .cancha")) tip.hide(); }, true);

const ICONOS = {
  equipo: "M4 20V10l8-6 8 6v10M9 20v-6h6v6",
  jugadores: "M16 11a4 4 0 1 0-8 0 4 4 0 0 0 8 0M4 21c0-4 3.6-6 8-6s8 2 8 6",
  partidos: "M4 5h16v14H4zM4 10h16M9 5v14",
  tiros: "M12 3a9 9 0 1 0 0 18 9 9 0 0 0 0-18M12 8a4 4 0 1 0 0 8 4 4 0 0 0 0-8M12 12h.01",
  sol: "M12 8a4 4 0 1 0 0 8 4 4 0 0 0 0-8M12 2v2M12 20v2M2 12h2M20 12h2M5 5l1.5 1.5M17.5 17.5L19 19M5 19l1.5-1.5M17.5 6.5L19 5",
  cerrar: "M6 6l12 12M18 6L6 18",
  descargar: "M12 4v11M7 11l5 5 5-5M5 20h14",
  buscar: "M11 4a7 7 0 1 0 0 14 7 7 0 0 0 0-14M20 20l-4-4",
  video: "M3 6h12v12H3zM15 10l6-3v10l-6-3",
  consulta: "M11 4a7 7 0 1 0 0 14 7 7 0 0 0 0-14M20 20l-4-4",
  datos: "M12 4v11M7 11l5 5 5-5M5 20h14",
  ajustes: "M12 15a3 3 0 1 0 0-6 3 3 0 0 0 0 6M19.4 15a1.7 1.7 0 0 0 .3 1.8l.1.1a2 2 0 1 1-2.8 2.8l-.1-.1a1.7 1.7 0 0 0-1.8-.3 1.7 1.7 0 0 0-1 1.5V21a2 2 0 1 1-4 0v-.1a1.7 1.7 0 0 0-1.1-1.5 1.7 1.7 0 0 0-1.8.3l-.1.1a2 2 0 1 1-2.8-2.8l.1-.1a1.7 1.7 0 0 0 .3-1.8 1.7 1.7 0 0 0-1.5-1H3a2 2 0 1 1 0-4h.1a1.7 1.7 0 0 0 1.5-1.1 1.7 1.7 0 0 0-.3-1.8l-.1-.1a2 2 0 1 1 2.8-2.8l.1.1a1.7 1.7 0 0 0 1.8.3H9a1.7 1.7 0 0 0 1-1.5V3a2 2 0 1 1 4 0v.1a1.7 1.7 0 0 0 1 1.5 1.7 1.7 0 0 0 1.8-.3l.1-.1a2 2 0 1 1 2.8 2.8l-.1.1a1.7 1.7 0 0 0-.3 1.8V9a1.7 1.7 0 0 0 1.5 1H21a2 2 0 1 1 0 4h-.1a1.7 1.7 0 0 0-1.5 1",
  playbook: "M3 4h18v16H3zM8 9l4 3-4 3M14 15h3",
  notas: "M6 3h12v18H6zM9 8h6M9 12h6M9 16h4",
  ia: "M4 5h16v11H9l-5 4zM8 9h8M8 12h5",
};
export const icono = (n) => s("svg", { class: "ico", viewBox: "0 0 24 24", "aria-hidden": "true" }, s("path", { d: ICONOS[n] }));

// Tabla ordenable. cols: [{key,label,fmt?,num?,title?,val?}]; orden: {col,dir}
// Cabecera de tabla: tocar ordena; mantener pulsado (móvil) o pasar el ratón (escritorio) muestra qué significa la columna.
function ayudaCabecera(c) {
  if (!c.title) return {};
  let timer = 0;
  const cuerpo = () => h("div", null, h("b", { text: c.label || c.key }), c.title);
  const pos = (el) => { const r = el.getBoundingClientRect(); return { clientX: r.left, clientY: r.bottom - 6 }; };
  return {
    onpointerenter: (ev) => { if (ev.pointerType === "mouse") tip.show(cuerpo(), ev); },
    onpointermove: (ev) => { if (ev.pointerType === "mouse") tip.move(ev); },
    onpointerleave: (ev) => { if (ev.pointerType === "mouse") tip.hide(); clearTimeout(timer); },
    onpointerdown: (ev) => {
      if (ev.pointerType === "mouse") return;
      const el = ev.currentTarget;
      timer = setTimeout(() => { el._largo = true; tip.show(cuerpo(), pos(el)); }, 450);
    },
    onpointerup: () => clearTimeout(timer), onpointercancel: () => clearTimeout(timer),
    oncontextmenu: (ev) => ev.preventDefault(),
  };
}

function glosario(cols) {
  const l = cols.filter((c) => c.title);
  return h("button", { type: "button", class: "btn fantasma glosario", onclick: () => dialogo("Qué significa cada columna", h("dl", { class: "glos" }, l.flatMap((c) => [h("dt", { text: c.label || c.key }), h("dd", { text: c.title })]))) },
    "ⓘ Qué significa cada columna");
}

export function tabla({ cols, filas, orden, onOrden, onFila, claseFila, vacioTxt = "Sin datos" }) {
  const val = (c, r) => (c.val ? c.val(r) : r[c.key]);
  const col = cols.find((c) => c.key === orden.col);
  const ord = filas.slice().sort((a, b) => {
    const va = val(col, a), vb = val(col, b);
    if (va == null && vb == null) return 0;
    if (va == null) return 1;
    if (vb == null) return -1;
    return (typeof va === "string" ? va.localeCompare(vb, "es") : va - vb) * orden.dir;
  });
  const head = cols.map((c) => h("th", {
    class: (c.num ? "num " : "") + (c.sec ? "sec " : "") + (c.key === orden.col ? "ord" : ""),
    title: c.title, scope: "col",
    "aria-sort": c.key === orden.col ? (orden.dir > 0 ? "ascending" : "descending") : "none",
  }, h("button", { type: "button", ...ayudaCabecera(c), onclick: (ev) => { if (ev.currentTarget._largo) { ev.currentTarget._largo = false; return; } onOrden({ col: c.key, dir: c.key === orden.col ? -orden.dir : (c.num ? -1 : 1) }); } }, c.label,
    c.key === orden.col ? h("span", { class: "flecha", "aria-hidden": "true", text: orden.dir > 0 ? "▲" : "▼" }) : null)));
  const body = ord.map((r) => h("tr", {
    class: (claseFila ? claseFila(r) : "") + (onFila ? " clic" : ""),
    tabindex: onFila ? 0 : null,
    onclick: onFila ? () => onFila(r) : null,
    onkeydown: onFila ? (e) => { if (e.key === "Enter") onFila(r); } : null,
  }, cols.map((c) => h("td", { class: (c.num ? "num" : "txt") + (c.sec ? " sec" : "") }, c.render ? c.render(r) : (c.fmt ? c.fmt(val(c, r)) : (val(c, r) ?? "—"))))));
  const tab = h("div", { class: "tabla-wrap" }, h("table", { class: "tabla" }, h("thead", null, h("tr", null, head)),
    h("tbody", null, body.length ? body : h("tr", null, h("td", { colspan: cols.length, class: "vacio-td", text: vacioTxt })))));
  return cols.some((c) => c.title) ? h("div", { class: "tabla-bloque" }, glosario(cols), tab) : tab;
}

/** Texto con tooltip explicativo: al pasar el ratón (o tocar en el móvil) muestra `texto`. */
export function conAyuda(titulo, texto, ...contenido) {
  const cuerpo = () => h("div", null, h("b", { text: titulo }), texto);
  const e = h("span", { class: "con-ayuda-txt", tabindex: 0 }, ...contenido);
  e.addEventListener("pointerenter", (ev) => { if (ev.pointerType === "mouse") tip.show(cuerpo(), ev); });
  e.addEventListener("pointermove", (ev) => { if (ev.pointerType === "mouse") tip.move(ev); });
  e.addEventListener("pointerleave", (ev) => { if (ev.pointerType === "mouse") tip.hide(); });
  e.addEventListener("click", (ev) => { if (ev.pointerType !== "mouse" && tactil()) tip.show(cuerpo(), ev); });
  e.addEventListener("focus", () => { const r = e.getBoundingClientRect(); tip.show(cuerpo(), { clientX: r.left + 12, clientY: r.bottom - 8 }); });
  e.addEventListener("blur", () => tip.hide());
  return e;
}

export function kpi(label, valor, { tono = "", nota = "" } = {}) {
  const d = nota || ayudaKpi(label);
  const e = h("div", { class: "kpi" + (d ? " con-ayuda" : ""), tabindex: d ? 0 : null }, h("div", { class: "kpi-l", text: label }), h("div", { class: "kpi-v " + tono, text: String(valor) }));
  if (d) {
    const cuerpo = () => h("div", null, h("b", { text: label }), d);
    const raton = (f) => (ev) => { if (ev.pointerType === "mouse") f(ev); }; // en táctil, enter/leave se disparan al soltar el dedo
    e.addEventListener("pointerenter", raton((ev) => tip.show(cuerpo(), ev)));
    e.addEventListener("pointermove", raton((ev) => tip.move(ev)));
    e.addEventListener("pointerleave", raton(() => tip.hide()));
    e.addEventListener("click", (ev) => { if (ev.pointerType !== "mouse" && tactil()) tip.show(cuerpo(), ev); });
    e.addEventListener("focus", () => { const r = e.getBoundingClientRect(); tip.show(cuerpo(), { clientX: r.left + 12, clientY: r.bottom - 8 }); });
    e.addEventListener("blur", () => tip.hide());
  }
  return e;
}

export const vacioMsg = (titulo, texto) => h("div", { class: "vacio" }, h("strong", { text: titulo }), texto ? h("p", { text: texto }) : null);

export function segmentado(opciones, actual, onCambio, etiqueta) {
  return h("div", { class: "seg", role: "radiogroup", "aria-label": etiqueta }, opciones.map(([v, l]) =>
    h("button", { type: "button", role: "radio", "aria-checked": String(v === actual), class: v === actual ? "on" : "", onclick: () => onCambio(v) }, l)));
}

export function dialogo(titulo, cuerpo, sub = "") {
  const d = document.getElementById("dlg");
  d.replaceChildren(
    h("div", { class: "dlg-head" }, h("div", null, h("h2", { text: titulo, style: { fontSize: "18px" } }), sub ? h("div", { class: "sub", style: { color: "var(--suave)" }, text: sub }) : null),
      h("button", { type: "button", class: "btn fantasma", "aria-label": "Cerrar", onclick: () => d.close() }, icono("cerrar"))),
    h("div", { class: "dlg-body" }, cuerpo));
  d.onclick = (e) => { if (e.target === d) d.close(); };
  d.showModal();
  return d;
}

export function tabsBar(opciones, actual, onCambio) {
  return h("div", { class: "tabs", role: "tablist" }, opciones.map(([v, l]) =>
    h("button", { type: "button", role: "tab", "aria-selected": String(v === actual), onclick: () => onCambio(v) }, l)));
}
