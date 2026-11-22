// Modo LOCAL (iPad y cualquier navegador sin la app del Mac): todo se guarda en el propio dispositivo (IndexedDB)
// y la IA se llama directamente desde aquí. No hace falta Mac, servidor ni conexión, salvo para preguntar a la IA.
// Los datos de la FEB se importan desde un paquete (.json) que se exporta en la app del Mac (Ajustes → Descarga de datos).
// Implementa los mismos comandos que la app de escritorio, así las vistas no distinguen el modo.

import { describir, normalizar } from "./jugada-modelo.js";

// ---------- utilidades ----------
const slug = (t) => String(t || "").normalize("NFKD").replace(/[^\x00-\x7f]/g, "").toLowerCase().replace(/[^a-z0-9]+/g, "_").replace(/^_+|_+$/g, "");
const stem = (db) => String(db || "").replace(/\.db$/, "");
const nombreDb = (p) => `grupo_${slug(p.competicion)}_${slug(p.grupo)}_${slug(p.temporada)}.db`;

// ---------- almacén: IndexedDB; si no está disponible (p. ej. al abrir el archivo suelto desde Archivos), localStorage ----------
let _db, _motor;
function abrir() {
  return (_db ||= new Promise((res, rej) => {
    if (!window.indexedDB) return rej(new Error("sin IndexedDB"));
    const r = indexedDB.open("febstats", 3);
    r.onupgradeneeded = () => {
      const d = r.result;
      if (!d.objectStoreNames.contains("grupos")) d.createObjectStore("grupos", { keyPath: "db" });
      if (!d.objectStoreNames.contains("chats")) d.createObjectStore("chats", { keyPath: "id", autoIncrement: true });
      if (!d.objectStoreNames.contains("mensajes")) d.createObjectStore("mensajes", { keyPath: "id", autoIncrement: true }).createIndex("chat", "chat_id");
      if (!d.objectStoreNames.contains("jugadas")) d.createObjectStore("jugadas", { keyPath: "id" }); // jugadas del Playbook (solo lectura en el iPad)
      if (!d.objectStoreNames.contains("notas")) d.createObjectStore("notas", { keyPath: "id" });        // notas (solo lectura)
      if (!d.objectStoreNames.contains("imagenes")) d.createObjectStore("imagenes", { keyPath: "nombre" }); // imágenes de las notas, si el paquete las incluye
    };
    r.onsuccess = () => res(r.result); r.onerror = () => rej(r.error); r.onblocked = () => rej(new Error("bloqueado"));
  }));
}
const usaIDB = () => (_motor ||= Promise.race([abrir().then(() => true, () => false), new Promise((r) => setTimeout(() => r(false), 1500))])); // si no responde (Safari con archivos locales) → localStorage
async function tx(store, modo, f) {
  const d = await abrir();
  return new Promise((res, rej) => {
    const t = d.transaction(store, modo); const s = t.objectStore(store);
    let out; const r = f(s); if (r) r.onsuccess = () => { out = r.result; };
    t.oncomplete = () => res(out); t.onerror = () => rej(t.error); t.onabort = () => rej(t.error);
  });
}
const CLAVE = { grupos: "db", chats: "id", mensajes: "id", jugadas: "id", notas: "id", imagenes: "nombre" };
const memoria = {}; // último recurso si ni localStorage está disponible: se pierde al cerrar
const lsLeer = (s) => { try { return JSON.parse(localStorage.getItem(`feb-${s}`) || "null") || memoria[s] || { next: 1, filas: {} }; } catch { return memoria[s] || { next: 1, filas: {} }; } };
const lsGuardar = (s, o) => { memoria[s] = o; try { localStorage.setItem(`feb-${s}`, JSON.stringify(o)); } catch { /* solo en memoria */ } };
async function get(s, k) { return (await usaIDB()) ? tx(s, "readonly", (o) => o.get(k)) : lsLeer(s).filas[k]; }
async function put(s, v) {
  if (await usaIDB()) return tx(s, "readwrite", (o) => o.put(v));
  const o = lsLeer(s); const kp = CLAVE[s]; if (v[kp] == null) v = { ...v, [kp]: o.next++ };
  o.filas[v[kp]] = v; lsGuardar(s, o); return v[kp];
}
async function del(s, k) { if (await usaIDB()) return tx(s, "readwrite", (o) => o.delete(k)); const o = lsLeer(s); delete o.filas[k]; lsGuardar(s, o); }
async function todos(s) { return (await usaIDB()) ? tx(s, "readonly", (o) => o.getAll()) : Object.values(lsLeer(s).filas); }
async function porChat(id) { return (await usaIDB()) ? tx("mensajes", "readonly", (o) => o.index("chat").getAll(id)) : Object.values(lsLeer("mensajes").filas).filter((m) => m.chat_id === id); }

// ---------- datos incluidos en el propio archivo (versión de un solo archivo .html generada por la app del Mac) ----------
let embebidos = [], jugadasEmbebidas = [], notasEmbebidas = [], imagenesEmbebidas = [];
try { const t = document.getElementById("feb-paquete")?.textContent?.trim(); if (t && !t.startsWith("__")) { const j = JSON.parse(t); embebidos = (j.grupos || []).map((g) => ({ ...g, payload: g.payload })); jugadasEmbebidas = j.jugadas || []; notasEmbebidas = j.notas || []; imagenesEmbebidas = j.imagenes || []; } } catch { /* sin datos incluidos */ }

// ---------- eventos (equivale a los eventos de Tauri) ----------
const oyentes = {};
export function escucharLocal(nombre, cb) { (oyentes[nombre] ||= []).push(cb); }
const emitir = (nombre, payload) => (oyentes[nombre] || []).forEach((cb) => cb({ payload }));

// ---------- datos FEB importados ----------
const cache = new Map();
export async function importarPaquetes(archivos) {
  const nombres = [];
  for (const f of archivos) {
    let j; try { j = JSON.parse(await f.text()); } catch { throw new Error(`«${f.name}» no es un archivo de datos válido.`); }
    const lista = j.formato === "feb-stats-paquete" ? j.grupos : (j.clasificacion && j.competicion ? [{ db: j.db, payload: j }] : null);
    if (!lista) throw new Error(`«${f.name}» no parece un paquete de FEBstats (expórtalo desde la app del Mac).`);
    for (const g of lista) {
      const p = g.payload; const db = g.db || nombreDb(p);
      await put("grupos", { db, competicion: p.competicion, grupo: p.grupo, temporada: p.temporada, partidos: (p.partidos || []).length, importado: new Date().toISOString(), payload: p });
      cache.delete(stem(db)); nombres.push(`${p.competicion} ${String(p.grupo).replace(/"/g, "")} ${p.temporada}`);
    }
  }
  // jugadas del Playbook incluidas en el paquete: sustituyen a las que hubiera (el iPad solo las consulta)
  for (const f of archivos) { let j; try { j = JSON.parse(await f.text()); } catch { continue; } if (Array.isArray(j.jugadas)) { for (const x of await todos("jugadas")) await del("jugadas", x.id); for (const x of j.jugadas) await put("jugadas", x); nombres.push(`${j.jugadas.length} jugada(s) del Playbook`); } }
  // notas (y sus imágenes, si se incluyeron) del paquete: sustituyen a las que hubiera; en el iPad solo se leen
  for (const f of archivos) { let j; try { j = JSON.parse(await f.text()); } catch { continue; } if (Array.isArray(j.notas)) {
    for (const x of await todos("notas")) await del("notas", x.id); for (const x of j.notas) await put("notas", x);
    for (const x of await todos("imagenes")) await del("imagenes", x.nombre); for (const x of j.imagenes || []) await put("imagenes", x);
    nombres.push(`${j.notas.length} nota(s)${(j.imagenes || []).length ? ` y ${j.imagenes.length} imagen(es)` : " (sin imágenes)"}`); } }
  try { await navigator.storage?.persist?.(); } catch { /* ignorar */ }
  return nombres;
}

async function listarJugadas() { // las incluidas en el archivo y las importadas (estas tienen prioridad)
  const m = new Map(jugadasEmbebidas.map((j) => [j.id, j])); for (const j of await todos("jugadas")) m.set(j.id, j);
  return [...m.values()].sort((a, b) => String(a.coleccion || "").localeCompare(String(b.coleccion || ""), "es") || (a.orden || 0) - (b.orden || 0) || a.id - b.id);
}

// ---------- notas (solo lectura) ----------
const plegar = (t) => String(t || "").normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLowerCase();
async function notasTodas() { const m = new Map(notasEmbebidas.map((n) => [n.id, n])); for (const n of await todos("notas")) m.set(n.id, n); return [...m.values()]; }
const metaNota = (n) => ({ titulo: n.titulo || "", temporada: n.temporada || "", grupo: n.grupo || "", equipo: n.equipo || "", equipo_txt: n.equipo_txt || "", jugador: n.jugador || "", jugador_txt: n.jugador_txt || "", partido: n.partido || "", partido_txt: n.partido_txt || "", creada: n.creada || "" });
function tituloNota(n) { if (n.titulo && n.titulo.trim()) return n.titulo.trim(); let c = false; for (const l of String(n.cuerpo || "").split("\n")) { if (/^\s*```/.test(l)) { c = !c; continue; } if (!c && /^# \S/.test(l)) return l.slice(2).trim(); } return `Nota ${n.creada || n.id}`; }
function enlacesNota(t) { const o = []; for (const seg of String(t || "").split(/(```[\s\S]*?```|`[^`\n]+`)/).filter((_, i) => i % 2 === 0)) for (const m of seg.matchAll(/\[\[([^\]\n|]+)(?:\|[^\]\n]*)?\]\]/g)) { const x = m[1].split("#")[0].trim(); if (x && !o.includes(x)) o.push(x); } return o; }
function resumenNota(n) {
  let ext = ""; for (const l of String(n.cuerpo || "").split("\n")) { const t = l.trim().replace(/^[#>\-*\s]+/, ""); if (t && !t.startsWith("```") && !t.startsWith("![")) { ext = t.slice(0, 160); break; } }
  return { id: n.id, titulo: tituloNota(n), meta: metaNota(n), modificada: n.modificada || 0, extracto: ext, enlaces: enlacesNota(n.cuerpo), palabras: String(n.cuerpo || "").split(/\s+/).filter(Boolean).length };
}
async function buscarNotas({ consulta = "", regex = false, mayus = false, filtro = {} } = {}) {
  const q = String(consulta).trim(); let re = null;
  if (regex && q) { try { re = new RegExp(q, mayus ? "" : "i"); } catch (e) { throw `Expresión regular no válida: ${e.message}`; } }
  const casa = (t) => (!q ? true : re ? re.test(t) : mayus ? String(t).includes(q) : plegar(t).includes(plegar(q)));
  const out = [];
  for (const n of (await notasTodas()).sort((a, b) => (b.modificada || 0) - (a.modificada || 0))) {
    const m = metaNota(n);
    if (filtro.general && m.temporada) continue;
    if ((filtro.temporada && m.temporada !== filtro.temporada) || (filtro.equipo && m.equipo_txt !== filtro.equipo) || (filtro.jugador && m.jugador_txt !== filtro.jugador) || (filtro.partido && m.partido !== filtro.partido)) continue;
    const titulo = tituloNota(n), enMeta = casa(titulo) || casa(m.equipo_txt) || casa(m.jugador_txt) || casa(m.temporada) || casa(m.partido_txt);
    const lineas = []; let total = 0;
    if (q) String(n.cuerpo || "").split("\n").forEach((l, i) => { if (casa(l)) { total++; if (lineas.length < 4) lineas.push({ n: i + 1, texto: l.trim().slice(0, 200) }); } });
    if (q && !total && !enMeta) continue;
    out.push({ ...resumenNota(n), coincidencias: total, lineas, en_titulo: enMeta });
  }
  return out;
}
async function imagenNota({ nombre }) {
  const im = (await get("imagenes", nombre)) || imagenesEmbebidas.find((x) => x.nombre === nombre);
  if (!im) throw "La imagen no se incluyó en este paquete (al exportar, marca «Incluir también las imágenes de las notas»).";
  return `data:${im.mime};base64,${im.base64}`;
}

async function listarGrupos() {
  const meta = [...embebidos.map(({ payload: p, db }) => ({ db: db || nombreDb(p), competicion: p.competicion, grupo: p.grupo, temporada: p.temporada, partidos: (p.partidos || []).length, incluido: true })),
    ...(await todos("grupos")).map(({ payload, ...m }) => m).filter((m) => !embebidos.some((e) => stem(e.db || nombreDb(e.payload)) === stem(m.db)))];
  if (location.protocol !== "file:") try { // datos publicados con la web (temporadas antiguas), si existen
    const r = await fetch("data/grupos.json"); if (r.ok && (r.headers.get("content-type") || "").includes("json")) {
      for (const g of await r.json()) if (!meta.some((m) => stem(m.db) === stem(g.db))) meta.push({ ...g, publicado: true });
    }
  } catch { /* sin datos publicados */ }
  meta.sort((a, b) => String(b.temporada).localeCompare(String(a.temporada)) || String(a.grupo).localeCompare(String(b.grupo)));
  return meta;
}
async function payload(db) {
  const k = stem(db); if (cache.has(k)) return cache.get(k);
  let p = embebidos.find((e) => stem(e.db || nombreDb(e.payload)) === k)?.payload || (await get("grupos", `${k}.db`))?.payload;
  if (!p) { const r = await fetch(`data/${k}.json`); if (!r.ok) throw new Error("No se encontraron esos datos."); p = await r.json(); }
  cache.set(k, p); return p;
}
async function todosPayloads() {
  const out = [];
  for (const g of await listarGrupos()) { try { out.push([g, await payload(g.db)]); } catch { /* grupo no disponible */ } }
  return out;
}

// ---------- ajustes de IA (en este dispositivo) ----------
const limpiarClave = (k) => { let t = String(k || "").trim(); for (let i = 0; i < 6; i++) { const a = t; t = t.replace(/^[\s"'`“”‘’«»]+|[\s"'`“”‘’«»]+$/g, "").replace(/^authorization:/i, "").replace(/^bearer[: ]\s*/i, ""); if (t === a) break; } return t.replace(/\s+/g, ""); }; // sin comillas ni «Bearer» pegados por error
const PROVEEDORES = { deepseek: { nombre: "DeepSeek", base_url: "https://api.deepseek.com", modelo: "deepseek-chat" }, openrouter: { nombre: "OpenRouter", base_url: "https://openrouter.ai/api/v1", modelo: "openai/gpt-4o-mini" } };
function iaGuardada() { // formato nuevo (proveedor + una clave y un modelo por servicio); convierte el antiguo (una sola URL)
  let raw = {}; try { raw = JSON.parse(localStorage.getItem("feb-ia") || "{}"); } catch { /* sin ajustes */ }
  if (raw.proveedores) return raw;
  const id = String(raw.base_url || "").toLowerCase().includes("openrouter") ? "openrouter" : "deepseek";
  const provs = { deepseek: { api_key: "", modelo: "" }, openrouter: { api_key: "", modelo: "" } };
  if (raw.api_key || raw.modelo) provs[id] = { api_key: raw.api_key || "", modelo: raw.modelo || "" };
  return { proveedor: id, proveedores: provs, instrucciones: raw.instrucciones || "" };
}
const guardarCfgIA = (c) => { try { localStorage.setItem("feb-ia", JSON.stringify(c)); } catch { /* sin almacenamiento: solo esta sesión */ } };
const cfgDe = (ia, id) => { const def = PROVEEDORES[id] || PROVEEDORES.deepseek; const p = ia.proveedores?.[id] || {}; return { proveedor: PROVEEDORES[id] ? id : "deepseek", base_url: def.base_url, modelo: (p.modelo || "").trim() || def.modelo, api_key: limpiarClave(p.api_key), instrucciones: ia.instrucciones || "" }; };
const cfgIA = () => { const ia = iaGuardada(); return cfgDe(ia, ia.proveedor); };
const cabecerasIA = (c, clave = c.api_key) => ({ "content-type": "application/json", authorization: `Bearer ${clave}`, ...(c.base_url.includes("openrouter.ai") ? { "X-Title": "FEBstats" } : {}) });
async function errorHttp(r) { let d = ""; try { const j = await r.json(); d = j?.error?.message || j?.error || j?.message || ""; } catch { /* sin detalle */ } return `Error ${r.status} del servicio de IA${d ? `: ${String(d).slice(0, 200)}` : "."}`; }

// ---------- herramientas de la IA (equivalentes a ia.rs, sin SQL ni vídeo) ----------
const HERRAMIENTAS = [
  { name: "listar_datos", description: "Lista todas las competiciones/grupos/temporadas importados (db, competición, grupo, temporada, nº de partidos).", parameters: { type: "object", properties: {} } },
  { name: "buscar_jugador", description: "Busca un jugador por nombre (parcial, sin acentos) en TODOS los grupos y temporadas y devuelve su resumen de cada temporada: promedios, porcentajes, uso, rol, perfil, índice.", parameters: { type: "object", properties: { nombre: { type: "string" }, equipo: { type: "string", description: "opcional" } }, required: ["nombre"] } },
  { name: "ficha_equipo", description: "Ficha de un equipo: clasificación, métricas avanzadas (ortg, drtg, ritmo, ts%), mejores jugadores y últimos partidos. Busca en todos los grupos salvo que se indique db.", parameters: { type: "object", properties: { equipo: { type: "string" }, db: { type: "string" } }, required: ["equipo"] } },
  { name: "partidos_jugador", description: "Estadística partido a partido (box score) de un jugador o de un equipo, para ver su evolución. Filtra por jugador y/o equipo; db opcional.", parameters: { type: "object", properties: { jugador: { type: "string" }, equipo: { type: "string" }, db: { type: "string" } } } },
  { name: "tras_evento", description: "Qué hace el RIVAL justo después de un hecho de un equipo (secuencias de juego con el reloj de cada tiro): p. ej. «probabilidad de que el rival anote tras un triple de mi equipo». Evento del equipo: triple (anotado), doble (anotado), canasta (cualquier tiro de campo anotado) o fallo (tiro de campo fallado). Devuelve cuántos eventos hay y el % de veces que (a) el siguiente tiro del partido es del rival y entra, (b) el rival anota antes de que el equipo vuelva a tirar, (c) el rival anota en los siguientes `ventana_seg` segundos (30 por defecto), junto a la referencia media del rival (canastas por minuto) y la misma medida tras el evento contrario (doble si pides triple, triple si pides doble). SOLO tiros de campo: el mapa de tiros de la FEB no incluye tiros libres, así que no cuenta faltas ni tiros libres. Muestras pequeñas: advierte del tamaño.", parameters: { type: "object", properties: { equipo: { type: "string" }, evento: { type: "string", enum: ["triple", "doble", "canasta", "fallo"] }, jugador: { type: "string", description: "opcional: solo eventos de ese jugador del equipo" }, ventana_seg: { type: "integer" }, db: { type: "string" } }, required: ["equipo"] } },
  { name: "tiros_resumen", description: "Resumen de tiros por zona de la cancha (intentos, aciertos, %) de un jugador o equipo. Zonas: pintura, media_baja, media_centro, media_alta, corner3_baja, corner3_alta, ala3_baja, ala3_alta, top3.", parameters: { type: "object", properties: { jugador: { type: "string" }, equipo: { type: "string" }, db: { type: "string" } } } },
];
HERRAMIENTAS.push(
  { name: "jugadas_playbook", description: "Jugadas del playbook del entrenador (dibujadas en la pizarra), descritas paso a paso en texto, con su vinculación a equipo, jugador y partido, su colección y su descripción. Filtros opcionales y parciales: texto, equipo, jugador, partido, coleccion.", parameters: { type: "object", properties: { texto: { type: "string" }, equipo: { type: "string" }, jugador: { type: "string" }, partido: { type: "string" }, coleccion: { type: "string" } } } },
  { name: "grafico_ranking", description: "DIBUJA un gráfico de barras real con el ranking de jugadores por una métrica (datos reales de la app). Métricas: puntos_prom, reb_tot_prom, asistencias_prom, recuperaciones_prom, perdidas_prom, valoracion_prom, t2_pct, t3_pct, tl_pct, tc_pct, ts_pct, uso_pct, ppt, indice_final. Por defecto: grupo más reciente, top 10, mínimo 3 partidos.", parameters: { type: "object", properties: { metrica: { type: "string" }, equipo: { type: "string" }, db: { type: "string" }, n: { type: "integer" }, min_partidos: { type: "integer" } }, required: ["metrica"] } },
  { name: "grafico_evolucion", description: "DIBUJA un gráfico de líneas real con la evolución partido a partido de un jugador. Métricas (hasta 3): puntos, reb_tot, asistencias, recuperaciones, perdidas, valoracion, minutos, tc_pct.", parameters: { type: "object", properties: { jugador: { type: "string" }, equipo: { type: "string" }, db: { type: "string" }, metricas: { type: "array", items: { type: "string" } } }, required: ["jugador", "metricas"] } },
  { name: "grafico_tiros", description: "DIBUJA el mapa de tiros real (cada tiro y % por zona) de un jugador o equipo. Filtros opcionales: cuarto, db.", parameters: { type: "object", properties: { jugador: { type: "string" }, equipo: { type: "string" }, db: { type: "string" }, cuarto: { type: "integer" } } } },
  { name: "crear_grafico", description: "DIBUJA un gráfico genérico con cifras que YA has obtenido de otras herramientas (nunca inventes valores). tipo=barras: items [{etiqueta, valor}]. tipo=lineas: etiquetas [..] y series [{nombre, valores [..]}]. tipo=dispersion: puntos [{etiqueta, x, y}] con eje_x y eje_y. Opcional: titulo, unidad.", parameters: { type: "object", properties: { tipo: { type: "string", enum: ["barras", "lineas", "dispersion"] }, titulo: { type: "string" }, unidad: { type: "string" }, items: { type: "array", items: { type: "object" } }, etiquetas: { type: "array", items: { type: "string" } }, series: { type: "array", items: { type: "object" } }, puntos: { type: "array", items: { type: "object" } }, eje_x: { type: "string" }, eje_y: { type: "string" } }, required: ["tipo"] } },
);
const SISTEMA = "Eres el asistente de análisis de un entrenador de baloncesto español. Respondes SIEMPRE en español, con datos reales de las herramientas: nunca inventes cifras. Hay datos de varias competiciones, grupos y temporadas a la vez: si la pregunta no precisa cuál, usa listar_datos y busca en todos (o pregunta cuál si es ambiguo), e indica siempre la temporada/grupo de cada dato. Los datos vienen de la FEB (estadística de partido y mapa de tiros, con el reloj de cada tiro: para secuencias de juego como «qué hace el rival tras un triple» usa tras_evento; solo hay tiros de campo, sin tiros libres, ni quintetos ni cambios). Si piden un gráfico, mapa de tiros, ranking o evolución, usa las herramientas grafico_ranking, grafico_evolucion, grafico_tiros o crear_grafico: la app los DIBUJA de verdad; nunca dibujes con texto o ASCII y no copies cifras inventadas (crear_grafico solo con cifras ya obtenidas de otras herramientas). No tienes acceso al vídeo ni a imágenes, solo a texto y cifras. Reglas FIBA 2026 (vigentes desde el 1-10-2026) por si hacen falta: 4 cuartos de 10 min y prórrogas de 5; tiempos muertos 2 en la 1.ª parte, 3 en la 2.ª (máx. 2 en los últimos 2:00 del 4.º) y 1 por prórroga; posesión de 24 s que pasa a 14 s tras balón en el aro o saque en campo contrario por falta/violación del rival; 8 s para pasar a campo contrario; 5 faltas = excluido; a la 4.ª falta de equipo en un cuarto, las siguientes personales dan 2 tiros libres; ya no existe la falta antideportiva: hay falta disruptiva y flagrante, técnicas de categoría 1 y 2, y falta en saque en los últimos 2:00; clasificación 2 puntos victoria, 1 derrota, 0 incomparecencia (20-0), con desempate entre empatados por los partidos entre ellos. Sé concreto y útil para tomar decisiones de entrenador; usa listas cortas y tablas markdown cuando comparen cifras. El entrenador también tiene un playbook de jugadas dibujadas: consúltalo con jugadas_playbook cuando pregunte por sus jugadas o por lo que ejecuta un equipo o jugador.";

const CAMPOS_J = ["jugador", "equipo", "partidos", "puntos_prom", "reb_tot_prom", "asistencias_prom", "recuperaciones_prom", "perdidas_prom", "valoracion_prom", "t2_pct", "t3_pct", "tl_pct", "tc_pct", "ts_pct", "uso_pct", "pp_pos", "ppt", "rol", "perfil", "indice_final", "minutos_total", "puntos"];
const compacto = (j, g) => { const o = { temporada: g.temporada, grupo: g.grupo, competicion: g.competicion }; for (const k of CAMPOS_J) if (j[k] != null) o[k] = j[k]; return o; };

const ZONAS = ["pintura", "media_baja", "media_centro", "media_alta", "corner3_baja", "corner3_alta", "ala3_baja", "ala3_alta", "top3"];
function zona(x, y) { // mismo reparto que index.py / payload.rs
  const [HX, HY, R, CY, KW, KD, W] = [1.575, 7.5, 6.75, 0.9, 4.9, 5.8, 15];
  const [kl, kh, cl, ch] = [W / 2 - KW / 2, W / 2 + KW / 2, CY, W - CY];
  const cx = HX + Math.sqrt(R * R - (cl - HY) ** 2);
  if (x <= KD && y >= kl && y <= kh) return 0;
  const enCorner = (y <= cl || y >= ch) && x <= cx;
  if (!(enCorner || Math.hypot(x - HX, y - HY) >= R)) return y < kl ? 1 : y > kh ? 3 : 2;
  if (enCorner) return y <= cl ? 4 : 5;
  const ang = Math.atan2(y - HY, x - HX);
  return Math.abs(ang) <= (15 * Math.PI) / 180 ? 8 : ang < 0 ? 6 : 7;
}

// Secuencias con el reloj del tiro (tiempo_seg = lo que queda del cuarto). Mismo cálculo que la consulta del Mac.
const tAbs = (t) => (t.cuarto <= 4 ? (t.cuarto - 1) * 600 + (600 - t.tiempo_seg) : 2400 + (t.cuarto - 5) * 300 + (300 - t.tiempo_seg));
function estadisticaTras(partidos, equipo, esEvento, ventana) {
  let n = 0, sig = 0, sigAnota = 0, antes = 0, vent = 0;
  for (const tiros of partidos) {
    const v = tiros.map((t, i) => ({ t, i, a: tAbs(t) })).sort((x, y) => x.a - y.a || x.i - y.i).map((o) => ({ ...o.t, a: o.a }));
    for (let i = 0; i < v.length; i++) {
      if (v[i].equipo !== equipo || !esEvento(v[i])) continue;
      n++; const resto = v.slice(i + 1);
      if (resto.length && resto[0].equipo !== equipo) { sig++; if (resto[0].resultado === "acierto") sigAnota++; }
      const k = resto.findIndex((t) => t.equipo === equipo); const hasta = k < 0 ? resto : resto.slice(0, k);
      if (hasta.some((t) => t.equipo !== equipo && t.resultado === "acierto")) antes++;
      if (resto.some((t) => t.a - v[i].a <= ventana && t.equipo !== equipo && t.resultado === "acierto")) vent++;
    }
  }
  const pct = (x) => (n ? Math.round((x / n) * 1000) / 10 : null);
  return { eventos: n, siguiente_tiro_del_rival_y_entra_pct: pct(sigAnota), siguiente_tiro_es_del_rival_pct: pct(sig), rival_anota_antes_de_que_el_equipo_vuelva_a_tirar_pct: pct(antes), rival_anota_en_ventana_pct: pct(vent) };
}
function trasEvento(a, sel, q) {
  const ev = a.evento || "triple", ventana = Math.max(5, Math.min(120, a.ventana_seg || 30)); const out = [];
  const defs = { triple: (t) => t.resultado === "acierto" && zona(t.Xinv, t.Yinv) >= 4, doble: (t) => t.resultado === "acierto" && zona(t.Xinv, t.Yinv) < 4, canasta: (t) => t.resultado === "acierto", fallo: (t) => t.resultado !== "acierto" };
  if (!defs[ev]) return { error: "evento debe ser triple, doble, canasta o fallo." };
  for (const [g, p] of sel) {
    const todos = p.tiros || []; if (!todos.length) continue;
    if (todos.some((t) => t.tiempo_seg == null)) { out.push({ temporada: g.temporada, grupo: g.grupo, error: "Estos datos no llevan el reloj de los tiros: vuelve a exportar el paquete desde el Mac con la versión nueva e impórtalo otra vez." }); continue; }
    const equipos = [...new Set(todos.map((t) => t.equipo).filter((e) => q(e).includes(q(a.equipo))))];
    if (!equipos.length) continue; if (equipos.length > 1) return { error: "Varios equipos coinciden; precisa el nombre.", candidatos: equipos };
    const eq = equipos[0]; const porPartido = new Map(); for (const t of todos) { if (!porPartido.has(t.partido_id)) porPartido.set(t.partido_id, []); porPartido.get(t.partido_id).push(t); }
    const suyos = [...porPartido.values()].filter((l) => l.some((t) => t.equipo === eq));
    const filtro = (t) => defs[ev](t) && (!a.jugador || q(t.jugador).includes(q(a.jugador)));
    let rivalAnota = 0, dur = 0; for (const l of suyos) { rivalAnota += l.filter((t) => t.equipo !== eq && t.resultado === "acierto").length; dur += Math.max(...l.map(tAbs)); }
    const r = { temporada: g.temporada, grupo: g.grupo, equipo: eq, partidos: suyos.length, evento: ev + (a.jugador ? ` de ${a.jugador}` : ""), ventana_seg: ventana, ...estadisticaTras(suyos, eq, filtro, ventana),
      referencia_rival_canastas_por_min: dur ? Math.round((rivalAnota / dur) * 60 * 100) / 100 : null };
    if (ev === "triple" || ev === "doble") { const o = ev === "triple" ? "doble" : "triple"; r["tras_" + o] = estadisticaTras(suyos, eq, (t) => defs[o](t) && (!a.jugador || q(t.jugador).includes(q(a.jugador))), ventana); }
    out.push(r);
  }
  return out.length ? out : { resultado: "No hay tiros de ese equipo." };
}

export function resumenZonas(tiros) { // para la ficha de jugador: zonas con tiros, de más a menos intentos
  const z = ZONAS.map(() => [0, 0]);
  for (const t of tiros) { const k = zona(t.Xinv, t.Yinv); z[k][0]++; if (t.resultado === "acierto") z[k][1]++; }
  const NOMBRES = ["Pintura", "Media baja", "Media centro", "Media alta", "Esquina baja", "Esquina alta", "Ala baja", "Ala alta", "Frontal 3"];
  return z.map(([i, a], k) => ({ nombre: NOMBRES[k], intentos: i, aciertos: a, pct: i ? Math.round((a / i) * 1000) / 10 : null })).filter((x) => x.intentos).sort((a, b) => b.intentos - a.intentos);
}

// ---------- gráficos (la IA los pide; la app los dibuja) ----------
const METRICAS_RANKING = { puntos_prom: ["Puntos por partido", "", 1], reb_tot_prom: ["Rebotes por partido", "", 1], asistencias_prom: ["Asistencias por partido", "", 1], recuperaciones_prom: ["Robos por partido", "", 1], perdidas_prom: ["Pérdidas por partido", "", 1],
  valoracion_prom: ["Valoración por partido", "", 1], t2_pct: ["% de T2", "%", 1], t3_pct: ["% de T3", "%", 1], tl_pct: ["% de TL", "%", 1], tc_pct: ["% de tiro de campo", "%", 1], ts_pct: ["TS%", "%", 100], uso_pct: ["Uso de posesión", "%", 1], ppt: ["Puntos por tiro", "", 1], indice_final: ["Índice de valoración", "", 1] };
const etiquetaGrupo = (g) => `${g.temporada} · ${String(g.grupo).replace(/"/g, "")}`;
const conGrafico = (spec, resumen) => ({ __grafico: spec, resumen });
const redondea = (v, d = 100) => Math.round(v * d) / d;
const minF = (s) => { const [m, sg] = String(s || "").split(":"); return (parseFloat(m) || 0) + (parseFloat(sg) || 0) / 60; };

async function grupoElegido(db) { const t = await todosPayloads(); return db ? t.find(([g]) => stem(g.db) === stem(db)) : t[0]; }

async function graficoRanking(a) {
  const m = METRICAS_RANKING[a.metrica]; if (!m) return { error: `Métrica no válida. Usa una de: ${Object.keys(METRICAS_RANKING).join(", ")}` };
  const gr = await grupoElegido(a.db); if (!gr) return { error: "No hay datos de ese grupo." }; const [g, p] = gr;
  const eq = a.equipo ? slug(a.equipo) : null; const n = Math.min(20, Math.max(3, a.n || 10)); const minp = a.min_partidos ?? 3;
  const v = (p.jugadores || []).filter((j) => (j.partidos || 0) >= minp && (!eq || slug(j.equipo).includes(eq)) && typeof j[a.metrica] === "number").map((j) => [j.jugador, j.equipo, j[a.metrica] * m[2]]).sort((x, y) => y[2] - x[2]).slice(0, n);
  if (!v.length) return { error: "Ningún jugador cumple el filtro." };
  const items = v.map(([j, e, x]) => ({ etiqueta: eq ? j : `${j} (${e})`, valor: redondea(x) }));
  return conGrafico({ tipo: "barras", titulo: `${m[0]} — top ${v.length}`, subtitulo: etiquetaGrupo(g), unidad: m[1], items }, { grupo: etiquetaGrupo(g), ranking: items });
}

async function graficoEvolucion(a) {
  const VALIDAS = { puntos: "Puntos", reb_tot: "Rebotes", asistencias: "Asistencias", recuperaciones: "Robos", perdidas: "Pérdidas", valoracion: "Valoración", minutos: "Minutos", tc_pct: "% tiro de campo" };
  const mets = (a.metricas || []).slice(0, 3); if (!mets.length || mets.some((k) => !VALIDAS[k])) return { error: `Métricas válidas: ${Object.keys(VALIDAS).join(", ")}` };
  const q = slug(a.jugador), eq = a.equipo ? slug(a.equipo) : null; const cand = [];
  for (const [g, p] of await todosPayloads()) {
    if (a.db && stem(g.db) !== stem(a.db)) continue;
    const vistos = new Set(); for (const s of p.partidosJugador || []) if (slug(s.jugador).includes(q) && (!eq || slug(s.equipo).includes(eq))) vistos.add(`${s.jugador}\x01${s.equipo}`);
    for (const k of vistos) cand.push([g, p, ...k.split("\x01")]);
  }
  if (!cand.length) return { error: "No hay partidos de ese jugador." };
  const dist = [...new Set(cand.map((c) => `${c[2]} (${c[3]})`))]; if (dist.length > 1) return { error: "Varios jugadores coinciden; precisa nombre o equipo.", candidatos: dist.slice(0, 8) };
  const [g, p, jug, equipo] = cand[0]; const ms = new Map((p.partidos || []).map((m) => [m.partido_id, m]));
  const filas = (p.partidosJugador || []).filter((s) => s.jugador === jug && s.equipo === equipo).map((s) => ({ s, f: ms.get(s.partido_id)?.fecha || "" })).sort((x, y) => x.f.localeCompare(y.f));
  const etiquetas = filas.map(({ f }) => (f.length >= 10 ? `${f.slice(8, 10)}/${f.slice(5, 7)}` : ""));
  const series = mets.map((k) => ({ nombre: VALIDAS[k], valores: filas.map(({ s }) => k === "minutos" ? redondea(minF(s.minutos), 10) : k === "tc_pct" ? (s.tc_intentos > 0 ? redondea((s.tc_aciertos / s.tc_intentos) * 100, 10) : 0) : s[k] ?? 0) }));
  return conGrafico({ tipo: "lineas", titulo: `${jug} — evolución`, subtitulo: `${equipo} · ${etiquetaGrupo(g)}`, etiquetas, series }, { jugador: jug, equipo, grupo: etiquetaGrupo(g), partidos: filas.length, series });
}

async function graficoTiros(a) {
  const qj = a.jugador ? slug(a.jugador) : null, qe = a.equipo ? slug(a.equipo) : null; if (!qj && !qe) return { error: "Indica jugador y/o equipo." };
  const pts = [], quienes = new Set(); let grupo = "";
  for (const [g, p] of await todosPayloads()) {
    if (a.db && stem(g.db) !== stem(a.db)) continue; const antes = pts.length;
    for (const t of p.tiros || []) if ((!qj || slug(t.jugador).includes(qj)) && (!qe || slug(t.equipo).includes(qe)) && (a.cuarto == null || t.cuarto === a.cuarto)) { quienes.add(qj ? `${t.jugador} (${t.equipo})` : t.equipo); pts.push([t.Xinv, t.Yinv, t.resultado === "acierto" ? 1 : 0]); }
    if (pts.length > antes && !grupo) grupo = etiquetaGrupo(g); if (pts.length && !a.db) break;
  }
  if (!pts.length) return { error: "No hay tiros que coincidan." }; if (quienes.size > 1) return { error: "Varios coinciden; precisa nombre o equipo.", candidatos: [...quienes].slice(0, 8) };
  const z = ZONAS.map(() => [0, 0]); for (const [x, y, m] of pts) { const k = zona(x, y); z[k][0]++; z[k][1] += m; }
  const paso = Math.floor(pts.length / 1500) + 1; const tiros = pts.filter((_, i) => i % paso === 0).map(([x, y, m]) => [redondea(x), redondea(y), m]);
  return conGrafico({ tipo: "mapa_tiros", titulo: `${[...quienes][0]} — mapa de tiros${a.cuarto != null ? ` (${a.cuarto}.º cuarto)` : ""}`, subtitulo: grupo, tiros }, { tiros: pts.length, aciertos: pts.reduce((s, p) => s + p[2], 0), zonas: ZONAS.map((n, i) => ({ zona: n, intentos: z[i][0], aciertos: z[i][1] })) });
}

function crearGrafico(a) {
  if (!["barras", "lineas", "dispersion"].includes(a.tipo)) return { error: "tipo debe ser barras, lineas o dispersion" };
  const spec = { ...a }; for (const k of ["items", "puntos"]) if (Array.isArray(spec[k])) spec[k] = spec[k].slice(0, 40);
  return conGrafico(spec, "ok");
}

async function ejecutar(nombre, a) {
  if (nombre === "grafico_ranking") return graficoRanking(a); if (nombre === "grafico_evolucion") return graficoEvolucion(a);
  if (nombre === "grafico_tiros") return graficoTiros(a); if (nombre === "crear_grafico") return crearGrafico(a);
  if (nombre === "jugadas_playbook") {
    const f = (s) => slug(s || ""), ok = (campo, filtro) => !filtro || f(campo).includes(f(filtro));
    const out = (await listarJugadas()).filter((j) => ok(j.equipo_txt, a.equipo) && ok(j.jugador_txt, a.jugador) && ok(j.partido_txt, a.partido) && ok(j.coleccion, a.coleccion) && ok(`${j.titulo} ${j.descripcion} ${j.texto}`, a.texto))
      .slice(0, 20).map((j) => { let texto = j.texto; try { texto = describir(normalizar(JSON.parse(j.datos))) || j.texto; } catch { /* usa el texto guardado */ } return { id: j.id, titulo: j.titulo, coleccion: j.coleccion, seccion: j.seccion, equipo: j.equipo_txt, jugador: j.jugador_txt, partido: j.partido_txt, temporada: j.temporada, pasos: texto, descripcion: j.descripcion }; });
    return out.length ? out : { resultado: "No hay jugadas del Playbook que coincidan." };
  }
  const q = (s) => slug(s || ""); const sel = [];
  for (const [g, p] of await todosPayloads()) if (!a.db || stem(g.db) === stem(a.db)) sel.push([g, p]);
  if (nombre === "listar_datos") return { grupos: (await listarGrupos()).map((g) => ({ db: g.db, competicion: g.competicion, grupo: g.grupo, temporada: g.temporada, partidos: g.partidos })) };
  if (nombre === "buscar_jugador") {
    const out = []; for (const [g, p] of sel) for (const j of p.jugadores || []) if (q(j.jugador).includes(q(a.nombre)) && (!a.equipo || q(j.equipo).includes(q(a.equipo)))) out.push({ db: g.db, ficha: compacto(j, g) });
    return out.length ? out.slice(0, 15) : { resultado: "No hay ningún jugador con ese nombre en los datos importados." };
  }
  if (nombre === "ficha_equipo") {
    const out = [];
    for (const [g, p] of sel) for (const c of p.clasificacion || []) if (q(c.equipo).includes(q(a.equipo))) {
      const js = (p.jugadores || []).filter((j) => j.equipo === c.equipo).sort((x, y) => y.puntos - x.puntos).slice(0, 6).map((j) => compacto(j, g));
      const ps = (p.partidos || []).filter((m) => m.equipo_local === c.equipo || m.equipo_visitante === c.equipo).sort((x, y) => String(y.fecha).localeCompare(String(x.fecha))).slice(0, 5)
        .map((m) => ({ fecha: m.fecha, local: m.equipo_local, visitante: m.equipo_visitante, marcador: `${m.pts_local}-${m.pts_visitante}` }));
      out.push({ db: g.db, competicion: g.competicion, grupo: g.grupo, temporada: g.temporada, clasificacion: c, mejores_jugadores: js, ultimos_partidos: ps });
    }
    return out.length ? out.slice(0, 8) : { resultado: "No hay ningún equipo con ese nombre en los datos importados." };
  }
  if (nombre === "partidos_jugador") {
    const out = [];
    for (const [g, p] of sel) {
      const ms = new Map((p.partidos || []).map((m) => [m.partido_id, m]));
      for (const s of p.partidosJugador || []) if ((!a.jugador || q(s.jugador).includes(q(a.jugador))) && (!a.equipo || q(s.equipo).includes(q(a.equipo)))) {
        const m = ms.get(s.partido_id) || {};
        out.push({ temporada: g.temporada, grupo: g.grupo, fecha: m.fecha, jugador: s.jugador, equipo: s.equipo, rival: s.equipo === m.equipo_local ? m.equipo_visitante : m.equipo_local, marcador: `${m.pts_local}-${m.pts_visitante}`,
          min: s.minutos, pts: s.puntos, tc: `${s.tc_aciertos}/${s.tc_intentos}`, t3: `${s.t3_aciertos}/${s.t3_intentos}`, tl: `${s.tl_aciertos}/${s.tl_intentos}`, reb: s.reb_tot, ast: s.asistencias, per: s.perdidas, rec: s.recuperaciones, val: s.valoracion, mas_menos: s.mas_menos });
      }
    }
    out.sort((x, y) => String(y.fecha).localeCompare(String(x.fecha)));
    return out.length ? out.slice(0, 60) : { resultado: "No hay partidos que coincidan." };
  }
  if (nombre === "tras_evento") return trasEvento(a, sel, q);
  if (nombre === "tiros_resumen") {
    const out = [];
    for (const [g, p] of sel) {
      const z = ZONAS.map(() => [0, 0]); let n = 0;
      for (const t of p.tiros || []) if ((!a.jugador || q(t.jugador).includes(q(a.jugador))) && (!a.equipo || q(t.equipo).includes(q(a.equipo)))) { const k = zona(t.Xinv, t.Yinv); z[k][0]++; if (t.resultado === "acierto") z[k][1]++; n++; }
      if (n) out.push({ temporada: g.temporada, grupo: g.grupo, tiros: n, zonas: Object.fromEntries(ZONAS.map((nm, i) => [nm, { intentos: z[i][0], aciertos: z[i][1], pct: z[i][0] ? Math.round((z[i][1] / z[i][0]) * 1000) / 10 : null }])) });
    }
    return out.length ? out : { resultado: "No hay tiros que coincidan." };
  }
  return { error: `herramienta desconocida: ${nombre}` };
}

// ---------- conversación (streaming SSE + bucle de herramientas) ----------
async function ronda(cfg, msgs, chatId) {
  let r;
  try {
    r = await fetch(`${cfg.base_url.replace(/\/$/, "")}/chat/completions`, { method: "POST", headers: cabecerasIA(cfg),
      body: JSON.stringify({ model: cfg.modelo, messages: msgs, tools: HERRAMIENTAS.map((f) => ({ type: "function", function: f })), stream: true, temperature: 0.3 }) });
  } catch { throw "Sin conexión con el servicio de IA. Comprueba Internet; los datos siguen disponibles sin IA."; }
  if (!r.ok) { const c = r.status, m = await errorHttp(r); throw c === 401 ? `${m}. Revisa la clave en «Ajustes → IA».` : c === 402 ? `${m}. Puede que la cuenta no tenga saldo.` : c === 429 ? `${m}. Espera unos segundos.` : m; }
  const rd = r.body.getReader(); const dec = new TextDecoder(); let buf = "", contenido = ""; const llamadas = [];
  for (;;) {
    const { done, value } = await rd.read(); if (done) break;
    buf += dec.decode(value, { stream: true });
    let i; while ((i = buf.indexOf("\n")) >= 0) {
      const linea = buf.slice(0, i).trim(); buf = buf.slice(i + 1);
      if (!linea.startsWith("data:")) continue; const d = linea.slice(5).trim(); if (!d || d === "[DONE]") continue;
      let v; try { v = JSON.parse(d); } catch { continue; }
      const delta = v.choices?.[0]?.delta || {};
      if (delta.content) { contenido += delta.content; emitir("ia", { chat_id: chatId, tipo: "token", texto: delta.content }); }
      for (const tc of delta.tool_calls || []) {
        const k = tc.index ?? 0; llamadas[k] ||= { id: "", name: "", args: "" };
        if (tc.id) llamadas[k].id = tc.id; if (tc.function?.name) llamadas[k].name += tc.function.name; if (tc.function?.arguments) llamadas[k].args += tc.function.arguments;
      }
    }
  }
  return [contenido, llamadas.filter((l) => l && l.name)];
}

async function preguntar({ chatId, texto, contexto, breve }) {
  const cfg = cfgIA();
  try {
    if (!cfg.api_key) throw "Falta la clave de la API de IA. Ve a Ajustes → IA y pégala (DeepSeek u OpenRouter).";
    const hist = (await porChat(chatId)).sort((a, b) => a.id - b.id).slice(-10);
    if (!hist.length) { const c = await get("chats", chatId); if (c) await put("chats", { ...c, titulo: texto.slice(0, 48) }); }
    await put("mensajes", { chat_id: chatId, rol: "user", contenido: texto, creado: new Date().toISOString() });
    let sis = SISTEMA; if ((cfg.instrucciones || "").trim()) sis += `\n\nPERFIL E INSTRUCCIONES DEL ENTRENADOR (síguelas; prevalecen sobre tu estilo por defecto, pero nunca inventes datos):\n${cfg.instrucciones.trim()}`;
    if (breve) sis += " MODO PARTIDO: el entrenador está en pleno partido; responde en MÁXIMO 3 frases cortas o 4 viñetas, lo más accionable primero.";
    if (contexto && Object.keys(contexto).length) sis += ` Contexto actual del entrenador en la aplicación: ${JSON.stringify(contexto)}.`;
    const msgs = [{ role: "system", content: sis }, ...hist.map((m) => ({ role: m.rol, content: m.contenido })), { role: "user", content: texto }];
    let respuesta = ""; const graficos = [];
    for (let i = 0; i < 7; i++) {
      const [contenido, llamadas] = await ronda(cfg, msgs, chatId);
      if (!llamadas.length) { respuesta = contenido; break; }
      msgs.push({ role: "assistant", content: contenido || null, tool_calls: llamadas.map((l) => ({ id: l.id, type: "function", function: { name: l.name, arguments: l.args } })) });
      for (const l of llamadas) {
        let args = {}; try { args = JSON.parse(l.args || "{}"); } catch { /* argumentos vacíos */ }
        emitir("ia", { chat_id: chatId, tipo: "herramienta", texto: `${l.name} ${l.args.slice(0, 120)}` });
        let res; try { res = await ejecutar(l.name, args); } catch (e) { res = { error: String(e) }; }
        if (res && res.__grafico) { graficos.push(res.__grafico); res = { ok: true, mensaje: "Gráfico mostrado al usuario justo debajo de tu respuesta. NO lo dibujes con texto; comenta lo importante.", resumen: res.resumen }; }
        let s = JSON.stringify(res); if (s.length > 24000) s = s.slice(0, 24000) + "…(recortado)";
        msgs.push({ role: "tool", tool_call_id: l.id, content: s });
      }
    }
    if (!respuesta) respuesta = "No he podido completar la consulta. Prueba a reformular la pregunta.";
    for (const g of graficos) respuesta += "\n\n```feb-grafico\n" + JSON.stringify(g) + "\n```";
    await put("mensajes", { chat_id: chatId, rol: "assistant", contenido: respuesta, creado: new Date().toISOString() });
    emitir("ia", { chat_id: chatId, tipo: "fin", texto: respuesta });
    return respuesta;
  } catch (e) { emitir("ia", { chat_id: chatId, tipo: "error", texto: String(e) }); throw String(e); }
}

// ---------- comandos ----------
const ordenes = {
  ping: async () => ({ local: true }),
  listar_grupos: listarGrupos,
  listar_jugadas: listarJugadas,
  notas_listar: async () => (await notasTodas()).sort((a, b) => (b.modificada || 0) - (a.modificada || 0)).map(resumenNota),
  notas_leer: async ({ id }) => { const n = (await notasTodas()).find((x) => x.id === id); if (!n) throw "Esa nota ya no existe."; return { id: n.id, meta: metaNota(n), contenido: n.cuerpo || "", modificada: n.modificada || 0 }; },
  notas_buscar: buscarNotas,
  notas_leer_imagen: imagenNota,
  notas_versiones: async () => [],
  leer_payload: ({ db }) => payload(db),
  borrar_grupo: async ({ db }) => { await del("grupos", db); cache.delete(stem(db)); return null; },
  listar_chats: async () => (await todos("chats")).sort((a, b) => b.id - a.id).map(({ id, titulo, creado }) => ({ id, titulo, creado })),
  crear_chat: async () => put("chats", { titulo: "Nueva conversación", creado: new Date().toISOString() }),
  borrar_chat: async ({ id }) => { for (const m of await porChat(id)) await del("mensajes", m.id); await del("chats", id); return null; },
  listar_mensajes: async ({ chatId }) => (await porChat(chatId)).sort((a, b) => a.id - b.id).map((m) => ({ rol: m.rol, contenido: m.contenido })),
  preguntar_ia: preguntar,
  leer_ajustes_ia: async () => { const ia = iaGuardada(), c = cfgIA(); const provs = {}; for (const [id, p] of Object.entries(PROVEEDORES)) { const x = cfgDe(ia, id); provs[id] = { nombre: p.nombre, base_url: p.base_url, modelo: x.modelo, tiene_clave: !!x.api_key }; } return { proveedor: c.proveedor, base_url: c.base_url, modelo: c.modelo, tiene_clave: !!c.api_key, instrucciones: c.instrucciones, proveedores: provs }; },
  guardar_ajustes_ia: async ({ proveedor, modelos, claves, instrucciones }) => {
    const ia = iaGuardada(); ia.proveedor = PROVEEDORES[proveedor] ? proveedor : "deepseek";
    for (const id of Object.keys(PROVEEDORES)) { ia.proveedores[id] ||= { api_key: "", modelo: "" }; if (modelos && typeof modelos[id] === "string") ia.proveedores[id].modelo = modelos[id].trim(); const k = limpiarClave(claves && claves[id]); if (k) ia.proveedores[id].api_key = k; }
    if (instrucciones != null) ia.instrucciones = String(instrucciones).slice(0, 4000); guardarCfgIA(ia); return null;
  },
  elegir_proveedor_ia: async ({ proveedor }) => { const ia = iaGuardada(); ia.proveedor = PROVEEDORES[proveedor] ? proveedor : "deepseek"; guardarCfgIA(ia); return null; },
  elegir_modelo_ia: async ({ modelo }) => { const ia = iaGuardada(); ia.proveedores[ia.proveedor] ||= { api_key: "", modelo: "" }; ia.proveedores[ia.proveedor].modelo = String(modelo).trim(); guardarCfgIA(ia); return null; },
  listar_modelos_ia: async ({ proveedor, apiKey } = {}) => {
    const ia = iaGuardada(); const c = cfgDe(ia, proveedor || ia.proveedor); const k = limpiarClave(apiKey) || c.api_key;
    if (!k) throw "Pega primero la clave de API.";
    let r; try { r = await fetch(`${c.base_url}/models`, { headers: cabecerasIA(c, k) }); } catch { throw "Sin conexión con el servicio."; }
    if (!r.ok) throw `${await errorHttp(r)} Escribe el nombre del modelo a mano.`;
    const ids = ((await r.json()).data || []).map((m) => m.id).sort(); if (!ids.length) throw "El servicio no devolvió ningún modelo; escribe el nombre a mano."; return ids;
  },
  probar_ia: async () => {
    const c = cfgIA(); if (!c.api_key) throw "Falta la clave de la API.";
    let r; try { r = await fetch(`${c.base_url}/chat/completions`, { method: "POST", headers: cabecerasIA(c), body: JSON.stringify({ model: c.modelo, messages: [{ role: "user", content: "Responde solo: ok" }], max_tokens: 16 }) }); } catch { throw "Sin conexión con el servicio."; }
    if (r.ok) return `Conexión correcta con ${PROVEEDORES[c.proveedor].nombre} (modelo ${c.modelo}).`;
    throw await errorHttp(r);
  },
};

export async function llamarLocal(cmd, args) {
  const f = ordenes[cmd]; if (!f) throw `«${cmd}» no está disponible en este dispositivo.`;
  return await f(args || {});
}
