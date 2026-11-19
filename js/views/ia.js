// Vista "Asistente" (solo escritorio): chat con IA sobre TODOS los datos descargados (varias divisiones y temporadas)
// y sobre las notas de vídeo del entrenador. Modo partido: respuestas muy breves para usarlo en directo.
import { h, vacioMsg, dialogo } from "../util.js";
import { invoke, escuchar as alEvento, enLocal } from "../api.js";
import { S } from "../state.js";

const A = { chats: [], chat: null, mensajes: [], grupos: [], grupo: "", equipos: [], equipo: "", jugadores: [], jugador: "", breve: false, modelo: "", modelos: [], ocupado: false, parcial: "", herr: "", escuchando: false, error: "" };
try { const b = localStorage.getItem("ia-breve"); A.breve = b === null ? enLocal : b === "1"; } catch { /* sin almacenamiento */ } // en el iPad: respuestas breves por defecto

// Markdown seguro (se escapa todo el HTML antes): títulos, negrita/cursiva, listas, tablas, citas, código y reglas.
function md(txt) {
  const esc = (s) => s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
  const inline = (s) => esc(s).replace(/`([^`]+)`/g, "<code>$1</code>").replace(/\*\*(.+?)\*\*/g, "<b>$1</b>").replace(/(^|[^*])\*([^*\s][^*]*?)\*(?!\*)/g, "$1<i>$2</i>").replace(/__(.+?)__/g, "<b>$1</b>");
  const celdas = (l) => l.trim().replace(/^\|/, "").replace(/\|$/, "").split("|").map((c) => c.trim());
  const esSep = (l) => /^\s*\|?\s*:?-{2,}:?\s*(\|\s*:?-{2,}:?\s*)*\|?\s*$/.test(l);
  const L = txt.replace(/\r/g, "").split("\n"); const out = []; let i = 0;
  while (i < L.length) {
    const l = L[i];
    if (/^```/.test(l)) { const c = []; i++; while (i < L.length && !/^```/.test(L[i])) c.push(L[i++]); i++; out.push(`<pre><code>${esc(c.join("\n"))}</code></pre>`); continue; }
    if (l.includes("|") && i + 1 < L.length && esSep(L[i + 1])) { // tabla
      const cab = celdas(l); i += 2; const filas = [];
      while (i < L.length && L[i].includes("|") && L[i].trim()) filas.push(celdas(L[i++]));
      out.push(`<table><thead><tr>${cab.map((c) => `<th>${inline(c)}</th>`).join("")}</tr></thead><tbody>${filas.map((f) => `<tr>${cab.map((_, k) => `<td>${inline(f[k] ?? "")}</td>`).join("")}</tr>`).join("")}</tbody></table>`); continue;
    }
    const li = l.match(/^\s*([-*•]|\d+[.)])\s+(.*)/);
    if (li) { const ord = /\d/.test(li[1]); const its = []; while (i < L.length) { const m = L[i].match(/^\s*([-*•]|\d+[.)])\s+(.*)/); if (!m) break; its.push(`<li>${inline(m[2])}</li>`); i++; } out.push(`<${ord ? "ol" : "ul"}>${its.join("")}</${ord ? "ol" : "ul"}>`); continue; }
    const hd = l.match(/^(#{1,6})\s+(.*)/); if (hd) { out.push(`<h4>${inline(hd[2])}</h4>`); i++; continue; }
    if (/^\s*(-{3,}|\*{3,})\s*$/.test(l)) { out.push("<hr>"); i++; continue; }
    if (/^>\s?/.test(l)) { const q = []; while (i < L.length && /^>\s?/.test(L[i])) q.push(L[i++].replace(/^>\s?/, "")); out.push(`<blockquote>${inline(q.join(" "))}</blockquote>`); continue; }
    if (l.trim()) { const p = []; while (i < L.length && L[i].trim() && !/^(```|#{1,6}\s|>|\s*([-*•]|\d+[.)])\s)/.test(L[i]) && !(L[i].includes("|") && i + 1 < L.length && esSep(L[i + 1]))) p.push(L[i++]); out.push(`<p>${inline(p.join("<br>").replace(/<br>/g, "\n")).replace(/\n/g, "<br>")}</p>`); continue; }
    i++;
  }
  return out.join("");
}

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
  const aj = await invoke("leer_ajustes_ia"); A.modelo = aj.modelo;
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
  const b = A.mensajes.map((m) => { const d = h("div", { class: `ia-m ${m.rol === "user" ? "yo" : "ia"}` }); d.innerHTML = m.rol === "user" ? md(m.contenido) : md(m.contenido); return d; });
  if (A.ocupado) { const d = h("div", { class: "ia-m ia" }); d.innerHTML = A.parcial ? md(A.parcial) : `<p class="ia-pensando">${A.herr ? "Consultando datos… <code>" + A.herr.replace(/</g, "&lt;").slice(0, 70) + "</code>" : "Pensando…"}</p>`; b.push(d); }
  if (A.error) b.push(h("div", { class: "ia-m ia ia-err", text: A.error }));
  return b;
}

export async function panelIA(cont) {
  const a = await invoke("leer_ajustes_ia");
  const url = h("input", { type: "text", value: a.base_url });
  const clave = h("input", { type: "password", placeholder: a.tiene_clave ? "•••••• (guardada; déjalo vacío para conservarla)" : "Pega aquí tu clave de API" });
  const msg = h("p", { class: "vid-ayuda" });
  const cajaModelo = h("div", { class: "ia-modelo" });
  let modelo = a.modelo, lista = A.modelos;
  const manual = h("input", { type: "text", value: modelo, placeholder: "p. ej. deepseek-chat", oninput: (e) => { modelo = e.target.value; } });
  const pintarModelo = () => {
    const sel = lista.length ? h("select", { onchange: (e) => { modelo = e.target.value; manual.value = modelo; } },
      (lista.includes(modelo) ? lista : [modelo, ...lista]).filter(Boolean).map((m) => h("option", { value: m, selected: m === modelo || null, text: m }))) : null;
    cajaModelo.replaceChildren(...[sel, manual].filter(Boolean));
  };
  const cargar = async () => {
    msg.textContent = "Consultando modelos…";
    try { lista = await invoke("listar_modelos_ia", { baseUrl: url.value, apiKey: clave.value || null }); A.modelos = lista; if (!modelo || !lista.includes(modelo)) { modelo = lista.includes("deepseek-chat") ? "deepseek-chat" : lista[0]; manual.value = modelo; } msg.textContent = `${lista.length} modelos disponibles.`; pintarModelo(); }
    catch (e) { msg.textContent = String(e); }
  };
  const guardar = async () => { await invoke("guardar_ajustes_ia", { baseUrl: url.value, modelo, apiKey: clave.value || null }); clave.value = ""; A.modelo = modelo; };
  pintarModelo();
  cont.replaceChildren(h("div", { class: "ia-ajustes" },
    h("p", { class: "vid-ayuda", text: "Por defecto DeepSeek (platform.deepseek.com). Sirve cualquier servicio compatible con la API de OpenAI. La clave se guarda solo en este ordenador (carpeta de datos); no la compartas junto con la carpeta." }),
    h("label", null, "URL del servicio", url), h("label", null, "Clave de API", clave),
    h("div", { class: "ia-fila" }, h("label", null, "Modelo", cajaModelo), h("button", { type: "button", class: "btn", onclick: cargar }, "Cargar modelos")),
    h("p", { class: "vid-ayuda", text: "Pega la clave y pulsa «Cargar modelos» para elegir de la lista del servicio, o escribe el nombre a mano." }),
    h("p", { class: "vid-ayuda", text: "Privacidad: a la IA solo se envían textos y cifras que salen de tus datos (estadísticas y tus notas). Nunca el vídeo ni imágenes." }),
    h("div", { class: "vid-herr" }, h("button", { type: "button", class: "btn primario", onclick: async () => { await guardar(); msg.textContent = "Guardado."; } }, "Guardar"),
      h("button", { type: "button", class: "btn", onclick: async () => { await guardar(); msg.textContent = "Probando…"; try { msg.textContent = await invoke("probar_ia"); } catch (e) { msg.textContent = String(e); } } }, "Guardar y probar")), msg));
  if (!lista.length && (a.tiene_clave)) cargar();
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
      h("label", { class: "ia-breve", title: "Modelo de IA que responde" }, "Modelo ",
        h("select", { class: "peq", onchange: async (e) => { A.modelo = e.target.value; await invoke("elegir_modelo_ia", { modelo: A.modelo }); } },
          (A.modelos.includes(A.modelo) || !A.modelo ? A.modelos : [A.modelo, ...A.modelos]).map((m) => h("option", { value: m, selected: m === A.modelo || null, text: m })),
          !A.modelos.length ? h("option", { value: A.modelo, text: A.modelo || "(sin definir)" }) : null)),
      h("button", { type: "button", class: "btn peq", style: "margin-left:auto", onclick: () => { location.hash = "#/ajustes?tab=ia"; } }, "⚙ Ajustes")),
    h("div", { class: "ia-cuerpo" }, lat,
      h("div", { class: "ia-main" },
        h("div", { class: "ia-msgs" }, ...(A.mensajes.length || A.ocupado ? burbujas() : [h("div", { class: "ia-vacio" }, h("p", { text: "Pregúntame sobre cualquier equipo, jugador, división o temporada que hayas descargado, o sobre tus notas de vídeo." }),
          h("div", { class: "ia-sug" }, sugerencias.map((s) => h("button", { type: "button", class: "btn", onclick: () => enviar(root, s) }, s))))])),
        h("div", { class: "ia-input" }, entrada, h("button", { type: "button", class: "btn primario", disabled: A.ocupado || null, onclick: () => { const t = entrada.value; entrada.value = ""; enviar(root, t); } }, "Enviar"))))));
  const caja = document.querySelector(".ia-msgs"); if (caja) caja.scrollTop = caja.scrollHeight;
  entrada.focus();
}
document.addEventListener("keydown", (ev) => { if ((ev.metaKey || ev.ctrlKey) && ev.key.toLowerCase() === "k") { const t = document.querySelector(".ia-entrada"); if (t) { ev.preventDefault(); t.focus(); } } });
