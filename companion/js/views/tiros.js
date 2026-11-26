// Vista "Mapas": Dispersión · % de acierto por zona · Spread + Range · Puntos esperados.
import { h, s, f0, f1, f2, fpct, tip, icono, segmentado, vacioMsg, tabsBar, tabla } from "../util.js";
import { S, equipoEnFoco, nombreDeKey, equipoDeKey } from "../state.js";
import { crearCancha, crearCanchaCompleta, lineasZonas, ZONAS, ZONA_IDS, asignarZona, puntosDeTiro, posView, VB, C } from "../court.js";
import { kde, pintarDensidad, pintarEficiencia, pintarZonas, estadisticasZonas, spreadRange, celdasSR, colorPPA, colorEficiencia, rgb,
  degradadoDensidad, degradadoEficiencia, esperadoPorCelda, puntosEsperados, colorXP, degradadoXP, srPromedioEntreEquipos, srPromedioJugadores, srContraPromedio } from "../heat.js";
import { AYUDA } from "../ayuda.js";
import { canvasCancha, nombreArchivo } from "../export.js";

const T = { pista: "sencilla", bw: 1.2, cuartos: new Set(), ac: true, fa: true, tabDisp: "mapa", tabSR: "mapa" };
const CUARTOS = [[1, "1.º"], [2, "2.º"], [3, "3.º"], [4, "4.º"], [5, "Prór."]];
const pts100 = (pts, n) => (n ? f2(pts / n) : "—");
const fila = (a, b) => h("div", { class: "fila" }, h("span", { class: "m", text: a }), h("span", { text: b }));
const sub = (t, c) => h("div", { class: "subtitulo " + c, text: t });

let _liga = null, _ligaDe = null;
function ligaZonas() {
  if (_ligaDe !== S.data) { _liga = estadisticasZonas(S.data.tiros); _ligaDe = S.data; }
  return _liga;
}

/** Cancha (media pista) con una capa elegida: puntos · zonas · sr · calor · eficiencia. Reutilizada por la ficha de jugador. */
export function mapaCancha({ tiros, modo, bw = 1.2, invertido = false, grid = null, vmax = null, ac = true, fa = true, tamano = "normal", xp = null }) {
  const centro = S.idx.ppaLiga, c = crearCancha({ res: 0.1 }), ligaZ = ligaZonas();
  const stZ = estadisticasZonas(tiros);
  let puntos = [], celdas = null, indice = null;
  if (modo === "calor") pintarDensidad(c.canvas, grid || kde(tiros, { bw }), vmax, invertido);
  else if (modo === "eficiencia") pintarEficiencia(c.canvas, grid || kde(tiros, { bw }), { centro, invertido });
  else if (modo === "zonas") {
    pintarZonas(c.canvas, stZ, { centro, invertido });
    c.datos.append(lineasZonas());
    for (const id of ZONA_IDS) {
      const z = stZ[id], [py, px] = ZONAS[id].pos, [vx, vy] = posView(px, py), esq = id.startsWith("corner");
      c.datos.append(s("text", { class: "z-pct", x: vx, y: vy + (esq ? 0.15 : 0), style: esq ? { fontSize: ".42px" } : null }, z.n ? `${Math.round((z.ac / z.n) * 100)}%` : "—"));
      if (!esq && z.n) c.datos.append(s("text", { class: "z-n", x: vx, y: vy + 0.6 }, `${z.ac}/${z.n}`));
    }
  } else if (modo === "sr") {
    celdas = celdasSR(tiros);
    let max = 0; for (const k of celdas.values()) if (k.n > max) max = k.n;
    const g = s("g");
    for (const k of celdas.values()) {
      const ppa = k.pts / k.n, size = 0.28 + 0.66 * Math.sqrt(k.n / max), off = (1 - size) / 2;
      g.append(s("rect", { class: "sr-celda", x: k.cy + off + 0.9, y: k.cx + off + 0.9, width: size, height: size, rx: size * 0.28, fill: colorPPA(ppa, invertido) }));
    }
    c.datos.append(g);
  } else if (modo === "xpts") {
    celdas = xp.celdas;
    let max = 0; for (const k of celdas.values()) if (k.n > max) max = k.n;
    const g = s("g");
    for (const k of celdas.values()) {
      const size = 0.28 + 0.66 * Math.sqrt(k.n / max), off = (1 - size) / 2;
      g.append(s("rect", { class: "sr-celda", x: k.cy + off + 0.9, y: k.cx + off + 0.9, width: size, height: size, rx: size * 0.28, fill: colorXP(k.pts / k.n - k.espPpa, invertido) }));
    }
    c.datos.append(g);
  } else if (modo === "puntos") {
    puntos = tiros.filter((t) => (t.resultado === "acierto" ? ac : fa));
    c.datos.append(capaTiros(puntos, (t) => posView(t.Xinv, t.Yinv)));
    indice = indiceEspacial(puntos);
  }
  const marca = s("circle", { class: "t-hover", r: 0.3, visibility: "hidden" });
  c.datos.append(marca);
  const ver = (ev) => {
    const { x, y } = c.aCancha(ev);
    marca.setAttribute("visibility", "hidden");
    if (x < 0 || x > 14 || y < 0 || y > 15) return tip.hide();
    if (modo === "puntos") {
      let best = null, bd = 0.5;
      for (const t of indice(x, y)) { const d = Math.hypot(t.Xinv - x, t.Yinv - y); if (d < bd) { bd = d; best = t; } }
      if (best) {
        const [vx, vy] = posView(best.Xinv, best.Yinv);
        marca.setAttribute("cx", vx); marca.setAttribute("cy", vy); marca.setAttribute("visibility", "visible");
        return tip.show(h("div", null, h("b", { text: best.jugador }), h("div", { class: "m", text: `${best.resultado === "acierto" ? "Acierto" : "Fallo"} · ${puntosDeTiro(best) === 3 ? "triple" : "doble"} · ${best.cuarto > 4 ? "prórroga" : best.cuarto + ".º cuarto"}` })), ev);
      }
    }
    if (modo === "xpts") {
      const k = celdas.get(Math.floor(x) * 15 + Math.floor(y));
      return tip.show(h("div", null, h("b", { text: "Casilla de 1 m²" }), fila("Tiros", k ? f0(k.n) : "0"),
        k ? fila("Pts/tiro real", pts100(k.pts, k.n)) : null, k ? fila("Pts/tiro esperado", f2(k.espPpa)) : null,
        k ? fila("Acierto", `${f0((k.ac / k.n) * 100)}% (esperado ${f0(k.espFg * 100)}%)`) : null,
        k ? fila("Diferencia", `${k.pts - k.esp >= 0 ? "+" : ""}${f2(k.pts - k.esp)} pts`) : null), ev);
    }
    if (modo === "sr") {
      const k = celdas.get(Math.floor(x) * 15 + Math.floor(y));
      return tip.show(h("div", null, h("b", { text: `Casilla de 1 m²` }), k ? fila("Tiros", f0(k.n)) : fila("Tiros", "0"), k ? fila("Pts/tiro", pts100(k.pts, k.n)) : null), ev);
    }
    const id = asignarZona(x, y), z = stZ[id], l = ligaZ[id];
    tip.show(h("div", null, h("b", { text: ZONAS[id].nombre }), fila("Tiros", z.n ? `${z.ac}/${z.n} (${f0((z.ac / z.n) * 100)}%)` : "0"), fila("Pts/tiro", pts100(z.pts, z.n)),
      fila("Media liga", l.n ? `${f0((l.ac / l.n) * 100)}% · ${f2(l.pts / l.n)} pts/tiro` : "—")), ev);
  };
  c.el.addEventListener("pointermove", (ev) => { if (ev.pointerType === "mouse") ver(ev); });
  c.el.addEventListener("click", ver); // táctil: un toque muestra el detalle
  c.el.addEventListener("pointerleave", (ev) => { if (ev.pointerType === "mouse") { tip.hide(); marca.setAttribute("visibility", "hidden"); } });
  if (tamano === "mini") c.el.style.maxWidth = "380px";
  botonPNG(c.el, nombreArchivo("mapa", ctxArchivo, modo, invertido ? "en_contra" : "a_favor"), tiros);
  return c;
}

/** Todos los tiros en solo dos elementos SVG (aciertos como círculos, fallos como aspas): con decenas de miles de tiros (una categoría entera)
 *  un elemento por tiro bloquea la pantalla. Cada tiro se coloca con `pos(t)` → [x, y] en la vista. */
function capaTiros(lista, pos) {
  // Con muchos tiros (una categoría entera) los marcadores grandes y con borde blanco tapan todo: se usan marcadores pequeños, sin borde y
  // semitransparentes, repartidos en varias capas para que se acumulen y se vea dónde se concentran (la densidad se lee por el color).
  const denso = lista.length > 1500, K = denso ? 12 : 6; // varias capas: donde se solapan tiros el color se intensifica
  const r = denso ? (lista.length > 20000 ? 0.075 : 0.1) : 0.2, a = denso ? 0.07 : 0.15;
  const ac = Array.from({ length: K }, () => []), fa = Array.from({ length: K }, () => []);
  let i = 0;
  for (const t of lista) {
    const [vx, vy] = pos(t), x = +vx.toFixed(3), y = +vy.toFixed(3), k = i++ % K;
    if (t.resultado === "acierto") ac[k].push(`M${(x - r).toFixed(3)},${y}a${r},${r} 0 1 0 ${2 * r},0a${r},${r} 0 1 0 ${-2 * r},0`);
    else fa[k].push(`M${(x - a).toFixed(3)},${(y - a).toFixed(3)}l${2 * a},${2 * a}m0,${-2 * a}l${-2 * a},${2 * a}`);
  }
  const g = s("g");
  for (const l of fa) if (l.length) g.append(s("path", { class: "t-fa" + (denso ? " denso" : ""), d: l.join("") }));
  for (const l of ac) if (l.length) g.append(s("path", { class: "t-ac" + (denso ? " denso" : ""), d: l.join("") }));
  return g;
}
/** Búsqueda del tiro más cercano al puntero sin recorrerlos todos: rejilla de 0,5 m; devuelve los tiros de la celda y sus vecinas. */
function indiceEspacial(lista) {
  const celda = 0.5, m = new Map(), k = (i, j) => i * 100 + j;
  for (const t of lista) { const kk = k(Math.floor(t.Xinv / celda), Math.floor(t.Yinv / celda)); (m.get(kk) || m.set(kk, []).get(kk)).push(t); }
  return (x, y) => {
    const i = Math.floor(x / celda), j = Math.floor(y / celda), out = [];
    for (let di = -1; di <= 1; di++) for (let dj = -1; dj <= 1; dj++) { const l = m.get(k(i + di, j + dj)); if (l) for (const t of l) out.push(t); }
    return out;
  };
}

function canchaCompleta(tiros, ac, fa, invertido = false) {
  const c = crearCanchaCompleta();
  c.datos.append(capaTiros(tiros.filter((x) => (x.resultado === "acierto" ? ac : fa)), (t) => posView(t.X, t.Y)));
  c.el.style.maxWidth = "420px";
  botonPNG(c.el, nombreArchivo("mapa", ctxArchivo, "pista_completa", invertido ? "en_contra" : "a_favor"), tiros);
  return c.el;
}

const leyAciertoFallo = (lista) => {
  const ac = lista.filter((t) => t.resultado === "acierto").length, pct = lista.length ? f1((ac / lista.length) * 100) : "—";
  return h("div", { class: "leyenda-tiros" },
    T.ac ? h("span", { class: "lg" }, h("i", { class: "pt ok" }), "Acierto") : null, T.fa ? h("span", { class: "lg" }, h("i", { class: "pt mal" }), "Fallo") : null,
    h("span", { text: `${lista.length} tiro(s)` + (T.ac && T.fa ? ` · ${ac} aciertos / ${lista.length - ac} fallos · ${pct}% de acierto` : "") }));
};
const franja = (fondo, a, b, medio) => h("div", { class: "leyenda" }, h("div", { class: "grad", style: { background: fondo } }), h("div", { class: "ext" }, h("span", { text: a }), medio ? h("span", { text: medio }) : null, h("span", { text: b })));
const nota = (t) => h("div", { class: "vacio", style: { padding: "10px" }, text: t });

function seleccion(f) {
  const foco = equipoEnFoco(f);
  const q = (l) => (T.cuartos.size ? l.filter((x) => T.cuartos.has(Math.min(x.cuarto, 5))) : l);
  let base = S.data.tiros;
  if (f.ju) base = base.filter((t) => t.jugador === nombreDeKey(f.ju) && t.equipo === equipoDeKey(f.ju));
  else if (foco) base = base.filter((t) => t.equipo === foco);
  if (f.pa) base = base.filter((t) => t.partido_id === f.pa);
  let contra = [];
  if (foco) {
    const ids = new Set(S.data.partidos.filter((p) => p.equipo_local === foco || p.equipo_visitante === foco).map((p) => p.partido_id));
    contra = S.data.tiros.filter((t) => t.equipo !== foco && ids.has(t.partido_id) && (!f.pa || t.partido_id === f.pa));
  }
  return { foco, base: q(base), contra: q(contra), dos: !!foco && !f.ju };
}

// Exportación de los mapas (PNG y CSV de los tiros): la toolbar la añade exportar-auto.js (solo en la app del Mac).
let ctxArchivo = "";
const csvTiros = (tiros) => ({ cab: ["Jugador", "Equipo", "Cuarto", "Resultado", "X (m)", "Y (m)", "X plegada (m)", "Y plegada (m)"], filas: (tiros || []).map((t) => [t.jugador, t.equipo, t.cuarto, t.resultado, t.X, t.Y, t.Xinv, t.Yinv]) });
function botonPNG(el, archivo, tiros) { el.__exp = { nombre: archivo, png: () => canvasCancha(el), get csv() { return csvTiros(tiros); } }; } // el CSV se arma solo al exportar (no por cada mapa pintado)

export function vistaTiros(root, f) {
  const { foco, base, contra, dos } = seleccion(f), rerender = () => vistaTiros(root, f);
  const nombre = f.ju ? nombreDeKey(f.ju) : foco || "Grupo";
  ctxArchivo = nombreArchivo(nombre, f.pa && S.idx.partidos.get(f.pa)?.fecha?.slice(0, 10), S.data.temporada);
  const et = [f.ju ? `${nombreDeKey(f.ju)} (${equipoDeKey(f.ju)})` : foco, f.pa ? (S.idx.partidos.get(f.pa) ? `${S.idx.partidos.get(f.pa).equipo_local} vs ${S.idx.partidos.get(f.pa).equipo_visitante}` : "") : ""].filter(Boolean);
  root.replaceChildren(h("div", { class: "titulo" }, h("h1", { text: "Mapas" }), h("p", { text: et.length ? et.join(" · ") : "Todo el grupo (elige un equipo para comparar a favor / en contra)" })));
  if (!S.data.tiros.length) { root.append(vacioMsg("Aún no hay tiros", "Extrae partidos para ver los mapas.")); return; }

  root.append(h("div", { class: "card controles" },
    h("div", { class: "campo" }, h("label", { text: "Pista" }), segmentado([["sencilla", "Sencilla"], ["completa", "Completa"]], T.pista, (v) => { T.pista = v; rerender(); }, "Tipo de pista")),
    h("div", { class: "campo" }, h("label", { text: "Cuarto" }), h("div", { class: "chips" }, CUARTOS.map(([q, l]) =>
      h("button", { type: "button", class: "chip", "aria-pressed": String(T.cuartos.has(q)), onclick: () => { T.cuartos.has(q) ? T.cuartos.delete(q) : T.cuartos.add(q); rerender(); } }, l)))),
    h("div", { class: "campo" }, h("label", { text: "Tiros" }), h("div", { class: "chips" },
      h("button", { type: "button", class: "chip", "aria-pressed": String(T.ac), onclick: () => { T.ac = !T.ac; rerender(); } }, "Aciertos"),
      h("button", { type: "button", class: "chip", "aria-pressed": String(T.fa), onclick: () => { T.fa = !T.fa; rerender(); } }, "Fallos")))));

  if (!T.ac && !T.fa) { root.append(vacioMsg('Marca al menos "Aciertos" o "Fallos" para ver el mapa.')); return; }
  const columnas = (favor, enContra) => h("div", { class: "grid " + (dos ? "dos" : "") }, h("div", { "data-mapa": "" }, favor()), dos ? h("div", null, enContra()) : null);
  const seccion = (titulo, ...c) => h("section", { class: "card" }, h("h2", { text: titulo }), ...c);
  const tFiltrados = (l) => l.filter((t) => (t.resultado === "acierto" ? T.ac : T.fa));

  // ---------- pista completa: solo dispersión (los datos sin plegar) ----------
  if (T.pista === "completa") {
    const bloque = (tit, cls, l) => h("div", { class: "bloque-completa" }, foco ? sub(tit, cls) : null, canchaCompleta(l, T.ac, T.fa, tit === "En contra"), leyAciertoFallo(tFiltrados(l)));
    root.append(seccion("Dispersión", columnas(() => bloque("A favor", "favor", base), () => bloque("En contra", "contra", contra))));
    return;
  }

  // ---------- fila 1: dispersión (puntos, densidad y eficiencia suavizadas) ----------
  const tabsD = [["mapa", "Mapa"], ["densidad", "Densidad"], ["eficiencia", "Eficiencia"], ["info", "Qué significa"]].filter(([v]) => !(f.ju && v === "densidad"));
  if (!tabsD.some(([v]) => v === T.tabDisp)) T.tabDisp = "mapa";
  const tabsDisp = tabsBar(tabsD, T.tabDisp, (v) => { T.tabDisp = v; rerender(); });
  const colPuntos = (tit, cls, l) => [foco ? sub(tit, cls) : null, mapaCancha({ tiros: l, modo: "puntos", ac: T.ac, fa: T.fa }).el, leyAciertoFallo(tFiltrados(l))];
  const smooth = T.tabDisp === "densidad" || T.tabDisp === "eficiencia";
  // Densidad respeta Aciertos/Fallos; Eficiencia (pts/tiro) necesita ambos, así que con uno solo apagado no se calcula.
  const dens = T.tabDisp === "densidad", sinEficiencia = T.tabDisp === "eficiencia" && !(T.ac && T.fa);
  const bC = dens ? tFiltrados(base) : base, cC = dens ? tFiltrados(contra) : contra;
  const g1 = smooth && !sinEficiencia ? kde(bC, { bw: T.bw }) : null, g2 = g1 && dos ? kde(cC, { bw: T.bw }) : null, vmax = g1 ? Math.max(g1.max, g2?.max || 0) : null;
  const colCalor = (tit, cls, l, g) => {
    const inv = cls === "contra";
    const mapa = mapaCancha({ tiros: l, modo: dens ? "calor" : "eficiencia", bw: T.bw, invertido: inv, grid: g, vmax });
    const ley = dens ? [franja(degradadoDensidad(inv), inv ? "Pocos tiros concedidos" : "Pocos tiros", inv ? "Muchos tiros concedidos" : "Muchos tiros"), leyAciertoFallo(l)]
      : [franja(degradadoEficiencia(inv), inv ? "Pocos pts/tiro concedidos" : "Pocos pts/tiro", inv ? "Muchos pts/tiro concedidos" : "Muchos pts/tiro", `Media liga ${f2(S.idx.ppaLiga)}`),
        nota("Puntos por tiro suavizados frente a la media de la liga; las zonas con pocos tiros se atenúan.")];
    return [foco ? sub(tit, cls) : null, mapa.el, ...ley];
  };
  const suav = smooth ? h("div", { class: "campo rng", style: { margin: "0 0 12px" } }, h("label", { text: `Suavizado · ${f1(T.bw)} m` }),
    h("input", { type: "range", min: 0.5, max: 2.2, step: 0.1, value: T.bw, "aria-label": "Suavizado", oninput: (e) => { T.bw = +e.target.value; clearTimeout(T._t); T._t = setTimeout(rerender, 60); } })) : null;
  root.append(seccion("Dispersión", tabsDisp, T.tabDisp === "mapa"
    ? columnas(() => colPuntos("A favor", "favor", base), () => colPuntos("En contra", "contra", contra))
    : sinEficiencia ? nota("La Eficiencia (puntos por tiro) necesita aciertos y fallos a la vez: activa los dos en \"Tiros\" para verla.")
    : smooth ? h("div", null, suav, columnas(() => colCalor("A favor", "favor", bC, g1), () => colCalor("En contra", "contra", cC, g2)))
    : h("div", { class: "explica" },
      h("p", { text: "Verde = acierto, rojo = fallo — siempre en ese sentido en todo el dashboard (también en las fichas de racha, verde = victoria y rojo = derrota)." }),
      h("p", null, h("strong", { text: "Densidad y Eficiencia: " }), "las mismas posiciones de tiro, suavizadas en un mapa de calor. Densidad muestra dónde se concentran los tiros; Eficiencia, cuántos puntos por tiro se consiguen en cada zona frente a la media de la liga (las zonas con pocos tiros se atenúan). El deslizador de suavizado controla cuánto se difuminan. Densidad respeta los botones Aciertos/Fallos (dónde se anota o dónde se falla); Eficiencia necesita ambos activos. Con un jugador concreto no hay Densidad, porque su volumen de tiros no es comparable con el de un equipo."),
      h("p", null, h("strong", { text: '"A favor" y "En contra": ' }), "con un equipo en foco, cada fila del mapa de tiros muestra dos gráficos: \"A favor\" son los intentos del equipo (o jugador) en foco, y \"En contra\" los que ha recibido, es decir, los de sus rivales en esos mismos partidos. El filtro de Partido afecta a los dos igual. Al elegir un jugador concreto, \"En contra\" desaparece: no hay forma de saber qué jugador propio defendía cada tiro rival, así que solo tendría sentido a nivel de equipo completo, y mostrarlo junto al de un jugador individual induciría a comparar cosas distintas."),
      h("p", { text: 'Sin ningún equipo en foco (vista de todo el grupo) no hay un "nosotros" de referencia, así que se muestra un único gráfico con los tiros de todos los equipos mezclados.' }))));

  // ---------- fila 2: % de acierto por zona ----------
  const colZonas = (tit, cls, l, txt) => [foco ? sub(tit, cls) : null, mapaCancha({ tiros: l, modo: "zonas", invertido: cls === "contra" }).el, nota(txt)];
  root.append(seccion("% de acierto por zona", columnas(
    () => colZonas("A favor", "favor", base, "Usa todos los tiros del filtro actual (jugador/equipo/partido), sin aplicar Aciertos/Fallos."),
    () => colZonas("En contra", "contra", contra, "% de acierto de los rivales por zona. Usa todos los tiros del filtro actual (partido), sin aplicar Aciertos/Fallos."))));

  // ---------- fila 3: Spread + Range · Puntos esperados ----------
  const tabsSR = [["mapa", "Spread + Range"], ["esperados", "Puntos esperados"], ["info", "Qué significa"]];
  if (!tabsSR.some(([v]) => v === T.tabSR)) T.tabSR = "mapa";
  const tabSRel = tabsBar(tabsSR, T.tabSR, (v) => { T.tabSR = v; rerender(); });
  const TITULO_SR = "Spread + Range y Puntos esperados";
  if (T.tabSR === "esperados") root.append(seccion(TITULO_SR, tabSRel, contenidoXP({ f, foco, base, contra })));
  else if (T.tabSR === "info") {
    const q = (fuerte, resto) => h("p", null, h("strong", { text: fuerte }), " " + resto);
    root.append(seccion(TITULO_SR, tabSRel, h("div", { class: "explica ancha" },
      h("h3", { text: "Spread + Range: ¿desde cuántos sitios y con qué eficacia?" }),
      q("Para qué sirve:", "describe el estilo de ataque (o de defensa) de un equipo o jugador sobre la pista, sin compararlo con la liga casilla a casilla. Responde a dos preguntas: ¿desde cuántos sitios distintos tira? y ¿desde cuántos de ellos es realmente eficaz?"),
      q("Spread:", "% de la pista (casillas de 1 m²) desde la que se ha tirado al menos una vez. Cuanto más alto, desde más sitios distintos ataca. En \"En contra\", desde cuántos sitios le han tirado sus rivales."),
      q("Range:", "% de la pista desde la que, de media, se anota más de 1 punto por tiro. Mide eficacia real, no solo variedad: se puede tirar desde muchos sitios (Spread alto) sin ser certero en ellos (Range bajo). En \"En contra\", desde cuántos sitios han sido eficaces los rivales: cuanto más bajo, mejor defiende."),
      q("Colores del mapa:", "cada casilla se colorea por los puntos por tiro conseguidos desde ahí, con el umbral fijo de 1 punto por tiro (rojo = menos, verde = más). El tamaño indica cuántos tiros se han intentado. En \"En contra\" la escala se invierte: azul = pocos puntos concedidos (bien), naranja = muchos (mal)."),
      q("Tablas:", "comparan Spread y Range con la media del resto de equipos (y, con un jugador, con el resto de su equipo). En \"En contra\", con los rivales del resto de equipos."),
      q("Referencia:", "Goldsberry, K. (2012). CourtVision: New Visual and Spatial Analytics for the NBA. MIT Sloan Sports Analytics Conference."),
      h("h3", { text: "Puntos esperados: ¿rinde más o menos de lo que cabría esperar por dónde tira?" }),
      q("Para qué sirve:", "separa la calidad del tiro (dónde se tira) de su acierto (si entra). Un jugador que tira mucho bajo el aro anota muchos puntos sin ser especialmente bueno, y uno que tira de media distancia puede ser excelente aunque promedie menos. Este mapa descuenta ese efecto."),
      q("Cómo se calcula:", "a cada casilla de 1 m² se le asigna el acierto y los puntos por tiro medios de la referencia desde esa misma casilla (las casillas con pocos tiros se acercan a la media de su zona para no depender del azar). Los puntos esperados son lo que habría anotado un tirador medio con esos mismos tiros."),
      q("Cómo leerlo:", "diferencia positiva = rinde por encima de lo esperado según dónde tira; negativa = por debajo. Las casillas se colorean por esa diferencia: turquesa = por encima, magenta = por debajo (en \"En contra\": lila = concede menos de lo esperado, marrón = más). El tamaño indica cuántos tiros hay en la casilla."),
      q("Referencia de comparación:", "con un jugador elegido se compara dos veces, frente a todos los tiros de la liga y frente al resto de su equipo (siempre sin contar al propio jugador). Con solo un equipo, \"A favor\" se compara con el resto de equipos y \"En contra\" con los tiros de partidos en los que no ha jugado. Ignora los filtros de Cuarto y Partido: la referencia es la temporada entera."),
      h("h3", { text: "En qué se diferencian" }),
      h("p", { text: "Los dos usan la misma rejilla, pero Spread + Range pinta el resultado absoluto (¿más de 1 punto por tiro?) y Puntos esperados pinta el resultado relativo (¿más de lo que consigue la liga desde ahí?). Por eso una casilla bajo el aro puede ser verde en Spread + Range y roja o neutra en Puntos esperados." }))));
  } else {
    const D = S.data, tablaSR = (filas) => tabla({ cols: [{ key: "e", label: "Comparación" }, { key: "spread", label: "Spread", num: true, fmt: fpct, title: AYUDA.spread }, { key: "range", label: "Range", num: true, fmt: fpct, title: AYUDA.range }],
      filas, orden: { col: "e", dir: 1 }, onOrden: () => {} });
    const srCol = (tit, cls, l) => {
      const inv = cls === "contra", filas = [{ e: f.ju ? nombreDeKey(f.ju) : foco || "Todo el grupo", ...spreadRange(l) }];
      if (inv) filas.push({ e: "Resto de equipos", ...srContraPromedio(D.equipos.filter((e) => e !== foco), D.partidos, D.tiros) });
      else {
        if (foco) filas.push({ e: "Resto de equipos", ...srPromedioEntreEquipos(D.tiros, D.equipos.filter((e) => e !== foco)) });
        if (f.ju) filas.push({ e: `Resto de jugadores de ${foco}`, ...srPromedioJugadores(D.tiros.filter((t) => t.equipo === foco && t.jugador !== nombreDeKey(f.ju))) });
      }
      return [foco ? sub(tit, cls) : null, mapaCancha({ tiros: l, modo: "sr", invertido: inv }).el,
        h("div", { class: "leyenda-tiros" }, h("span", { text: "Tamaño = nº de tiros desde esa celda (1m²)" })),
        franja(degradadoEficiencia(inv), inv ? "Pocos pts/tiro concedidos" : "Pocos pts/tiro", inv ? "Muchos pts/tiro concedidos" : "Muchos pts/tiro"),
        tablaSR(filas), !foco ? nota("Elige un equipo o un jugador arriba para comparar con algo.") : null];
    };
    root.append(seccion(TITULO_SR, tabSRel, columnas(() => srCol("A favor", "favor", base), () => srCol("En contra", "contra", contra))));
  }

}

// ---------- Puntos esperados (pestaña de Spread + Range) ----------
function contenidoXP({ f, foco, base, contra }) {
  const D = S.data;
  const col = (tit, cls, tiros, ref, subtit) => {
    const inv = cls === "contra";
    const cab = tit ? sub(tit, cls) : null;
    if (ref.length < 30) return [cab, nota("No hay tiros suficientes de referencia para calcular lo esperado.")];
    const xp = puntosEsperados(tiros, esperadoPorCelda(ref)), dif = xp.pts - xp.esp, sg = (v, d = 1) => (v >= 0 ? "+" : "") + v.toFixed(d);
    const mapa = mapaCancha({ tiros, modo: "xpts", xp, invertido: inv });
    return [cab, subtit ? nota(subtit) : null, mapa.el,
      h("div", { class: "leyenda-tiros" }, h("span", { text: "Tamaño = nº de tiros desde esa casilla (1 m²)" })),
      franja(degradadoXP(inv), inv ? "Concede más de lo esperado" : "Por debajo de lo esperado", inv ? "Concede menos de lo esperado" : "Por encima de lo esperado", "Esperado"),
      xp.n ? h("div", { class: "kpis-xp" }, fila("Tiros", f0(xp.n)), fila("Puntos reales", f1(xp.pts)), fila("Puntos esperados", f1(xp.esp)),
        fila(inv ? "Diferencia (+ = concede más)" : "Diferencia", `${sg(dif)} pts (${sg(dif / xp.n, 2)} por tiro)`),
        fila("Acierto real / esperado", `${f1((xp.ac / xp.n) * 100)}% / ${f1((xp.espAc / xp.n) * 100)}%`)) : nota("Sin tiros con el filtro actual.")];
  };
  let cols;
  if (f.ju) {
    const nom = nombreDeKey(f.ju), propio = (t) => t.jugador === nom && t.equipo === foco;
    cols = [col("Frente a toda la liga", "favor", base, D.tiros.filter((t) => !propio(t))),
      col(`Frente a ${foco}`, "favor", base, D.tiros.filter((t) => t.equipo === foco && !propio(t)))];
  } else if (foco) {
    const ids = new Set(D.partidos.filter((p) => p.equipo_local === foco || p.equipo_visitante === foco).map((p) => p.partido_id));
    cols = [col("A favor", "favor", base, D.tiros.filter((t) => t.equipo !== foco), "Frente a la media del resto de equipos."),
      col("En contra", "contra", contra, D.tiros.filter((t) => !ids.has(t.partido_id)), "Frente a los tiros de partidos en los que no ha jugado.")];
  } else return nota("Elige un equipo o un jugador arriba para comparar su rendimiento con lo esperado.");
  return h("div", { class: "grid dos" }, h("div", { "data-mapa": "" }, cols[0]), h("div", null, cols[1]));
}
