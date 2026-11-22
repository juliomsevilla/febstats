// Vista "Partidos": calendario por días y boxscore de cada partido.
import { h, f0, tabla, vacioMsg, dialogo, fechaCorta, fpct } from "../util.js";
import { S, ir, equipoEnFoco } from "../state.js";
import { conVideo, invoke } from "../api.js";
import { AYUDA } from "../ayuda.js";

export function vistaPartidos(root, f) {
  const foco = equipoEnFoco(f);
  let ps = S.data.partidos.filter((p) => !foco || p.equipo_local === foco || p.equipo_visitante === foco);
  ps = ps.slice().sort((a, b) => (b.fecha || "").localeCompare(a.fecha || ""));
  root.replaceChildren(h("div", { class: "titulo" }, h("h1", { text: "Partidos" }), h("p", { text: foco || "Todos los equipos del grupo" })));
  if (!ps.length) { root.append(vacioMsg("Sin partidos")); return; }
  let dia = null, grid = null;
  for (const p of ps) {
    const d = (p.fecha || "").slice(0, 10);
    if (d !== dia) { dia = d; root.append(h("div", { class: "dia", text: fechaCorta(d) })); grid = h("div", { class: "partidos" }); root.append(grid); }
    const gl = p.pts_local > p.pts_visitante;
    grid.append(h("button", { type: "button", class: "partido", "data-pid": p.partido_id, onclick: () => boxscore(p) },
      h("div", { class: "eq " + (gl ? "gana" : "") }, h("span", { text: p.equipo_local }), h("span", { text: p.pts_local })),
      h("div", { class: "eq " + (!gl ? "gana" : "") }, h("span", { text: p.equipo_visitante }), h("span", { text: p.pts_visitante })),
      h("div", { class: "parc", text: `Parciales: ${(p.parciales_local || []).map((x, i) => `${x}-${(p.parciales_visitante || [])[i]}`).join(" · ")}` })));
  }
  marcarVideos(root).catch(() => {});
}

// Marca con 🎥 los partidos que tienen vídeo vinculado (solo escritorio).
async function marcarVideos(root) {
  if (!conVideo) return;
  const stem = (S.db || "").replace(/\.db$/, "");
  const vids = (await invoke("listar_videos")).filter((v) => v.partido_id && (v.grupo_db || "").replace(/\.db$/, "") === stem);
  for (const v of vids) {
    const card = root.querySelector(`.partido[data-pid="${v.partido_id}"]`); if (!card) continue;
    const prev = card.querySelector(".vid-ins");
    if (prev) { prev.dataset.n = Number(prev.dataset.n) + 1; prev.textContent = `🎥 ${prev.dataset.n}`; prev.title = "Varios vídeos de este partido"; continue; }
    card.append(h("span", { class: "vid-ins", "data-n": 1, role: "button", tabindex: 0, title: `Ver vídeo: ${v.titulo} (${v.n_eventos} marcas)`, text: "🎥",
      onclick: (ev) => { ev.stopPropagation(); window.__abrirVideo = v.id; location.hash = "#/video"; } }));
  }
}

const COLS = [
  { key: "dorsal", label: "#", num: true, val: (r) => parseInt(r.dorsal, 10) || 0 },
  { key: "jugador", label: "Jugador" }, { key: "minutos", label: "Min", num: true },
  { key: "puntos", label: "Pts", num: true },
  { key: "tc", label: "TC", num: true, val: (r) => r.tc_intentos, render: (r) => `${r.tc_aciertos}/${r.tc_intentos}` },
  { key: "t3", label: "T3", num: true, val: (r) => r.t3_intentos, render: (r) => `${r.t3_aciertos}/${r.t3_intentos}` },
  { key: "tl", label: "TL", num: true, val: (r) => r.tl_intentos, render: (r) => `${r.tl_aciertos}/${r.tl_intentos}` },
  { key: "reb_tot", label: "Reb", num: true }, { key: "asistencias", label: "Ast", num: true },
  { key: "recuperaciones", label: "Rob", num: true }, { key: "perdidas", label: "Per", num: true },
  { key: "faltas_cometidas", label: "Fal", num: true, title: AYUDA.fal, render: (r) => (r.faltas_cometidas >= 5 ? h("span", { class: "fal-excl", title: "5 faltas: excluido (art. 41 FIBA)" }, `${r.faltas_cometidas} · excl.`) : String(r.faltas_cometidas ?? "—")) },
  { key: "valoracion", label: "Val", num: true }, { key: "mas_menos", label: "+/-", num: true },
];

function boxscore(p) {
  const bloque = (eq, pts) => h("div", null, h("h2", { text: `${eq} · ${pts}`, style: { fontSize: "15px", marginBottom: "8px" } }),
    tabla({ cols: COLS, filas: S.data.partidosJugador.filter((r) => r.partido_id === p.partido_id && r.equipo === eq), orden: { col: "puntos", dir: -1 }, onOrden: () => {}, claseFila: (r) => (r.faltas_cometidas >= 5 ? "fila-excl" : ""), vacioTxt: "Sin boxscore" }));
  const cuerpo = h("div", { style: { display: "grid", gap: "20px" } }, bloque(p.equipo_local, p.pts_local), bloque(p.equipo_visitante, p.pts_visitante),
    h("div", null, h("button", { type: "button", class: "btn primario", onclick: () => { document.getElementById("dlg").close(); ir({ view: "tiros", f: { pa: p.partido_id } }); } }, "Ver mapa de tiros de este partido")));
  dialogo(`${p.equipo_local} – ${p.equipo_visitante}`, cuerpo, fechaCorta(p.fecha));
}
