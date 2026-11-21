// Markdown ampliado para las Notas (adaptado de MDstudio): tablas, listas de tareas, notas al pie [^1], avisos > [!NOTE],
// superíndice x^2^, matemáticas con KaTeX ($…$ y $$…$$), índice [TOC], enlaces entre notas [[nota]] y [[nota|texto]].
// Las bibliotecas (marked, DOMPurify, KaTeX, CodeMirror) están en app/static/lib y se cargan solo al abrir las Notas.

const cargadas = new Map();
function script(src) {
  if (!cargadas.has(src)) cargadas.set(src, new Promise((ok, mal) => { const e = document.createElement("script"); e.src = src; e.onload = ok; e.onerror = () => mal(new Error(`No se pudo cargar ${src}`)); document.head.append(e); }));
  return cargadas.get(src);
}
function hoja(href) {
  if (!cargadas.has(href)) { const l = document.createElement("link"); l.rel = "stylesheet"; l.href = href; document.head.append(l); cargadas.set(href, Promise.resolve()); }
}
let _libs;
/** Carga CodeMirror, marked, DOMPurify y KaTeX (una sola vez). */
export function cargarLibs() {
  return (_libs ||= (async () => {
    hoja("lib/codemirror.min.css"); hoja("lib/katex/katex.min.css");
    await script("lib/codemirror.min.js");
    await script("lib/meta.min.js"); await script("lib/xml.min.js"); await script("lib/markdown.min.js");
    await Promise.all([script("lib/marked.min.js"), script("lib/purify.min.js"), script("lib/katex/katex.min.js")]);
    marked.use({ renderer: { heading(text, level) { return `<h${level} id="${idUnico(text)}">${text}</h${level}>\n`; } } });
  })());
}

export const esc = (t) => String(t).replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[c]);
export const plegar = (s) => String(s).normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLowerCase();
const slug = (t) => plegar(t.replace(/<[^>]+>/g, "")).replace(/[^\p{L}\p{N}]+/gu, "-").replace(/^-|-$/g, "") || "titulo";
let heads = new Map();
const idUnico = (t) => { const b = slug(t), n = heads.get(b) || 0; heads.set(b, n + 1); return n ? `${b}-${n + 1}` : b; };
const FENCE = /(```[\s\S]*?```|`[^`\n]+`)/; // bloques y código en línea: no se tocan

const enc = (n) => encodeURIComponent(n.trim()).replace(/\(/g, "%28").replace(/\)/g, "%29");
/** [[nota]] y [[nota|texto]] → enlace interno (#wiki=nota). No toca el código. */
export const wikiMd = (src) => src.split(FENCE).map((seg, i) => (i % 2 ? seg : seg.replace(/\[\[([^\]\n|]+)(?:\|([^\]\n]+))?\]\]/g,
  (_, n, t) => `[${(t || n).replace(/[\[\]]/g, "")}](#wiki=${enc(n)})`))).join("");

const AVISOS = { note: "Nota", tip: "Consejo", important: "Importante", warning: "Advertencia", caution: "Precaución" };
const sup = (t) => t.replace(/\^([^\s^]+)\^/g, "<sup>$1</sup>");

function indice(out) {
  const hs = [...out.matchAll(/<h([1-6]) id="([^"]+)">([\s\S]*?)<\/h\1>/g)];
  if (!hs.length) return "";
  const min = Math.min(...hs.map((h) => +h[1]));
  return `<nav class="toc"><ul>${hs.map((h) => `<li style="margin-left:${(+h[1] - min) * 1.2}em"><a href="#${h[2]}">${h[3].replace(/<[^>]+>/g, "")}</a></li>`).join("")}</ul></nav>`;
}
// Notas al pie: quita las definiciones «[^id]: texto», numera las referencias por orden y devuelve la lista ya en HTML
function extras(src) {
  const defs = new Map(), nums = new Map();
  let partes = src.split(FENCE);
  const fuera = (f) => { partes = partes.map((s, i) => (i % 2 ? s : f(s))); };
  fuera((t) => t.replace(/^\[\^([^\]\s]+)\]:[ \t]*(.*(?:\n(?:[ \t]{2,}|\t)\S.*)*)$/gm, (_, id, txt) => (defs.set(id, txt.replace(/\n[ \t]+/g, " ").trim()), "")));
  fuera((t) => sup(t.replace(/\[\^([^\]\s]+)\]/g, (m, id) => {
    if (!defs.has(id)) return m;
    if (!nums.has(id)) nums.set(id, { n: nums.size + 1, k: 0 });
    const o = nums.get(id);
    return `<sup class="fnref"><a id="fnref-${o.n}-${++o.k}" href="#fn-${o.n}">${o.n}</a></sup>`;
  })));
  const items = [...nums].map(([id, o]) => `<li id="fn-${o.n}">${marked.parseInline(wikiMd(sup(defs.get(id))))} <a class="fnback" href="#fnref-${o.n}-1">↩</a></li>`);
  return { body: partes.join(""), pie: items.length ? `<section class="footnotes"><hr><ol>${items.join("")}</ol></section>` : "" };
}

/** Markdown → HTML saneado. Las imágenes `imagenes/x.png` quedan sin resolver (las resuelve hidratarImagenes). */
export function renderizar(src) {
  const maths = [];
  const body = src.split(FENCE).map((seg, i) => (i % 2 ? seg : seg.replace(/\$\$([\s\S]+?)\$\$|\$([^$\n]+?)\$/g, (_, dd, d) => {
    maths.push({ tex: dd ?? d, display: dd !== undefined }); return `MDMATH${maths.length - 1}X`;
  }))).join("");
  heads = new Map();
  const ex = extras(body);
  let out = marked.parse(wikiMd(ex.body));
  out = out.replace(/<blockquote>\s*<p>\[!(NOTE|TIP|IMPORTANT|WARNING|CAUTION)\][ \t]*(?:<br>)?\n?(<\/p>)?/gi, (_, t, cierra) => {
    const k = t.toLowerCase();
    return `<blockquote class="callout callout-${k}"><div class="callout-title">${AVISOS[k]}</div>${cierra ? "" : "<p>"}`;
  });
  if (out.includes("<p>[TOC]</p>")) out = out.replace("<p>[TOC]</p>", indice(out));
  out += ex.pie;
  let html = DOMPurify.sanitize(out);
  if (maths.length) html = html.replace(/MDMATH(\d+)X/g, (_, i) => katex.renderToString(maths[i].tex, { displayMode: maths[i].display, throwOnError: false }));
  return html;
}

/** Títulos (con su línea) para el esquema; ignora el código. */
export function titulos(src) {
  const out = []; let codigo = false;
  src.split("\n").forEach((l, i) => {
    if (/^\s*```/.test(l)) { codigo = !codigo; return; }
    const m = !codigo && l.match(/^(#{1,6})\s+(.+?)\s*#*\s*$/);
    if (m) out.push({ nivel: m[1].length, texto: m[2].replace(/[*_`]/g, ""), linea: i });
  });
  return out;
}

/** Sustituye en un elemento (o texto HTML) las imágenes `imagenes/…` por su contenido (data URI). `leer(nombre)` → data URL. */
export async function hidratarImagenes(el, leer) {
  const imgs = [...el.querySelectorAll("img")].filter((i) => /^imagenes\//.test(i.getAttribute("src") || ""));
  await Promise.all(imgs.map(async (i) => {
    const n = decodeURIComponent(i.getAttribute("src").slice(9));
    try { i.src = await leer(n); i.addEventListener("error", () => { const f = document.createElement("span"); f.className = "img-falta"; f.textContent = `⚠ No se puede mostrar ${n}`; i.replaceWith(f); }, { once: true }); }
    catch (e) { const f = document.createElement("span"); f.className = "img-falta"; f.textContent = `⚠ ${n}: ${typeof e === "string" ? e : e?.message || "no disponible"}`; i.replaceWith(f); }
  }));
}

// CSS de KaTeX con las fuentes incrustadas, para que el HTML/PDF exportado funcione solo
export async function estiloKatex(texto) {
  if (!texto.includes("$")) return "";
  let css = await (await fetch("lib/katex/katex.min.css")).text();
  const urls = [...new Set([...css.matchAll(/url\((fonts\/[^)]+\.woff2)\)/g)].map((m) => m[1]))];
  for (const u of urls) {
    const b = new Uint8Array(await (await fetch("lib/katex/" + u)).arrayBuffer());
    let bin = ""; for (let i = 0; i < b.length; i += 0x8000) bin += String.fromCharCode(...b.subarray(i, i + 0x8000));
    css = css.split(`url(${u})`).join(`url(data:font/woff2;base64,${btoa(bin)})`);
  }
  return css;
}

export const CSS_EXPORT = `:root{color-scheme:light}
@page{size:A4;margin:18mm 16mm}
body{margin:0;font:16px/1.65 Georgia,"Times New Roman",serif;background:#fff;color:#222}
main{max-width:72ch;margin:0 auto;padding:2.5rem 1.25rem}
h1,h2,h3,h4,h5,h6{font-family:system-ui,-apple-system,"Segoe UI",sans-serif;line-height:1.25;margin:1.6em 0 .5em;break-after:avoid}
h1{font-size:2rem}a{color:#0b5fff}img{max-width:100%;break-inside:avoid}
code{font:.85em ui-monospace,Menlo,Consolas,monospace;background:#f2f2f2;padding:.15em .35em;border-radius:4px}
pre{background:#f6f6f6;padding:1rem;overflow:auto;border-radius:6px;white-space:pre-wrap}pre code{background:none;padding:0}
blockquote{margin:1.2em 0;padding-left:1rem;border-left:4px solid #ddd;color:#555}
blockquote.callout{--c:#0969da;color:inherit;border-color:var(--c);background:color-mix(in srgb,var(--c) 10%,transparent);padding:.5rem 1rem;border-radius:0 6px 6px 0}
blockquote.callout>:last-child{margin-bottom:0}.callout-title{font:700 .9em system-ui,sans-serif;color:var(--c);margin-bottom:.3em}
.callout-tip{--c:#1a7f37}.callout-important{--c:#8250df}.callout-warning{--c:#9a6700}.callout-caution{--c:#cf222e}
section.footnotes{font-size:.9em;color:#555}.fnback{text-decoration:none}
table{border-collapse:collapse;width:100%;break-inside:avoid}th,td{border:1px solid #ddd;padding:.35rem .6rem;text-align:left}th{background:#f6f6f6}
nav.toc{border:1px solid #ddd;border-radius:4px;padding:8px 14px}nav.toc ul{list-style:none;margin:0;padding:0}
.nota-meta{font:13px system-ui,sans-serif;color:#666;border-bottom:1px solid #ddd;padding-bottom:.6rem;margin-bottom:1rem}
a.wiki{color:inherit;text-decoration:none;border-bottom:1px dotted #888}`;

/** Documento HTML autocontenido de una nota (cuerpoHtml con las imágenes ya incrustadas). */
export function documentoHtml(titulo, cuerpoHtml, { cabecera = "", katexCss = "" } = {}) {
  const limpio = cuerpoHtml.replace(/<a href="#wiki=([^"]*)"/g, '<a class="wiki" href="#"');
  return `<!doctype html>\n<html lang="es"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>${esc(titulo)}</title><style>${CSS_EXPORT}${katexCss}</style></head><body><main>${cabecera}${limpio}</main></body></html>`;
}
