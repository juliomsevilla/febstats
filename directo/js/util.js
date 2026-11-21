// Helpers de DOM, formato y utilidades. Sin dependencias externas.

const SVG_NS = "http://www.w3.org/2000/svg";

function aplicar(e, attrs) {
  for (const [k, v] of Object.entries(attrs || {})) {
    if (v == null || v === false) continue;
    if (k === "class") e.setAttribute("class", v);
    else if (k === "text") e.textContent = v;
    else if (k === "html") e.innerHTML = v;
    else if (k.startsWith("on") && typeof v === "function") e.addEventListener(k.slice(2), v);
    else if (k === "style" && typeof v === "object") Object.assign(e.style, v);
    else if (k === "dataset" && typeof v === "object") Object.assign(e.dataset, v);
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
export const frag = (...kids) => hijos(document.createDocumentFragment(), kids);
export const limpiar = (el) => { while (el.firstChild) el.removeChild(el.firstChild); return el; };
export const txt = (t) => document.createTextNode(t == null ? "" : String(t));

const N0 = new Intl.NumberFormat("es-ES", { maximumFractionDigits: 0 });
const N1 = new Intl.NumberFormat("es-ES", { maximumFractionDigits: 1 });
const vacio = (v) => v == null || v === "" || Number.isNaN(v);
export const f0 = (v) => (vacio(v) ? "—" : N0.format(v));
export const f1 = (v) => (vacio(v) ? "—" : N1.format(v));
export const fpct = (v) => (vacio(v) ? "—" : N1.format(v) + "%");
export const fsigno = (v) => (vacio(v) ? "—" : (v > 0 ? "+" : "") + N0.format(v));

/** "MM:SS" → segundos. */
export function aSegundos(txt) {
  if (txt == null || txt === "") return 0;
  if (typeof txt === "number") return txt;
  const p = String(txt).split(":");
  return (parseInt(p[0], 10) || 0) * 60 + (parseInt(p[1], 10) || 0);
}
/** segundos → "MM:SS" (o "M:SS.t" si decimal). */
export function mmss(seg, dec = false) {
  const v = Math.max(0, Number(seg) || 0);
  const m = Math.floor(v / 60);
  const s = Math.floor(v % 60);
  if (dec) return `${m}:${String(s).padStart(2, "0")}.${Math.floor((v % 1) * 10)}`;
  return `${m}:${String(s).padStart(2, "0")}`;
}
export const minutos = (txt) => (aSegundos(txt) / 60);

export const clamp = (v, a, b) => Math.max(a, Math.min(b, v));
export const jornadaTexto = (j) => (!j ? "" : /^\d+$/.test(String(j)) ? `J${j}` : String(j)).trim();
export function fechaCorta(f) {
  if (!f) return "?";
  const d = String(f).slice(0, 10).split("-");
  return d.length === 3 ? `${d[2]}/${d[1]}/${d[0]}` : String(f);
}
export function ahoraISO() { return new Date().toISOString(); }
export function selloLocal(d = new Date()) {
  const p = (n, l = 2) => String(n).padStart(l, "0");
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())} ${p(d.getHours())}${p(d.getMinutes())}${p(d.getSeconds())}.${p(d.getMilliseconds(), 3)}`;
}
export const uid = (p = "e") => `${p}_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 9)}`;
export const esc = (t) => String(t ?? "").replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));

/** Aviso breve no bloqueante. */
let toastTimer = 0;
export function toast(msg, tipo = "") {
  let el = document.getElementById("toast");
  if (!el) { el = h("div", { id: "toast", role: "status", "aria-live": "polite" }); document.body.append(el); }
  el.className = "toast visible " + tipo;
  el.textContent = msg;
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => { el.className = "toast " + tipo; }, 2600);
}

/** Diálogo modal. Devuelve el <dialog>. */
export function dialogo(titulo, cuerpo, { sub = "", ancho = "" } = {}) {
  const d = document.getElementById("dlg");
  limpiar(d);
  d.className = "dlg " + ancho;
  d.append(
    h("div", { class: "dlg-head" },
      h("div", { class: "dlg-tit" }, h("h2", { text: titulo }), sub ? h("div", { class: "sub", text: sub }) : null),
      h("button", { type: "button", class: "btn fantasma", "aria-label": "Cerrar", onclick: () => d.close() }, "✕")),
    h("div", { class: "dlg-body" }, cuerpo));
  d.onclick = (e) => { if (e.target === d) d.close(); };
  if (!d.open) d.showModal();
  return d;
}

export function confirmar(titulo, texto, { ok = "Aceptar", peligro = false } = {}) {
  return new Promise((resolver) => {
    const cerrar = (v) => { dlg.close(); resolver(v); };
    const dlg = dialogo(titulo, h("div", { class: "confirmar" },
      h("p", { text: texto }),
      h("div", { class: "acciones" },
        h("button", { type: "button", class: "btn", onclick: () => cerrar(false) }, "Cancelar"),
        h("button", { type: "button", class: "btn " + (peligro ? "peligro" : "primario"), onclick: () => cerrar(true) }, ok))));
    dlg.addEventListener("close", () => resolver(false), { once: true });
  });
}

/** Pide un texto corto en un diálogo. Devuelve "" si se cancela. */
export function pedirTexto(titulo, placeholder = "", { ok = "Guardar" } = {}) {
  return new Promise((resolver) => {
    const ta = h("textarea", { rows: 4, placeholder });
    const d = dialogo(titulo, h("div", { class: "pedir-texto" }, ta,
      h("div", { class: "acciones" }, btn("Cancelar", () => { d.close(); resolver(""); }), btn(ok, () => { const v = ta.value.trim(); d.close(); resolver(v); }, { clase: "btn primario" }))));
    d.addEventListener("close", () => resolver(""), { once: true });
    setTimeout(() => ta.focus(), 50);
  });
}

export function descargar(blob, nombre) {
  const url = URL.createObjectURL(blob);
  const a = h("a", { href: url, download: nombre });
  document.body.append(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 4000);
}

/** Guarda un archivo: en iPad ofrece «Guardar en Archivos»; si no, descarga normal. */
export async function guardarArchivo(blob, nombre) {
  try {
    const file = new File([blob], nombre, { type: blob.type || "application/octet-stream" });
    if (navigator.canShare && navigator.canShare({ files: [file] })) {
      await navigator.share({ files: [file], title: nombre });
      return "compartido";
    }
  } catch (e) {
    if (e && e.name === "AbortError") return "cancelado";
  }
  descargar(blob, nombre);
  return "descargado";
}

export function debounce(fn, ms = 200) {
  let t = 0;
  return (...a) => { clearTimeout(t); t = setTimeout(() => fn(...a), ms); };
}

/** Markdown para las notas: títulos, listas, tareas, tablas, citas/avisos, código, enlaces, imágenes, fórmulas y reglas. */
export function md(texto) {
  const lineas = String(texto || "").replace(/\r\n/g, "\n").split("\n");
  const out = [];
  const inline = (t) => {
    const codigos = [];
    let x = esc(t).replace(/`([^`]+)`/g, (_, c) => { codigos.push(c); return `\u0000${codigos.length - 1}\u0000`; });
    x = x
      .replace(/!\[([^\]]*)\]\(([^)\s]+)\)/g, '<img alt="$1" src="$2" class="md-img" loading="lazy">')
      .replace(/\[\[jugada:(\d+)\|([^\]]+)\]\]/g, '<span class="etiqueta-jugada">▶ $2</span>')
      .replace(/\[([^\]]+)\]\((https?:[^)\s]+)\)/g, '<a href="$2" target="_blank" rel="noopener">$1</a>')
      .replace(/\[\^([^\]]+)\]/g, '<sup class="md-pie">$1</sup>')
      .replace(/\*\*([^*]+)\*\*/g, "<strong>$1</strong>")
      .replace(/~~([^~]+)~~/g, "<del>$1</del>")
      .replace(/(^|[\s(])\*([^*\n]+)\*/g, "$1<em>$2</em>")
      .replace(/\$([^$\n]+)\$/g, '<span class="md-formula">$1</span>');
    return x.replace(/\u0000(\d+)\u0000/g, (_, i) => `<code>${codigos[i]}</code>`);
  };
  let i = 0;
  while (i < lineas.length) {
    const l = lineas[i];
    if (/^\s*```/.test(l)) {
      const buf = []; i++;
      while (i < lineas.length && !/^\s*```/.test(lineas[i])) buf.push(lineas[i++]);
      if (i < lineas.length) i++;
      out.push(`<pre class="md-codigo"><code>${esc(buf.join("\n"))}</code></pre>`);
      continue;
    }
    if (/^\s*(?:---+|\*\*\*+|___+)\s*$/.test(l)) { out.push("<hr>"); i++; continue; }
    const hm = l.match(/^(#{1,4})\s+(.*)$/);
    if (hm) { const n = hm[1].length + 1; out.push(`<h${n}>${inline(hm[2])}</h${n}>`); i++; continue; }
    if (l.includes("|") && i + 1 < lineas.length && /^\s*\|?\s*:?-{2,}/.test(lineas[i + 1])) {
      const celdas = (line) => line.replace(/^\s*\|/, "").replace(/\|\s*$/, "").split("|").map((c) => c.trim());
      const cab = celdas(l); i += 2; const filas = [];
      while (i < lineas.length && lineas[i].includes("|") && lineas[i].trim()) { filas.push(celdas(lineas[i])); i++; }
      out.push(`<div class="md-tabla-wrap"><table class="md-tabla"><thead><tr>${cab.map((c) => `<th>${inline(c)}</th>`).join("")}</tr></thead><tbody>${filas.map((f) => `<tr>${f.map((c) => `<td>${inline(c)}</td>`).join("")}</tr>`).join("")}</tbody></table></div>`);
      continue;
    }
    if (/^\s*>/.test(l)) {
      const buf = [];
      while (i < lineas.length && /^\s*>/.test(lineas[i])) buf.push(lineas[i++].replace(/^\s*>\s?/, ""));
      const aviso = (buf[0] || "").match(/^\[!(NOTE|TIP|WARNING|IMPORTANT|CAUTION)\]\s*(.*)$/i);
      if (aviso) {
        const tipo = aviso[1].toLowerCase();
        const resto = [aviso[2], ...buf.slice(1)].filter(Boolean);
        out.push(`<div class="md-aviso ${tipo}"><b>${esc(aviso[1])}</b>${resto.map((x) => `<p>${inline(x)}</p>`).join("")}</div>`);
      } else {
        out.push(`<blockquote>${buf.map((x) => x ? `<p>${inline(x)}</p>` : "").join("")}</blockquote>`);
      }
      continue;
    }
    const esUl = /^\s*[-*+]\s+/.test(l), esOl = /^\s*\d+[.)]\s+/.test(l);
    if (esUl || esOl) {
      const tipo = esUl ? "ul" : "ol", items = [];
      while (i < lineas.length) {
        const mm = esUl ? lineas[i].match(/^\s*[-*+]\s+(.*)$/) : lineas[i].match(/^\s*\d+[.)]\s+(.*)$/);
        if (!mm) break;
        const tarea = mm[1].match(/^\[([ xX])\]\s+(.*)$/);
        items.push(tarea
          ? `<li class="md-tarea"><input type="checkbox" disabled${tarea[1].toLowerCase() === "x" ? " checked" : ""}> ${inline(tarea[2])}</li>`
          : `<li>${inline(mm[1])}</li>`);
        i++;
      }
      out.push(`<${tipo}>${items.join("")}</${tipo}>`);
      continue;
    }
    if (!l.trim()) out.push("<p class='md-vacio'></p>");
    else out.push(`<p>${inline(l)}</p>`);
    i++;
  }
  return out.join("");
}

/** Markdown de notas: las imágenes relativas del paquete se muestran como marcador (no rompen la vista). */
export function mdNota(texto) {
  return md(texto).replace(/<img\b([^>]*)>/g, (tag, attrs) => {
    const src = (attrs.match(/\bsrc="([^"]*)"/) || [])[1] || "";
    if (/^(data:|https?:)/i.test(src)) return tag;
    const alt = (attrs.match(/\balt="([^"]*)"/) || [])[1] || "";
    return `<span class="img-falta" data-img="${src}">Imagen no incluida: ${alt || src.split("/").pop()}</span>`;
  });
}

export const ICONOS = {
  inicio: "M3 11l9-7 9 7v9a1 1 0 0 1-1 1h-5v-6H9v6H4a1 1 0 0 1-1-1z",
  partido: "M12 3a9 9 0 1 0 0 18 9 9 0 0 0 0-18M12 8a4 4 0 1 0 0 8 4 4 0 0 0 0-8M12 12h.01",
  boxscore: "M4 5h16v14H4zM4 10h16M9 5v14M14 5v14",
  notas: "M6 3h12v18H6zM9 8h6M9 12h6M9 16h4",
  ajustes: "M12 15a3 3 0 1 0 0-6 3 3 0 0 0 0 6M19.4 15a1.7 1.7 0 0 0 .3 1.8l.1.1a2 2 0 1 1-2.8 2.8l-.1-.1a1.7 1.7 0 0 0-1.8-.3 1.7 1.7 0 0 0-1 1.5V21a2 2 0 1 1-4 0v-.1a1.7 1.7 0 0 0-1.1-1.5 1.7 1.7 0 0 0-1.8.3l-.1.1a2 2 0 1 1-2.8-2.8l.1-.1a1.7 1.7 0 0 0 .3-1.8 1.7 1.7 0 0 0-1.5-1H3a2 2 0 1 1 0-4h.1a1.7 1.7 0 0 0 1.5-1.1 1.7 1.7 0 0 0-.3-1.8l-.1-.1a2 2 0 1 1 2.8-2.8l.1.1a1.7 1.7 0 0 0 1.8.3H9a1.7 1.7 0 0 0 1-1.5V3a2 2 0 1 1 4 0v.1a1.7 1.7 0 0 0 1 1.5 1.7 1.7 0 0 0 1.8-.3l.1-.1a2 2 0 1 1 2.8 2.8l-.1.1a1.7 1.7 0 0 0-.3 1.8V9a1.7 1.7 0 0 0 1.5 1H21a2 2 0 1 1 0 4h-.1a1.7 1.7 0 0 0-1.5 1",
  importar: "M12 4v11M7 11l5 5 5-5M5 20h14",
  exportar: "M12 20V9M7 13l5-5 5 5M5 4h14",
  play: "M8 5v14l11-7z",
  pausa: "M7 5h4v14H7zM13 5h4v14h-4z",
  deshacer: "M9 7L4 12l5 5M4 12h10a5 5 0 0 1 0 10h-1",
  cambiar: "M4 8h13l-3-3M20 16H7l3 3",
  mas: "M12 5v14M5 12h14",
  menos: "M5 12h14",
  cerrar: "M6 6l12 12M18 6L6 18",
  buscar: "M11 4a7 7 0 1 0 0 14 7 7 0 0 0 0-14M20 20l-4-4",
  balon: "M12 3a9 9 0 1 0 0 18 9 9 0 0 0 0-18M5.6 5.6c2 2 2.6 4.4 2.6 6.4s-.6 4.4-2.6 6.4M18.4 5.6c-2 2-2.6 4.4-2.6 6.4s.6 4.4 2.6 6.4M3 12h18",
  reloj: "M12 7v5l3 2M12 3a9 9 0 1 0 0 18 9 9 0 0 0 0-18",
  importado: "M5 13l4 4L19 7",
};
export const icono = (n) => s("svg", { class: "ico", viewBox: "0 0 24 24", "aria-hidden": "true" }, s("path", { d: ICONOS[n] || ICONOS.partido }));

/** Botón con icono + texto. */
export const btn = (texto, onclick, { clase = "btn", icon = "", type = "button", ...rest } = {}) =>
  h("button", { type, class: clase, onclick, ...rest }, icon ? icono(icon) : null, texto ? h("span", { text: texto }) : null);
