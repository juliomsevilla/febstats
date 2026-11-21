// Vista "Asistente" (solo escritorio): chat con IA sobre TODOS los datos descargados (varias divisiones y temporadas)
// y sobre las notas de vídeo del entrenador. Modo partido: respuestas muy breves para usarlo en directo.
import { h, vacioMsg, dialogo } from "../util.js";
import { invoke, escuchar as alEvento, enLocal } from "../api.js";
import { S } from "../state.js";
import { hidratar } from "../graficos.js";
import { md } from "../md.js";

const A = { chats: [], chat: null, mensajes: [], grupos: [], grupo: "", equipos: [], equipo: "", jugadores: [], jugador: "", breve: false, modelo: "", modelos: [], ocupado: false, parcial: "", herr: "", escuchando: false, error: "" };
try { const b = localStorage.getItem("ia-breve"); A.breve = b === null ? enLocal : b === "1"; } catch { /* sin almacenamiento */ } // en el iPad: respuestas breves por defecto

async function escuchar(root) {
  if (A.escuchando) return; A.escuchando = true;
  await alEvento("ia", (ev) => {
    const p = ev.payload; if (p.chat_id !== A.chat) return;
    if (p.tipo === "token") { A.parcial += p.texto; A.herr = ""; }
    else if (p.tipo === "herramienta") A.herr = p.texto;
    else if (p.tipo === "error") { A.error = p.texto; A.ocupado = false; A.parcial = ""; }
    if (document.querySelector(".ia-root")) actualizarMensajes();
  });
}

export async function vistaIA(root) {
  await escuchar(root);
  A.chats = await invoke("listar_chats");
  A.grupos = await invoke("listar_grupos");
  const aj = await invoke("leer_ajustes_ia"); A.modelo = aj.modelo; if (A.proveedor !== aj.proveedor) { A.proveedor = aj.proveedor; A.modelos = []; } A.nombreProveedor = aj.proveedores?.[aj.proveedor]?.nombre || ""; A.proveedores = aj.proveedores;
  if (aj.tiene_clave && !A.modelos.length) invoke("listar_modelos_ia", {}).then((m) => { A.modelos = m; if (document.querySelector(".ia-root")) pintar(root); }).catch(() => {});
  if (!A.chat || !A.chats.some((c) => c.id === A.chat)) A.chat = A.chats[0]?.id ?? null;
  A.mensajes = A.chat ? await invoke("listar_mensajes", { chatId: A.chat }) : [];
  pintar(root);
  if (window.__iaPregunta) { const q = window.__iaPregunta; window.__iaPregunta = null; A.breve = true; A.chat = null; A.mensajes = []; enviar(root, q); } // viene de una ficha de Consulta
}

async function elegirChat(root, id) { A.chat = id; A.parcial = ""; A.error = ""; A.mensajes = await invoke("listar_mensajes", { chatId: id }); pintar(root); }

async function cargarEquipos(root) {
  A.equipos = []; A.jugadores = [];
  if (A.grupo) { try { const P = await invoke("leer_payload", { db: A.grupo }); A.equipos = P.equipos; A._P = P; if (A.equipo) A.jugadores = P.jugadores.filter((j) => j.equipo === A.equipo).map((j) => j.jugador).sort(); } catch { /* sin datos */ } }
  pintar(root);
}

async function enviar(root, texto) {
  texto = texto.trim(); if (!texto || A.ocupado) return;
  if (!A.chat) { A.chat = await invoke("crear_chat"); A.chats = await invoke("listar_chats"); }
  A.mensajes.push({ rol: "user", contenido: texto }); A.ocupado = true; A.parcial = ""; A.error = ""; A.herr = "";
  pintar(root);
  const contexto = {}; if (A.grupo) { const g = A.grupos.find((x) => x.db === A.grupo); contexto.grupo = `${g?.competicion} ${g?.grupo} ${g?.temporada}`; contexto.db = A.grupo; }
  if (A.equipo) contexto.equipo = A.equipo; if (A.jugador) contexto.jugador = A.jugador;
  try { const r = await invoke("preguntar_ia", { chatId: A.chat, texto, contexto, breve: A.breve }); A.mensajes.push({ rol: "assistant", contenido: r }); }
  catch (e) { A.error = String(e); }
  A.ocupado = false; A.parcial = ""; A.herr = ""; A.chats = await invoke("listar_chats");
  if (document.querySelector(".ia-root")) pintar(root);
}

function actualizarMensajes() {
  const caja = document.querySelector(".ia-msgs"); if (!caja) return;
  caja.replaceChildren(...burbujas());
  caja.scrollTop = caja.scrollHeight;
}
function burbujas() {
  const b = A.mensajes.map((m) => { const d = h("div", { class: `ia-m ${m.rol === "user" ? "yo" : "ia"}` }); d.innerHTML = md(m.contenido); hidratar(d); return d; });
  if (A.ocupado) { const d = h("div", { class: "ia-m ia" }); d.innerHTML = A.parcial ? md(A.parcial) : `<p class="ia-pensando">${A.herr ? "Consultando datos… <code>" + A.herr.replace(/</g, "&lt;").slice(0, 70) + "</code>" : "Pensando…"}</p>`; b.push(d); }
  if (A.error) b.push(h("div", { class: "ia-m ia ia-err", text: A.error }));
  return b;
}

export async function panelIA(cont) {
  const a = await invoke("leer_ajustes_ia");
  const provs = a.proveedores || {};                 // {deepseek:{nombre, base_url, modelo, tiene_clave}, openrouter:{…}}
  let prov = a.proveedor;
  const st = Object.fromEntries(Object.entries(provs).map(([id, p]) => [id, { clave: "", modelo: p.modelo, lista: [] }]));
  const AYUDA = {
    deepseek: "DeepSeek (platform.deepseek.com → API keys). Modelos habituales: deepseek-chat (rápido, ideal para el partido) y deepseek-reasoner.",
    openrouter: "OpenRouter (openrouter.ai/keys): una sola clave para muchos modelos de distintas empresas. El modelo se escribe como proveedor/modelo (p. ej. openai/gpt-4o-mini, anthropic/claude-sonnet-5.5, google/gemini-2.5-flash). Si sale «No allowed providers…», amplía los proveedores permitidos en openrouter.ai/settings/privacy. Para el asistente conviene un modelo con soporte de herramientas (tool calling).",
  };
  const clave = h("input", { type: "password", autocomplete: "off" });
  const ayuda = h("p", { class: "vid-ayuda" }); const urlTxt = h("code", { class: "rut-ruta" });
  const msg = h("p", { class: "vid-ayuda" });
  const lista = h("datalist", { id: "ia-modelos" });
  const modeloIn = h("input", { type: "text", list: "ia-modelos", autocomplete: "off", spellcheck: "false", oninput: (e) => { st[prov].modelo = e.target.value; } });
  const segmento = h("div", { class: "seg", role: "radiogroup", "aria-label": "Servicio de IA" });
  const pintarProveedor = () => {
    const p = provs[prov], s = st[prov];
    segmento.replaceChildren(...Object.entries(provs).map(([id, x]) => h("button", { type: "button", role: "radio", "aria-checked": String(id === prov), class: id === prov ? "on" : "",
      onclick: () => { st[prov].clave = clave.value; prov = id; pintarProveedor(); } }, x.nombre + (x.tiene_clave || st[id].clave ? " ✓" : ""))));
    urlTxt.textContent = p.base_url; ayuda.textContent = AYUDA[prov] || "";
    clave.value = s.clave; clave.placeholder = p.tiene_clave ? "•••••• (guardada; déjalo vacío para conservarla)" : `Pega aquí tu clave de ${p.nombre}`;
    modeloIn.value = s.modelo; modeloIn.placeholder = prov === "openrouter" ? "p. ej. openai/gpt-4o-mini" : "p. ej. deepseek-chat";
    lista.replaceChildren(...s.lista.map((m) => h("option", { value: m })));
  };
  const cargar = async () => {
    msg.textContent = "Consultando modelos…"; st[prov].clave = clave.value;
    try { const l = await invoke("listar_modelos_ia", { proveedor: prov, apiKey: clave.value || null }); st[prov].lista = l; pintarProveedor(); msg.textContent = `${l.length} modelos disponibles: escribe en el cuadro para filtrar o despliega la lista.`; }
    catch (e) { msg.textContent = String(e); }
  };
  const PERFILES = [
    ["Entrenador jefe", "Actúa como un entrenador jefe de baloncesto con 20 años de experiencia en categorías FEB. Habla claro y directo, como en un vestuario. Prioriza decisiones: quién juega, qué defensa, qué sistema o jugada. Explica el porqué con 2-3 datos clave y termina siempre con un plan de acción concreto. Si faltan datos, dilo."],
    ["Analista de scouting", "Actúa como analista de scouting de un cuerpo técnico. Para cada rival o jugador entrega: Resumen · Ataque (tendencias, zonas de tiro, ritmo) · Defensa · Jugadores a vigilar · Plan de partido (cómo atacarles y cómo defenderles). Apóyate siempre en cifras de los datos y avisa de las muestras pequeñas."],
    ["Ayudante en directo (breve)", "Estoy en pleno partido. Responde en máximo 3 frases, sin introducción ni despedida, con lo más accionable primero. Si hace falta una cifra, da solo la imprescindible."],
    ["Formador de jugadores", "Actúa como entrenador de formación. Evalúa a los jugadores con foco en su desarrollo: qué hacen bien, qué deben mejorar y 2-3 ejercicios o hábitos concretos para trabajarlo. Tono positivo y exigente."],
  ];
  const instr = h("textarea", { rows: 7, placeholder: "Opcional. Escribe cómo quieres que se comporte el asistente (rol, estilo, qué priorizar, formato de las respuestas…)." }, a.instrucciones || "");
  const guardar = async () => {
    st[prov].clave = clave.value;
    await invoke("guardar_ajustes_ia", { proveedor: prov, modelos: Object.fromEntries(Object.entries(st).map(([id, x]) => [id, x.modelo])), claves: Object.fromEntries(Object.entries(st).map(([id, x]) => [id, x.clave])), instrucciones: instr.value });
    for (const [id, p] of Object.entries(provs)) { if (st[id].clave) p.tiene_clave = true; p.modelo = st[id].modelo; }
    for (const x of Object.values(st)) x.clave = ""; clave.value = ""; pintarProveedor();
    A.modelo = st[prov].modelo; A.modelos = []; A.proveedor = prov;
  };
  pintarProveedor();
  cont.replaceChildren(h("div", { class: "ia-ajustes" },
    h("p", { class: "vid-ayuda", text: "Elige el servicio de IA. Cada uno guarda su propia clave y su modelo; el que marques es el que usa el asistente. Las claves se guardan solo en este ordenador (carpeta de datos); no las compartes con el archivo para el iPad." }),
    h("div", { class: "campo" }, h("label", { text: "Servicio" }), segmento, h("small", null, "Dirección: ", urlTxt)), ayuda,
    h("label", null, "Clave de API", clave),
    h("label", null, "Perfil del asistente (su rol e instrucciones)", instr),
    h("div", { class: "vid-herr" }, ...PERFILES.map(([n, t]) => h("button", { type: "button", class: "btn", onclick: () => { instr.value = t; } }, n)), h("button", { type: "button", class: "btn fantasma", onclick: () => { instr.value = ""; } }, "Quitar perfil")),
    h("p", { class: "vid-ayuda", text: "Elige un perfil de ejemplo y edítalo, o escribe el tuyo. Se aplica a todas las conversaciones (las nuevas y las ya abiertas) y se guarda en este dispositivo." }),
    h("div", { class: "ia-fila" }, h("label", null, "Modelo", modeloIn, lista), h("button", { type: "button", class: "btn", onclick: cargar }, "Cargar modelos")),
    h("p", { class: "vid-ayuda", text: "Pega la clave y pulsa «Cargar modelos» para ver los del servicio, o escribe el nombre a mano." }),
    h("p", { class: "vid-ayuda", text: "Privacidad: a la IA solo se envían textos y cifras que salen de tus datos (estadísticas y tus notas). Nunca el vídeo ni imágenes." }),
    h("div", { class: "vid-herr" }, h("button", { type: "button", class: "btn primario", onclick: async () => { await guardar(); msg.textContent = "Guardado."; } }, "Guardar"),
      h("button", { type: "button", class: "btn", onclick: async () => { await guardar(); msg.textContent = "Probando…"; try { msg.textContent = await invoke("probar_ia"); } catch (e) { msg.textContent = String(e); } } }, "Guardar y probar")), msg));
}

/** Servicio de IA (DeepSeek / OpenRouter) y modelo, junto a la caja de escritura: se cambian sobre la marcha, sin ir a Ajustes. */
function configIA(root) {
  const provs = A.proveedores || {};
  const servicio = h("select", { class: "peq", "aria-label": "Servicio de IA", title: "Servicio de IA que responde", disabled: A.ocupado || null, onchange: async (e) => { await cambiarProveedor(root, e.target.value); } },
    Object.entries(provs).map(([id, p]) => h("option", { value: id, selected: id === A.proveedor || null, text: p.nombre + (p.tiene_clave ? "" : " (sin clave)") })));
  const elegir = async (m) => { A.modelo = m.trim(); await invoke("elegir_modelo_ia", { modelo: A.modelo }); };
  const modelo = A.modelos.length > 60
    ? h("span", null, h("input", { class: "peq", type: "text", list: "ia-modelos-chat", value: A.modelo, style: { width: "230px" }, spellcheck: "false", "aria-label": "Modelo", title: "Modelo (escribe para filtrar la lista)", onchange: (e) => elegir(e.target.value) }),
      h("datalist", { id: "ia-modelos-chat" }, A.modelos.map((m) => h("option", { value: m }))))
    : h("select", { class: "peq", "aria-label": "Modelo", title: "Modelo de IA que responde", onchange: (e) => elegir(e.target.value) },
      (A.modelos.includes(A.modelo) || !A.modelo ? A.modelos : [A.modelo, ...A.modelos]).map((m) => h("option", { value: m, selected: m === A.modelo || null, text: m })),
      !A.modelos.length ? h("option", { value: A.modelo, text: A.modelo || "(sin definir)" }) : null);
  return h("div", { class: "ia-conf" }, servicio, modelo, h("small", { class: "ia-conf-ayuda", text: "Cambia de servicio o de modelo cuando quieras" }));
}
async function cambiarProveedor(root, id) {
  A.error = ""; await invoke("elegir_proveedor_ia", { proveedor: id });
  const aj = await invoke("leer_ajustes_ia"); A.proveedores = aj.proveedores; A.proveedor = aj.proveedor; A.modelo = aj.modelo; A.modelos = []; A.nombreProveedor = aj.proveedores?.[aj.proveedor]?.nombre || "";
  if (!aj.tiene_clave) A.error = `Falta la clave de ${A.nombreProveedor}: pégala en Ajustes → IA.`;
  pintar(root);
  if (aj.tiene_clave) invoke("listar_modelos_ia", {}).then((m) => { A.modelos = m; if (A.proveedor === aj.proveedor && document.querySelector(".ia-root")) pintar(root); }).catch(() => {});
}

function pintar(root) {
  const sel = (ops, val, on, vacio) => h("select", { class: "peq", onchange: (e) => on(e.target.value) }, h("option", { value: "", text: vacio }), ops.map(([v, t]) => h("option", { value: v, selected: v === val || null, text: t })));
  const entrada = h("textarea", { class: "ia-entrada", rows: 2, placeholder: A.breve ? "Pregunta rápida (modo partido)…" : "Pregunta sobre equipos, jugadores, temporadas o tus notas de vídeo…",
    onkeydown: (ev) => { if (ev.key === "Enter" && !ev.shiftKey) { ev.preventDefault(); const t = entrada.value; entrada.value = ""; enviar(root, t); } } });
  const sugerencias = ["¿Cuáles son los puntos fuertes y débiles de este equipo?", "¿Quién es el jugador más eficiente y por qué?", "Resume mis notas de vídeo sobre el rival", "Compara a este jugador con sus temporadas anteriores"];
  const lat = h("div", { class: "ia-lat" }, h("button", { type: "button", class: "btn primario", onclick: async () => { A.chat = await invoke("crear_chat"); A.mensajes = []; A.chats = await invoke("listar_chats"); pintar(root); } }, "+ Nueva"),
    ...A.chats.map((c) => h("div", { class: "ia-chat" + (c.id === A.chat ? " sel" : "") }, h("button", { type: "button", onclick: () => elegirChat(root, c.id), text: c.titulo }),
      h("button", { type: "button", class: "btn fantasma", "aria-label": "Borrar conversación", onclick: async () => { await invoke("borrar_chat", { id: c.id }); A.chat = null; await vistaIA(root); } }, "✕"))));
  root.replaceChildren(h("div", { class: "ia-root" },
    h("div", { class: "vid-cab" }, h("b", { class: "vid-h", text: "Asistente" }),
      sel(A.grupos.map((g) => [g.db, `${g.temporada} · ${g.competicion} ${g.grupo.replace(/"/g, "")}`]), A.grupo, (v) => { A.grupo = v; A.equipo = ""; A.jugador = ""; cargarEquipos(root); }, "Todos los datos"),
      A.grupo ? sel(A.equipos.map((e) => [e, e]), A.equipo, (v) => { A.equipo = v; A.jugador = ""; cargarEquipos(root); }, "Equipo…") : null,
      A.equipo ? sel(A.jugadores.map((j) => [j, j]), A.jugador, (v) => { A.jugador = v; }, "Jugador…") : null,
      h("label", { class: "ia-breve", title: "Respuestas de 3 frases máximo, para usar durante el partido" }, h("input", { type: "checkbox", checked: A.breve || null, onchange: (e) => { A.breve = e.target.checked; try { localStorage.setItem("ia-breve", A.breve ? "1" : "0"); } catch { /* ignorar */ } entrada.placeholder = A.breve ? "Pregunta rápida (modo partido)…" : "Pregunta…"; } }), " Modo partido"),
      h("button", { type: "button", class: "btn peq", style: "margin-left:auto", onclick: () => { location.hash = "#/ajustes?tab=ia"; } }, "⚙ Ajustes")),
    h("div", { class: "ia-cuerpo" }, lat,
      h("div", { class: "ia-main" },
        h("div", { class: "ia-msgs" }, ...(A.mensajes.length || A.ocupado ? burbujas() : [A.error ? h("div", { class: "ia-m ia ia-err", text: A.error }) : null, h("div", { class: "ia-vacio" }, h("p", { text: "Pregúntame sobre cualquier equipo, jugador, división o temporada que hayas descargado, o sobre tus notas de vídeo." }),
          h("div", { class: "ia-sug" }, sugerencias.map((s) => h("button", { type: "button", class: "btn", onclick: () => enviar(root, s) }, s))))])),
        configIA(root),
        h("div", { class: "ia-input" }, entrada, h("button", { type: "button", class: "btn primario", disabled: A.ocupado || null, onclick: () => { const t = entrada.value; entrada.value = ""; enviar(root, t); } }, "Enviar"))))));
  const caja = document.querySelector(".ia-msgs"); if (caja) caja.scrollTop = caja.scrollHeight;
  entrada.focus();
}
document.addEventListener("keydown", (ev) => { if ((ev.metaKey || ev.ctrlKey) && ev.key.toLowerCase() === "k") { const t = document.querySelector(".ia-entrada"); if (t) { ev.preventDefault(); t.focus(); } } });
