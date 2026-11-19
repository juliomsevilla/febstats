// Modo LOCAL (iPad y cualquier navegador sin la app del Mac): todo se guarda en el propio dispositivo (IndexedDB)
// y la IA se llama directamente desde aquí. No hace falta Mac, servidor ni conexión, salvo para preguntar a la IA.
// Los datos de la FEB se importan desde un paquete (.json) que se exporta en la app del Mac (Ajustes → Descarga de datos).
// Implementa los mismos comandos que la app de escritorio, así las vistas no distinguen el modo.

// ---------- utilidades ----------
const slug = (t) => String(t || "").normalize("NFKD").replace(/[^\x00-\x7f]/g, "").toLowerCase().replace(/[^a-z0-9]+/g, "_").replace(/^_+|_+$/g, "");
const stem = (db) => String(db || "").replace(/\.db$/, "");
const nombreDb = (p) => `grupo_${slug(p.competicion)}_${slug(p.grupo)}_${slug(p.temporada)}.db`;

// ---------- almacén: IndexedDB; si no está disponible (p. ej. al abrir el archivo suelto desde Archivos), localStorage ----------
let _db, _motor;
function abrir() {
  return (_db ||= new Promise((res, rej) => {
    if (!window.indexedDB) return rej(new Error("sin IndexedDB"));
    const r = indexedDB.open("febstats", 1);
    r.onupgradeneeded = () => {
      const d = r.result;
      d.createObjectStore("grupos", { keyPath: "db" });
      d.createObjectStore("chats", { keyPath: "id", autoIncrement: true });
      d.createObjectStore("mensajes", { keyPath: "id", autoIncrement: true }).createIndex("chat", "chat_id");
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
const CLAVE = { grupos: "db", chats: "id", mensajes: "id" };
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
let embebidos = [];
try { const t = document.getElementById("feb-paquete")?.textContent?.trim(); if (t && !t.startsWith("__")) embebidos = (JSON.parse(t).grupos || []).map((g) => ({ ...g, payload: g.payload })); } catch { /* sin datos incluidos */ }

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
    if (!lista) throw new Error(`«${f.name}» no parece un paquete de FEB Stats (expórtalo desde la app del Mac).`);
    for (const g of lista) {
      const p = g.payload; const db = g.db || nombreDb(p);
      await put("grupos", { db, competicion: p.competicion, grupo: p.grupo, temporada: p.temporada, partidos: (p.partidos || []).length, importado: new Date().toISOString(), payload: p });
      cache.delete(stem(db)); nombres.push(`${p.competicion} ${String(p.grupo).replace(/"/g, "")} ${p.temporada}`);
    }
  }
  try { await navigator.storage?.persist?.(); } catch { /* ignorar */ }
  return nombres;
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
const cfgIA = () => { try { return { base_url: "https://api.deepseek.com", modelo: "deepseek-chat", api_key: "", ...JSON.parse(localStorage.getItem("feb-ia") || "{}") }; } catch { return { base_url: "https://api.deepseek.com", modelo: "deepseek-chat", api_key: "" }; } };
const guardarCfgIA = (c) => { try { localStorage.setItem("feb-ia", JSON.stringify(c)); } catch { /* sin almacenamiento: solo esta sesión */ } };

// ---------- herramientas de la IA (equivalentes a ia.rs, sin SQL ni vídeo) ----------
const HERRAMIENTAS = [
  { name: "listar_datos", description: "Lista todas las competiciones/grupos/temporadas importados (db, competición, grupo, temporada, nº de partidos).", parameters: { type: "object", properties: {} } },
  { name: "buscar_jugador", description: "Busca un jugador por nombre (parcial, sin acentos) en TODOS los grupos y temporadas y devuelve su resumen de cada temporada: promedios, porcentajes, uso, rol, perfil, índice.", parameters: { type: "object", properties: { nombre: { type: "string" }, equipo: { type: "string", description: "opcional" } }, required: ["nombre"] } },
  { name: "ficha_equipo", description: "Ficha de un equipo: clasificación, métricas avanzadas (ortg, drtg, ritmo, ts%), mejores jugadores y últimos partidos. Busca en todos los grupos salvo que se indique db.", parameters: { type: "object", properties: { equipo: { type: "string" }, db: { type: "string" } }, required: ["equipo"] } },
  { name: "partidos_jugador", description: "Estadística partido a partido (box score) de un jugador o de un equipo, para ver su evolución. Filtra por jugador y/o equipo; db opcional.", parameters: { type: "object", properties: { jugador: { type: "string" }, equipo: { type: "string" }, db: { type: "string" } } } },
  { name: "tiros_resumen", description: "Resumen de tiros por zona de la cancha (intentos, aciertos, %) de un jugador o equipo. Zonas: pintura, media_baja, media_centro, media_alta, corner3_baja, corner3_alta, ala3_baja, ala3_alta, top3.", parameters: { type: "object", properties: { jugador: { type: "string" }, equipo: { type: "string" }, db: { type: "string" } } } },
];
const SISTEMA = "Eres el asistente de análisis de un entrenador de baloncesto español. Respondes SIEMPRE en español, con datos reales de las herramientas: nunca inventes cifras. Hay datos de varias competiciones, grupos y temporadas a la vez: si la pregunta no precisa cuál, usa listar_datos y busca en todos (o pregunta cuál si es ambiguo), e indica siempre la temporada/grupo de cada dato. Los datos vienen de la FEB (estadística de partido y mapa de tiros). No tienes acceso al vídeo ni a imágenes, solo a texto y cifras. Sé concreto y útil para tomar decisiones de entrenador; usa listas cortas y tablas markdown cuando comparen cifras.";

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

export function resumenZonas(tiros) { // para la ficha de jugador: zonas con tiros, de más a menos intentos
  const z = ZONAS.map(() => [0, 0]);
  for (const t of tiros) { const k = zona(t.Xinv, t.Yinv); z[k][0]++; if (t.resultado === "acierto") z[k][1]++; }
  const NOMBRES = ["Pintura", "Media baja", "Media centro", "Media alta", "Esquina baja", "Esquina alta", "Ala baja", "Ala alta", "Frontal 3"];
  return z.map(([i, a], k) => ({ nombre: NOMBRES[k], intentos: i, aciertos: a, pct: i ? Math.round((a / i) * 1000) / 10 : null })).filter((x) => x.intentos).sort((a, b) => b.intentos - a.intentos);
}

async function ejecutar(nombre, a) {
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
    r = await fetch(`${cfg.base_url.replace(/\/$/, "")}/chat/completions`, { method: "POST", headers: { "content-type": "application/json", authorization: `Bearer ${cfg.api_key}` },
      body: JSON.stringify({ model: cfg.modelo, messages: msgs, tools: HERRAMIENTAS.map((f) => ({ type: "function", function: f })), stream: true, temperature: 0.3 }) });
  } catch { throw "Sin conexión con el servicio de IA. Comprueba Internet; los datos siguen disponibles sin IA."; }
  if (!r.ok) {
    const c = r.status; const cuerpo = (await r.text().catch(() => "")).slice(0, 200);
    throw c === 401 ? "La clave de la API no es válida (401). Revísala en «Ajustes»." : c === 402 ? "La cuenta de IA no tiene saldo (402)." : c === 429 ? "Demasiadas peticiones a la IA (429); espera unos segundos." : `Error ${c} del servicio de IA: ${cuerpo}`;
  }
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
    if (!cfg.api_key) throw "Falta la clave de la API de IA. Ve a Ajustes → IA y pégala (DeepSeek: platform.deepseek.com).";
    const hist = (await porChat(chatId)).sort((a, b) => a.id - b.id).slice(-10);
    if (!hist.length) { const c = await get("chats", chatId); if (c) await put("chats", { ...c, titulo: texto.slice(0, 48) }); }
    await put("mensajes", { chat_id: chatId, rol: "user", contenido: texto, creado: new Date().toISOString() });
    let sis = SISTEMA; if (breve) sis += " MODO PARTIDO: el entrenador está en pleno partido; responde en MÁXIMO 3 frases cortas o 4 viñetas, lo más accionable primero.";
    if (contexto && Object.keys(contexto).length) sis += ` Contexto actual del entrenador en la aplicación: ${JSON.stringify(contexto)}.`;
    const msgs = [{ role: "system", content: sis }, ...hist.map((m) => ({ role: m.rol, content: m.contenido })), { role: "user", content: texto }];
    let respuesta = "";
    for (let i = 0; i < 7; i++) {
      const [contenido, llamadas] = await ronda(cfg, msgs, chatId);
      if (!llamadas.length) { respuesta = contenido; break; }
      msgs.push({ role: "assistant", content: contenido || null, tool_calls: llamadas.map((l) => ({ id: l.id, type: "function", function: { name: l.name, arguments: l.args } })) });
      for (const l of llamadas) {
        let args = {}; try { args = JSON.parse(l.args || "{}"); } catch { /* argumentos vacíos */ }
        emitir("ia", { chat_id: chatId, tipo: "herramienta", texto: `${l.name} ${l.args.slice(0, 120)}` });
        let res; try { res = await ejecutar(l.name, args); } catch (e) { res = { error: String(e) }; }
        let s = JSON.stringify(res); if (s.length > 24000) s = s.slice(0, 24000) + "…(recortado)";
        msgs.push({ role: "tool", tool_call_id: l.id, content: s });
      }
    }
    if (!respuesta) respuesta = "No he podido completar la consulta. Prueba a reformular la pregunta.";
    await put("mensajes", { chat_id: chatId, rol: "assistant", contenido: respuesta, creado: new Date().toISOString() });
    emitir("ia", { chat_id: chatId, tipo: "fin", texto: respuesta });
    return respuesta;
  } catch (e) { emitir("ia", { chat_id: chatId, tipo: "error", texto: String(e) }); throw String(e); }
}

// ---------- comandos ----------
const ordenes = {
  ping: async () => ({ local: true }),
  listar_grupos: listarGrupos,
  leer_payload: ({ db }) => payload(db),
  borrar_grupo: async ({ db }) => { await del("grupos", db); cache.delete(stem(db)); return null; },
  listar_chats: async () => (await todos("chats")).sort((a, b) => b.id - a.id).map(({ id, titulo, creado }) => ({ id, titulo, creado })),
  crear_chat: async () => put("chats", { titulo: "Nueva conversación", creado: new Date().toISOString() }),
  borrar_chat: async ({ id }) => { for (const m of await porChat(id)) await del("mensajes", m.id); await del("chats", id); return null; },
  listar_mensajes: async ({ chatId }) => (await porChat(chatId)).sort((a, b) => a.id - b.id).map((m) => ({ rol: m.rol, contenido: m.contenido })),
  preguntar_ia: preguntar,
  leer_ajustes_ia: async () => { const c = cfgIA(); return { base_url: c.base_url, modelo: c.modelo, tiene_clave: !!c.api_key }; },
  guardar_ajustes_ia: async ({ baseUrl, modelo, apiKey }) => { const c = cfgIA(); guardarCfgIA({ base_url: String(baseUrl || c.base_url).trim(), modelo: String(modelo || c.modelo).trim(), api_key: apiKey && apiKey.trim() ? apiKey.trim() : c.api_key }); return null; },
  elegir_modelo_ia: async ({ modelo }) => { guardarCfgIA({ ...cfgIA(), modelo: String(modelo).trim() }); return null; },
  listar_modelos_ia: async ({ baseUrl, apiKey } = {}) => {
    const c = cfgIA(); const base = (baseUrl || c.base_url).replace(/\/$/, ""); const k = apiKey || c.api_key;
    if (!k) throw "Pega primero la clave de API.";
    let r; try { r = await fetch(`${base}/models`, { headers: { authorization: `Bearer ${k}` } }); } catch { throw "Sin conexión con el servicio."; }
    if (!r.ok) throw r.status === 401 ? "La clave de la API no es válida (401)." : `El servicio respondió ${r.status} al pedir los modelos; escribe el nombre del modelo a mano.`;
    const ids = ((await r.json()).data || []).map((m) => m.id).sort(); if (!ids.length) throw "El servicio no devolvió ningún modelo; escribe el nombre a mano."; return ids;
  },
  probar_ia: async () => {
    const c = cfgIA(); if (!c.api_key) throw "Falta la clave de la API.";
    let r; try { r = await fetch(`${c.base_url.replace(/\/$/, "")}/chat/completions`, { method: "POST", headers: { "content-type": "application/json", authorization: `Bearer ${c.api_key}` }, body: JSON.stringify({ model: c.modelo, messages: [{ role: "user", content: "Responde solo: ok" }], max_tokens: 5 }) }); } catch { throw "Sin conexión con el servicio."; }
    if (r.ok) return "Conexión correcta."; throw `Error ${r.status} del servicio de IA.`;
  },
};

export async function llamarLocal(cmd, args) {
  const f = ordenes[cmd]; if (!f) throw `«${cmd}» no está disponible en este dispositivo.`;
  return await f(args || {});
}
