// Exportación a Word (.docx) sin bibliotecas: convierte el HTML renderizado de una nota a WordprocessingML y lo empaqueta en un zip
// (sin compresión). Admite títulos, párrafos, negrita/cursiva/tachado/código, enlaces, listas (con anidado y numeradas), citas,
// código, tablas, reglas, imágenes y fórmulas (como texto TeX).

// ---------- zip mínimo (entradas sin comprimir) ----------
const TABLA_CRC = (() => { const t = new Uint32Array(256); for (let n = 0; n < 256; n++) { let c = n; for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1; t[n] = c >>> 0; } return t; })();
const crc32 = (b) => { let c = 0xffffffff; for (let i = 0; i < b.length; i++) c = TABLA_CRC[(c ^ b[i]) & 255] ^ (c >>> 8); return (c ^ 0xffffffff) >>> 0; };
export function zip(archivos) { // [{nombre, datos: Uint8Array}]
  const enc = new TextEncoder(), partes = [], central = []; let pos = 0;
  const u16 = (v) => [v & 255, (v >> 8) & 255], u32 = (v) => [v & 255, (v >>> 8) & 255, (v >>> 16) & 255, (v >>> 24) & 255];
  for (const a of archivos) {
    const nom = enc.encode(a.nombre), crc = crc32(a.datos), n = a.datos.length;
    const cab = new Uint8Array([0x50, 0x4b, 3, 4, ...u16(20), ...u16(0x0800), ...u16(0), ...u16(0), ...u16(0x21), ...u32(crc), ...u32(n), ...u32(n), ...u16(nom.length), ...u16(0), ...nom]);
    partes.push(cab, a.datos);
    central.push(new Uint8Array([0x50, 0x4b, 1, 2, ...u16(20), ...u16(20), ...u16(0x0800), ...u16(0), ...u16(0), ...u16(0x21), ...u32(crc), ...u32(n), ...u32(n), ...u16(nom.length), ...u16(0), ...u16(0), ...u16(0), ...u16(0), ...u32(0), ...u32(pos), ...nom]));
    pos += cab.length + n;
  }
  const tamC = central.reduce((s, c) => s + c.length, 0);
  const fin = new Uint8Array([0x50, 0x4b, 5, 6, ...u16(0), ...u16(0), ...u16(archivos.length), ...u16(archivos.length), ...u32(tamC), ...u32(pos), ...u16(0)]);
  return new Blob([...partes, ...central, fin], { type: "application/vnd.openxmlformats-officedocument.wordprocessingml.document" });
}

// ---------- utilidades ----------
const x = (s) => String(s).replace(/[&<>"]/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" })[c]).replace(/[\u0000-\u0008\u000b\u000c\u000e-\u001f]/g, "");
const EMU_CM = 360000, ANCHO_MAX = 16 * EMU_CM, ALTO_MAX = 21 * EMU_CM, ANCHO_TXT = 9072; // A4 con márgenes de 2,5 cm, en twips
const MONO = "Consolas";

function aBytes(dataUrl) {
  const m = dataUrl.match(/^data:([^;,]+)(;base64)?,(.*)$/s); if (!m) return null;
  const bin = m[2] ? atob(m[3]) : decodeURIComponent(m[3]);
  const b = new Uint8Array(bin.length); for (let i = 0; i < bin.length; i++) b[i] = bin.charCodeAt(i); return { mime: m[1], bytes: b };
}
function cargarImg(src) { return new Promise((ok) => { const i = new Image(); i.onload = () => ok(i); i.onerror = () => ok(null); i.src = src; }); }
async function prepararImagen(src) { // → { bytes, ext, w, h } (px) o null; webp y otros formatos se pasan a PNG
  const im = await cargarImg(src); if (!im) return null;
  const d = src.startsWith("data:") ? aBytes(src) : null;
  const ext = d && /image\/(png|jpeg|gif)/.test(d.mime) ? d.mime.split("/")[1].replace("jpeg", "jpg") : null;
  if (ext) return { bytes: d.bytes, ext, w: im.naturalWidth || 400, h: im.naturalHeight || 300 };
  const c = document.createElement("canvas"); c.width = im.naturalWidth || 400; c.height = im.naturalHeight || 300; c.getContext("2d").drawImage(im, 0, 0);
  const png = aBytes(c.toDataURL("image/png")); return png ? { bytes: png.bytes, ext: "png", w: c.width, h: c.height } : null;
}

/** HTML (con imágenes ya incrustadas como data:) → Blob .docx. `cabecera`: líneas de texto bajo el título (temporada, equipo…). */
export async function crearDocx(html, { titulo = "", cabecera = [] } = {}) {
  const doc = new DOMParser().parseFromString(`<body>${html}</body>`, "text/html").body;
  const rels = []; // [{id, tipo, destino, externo}]
  const media = []; // [{nombre, bytes}]
  const ids = { n: 1 }; const nuevoId = () => `rId${++ids.n + 10}`;
  const numeradas = []; // numId de cada <ol>
  let nDocPr = 0;
  const imagenes = new Map();
  for (const im of doc.querySelectorAll("img")) { const s = im.getAttribute("src") || ""; if (!imagenes.has(s)) imagenes.set(s, await prepararImagen(s)); }

  const rPr = (f) => {
    const p = [];
    if (f.mono) p.push(`<w:rFonts w:ascii="${MONO}" w:hAnsi="${MONO}" w:cs="${MONO}"/>`);
    if (f.b) p.push("<w:b/>"); if (f.i) p.push("<w:i/>"); if (f.s) p.push("<w:strike/>");
    if (f.color) p.push(`<w:color w:val="${f.color}"/>`);
    if (f.mono) p.push('<w:sz w:val="19"/>');
    if (f.u) p.push('<w:u w:val="single"/>');
    if (f.mono && !f.bloque) p.push('<w:shd w:val="clear" w:color="auto" w:fill="F2F2F2"/>');
    if (f.sup) p.push('<w:vertAlign w:val="superscript"/>'); if (f.sub) p.push('<w:vertAlign w:val="subscript"/>');
    return p.length ? `<w:rPr>${p.join("")}</w:rPr>` : "";
  };
  const run = (t, f) => (t === "" ? "" : `<w:r>${rPr(f)}<w:t xml:space="preserve">${x(t)}</w:t></w:r>`);

  function dibujo(src, alt) {
    const im = imagenes.get(src); if (!im) return run(`[${alt || "imagen"}]`, { i: true });
    const nombre = `imagen${media.length + 1}.${im.ext}`; media.push({ nombre, bytes: im.bytes });
    const rid = nuevoId(); rels.push({ id: rid, tipo: "image", destino: `media/${nombre}` });
    let w = im.w * 9525, hh = im.h * 9525; const k = Math.min(1, ANCHO_MAX / w, ALTO_MAX / hh); w = Math.round(w * k); hh = Math.round(hh * k);
    const id = ++nDocPr;
    return `<w:r><w:drawing><wp:inline distT="0" distB="0" distL="0" distR="0"><wp:extent cx="${w}" cy="${hh}"/><wp:docPr id="${id}" name="Imagen ${id}" descr="${x(alt || "")}"/>` +
      `<a:graphic xmlns:a="http://schemas.openxmlformats.org/drawingml/2006/main"><a:graphicData uri="http://schemas.openxmlformats.org/drawingml/2006/picture"><pic:pic xmlns:pic="http://schemas.openxmlformats.org/drawingml/2006/picture">` +
      `<pic:nvPicPr><pic:cNvPr id="${id}" name="${nombre}"/><pic:cNvPicPr/></pic:nvPicPr><pic:blipFill><a:blip r:embed="${rid}"/><a:stretch><a:fillRect/></a:stretch></pic:blipFill>` +
      `<pic:spPr><a:xfrm><a:off x="0" y="0"/><a:ext cx="${w}" cy="${hh}"/></a:xfrm><a:prstGeom prst="rect"><a:avLst/></a:prstGeom></pic:spPr></pic:pic></a:graphicData></a:graphic></wp:inline></w:drawing></w:r>`;
  }

  // inline: devuelve XML de runs
  function inline(n, f = {}) {
    if (n.nodeType === 3) return run(n.textContent.replace(/\s+/g, " "), f);
    if (n.nodeType !== 1) return "";
    const t = n.tagName.toLowerCase(), c = n.classList;
    if (t === "br") return "<w:r><w:br/></w:r>";
    if (t === "img") return dibujo(n.getAttribute("src") || "", n.getAttribute("alt"));
    if (t === "input") return run(n.checked || n.hasAttribute("checked") ? "☑ " : "☐ ", f);
    if (c.contains("katex") || c.contains("katex-display")) { const a = n.querySelector('annotation[encoding="application/x-tex"]'); return run(a ? a.textContent : n.textContent, { ...f, i: true, mono: true }); }
    const g = { ...f };
    if (t === "strong" || t === "b") g.b = true; else if (t === "em" || t === "i") g.i = true; else if (t === "del" || t === "s") g.s = true;
    else if (t === "code") g.mono = true; else if (t === "sup") g.sup = true; else if (t === "sub") g.sub = true;
    else if (t === "a") {
      const href = n.getAttribute("href") || "";
      g.color = "0B5FFF"; g.u = true;
      const interior = [...n.childNodes].map((k) => inline(k, g)).join("");
      if (/^https?:|^mailto:/i.test(href)) { const rid = nuevoId(); rels.push({ id: rid, tipo: "hyperlink", destino: href, externo: true }); return `<w:hyperlink r:id="${rid}">${interior}</w:hyperlink>`; }
      return interior;
    }
    return [...n.childNodes].map((k) => inline(k, g)).join("");
  }

  const para = (runs, o = {}) => {
    const p = [];
    if (o.estilo) p.push(`<w:pStyle w:val="${o.estilo}"/>`);
    if (o.num) p.push(`<w:numPr><w:ilvl w:val="${o.num[1]}"/><w:numId w:val="${o.num[0]}"/></w:numPr>`);
    const q = o.cita || 0;
    if (q || o.borde) p.push(`<w:pBdr>${q ? '<w:left w:val="single" w:sz="18" w:space="8" w:color="BBBBBB"/>' : ""}${o.borde === "abajo" ? '<w:bottom w:val="single" w:sz="6" w:space="1" w:color="999999"/>' : ""}</w:pBdr>`);
    if (o.relleno) p.push(`<w:shd w:val="clear" w:color="auto" w:fill="${o.relleno}"/>`);
    p.push(`<w:spacing w:before="${o.antes ?? 0}" w:after="${o.despues ?? 120}"${o.interlinea ? ` w:line="${o.interlinea}" w:lineRule="auto"` : ""}/>`);
    if (q || o.sangria) p.push(`<w:ind w:left="${q * 400 + (o.sangria || 0)}"/>`);
    if (o.centrar) p.push('<w:jc w:val="center"/>');
    return `<w:p><w:pPr>${p.join("")}</w:pPr>${runs}</w:p>`;
  };

  const ES_BLOQUE = new Set(["p", "ul", "ol", "li", "blockquote", "pre", "table", "h1", "h2", "h3", "h4", "h5", "h6", "hr", "div", "section", "nav", "figure"]);
  // bloques: devuelve XML de párrafos/tablas
  function bloques(nodos, ctx = {}) {
    let out = "", suelto = "";
    const vaciar = () => { if (/<w:(t|drawing|br)[ />]/.test(suelto) && (suelto.replace(/<[^>]+>/g, "").trim() || /<w:(drawing|br)/.test(suelto))) out += para(suelto, { cita: ctx.cita }); suelto = ""; };
    for (const n of nodos) {
      if (n.nodeType === 3) { if (suelto || n.textContent.trim()) suelto += inline(n); continue; }
      if (n.nodeType !== 1) continue;
      const t = n.tagName.toLowerCase();
      if (!ES_BLOQUE.has(t) || n.classList.contains("katex") ) { suelto += inline(n); continue; }
      vaciar();
      if (/^h[1-6]$/.test(t)) out += para([...n.childNodes].map((k) => inline(k)).join(""), { estilo: `Heading${t[1]}`, cita: ctx.cita });
      else if (t === "p") out += n.querySelector(".katex-display") && n.textContent.trim() === n.querySelector(".katex-display").textContent.trim()
        ? para(inline(n), { centrar: true, cita: ctx.cita }) : para([...n.childNodes].map((k) => inline(k)).join(""), { cita: ctx.cita });
      else if (t === "ul" || t === "ol") out += lista(n, ctx, 0, t === "ol" ? (numeradas.push(numeradas.length + 2), numeradas[numeradas.length - 1]) : 1);
      else if (t === "blockquote") {
        const aviso = n.classList.contains("callout");
        out += bloques([...n.childNodes], { ...ctx, cita: (ctx.cita || 0) + 1, aviso });
      }
      else if (t === "pre") {
        const lineas = n.textContent.replace(/\n$/, "").split("\n");
        out += lineas.map((l, i) => para(run(l, { mono: true, bloque: true }) || "<w:r><w:t></w:t></w:r>", { relleno: "F6F6F6", despues: i === lineas.length - 1 ? 160 : 0, cita: ctx.cita, interlinea: 240 })).join("");
      }
      else if (t === "hr") out += para("", { borde: "abajo", cita: ctx.cita });
      else if (t === "table") out += tabla(n);
      else if (n.classList.contains("callout-title")) out += para(run(n.textContent, { b: true }), { cita: ctx.cita });
      else if (n.classList.contains("katex-display")) out += para(inline(n), { centrar: true });
      else out += bloques([...n.childNodes], ctx);
    }
    vaciar();
    return out;
  }
  function lista(ul, ctx, nivel, numId) {
    let out = "";
    for (const li of ul.children) {
      if (li.tagName.toLowerCase() !== "li") continue;
      let primero = true, buf = "";
      const volcar = () => { if (buf.trim() || primero) { out += para(buf, { num: [numId, Math.min(nivel, 8)], despues: 40, cita: ctx.cita }); primero = false; } buf = ""; };
      for (const k of li.childNodes) {
        const t = k.nodeType === 1 ? k.tagName.toLowerCase() : "";
        if (t === "ul" || t === "ol") { volcar(); const id = t === "ol" ? (numeradas.push(numeradas.length + 2), numeradas[numeradas.length - 1]) : 1; out += lista(k, ctx, nivel + 1, id); }
        else if (t === "p") { buf += (buf ? "<w:r><w:br/></w:r>" : "") + [...k.childNodes].map((z) => inline(z)).join(""); }
        else if (t === "pre" || t === "table" || t === "blockquote") { volcar(); out += bloques([k], ctx); }
        else buf += inline(k);
      }
      volcar();
    }
    return out;
  }
  function tabla(tb) {
    const filas = [...tb.querySelectorAll("tr")]; if (!filas.length) return "";
    const nCol = Math.max(...filas.map((r) => r.children.length)); const w = Math.floor(ANCHO_TXT / nCol);
    const borde = (l) => `<w:${l} w:val="single" w:sz="4" w:space="0" w:color="BBBBBB"/>`;
    const trs = filas.map((r) => `<w:tr>${[...r.children].map((c) => {
      const th = c.tagName.toLowerCase() === "th";
      const cont = th ? para([...c.childNodes].map((k) => inline(k, { b: true })).join(""), { despues: 40 }) : (bloques([...c.childNodes]) || para("", { despues: 40 }));
      return `<w:tc><w:tcPr><w:tcW w:w="${w}" w:type="dxa"/>${th ? '<w:shd w:val="clear" w:color="auto" w:fill="F2F2F2"/>' : ""}</w:tcPr>${cont}</w:tc>`;
    }).join("")}</w:tr>`).join("");
    return `<w:tbl><w:tblPr><w:tblW w:w="${w * nCol}" w:type="dxa"/><w:tblBorders>${["top", "left", "bottom", "right", "insideH", "insideV"].map(borde).join("")}</w:tblBorders><w:tblLayout w:type="fixed"/><w:tblCellMar><w:left w:w="90" w:type="dxa"/><w:right w:w="90" w:type="dxa"/></w:tblCellMar></w:tblPr>` +
      `<w:tblGrid>${Array.from({ length: nCol }, () => `<w:gridCol w:w="${w}"/>`).join("")}</w:tblGrid>${trs}</w:tbl>${para("", { despues: 80 })}`;
  }

  let cuerpo = "";
  if (titulo) cuerpo += para(run(titulo, {}), { estilo: "Title" });
  for (const l of cabecera) cuerpo += para(run(l, { color: "666666" }), { despues: 40 });
  if (cabecera.length) cuerpo += para("", { borde: "abajo", despues: 160 });
  cuerpo += bloques([...doc.childNodes]);
  cuerpo += '<w:sectPr><w:pgSz w:w="11906" w:h="16838"/><w:pgMar w:top="1417" w:right="1417" w:bottom="1417" w:left="1417" w:header="709" w:footer="709" w:gutter="0"/></w:sectPr>';

  const NS = 'xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main" xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships" xmlns:wp="http://schemas.openxmlformats.org/drawingml/2006/wordprocessingDrawing"';
  const documento = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?><w:document ${NS}><w:body>${cuerpo}</w:body></w:document>`;

  const estiloTit = (id, nombre, sz, extra = "") => `<w:style w:type="paragraph" w:styleId="${id}"><w:name w:val="${nombre}"/><w:basedOn w:val="Normal"/><w:next w:val="Normal"/><w:qFormat/><w:pPr><w:keepNext/><w:spacing w:before="${id === "Title" ? 0 : 280}" w:after="120"/></w:pPr><w:rPr><w:rFonts w:ascii="Calibri" w:hAnsi="Calibri"/><w:b/>${extra}<w:sz w:val="${sz}"/></w:rPr></w:style>`;
  const estilos = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?><w:styles xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main"><w:docDefaults><w:rPrDefault><w:rPr><w:rFonts w:ascii="Calibri" w:hAnsi="Calibri" w:cs="Calibri" w:eastAsia="Calibri"/><w:sz w:val="22"/><w:lang w:val="es-ES"/></w:rPr></w:rPrDefault><w:pPrDefault><w:pPr><w:spacing w:after="120" w:line="264" w:lineRule="auto"/></w:pPr></w:pPrDefault></w:docDefaults>` +
    `<w:style w:type="paragraph" w:default="1" w:styleId="Normal"><w:name w:val="Normal"/><w:qFormat/></w:style>` +
    estiloTit("Title", "Title", 44) + [[1, 36], [2, 30], [3, 26], [4, 24], [5, 22], [6, 22]].map(([n, sz]) => estiloTit(`Heading${n}`, `heading ${n}`, sz)).join("") + `</w:styles>`;

  const lvl = (n, fmt, txt) => `<w:lvl w:ilvl="${n}"><w:start w:val="1"/><w:numFmt w:val="${fmt}"/><w:lvlText w:val="${txt}"/><w:lvlJc w:val="left"/><w:pPr><w:ind w:left="${720 + n * 360}" w:hanging="360"/></w:pPr></w:lvl>`;
  const viñetas = ["•", "◦", "▪"], formatos = ["decimal", "lowerLetter", "lowerRoman"];
  const numeracion = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?><w:numbering xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main">` +
    `<w:abstractNum w:abstractNumId="0"><w:multiLevelType w:val="hybridMultilevel"/>${Array.from({ length: 9 }, (_, n) => lvl(n, "bullet", viñetas[n % 3])).join("")}</w:abstractNum>` +
    `<w:abstractNum w:abstractNumId="1"><w:multiLevelType w:val="hybridMultilevel"/>${Array.from({ length: 9 }, (_, n) => lvl(n, formatos[n % 3], `%${n + 1}.`)).join("")}</w:abstractNum>` +
    `<w:num w:numId="1"><w:abstractNumId w:val="0"/></w:num>` +
    numeradas.map((id) => `<w:num w:numId="${id}"><w:abstractNumId w:val="1"/><w:lvlOverride w:ilvl="0"><w:startOverride w:val="1"/></w:lvlOverride></w:num>`).join("") + `</w:numbering>`;

  const R = "http://schemas.openxmlformats.org/officeDocument/2006/relationships";
  const relsDoc = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?><Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">` +
    `<Relationship Id="rId1" Type="${R}/styles" Target="styles.xml"/><Relationship Id="rId2" Type="${R}/numbering" Target="numbering.xml"/>` +
    rels.map((r) => `<Relationship Id="${r.id}" Type="${R}/${r.tipo}" Target="${x(r.destino)}"${r.externo ? ' TargetMode="External"' : ""}/>`).join("") + `</Relationships>`;
  const tipos = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?><Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types"><Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/><Default Extension="xml" ContentType="application/xml"/><Default Extension="png" ContentType="image/png"/><Default Extension="jpg" ContentType="image/jpeg"/><Default Extension="gif" ContentType="image/gif"/>` +
    `<Override PartName="/word/document.xml" ContentType="application/vnd.openxmlformats-officedocument.wordprocessingml.document.main+xml"/><Override PartName="/word/styles.xml" ContentType="application/vnd.openxmlformats-officedocument.wordprocessingml.styles+xml"/><Override PartName="/word/numbering.xml" ContentType="application/vnd.openxmlformats-officedocument.wordprocessingml.numbering+xml"/></Types>`;
  const relsRaiz = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?><Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Id="rId1" Type="${R}/officeDocument" Target="word/document.xml"/></Relationships>`;

  const te = new TextEncoder();
  return zip([
    { nombre: "[Content_Types].xml", datos: te.encode(tipos) }, { nombre: "_rels/.rels", datos: te.encode(relsRaiz) },
    { nombre: "word/document.xml", datos: te.encode(documento) }, { nombre: "word/styles.xml", datos: te.encode(estilos) }, { nombre: "word/numbering.xml", datos: te.encode(numeracion) },
    { nombre: "word/_rels/document.xml.rels", datos: te.encode(relsDoc) },
    ...media.map((m) => ({ nombre: `word/media/${m.nombre}`, datos: m.bytes })),
  ]);
}
