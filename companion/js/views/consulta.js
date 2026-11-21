// Vista "Consulta" (pensada para el banquillo): buscador instantáneo de jugadores y equipos de TODOS los datos
// importados, con fichas de lectura rápida. Funciona sin conexión; la IA es opcional.
import { h, f0, f1, fpct, fsigno, fechaCorta, vacioMsg } from "../util.js";
import { invoke } from "../api.js";
import { resumenZonas } from "../local.js";

const C = { sig: "", cargado: false, jugadores: [], equipos: [], q: "", ficha: null, favs: [] };
try { C.favs = JSON.parse(localStorage.getItem("feb-favs") || "[]"); } catch { /* sin almacenamiento */ }
const guardarFavs = () => { try { localStorage.setItem("feb-favs", JSON.stringify(C.favs)); } catch { /* ignorar */ } };
const norm = (s) => String(s || "").normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase();
const claveEq = (x) => `${x.db}\x01${x.equipo}`;

async function cargar() {
  const grupos = await invoke("listar_grupos"); C.jugadores = []; C.equipos = [];
  for (const g of grupos) {
    let P; try { P = await invoke("leer_payload", { db: g.db }); } catch { continue; }
    const etiqueta = `${g.temporada} · ${String(g.grupo).replace(/"/g, "")}`;
    for (const c of P.clasificacion || []) C.equipos.push({ tipo: "equipo", db: g.db, equipo: c.equipo, etiqueta, c, P, g });
    for (const j of P.jugadores || []) C.jugadores.push({ tipo: "jugador", db: g.db, jugador: j.jugador, equipo: j.equipo, etiqueta, j, P, g });
  }
  C.cargado = true;
}

export async function vistaConsulta(root) {
  const sig = JSON.stringify((await invoke("listar_grupos")).map((g) => g.db + (g.importado || ""))); // recarga si cambian los datos importados
  if (!C.cargado || sig !== C.sig) { root.replaceChildren(vacioMsg("Cargando datos…")); await cargar(); C.sig = sig; }
  pintar(root);
}

function puntuar(txt, q) { const t = norm(txt); const i = t.indexOf(q); return i < 0 ? -1 : (i === 0 ? 0 : t.split(" ").some((w) => w.startsWith(q)) ? 1 : 2); }

function pintar(root) {
  if (!C.equipos.length) { root.replaceChildren(vacioMsg("Aún no hay datos", "Importa tu paquete de datos en Ajustes → Datos (en el iPad) o descarga datos (en el Mac).")); return; }
  const entrada = h("input", { class: "con-q", type: "search", placeholder: "Buscar jugador o equipo…", value: C.q, autocomplete: "off", autocapitalize: "off", spellcheck: "false" });
  const res = h("div", { class: "con-res" });
  const pintarRes = () => {
    const q = norm(C.q.trim()); res.replaceChildren();
    if (!q) {
      const fv = C.favs.map((k) => C.equipos.find((e) => claveEq(e) === k)).filter(Boolean);
      res.append(h("h3", { class: "con-t", text: "Equipos favoritos" }), fv.length ? h("div", { class: "con-lista" }, fv.map(tarjeta)) : h("p", { class: "vid-ayuda", text: "Abre un equipo y pulsa ☆ para tenerlo aquí a un toque (tu equipo y el próximo rival)." }),
        h("h3", { class: "con-t", text: "Todos los equipos" }), h("div", { class: "con-lista" }, C.equipos.slice().sort((a, b) => a.equipo.localeCompare(b.equipo, "es")).map(tarjeta)));
      return;
    }
    const todos = [...C.equipos.map((e) => [puntuar(e.equipo, q), e]), ...C.jugadores.map((j) => [puntuar(j.jugador, q), j])].filter(([p]) => p >= 0)
      .sort((a, b) => a[0] - b[0] || String(b[1].g.temporada).localeCompare(String(a[1].g.temporada)) || (b[1].j?.puntos ?? 0) - (a[1].j?.puntos ?? 0)).slice(0, 40).map(([, x]) => x);
    res.append(todos.length ? h("div", { class: "con-lista" }, todos.map(tarjeta)) : h("p", { class: "vid-ayuda", text: "Sin resultados." }));
  };
  entrada.addEventListener("input", () => { C.q = entrada.value; pintarRes(); });
  const abrir = (x) => { C.ficha = x; pintar(root); window.scrollTo(0, 0); };
  function tarjeta(x) {
    return x.tipo === "equipo"
      ? h("button", { type: "button", class: "con-card", onclick: () => abrir(x) }, h("b", { text: x.equipo }), h("span", { text: `${x.etiqueta} · ${x.c.posicion}.º · ${x.c.pg}-${x.c.pp}` }))
      : h("button", { type: "button", class: "con-card", onclick: () => abrir(x) }, h("b", { text: x.jugador }), h("span", { text: `${x.equipo} · ${x.etiqueta}` }), h("span", { class: "con-mini", text: `${f1(x.j.puntos_prom)} pts · ${f1(x.j.reb_tot_prom)} reb · ${f1(x.j.asistencias_prom)} ast` }));
  }
  if (C.ficha) { root.replaceChildren(ficha(C.ficha, () => { C.ficha = null; pintar(root); }, abrir, root)); return; }
  root.replaceChildren(h("div", { class: "con-cab" }, h("h1", { text: "Consulta" }), entrada), res);
  pintarRes();
  if (!C.q) entrada.focus();
}

function kv(l, v, sub) { return h("div", { class: "con-kv" }, h("div", { class: "con-kv-l", text: l }), h("div", { class: "con-kv-v", text: v }), sub ? h("div", { class: "con-kv-s", text: sub }) : null); }
function preguntaIA(texto) { window.__iaPregunta = texto; location.hash = "#/ia"; }

function ficha(x, volver, abrir, root) {
  const barra = h("div", { class: "con-barra" }, h("button", { type: "button", class: "btn", onclick: volver }, "← Volver"));
  if (x.tipo === "equipo") {
    const { c, P } = x; const fav = C.favs.includes(claveEq(x));
    const partidos = (P.partidos || []).filter((m) => m.equipo_local === x.equipo || m.equipo_visitante === x.equipo).sort((a, b) => String(b.fecha).localeCompare(String(a.fecha))).slice(0, 6);
    const plantilla = (P.jugadores || []).filter((j) => j.equipo === x.equipo).sort((a, b) => b.puntos - a.puntos);
    barra.append(h("button", { type: "button", class: "btn", onclick: () => { C.favs = fav ? C.favs.filter((k) => k !== claveEq(x)) : [...C.favs, claveEq(x)]; guardarFavs(); abrir(x); } }, fav ? "★ Favorito" : "☆ Favorito"),
      h("button", { type: "button", class: "btn primario", onclick: () => preguntaIA(`Dame un informe breve del equipo ${x.equipo} (${x.etiqueta}): cómo juega, puntos fuertes y débiles, y a quién hay que vigilar.`) }, "Preguntar a la IA"));
    return h("div", { class: "con-ficha" }, barra, h("h1", { text: x.equipo }), h("p", { class: "vid-ayuda", text: `${x.g.competicion} · ${x.etiqueta}` }),
      h("div", { class: "con-kvs" }, kv("Puesto", `${c.posicion}.º`, `${c.pg}-${c.pp}`), kv("Puntos", f1(c.pf_prom), "a favor / partido"), kv("Encaja", f1(c.pc_prom), "en contra / partido"), kv("Ataque", f1(c.ortg), "pts / 100 pos"), kv("Defensa", f1(c.drtg), "pts / 100 pos"),
        kv("Neto", fsigno(c.neto)), kv("Ritmo", f1(c.ritmo), "posesiones"), kv("T3", fpct(c.pct_t3), "de sus tiros"), kv("TS%", fpct(c.ts_pct))),
      h("h3", { class: "con-t", text: "Últimos partidos" }), h("div", { class: "con-lista" }, partidos.map((m) => { const loc = m.equipo_local === x.equipo; const [a, b] = loc ? [m.pts_local, m.pts_visitante] : [m.pts_visitante, m.pts_local];
        return h("div", { class: "con-res-p " + (a > b ? "gana" : "pierde") }, h("b", { text: a > b ? "V" : "D" }), h("span", { text: `${loc ? "vs" : "@"} ${loc ? m.equipo_visitante : m.equipo_local}` }), h("span", { text: `${a}-${b}` }), h("span", { class: "vid-ayuda", text: fechaCorta(m.fecha) })); })),
      h("h3", { class: "con-t", text: "Plantilla (por puntos)" }), h("div", { class: "con-lista" }, plantilla.map((j) => h("button", { type: "button", class: "con-card", onclick: () => abrir({ tipo: "jugador", db: x.db, jugador: j.jugador, equipo: j.equipo, etiqueta: x.etiqueta, j, P, g: x.g }) },
        h("b", { text: `${j.dorsal ? "#" + j.dorsal + " " : ""}${j.jugador}` }), h("span", { class: "con-mini", text: `${f1(j.puntos_prom)} pts · ${f1(j.reb_tot_prom)} reb · ${f1(j.asistencias_prom)} ast · ${j.partidos} PJ` }), j.rol ? h("span", { class: "vid-chip-s", text: j.rol }) : null))));
  }
  const { j, P } = x;
  const juegos = (P.partidosJugador || []).filter((s) => s.jugador === j.jugador && s.equipo === j.equipo); const ms = new Map((P.partidos || []).map((m) => [m.partido_id, m]));
  const ult = juegos.map((s) => ({ s, m: ms.get(s.partido_id) || {} })).sort((a, b) => String(b.m.fecha).localeCompare(String(a.m.fecha))).slice(0, 5);
  const zonas = resumenZonas((P.tiros || []).filter((t) => t.jugador === j.jugador && t.equipo === j.equipo));
  barra.append(h("button", { type: "button", class: "btn", onclick: () => abrir(C.equipos.find((e) => e.db === x.db && e.equipo === x.equipo)) }, `Equipo: ${x.equipo}`),
    h("button", { type: "button", class: "btn primario", onclick: () => preguntaIA(`Dame una ficha breve de ${j.jugador} (${j.equipo}, ${x.etiqueta}): cómo juega, qué hace bien, qué hace mal y cómo defenderle.`) }, "Preguntar a la IA"));
  return h("div", { class: "con-ficha" }, barra, h("h1", { text: j.jugador }), h("p", { class: "vid-ayuda", text: `${j.equipo} · ${x.etiqueta}${j.dorsal ? " · #" + j.dorsal : ""}${j.perfil ? " · " + j.perfil : ""}` }),
    j.rol ? h("p", null, h("span", { class: "vid-chip-s", text: j.rol })) : null,
    h("div", { class: "con-kvs" }, kv("Puntos", f1(j.puntos_prom)), kv("Rebotes", f1(j.reb_tot_prom)), kv("Asist.", f1(j.asistencias_prom)), kv("Robos", f1(j.recuperaciones_prom)), kv("Pérdidas", f1(j.perdidas_prom)), kv("Valoración", f1(j.valoracion_prom)),
      kv("T2", fpct(j.t2_pct), `${j.t2_aciertos}/${j.t2_intentos}`), kv("T3", fpct(j.t3_pct), `${j.t3_aciertos}/${j.t3_intentos}`), kv("TL", fpct(j.tl_pct), `${j.tl_aciertos}/${j.tl_intentos}`),
      kv("TS%", fpct((j.ts_pct ?? NaN) * 100)), kv("Uso", fpct(j.uso_pct)), kv("Min/partido", f1(j.partidos ? j.minutos_total / j.partidos : null), `${j.partidos} partidos`)),
    zonas.length ? h("div", null, h("h3", { class: "con-t", text: "Dónde tira (aciertos / intentos)" }), h("div", { class: "con-zonas" }, zonas.map((z) => h("div", { class: "con-zona", style: `--p:${z.pct ?? 0}` }, h("b", { text: z.nombre }), h("span", { text: `${z.aciertos}/${z.intentos}` }), h("span", { text: z.pct == null ? "—" : z.pct + "%" }))))) : null,
    h("h3", { class: "con-t", text: "Últimos partidos" }), h("div", { class: "vid-tabla" }, h("table", null, h("thead", null, h("tr", null, ["Fecha", "Rival", "Min", "Pts", "TC", "T3", "Reb", "Ast", "Val"].map((t) => h("th", { text: t })))),
      h("tbody", null, ult.map(({ s, m }) => h("tr", null, h("td", { text: fechaCorta(m.fecha) }), h("td", { text: s.equipo === m.equipo_local ? m.equipo_visitante : m.equipo_local }), h("td", { text: s.minutos }), h("td", { text: s.puntos }),
        h("td", { text: `${s.tc_aciertos}/${s.tc_intentos}` }), h("td", { text: `${s.t3_aciertos}/${s.t3_intentos}` }), h("td", { text: s.reb_tot }), h("td", { text: s.asistencias }), h("td", { text: s.valoracion })))))));
}
