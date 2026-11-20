// Markdown seguro (se escapa todo el HTML antes): títulos, negrita/cursiva, listas (con líneas de continuación), tablas, citas,
// código, reglas y enlaces internos `[texto](#cap:id)`. Con { blando: true } las líneas de un párrafo se unen (para textos largos).
export function md(txt, { blando = false } = {}) {
  const esc = (s) => s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
  const enlace = (s) => s.replace(/!\[([^\]]*)\]\((imagenes\/[^)\s]+)\)/g, (_, alt, src) => `<img src="${src}" alt="${alt}">`) // imágenes de las notas (solo las propias)
    .replace(/\[\[([^\]\n|]+)(?:\|([^\]\n]+))?\]\]/g, (_, n, t) => `<a href="#wiki=${encodeURIComponent(n.trim()).replace(/\(/g, "%28").replace(/\)/g, "%29")}" class="wiki">${(t || n).trim()}</a>`) // enlaces [[nota]] y [[jugada:12|texto]]
    .replace(/\[([^\]]+)\]\(#cap:([\w-]+)\)/g, (_, t, id) => `<a href="#" class="md-cap" data-cap="${id}">${t}</a>`).replace(/\[([^\]]+)\]\((?:https?:|mailto:)[^)]*\)/g, "$1");
  const inline = (s) => enlace(esc(s).replace(/`([^`]+)`/g, "<code>$1</code>").replace(/\*\*(.+?)\*\*/g, "<b>$1</b>").replace(/(^|[^*])\*([^*\s][^*]*?)\*(?!\*)/g, "$1<i>$2</i>").replace(/__(.+?)__/g, "<b>$1</b>"));
  const celdas = (l) => l.trim().replace(/^\|/, "").replace(/\|$/, "").split(/(?<!\\)\|/).map((c) => c.trim().replace(/\\\|/g, "|"));
  const esSep = (l) => /^\s*\|?\s*:?-{2,}:?\s*(\|\s*:?-{2,}:?\s*)*\|?\s*$/.test(l);
  const L = txt.replace(/\r/g, "").split("\n"); const out = []; let i = 0;
  const marca = /^\s*([-*•]|\d+[.)])\s+(.*)/;
  while (i < L.length) {
    const l = L[i];
    if (/^```/.test(l)) {
      const lang = l.slice(3).trim(); const c = []; i++; while (i < L.length && !/^```/.test(L[i])) c.push(L[i++]); i++;
      out.push(lang === "feb-grafico" ? `<div class="ia-graf" data-spec="${esc(c.join("\n")).replace(/"/g, "&quot;")}"></div>` : `<pre><code>${esc(c.join("\n"))}</code></pre>`); continue;
    }
    if (l.includes("|") && i + 1 < L.length && esSep(L[i + 1])) { // tabla
      const cab = celdas(l); i += 2; const filas = [];
      while (i < L.length && L[i].includes("|") && L[i].trim()) filas.push(celdas(L[i++]));
      out.push(`<div class="md-tabla"><table><thead><tr>${cab.map((c) => `<th>${inline(c)}</th>`).join("")}</tr></thead><tbody>${filas.map((f) => `<tr>${cab.map((_, k) => `<td>${inline(f[k] ?? "")}</td>`).join("")}</tr>`).join("")}</tbody></table></div>`); continue;
    }
    const li = l.match(marca);
    if (li) {
      const ord = /\d/.test(li[1]); const its = [];
      while (i < L.length) {
        const m = L[i].match(marca); if (!m) break;
        let t = m[2]; i++;
        while (i < L.length && L[i].trim() && /^\s{2,}\S/.test(L[i]) && !marca.test(L[i])) t += " " + L[i++].trim(); // continuación de la viñeta
        its.push(`<li>${inline(t)}</li>`);
      }
      out.push(`<${ord ? "ol" : "ul"}>${its.join("")}</${ord ? "ol" : "ul"}>`); continue;
    }
    const hd = l.match(/^(#{1,6})\s+(.*)/); if (hd) { const n = Math.min(4, hd[1].length + (blando ? 1 : 3)); out.push(`<h${n}>${inline(hd[2])}</h${n}>`); i++; continue; }
    if (/^\s*(-{3,}|\*{3,})\s*$/.test(l)) { out.push("<hr>"); i++; continue; }
    if (/^>\s?/.test(l)) { const q = []; while (i < L.length && /^>\s?/.test(L[i])) q.push(L[i++].replace(/^>\s?/, "")); out.push(`<blockquote>${inline(q.join(" "))}</blockquote>`); continue; }
    if (l.trim()) {
      const p = []; while (i < L.length && L[i].trim() && !/^(```|#{1,6}\s|>)/.test(L[i]) && !marca.test(L[i]) && !(L[i].includes("|") && i + 1 < L.length && esSep(L[i + 1]))) p.push(L[i++]);
      out.push(`<p>${inline(p.join(blando ? " " : "\n")).replace(/\n/g, "<br>")}</p>`); continue;
    }
    i++;
  }
  return out.join("");
}
