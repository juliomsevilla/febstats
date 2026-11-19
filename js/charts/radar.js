// Gráfico de radar SVG para comparar dos series sobre ejes normalizados (0 = peor del grupo, 1 = mejor).
import { s } from "../util.js";

/** ejes: [{label, a, b}] con a/b en 0..1; colores: [colorA, colorB]. Devuelve el <svg>. */
export function radar({ ejes, colores = ["#d9480f", "#2f6fed"], hayB = true }) {
  const W = 440, H = 400, cx = W / 2, cy = H / 2 + 4, R = 138, n = ejes.length;
  const ang = (i) => -Math.PI / 2 + (i * 2 * Math.PI) / n;
  const pt = (i, v) => [cx + Math.cos(ang(i)) * R * v, cy + Math.sin(ang(i)) * R * v];
  const poli = (vals) => vals.map((v, i) => pt(i, Math.max(0.03, v)).join(",")).join(" ");
  const svg = s("svg", { class: "radar", viewBox: `0 0 ${W} ${H}`, role: "img" });
  for (const nivel of [0.25, 0.5, 0.75, 1]) svg.append(s("polygon", { class: "eje", points: ejes.map((_, i) => pt(i, nivel).join(",")).join(" "), fill: "none", "stroke-dasharray": nivel < 1 ? "2 4" : "" }));
  ejes.forEach((e, i) => {
    const [x, y] = pt(i, 1), [lx, ly] = pt(i, 1.17), c = Math.cos(ang(i));
    svg.append(s("line", { class: "eje", x1: cx, y1: cy, x2: x, y2: y }),
      s("text", { x: lx, y: ly + 4, "text-anchor": Math.abs(c) < 0.25 ? "middle" : c > 0 ? "start" : "end", style: { fontSize: "12px", fill: "var(--texto)", fontWeight: 600 } }, e.label));
  });
  const forma = (vals, color, op) => s("polygon", { points: poli(vals), style: { fill: color, "fill-opacity": op, stroke: color, "stroke-width": 2, "stroke-linejoin": "round" } });
  if (hayB) svg.append(forma(ejes.map((e) => e.b), colores[1], 0.22));
  svg.append(forma(ejes.map((e) => e.a), colores[0], 0.3));
  return svg;
}
