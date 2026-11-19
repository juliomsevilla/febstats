// Exportación: tablas a CSV (Excel en español: «;» y coma decimal) y gráficos a PNG.
import { h, icono } from "./util.js";

function descargar(href, nombre) {
  const a = h("a", { href, download: nombre });
  document.body.append(a); a.click(); a.remove();
}
const limpio = (s) => String(s).normalize("NFD").replace(/[̀-ͯ]/g, "").replace(/[^\w.-]+/g, "_").replace(/^_+|_+$/g, "");
export const nombreArchivo = (...partes) => limpio(partes.filter(Boolean).join("_")) || "datos";

const celda = (v) => {
  if (v == null || Number.isNaN(v)) return "";
  let s = typeof v === "number" ? String(Math.round(v * 1000) / 1000).replace(".", ",") : String(v);
  return /[;"\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
};
/** Descarga un CSV con las mismas filas, en el mismo orden y con las mismas columnas que la tabla en pantalla. */
export function csvTabla({ cols, filas, orden, nombre }) {
  const orig = cols;
  cols = cols.flatMap((c) => (c.par ? [{ key: c.par[0], label: `${c.label} anotados` }, { key: c.par[1], label: `${c.label} intentados` }] : [c])); // «2/5» lo convierte Excel en fecha
  const val = (c, r) => (c.csv ? c.csv(r) : c.val ? c.val(r) : r[c.key]);
  const col = orig.find((c) => c.key === orden?.col);
  const ord = col ? filas.slice().sort((a, b) => {
    const x = val(col, a), y = val(col, b);
    if (x == null) return 1; if (y == null) return -1;
    return (typeof x === "string" ? x.localeCompare(y, "es") : x - y) * orden.dir;
  }) : filas;
  const cab = cols.map((c) => celda(c.csvLabel || c.label || c.key));
  const lineas = [cab.join(";"), ...ord.map((r) => cols.map((c) => celda(val(c, r))).join(";"))];
  descargar("data:text/csv;charset=utf-8,﻿" + encodeURIComponent(lineas.join("\r\n")), nombre + ".csv");
}

/** Descarga arbitraria de filas ya preparadas: {cab:[...], filas:[[...]]}. */
export function csvDatos({ cab, filas, nombre }) {
  const lineas = [cab.map(celda).join(";"), ...filas.map((f) => f.map(celda).join(";"))];
  descargar("data:text/csv;charset=utf-8,﻿" + encodeURIComponent(lineas.join("\r\n")), nombre + ".csv");
}

export const botonCSV = (opts) => h("button", { type: "button", class: "btn", title: "Descargar esta tabla en CSV (Excel)", onclick: () => csvTabla(opts) }, icono("descargar"), "CSV");

// --- PNG de un SVG: se congelan los estilos calculados (variables CSS, light-dark) en cada nodo ---
const PROPS = ["fill", "stroke", "stroke-width", "stroke-dasharray", "stroke-linecap", "stroke-linejoin", "opacity", "font-size", "font-weight", "font-family", "text-anchor", "paint-order", "fill-opacity"];
export function congelar(svg) {
  const clon = svg.cloneNode(true), o = [svg, ...svg.querySelectorAll("*")], k = [clon, ...clon.querySelectorAll("*")];
  o.forEach((n, i) => { const cs = getComputedStyle(n); for (const p of PROPS) k[i].style.setProperty(p, cs.getPropertyValue(p)); });
  clon.setAttribute("xmlns", "http://www.w3.org/2000/svg");
  return clon;
}
export const cargarImg = (src) => new Promise((ok, ko) => { const i = new Image(); i.onload = () => ok(i); i.onerror = ko; i.src = src; });
export const svgUrl = (svg, W, H) => "data:image/svg+xml;charset=utf-8," + encodeURIComponent(new XMLSerializer().serializeToString(congelar(svg)).replace("<svg ", `<svg width="${W}" height="${H}" `));

export async function pngSvg(svg, nombre, { ancho = 1400, titulo = "", leyenda = [] } = {}) {
  const vb = svg.viewBox.baseVal, H0 = Math.round((ancho * vb.height) / vb.width), cab = titulo ? 56 : 16, pie = leyenda.length ? 40 : 16, H = H0 + cab + pie;
  const c = h("canvas", { width: ancho, height: H }), ctx = c.getContext("2d");
  const cs = getComputedStyle(document.body);
  ctx.fillStyle = cs.backgroundColor === "rgba(0, 0, 0, 0)" ? "#fff" : getComputedStyle(document.querySelector(".card") || document.body).backgroundColor; ctx.fillRect(0, 0, ancho, H);
  ctx.fillStyle = cs.color; ctx.font = "600 24px system-ui, sans-serif"; if (titulo) ctx.fillText(titulo, 24, 36);
  ctx.drawImage(await cargarImg(svgUrl(svg, ancho, H0)), 0, cab, ancho, H0);
  ctx.font = "16px system-ui, sans-serif"; let x = 24;
  for (const [color, txt] of leyenda) { ctx.fillStyle = color; ctx.fillRect(x, H - 30, 14, 14); ctx.fillStyle = cs.color; ctx.fillText(txt, x + 22, H - 17); x += 50 + ctx.measureText(txt).width; }
  descargar(c.toDataURL("image/png"), nombre + ".png");
}
