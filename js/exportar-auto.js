// Exportación automática: añade botones CSV y PNG a TODAS las tablas y gráficos de la aplicación, sin tocar cada vista.
// Solo en la app del Mac (no en el iPad). Las tablas se leen del DOM; los gráficos aportan sus datos en `elemento.__exp`
// ({ csv: {cab, filas}, png: () => canvas, svg?, leyenda?, titulo?, nombre? }).
import { h, icono } from "./util.js";
import { puedeExportar, guardarArchivo } from "./api.js";
import { nombreArchivo, canvasSvg } from "./export.js";
import { S } from "./state.js";

const celdaCsv = (v) => { const s = v == null ? "" : String(v); return /[;"\n\r]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s; };
const texto = (c) => {
  const k = c.cloneNode(true);
  // Los campos (selectores, cajas de texto) se sustituyen por lo que tienen seleccionado/escrito AHORA; si no, un <select>
  // aportaría el texto de todas sus opciones (p. ej., todos los jugadores) a la celda. Se hace antes de quitar nada para
  // que el original y la copia tengan los campos en el mismo orden.
  const orig = [...c.querySelectorAll("select, input, textarea")], copia = [...k.querySelectorAll("select, input, textarea")];
  copia.forEach((el, i) => {
    const o = orig[i]; if (!o) return;
    el.replaceWith(document.createTextNode(o.tagName === "SELECT" ? (o.value ? (o.selectedOptions[0]?.textContent || "") : "") : (o.value ?? "")));
  });
  k.querySelectorAll(".flecha, .ayuda, .exp-barra, svg, button.btn").forEach((n) => n.remove());
  return k.textContent.replace(/\s+/g, " ").trim();
};
const esNumero = (s) => /^[−+-]?[\d.,]+\s?%?$/.test(s);

/** Tabla del DOM → {cab, filas}. Las columnas «aciertos/intentos» se parten en dos para que Excel no las tome por fechas. */
function datosTabla(t) {
  const cab = [...(t.tHead?.rows[0]?.cells || [])].map(texto);
  let filas = [...(t.tBodies[0]?.rows || [])].filter((r) => !r.querySelector(".vacio-td")).slice(0, 5000).map((r) => [...r.cells].map(texto));
  let cabs = cab.length ? cab : (filas[0] || []).map((_, i) => `Col ${i + 1}`);
  const n = cabs.length;
  for (let j = n - 1; j >= 0; j--) { // de derecha a izquierda para no desordenar los índices
    const vals = filas.map((f) => f[j]).filter((v) => v !== "" && v != null && v !== "—");
    if (vals.length && vals.every((v) => /^\d+\/\d+$/.test(v))) {
      cabs = [...cabs.slice(0, j), `${cabs[j]} anotados`, `${cabs[j]} intentados`, ...cabs.slice(j + 1)];
      filas = filas.map((f) => { const [a, b] = /^\d+\/\d+$/.test(f[j] || "") ? f[j].split("/") : ["", ""]; return [...f.slice(0, j), a, b, ...f.slice(j + 1)]; });
    }
  }
  return { cab: cabs, filas };
}

function canvasTabla(t, titulo) {
  const { cab, filas } = (() => { const d = datosTabla(t); return d; })();
  const cs = getComputedStyle(document.body), esc = 2, fuente = "14px system-ui, -apple-system, sans-serif", negrita = "600 14px system-ui, -apple-system, sans-serif";
  const m = document.createElement("canvas").getContext("2d");
  const anchos = cab.map((c, j) => { m.font = negrita; let w = m.measureText(c).width; m.font = fuente; for (const f of filas) w = Math.max(w, m.measureText(String(f[j] ?? "")).width); return Math.min(380, Math.ceil(w) + 24); });
  const W = anchos.reduce((a, b) => a + b, 0) + 24, filaH = 30, cabT = titulo ? 54 : 16, H = cabT + filaH * (filas.length + 1) + 16;
  const c = document.createElement("canvas"); c.width = W * esc; c.height = H * esc; const x = c.getContext("2d"); x.scale(esc, esc);
  const bg = getComputedStyle(document.querySelector(".card") || document.body).backgroundColor; x.fillStyle = !bg || bg === "rgba(0, 0, 0, 0)" ? "#fff" : bg; x.fillRect(0, 0, W, H);
  x.fillStyle = cs.color; x.textBaseline = "middle";
  if (titulo) { x.font = "700 20px system-ui, sans-serif"; x.fillText(titulo, 12, 28); }
  let y = cabT;
  x.fillStyle = "rgba(128,128,128,.18)"; x.fillRect(12, y, W - 24, filaH);
  const pintaFila = (vals, enCab, k) => {
    let px = 12;
    vals.forEach((v, j) => { const s = String(v ?? ""); x.font = enCab ? negrita : fuente; x.fillStyle = cs.color; const num = j > 0 && esNumero(s); x.textAlign = num ? "right" : "left"; x.fillText(s.slice(0, 60), num ? px + anchos[j] - 10 : px + 10, y + filaH / 2); px += anchos[j]; });
    if (!enCab && k % 2) { x.fillStyle = "rgba(128,128,128,.07)"; x.fillRect(12, y, W - 24, filaH); }
  };
  x.textAlign = "left"; pintaFila(cab, true, 0); y += filaH;
  filas.forEach((f, k) => { if (k % 2) { x.fillStyle = "rgba(128,128,128,.07)"; x.fillRect(12, y, W - 24, filaH); } pintaFila(f, false, k + 1); y += filaH; });
  x.strokeStyle = "rgba(128,128,128,.4)"; x.lineWidth = 1; x.strokeRect(12.5, cabT + 0.5, W - 25, filaH * (filas.length + 1));
  return c;
}

const tituloDe = (el) => {
  const bloque = el.closest(".card, section, .tabla-bloque, .ia-m, #dlg") || document;
  const h2 = [...bloque.querySelectorAll("h1, h2, h3, .graf-t")].reverse().find((n) => n.compareDocumentPosition(el) & Node.DOCUMENT_POSITION_FOLLOWING);
  return (h2?.textContent || document.title.split("·")[0] || "").trim();
};
const sello = () => (S.data ? [S.data.temporada] : []);

function barra(el, { csv, png, nombre }) {
  const b = h("div", { class: "exp-barra" },
    csv ? h("button", { type: "button", class: "btn", title: "Descargar los datos en CSV (Excel)", onclick: async (e) => { e.stopPropagation(); const d = csv(); await guardarArchivo(`${nombre()}.csv`, "data:text/csv;charset=utf-8,﻿" + encodeURIComponent([d.cab.map(celdaCsv).join(";"), ...d.filas.map((f) => f.map((v) => celdaCsv(typeof v === "number" ? String(Math.round(v * 1000) / 1000).replace(".", ",") : v)).join(";"))].join("\r\n"))); } }, icono("descargar"), "CSV") : null,
    png ? h("button", { type: "button", class: "btn", title: "Descargar como imagen PNG", onclick: async (e) => { e.stopPropagation(); try { const c = await png(); await guardarArchivo(`${nombre()}.png`, c.toDataURL("image/png")); } catch (err) { console.error(err); } } }, icono("descargar"), "PNG") : null);
  el.before(b);
}

let pendiente = 0;
function escanear() {
  pendiente = 0;
  for (const t of document.querySelectorAll("table")) {
    if (t.dataset.exp || t.closest(".exp-barra, .mdx")) continue; // (las tablas de las notas no llevan botones CSV/PNG)
    t.dataset.exp = "1";
    const ancla = t.closest(".tabla-wrap, .vid-tabla, .tabla-bloque") || t;
    barra(ancla, { csv: () => datosTabla(t), png: async () => canvasTabla(t, tituloDe(t)), nombre: () => nombreArchivo(tituloDe(t) || "tabla", ...sello()) });
  }
  for (const el of document.querySelectorAll("*")) {
    const x = el.__exp; if (!x || el.dataset.exp) continue;
    el.dataset.exp = "1";
    const png = x.png || (x.svg ? () => canvasSvg(x.svg, { titulo: x.titulo || tituloDe(el), leyenda: x.leyenda || [] }) : null);
    barra(el, { csv: x.csv ? () => x.csv : null, png, nombre: () => x.nombre || nombreArchivo(x.titulo || tituloDe(el) || "grafico", ...sello()) });
  }
}

/** Activa la exportación automática (solo en la app del Mac). */
export function activarExportacion() {
  if (!puedeExportar) return;
  const programar = () => { if (!pendiente) pendiente = setTimeout(escanear, 150); };
  new MutationObserver(programar).observe(document.body, { childList: true, subtree: true });
  programar();
}
