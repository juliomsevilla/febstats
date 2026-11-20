// Vista "Ajustes" (solo escritorio): descarga de datos FEB, configuración de la IA y botones de marcado de vídeo.
import { h, tabsBar } from "../util.js";
import { vistaDatos } from "./datos.js";
import { panelIA } from "./ia.js";
import { panelBotones } from "./video.js";
import { invoke, elegirCarpeta, enRemoto, enLocal } from "../api.js";
import { importarPaquetes } from "../local.js";
import { panelAyuda, panelAutoria, panelLicencia } from "./info.js";

const INFO = ["ayuda", "autoria", "licencia"]; // en todas las versiones (también en el iPad)
const TABS = [["datos", enLocal ? "Datos" : "Descarga de datos"], ["carpetas", "Carpetas"], ["ia", "IA"], ["botones", "Botones de vídeo"], ["ipad", "Acceso por red"], ["ayuda", "Ayuda"], ["autoria", "Autoría"], ["licencia", "Licencia"]]
  .filter(([t]) => INFO.includes(t) || (enLocal ? (t === "datos" || t === "ia") : enRemoto ? (t === "datos" || t === "botones") : true));

export async function vistaAjustes(root) {
  const q = new URLSearchParams((location.hash.split("?")[1] || ""));
  const tab = TABS.some(([t]) => t === q.get("tab")) ? q.get("tab") : "datos";
  const cont = h("div", { class: "aj-cont" });
  let version = ""; try { version = window.__TAURI__?.app ? "v" + (await window.__TAURI__.app.getVersion()) : ""; } catch { /* sin versión */ }
  root.replaceChildren(h("div", { class: "titulo" }, h("h1", { text: "Ajustes" }), version ? h("p", { text: `FEBstats ${version}` }) : null),
    tabsBar(TABS, tab, (v) => { location.hash = `#/ajustes?tab=${v}`; }), cont);
  if (tab === "datos") await (enLocal ? panelImportar(cont) : vistaDatos(cont));
  else if (tab === "ia") await panelIA(cont);
  else if (tab === "botones") await panelBotones(cont);
  else if (tab === "ayuda") await panelAyuda(cont);
  else if (tab === "autoria") await panelAutoria(cont);
  else if (tab === "licencia") await panelLicencia(cont);
  else if (tab === "carpetas") await panelCarpetas(cont);
  else await panelRemoto(cont);
}

// Carpetas de guardado de cada tipo de archivo.
async function panelCarpetas(cont) {
  const r = await invoke("leer_rutas");
  const msg = h("p", { class: "vid-ayuda" });
  let mover = true;
  const cambiar = async (clave, ruta) => { msg.textContent = "Guardando…"; try { msg.textContent = await invoke("guardar_ruta", { clave, ruta, mover }); } catch (e) { msg.textContent = String(e); } await panelCarpetas(cont); cont.append(msg); };
  cont.replaceChildren(
    h("p", { class: "vid-ayuda", text: "Por defecto todo vive en la carpeta de FEBstats, dentro de Documentos. Puedes cambiar dónde se guarda cada una de estas carpetas (por ejemplo, a un disco externo), pero hacerlo es bajo tu responsabilidad: si esa ubicación deja de estar disponible, FEBstats te avisará y trabajará con una carpeta vacía hasta que la recuperes." }),
    h("label", { class: "ia-breve" }, h("input", { type: "checkbox", checked: true, onchange: (e) => { mover = e.target.checked; } }), " Al cambiar una carpeta, mover a la nueva lo que ya haya guardado"),
    h("div", { class: "rut-lista" }, r.rutas.map((x) => h("div", { class: "card rut-fila" },
      h("div", { class: "rut-tit" }, h("b", { text: x.etiqueta }), x.personalizada ? h("span", { class: "vid-chip-s", text: "personalizada" }) : h("span", { class: "vid-chip-s", text: "por defecto" })),
      h("code", { class: "rut-ruta", text: x.ruta }), h("span", { class: "vid-ayuda", text: `${x.n_archivos} elemento(s)` }),
      h("div", { class: "vid-herr" },
        h("button", { type: "button", class: "btn", onclick: async () => { const n = await elegirCarpeta(x.ruta); if (n) cambiar(x.clave, n); } }, "Cambiar…"),
        x.personalizada ? h("button", { type: "button", class: "btn fantasma", onclick: () => cambiar(x.clave, null) }, "Restablecer") : null)))),
    h("p", { class: "vid-ayuda", text: `Carpeta de FEBstats: ${r.base}. Es siempre la misma (se crea la primera vez y, al actualizar la app, se reutiliza con todo lo que contiene). Dentro están data (todo lo importante: datos de la FEB, notas, jugadas, vídeos y marcas), capturas, videos y bin, más copias (copias de seguridad) y config.json (ajustes y clave de IA).` }), msg,
    await tarjetaCopias(cont));
}


// Copias de seguridad de las anotaciones (vídeos, marcas, botones, chats): carpeta segura fuera de la app.
async function tarjetaCopias(cont) {
  const [copias, est] = [await invoke("listar_copias"), await invoke("estado_datos")];
  const msg = h("p", { class: "vid-ayuda" });
  const fecha = (n) => { const m = n.match(/usuario-(\d{4})(\d{2})(\d{2})-(\d{2})(\d{2})/); return m ? `${m[3]}/${m[2]}/${m[1]} ${m[4]}:${m[5]} UTC` : n; };
  const motivo = { auto: "automática", manual: "manual", "antes-de-actualizar": "antes de actualizar", "antes-de-restaurar": "antes de restaurar" };
  const nueva = async () => { try { msg.textContent = await invoke("crear_copia"); await panelCarpetas(cont); } catch (e) { msg.textContent = String(e); } };
  const restaurar = async (c) => {
    if (restaurar._pend !== c.ruta) { restaurar._pend = c.ruta; msg.textContent = `Pulsa «Restaurar» otra vez para volver a la copia del ${fecha(c.nombre)} (${c.videos} vídeos, ${c.marcas} marcas). Antes se guardará una copia de lo actual.`; return; }
    restaurar._pend = null; try { msg.textContent = await invoke("restaurar_copia", { ruta: c.ruta }); } catch (e) { msg.textContent = String(e); }
  };
  return h("div", { class: "card", style: { marginTop: "14px" } }, h("h2", { text: "Copias de seguridad de tus anotaciones" }),
    h("p", { class: "vid-ayuda", text: `Se guardan solas (al actualizar, antes de restaurar y cada pocas horas de uso) en la carpeta «copias» de FEBstats, fuera de la aplicación, así que no se borra al desinstalarla: ${est.carpeta_segura ? est.carpeta_segura + "/copias" : "no disponible"}. Incluyen vídeos, vínculos, marcas, botones y chats.` }),
    h("div", { class: "vid-herr" }, h("button", { type: "button", class: "btn primario", onclick: nueva }, "Crear copia ahora")),
    copias.length ? h("div", null, copias.slice(0, 15).map((c) => h("div", { class: "cop-fila" }, h("span", { text: `${fecha(c.nombre)} · ${motivo[c.motivo.replace(/-\d+$/, "")] || c.motivo}` }), h("span", { class: "vid-ayuda", text: `${c.videos} vídeos · ${c.marcas} marcas` }),
      h("button", { type: "button", class: "btn", onclick: () => restaurar(c) }, "Restaurar")))) : h("p", { class: "vid-ayuda", text: "Aún no hay copias." }),
    h("p", { class: "vid-ayuda", text: `Esquema de datos ${est.esquema} · compilación ${est.compilacion}` }), msg);
}
// Acceso desde el iPad: el Mac sirve la app por la red local, protegida con PIN.
async function panelRemoto(cont) {
  const r = await invoke("leer_remoto");
  const msg = h("p", { class: "vid-ayuda" });
  const act = h("input", { type: "checkbox", checked: r.deseado || null });
  const puerto = h("input", { type: "number", value: r.puerto, min: 1024, max: 65535 });
  const pin = h("input", { type: "text", value: r.pin, inputmode: "numeric", placeholder: "PIN (se genera uno si lo dejas vacío)" });
  const guardar = async () => { msg.textContent = "Guardando…"; try { await invoke("guardar_remoto", { activo: act.checked, puerto: Number(puerto.value), pin: pin.value || null }); await panelRemoto(cont); } catch (e) { msg.textContent = String(e); } };
  cont.replaceChildren(h("div", { class: "card ia-ajustes" },
    h("p", { class: "vid-ayuda", text: "Deja que el iPad use esta aplicación a través de la red Wi-Fi: el Mac aporta los datos, la IA y los vídeos; el iPad es la pantalla (marcar vídeo, consultar datos, preguntar a la IA). Ambos deben estar en la misma red (o el Mac conectado al punto de acceso del iPhone)." }),
    h("label", { class: "ia-breve" }, act, " Permitir acceso desde otros dispositivos"),
    h("div", { class: "ia-fila" }, h("label", null, "Puerto", puerto), h("label", null, "PIN", pin)),
    h("div", { class: "vid-herr" }, h("button", { type: "button", class: "btn primario", onclick: guardar }, "Guardar"),
      h("button", { type: "button", class: "btn", onclick: () => { pin.value = String(Math.floor(Math.random() * 900000) + 100000); } }, "Nuevo PIN")),
    r.activo ? h("div", { class: "dat-ok" }, h("b", { text: "Activo. En el iPad abre Safari y escribe una de estas direcciones:" }), ...r.urls.map((u) => h("p", null, h("code", { class: "rut-ruta", text: u }))),
      h("p", { class: "vid-ayuda", text: "Introduce el PIN. Para instalarla como app: botón Compartir → «Añadir a pantalla de inicio». La primera vez, macOS puede preguntar si permite conexiones entrantes: pulsa Permitir." })) : h("p", { class: "vid-ayuda", text: "Desactivado." }),
    h("p", { class: "vid-ayuda", text: "Seguridad: la conexión no está cifrada (HTTP); úsalo solo en redes de confianza. Desde el iPad no se pueden cambiar la clave de IA, las carpetas ni este acceso." }), msg));
}

// iPad / modo local: importar los paquetes de datos exportados desde la app del Mac.
async function panelImportar(cont) {
  const grupos = await invoke("listar_grupos"); const msg = h("p", { class: "vid-ayuda" });
  const input = h("input", { type: "file", multiple: true, accept: ".json,application/json", class: "oculto", onchange: async () => {
    msg.textContent = "Importando…";
    try { const n = await importarPaquetes([...input.files]); msg.textContent = `Importado: ${n.join(" · ")}`; await panelImportar(cont); cont.append(msg); } catch (e) { msg.textContent = String(e.message || e); }
  } });
  cont.replaceChildren(h("div", { class: "card" }, h("h2", { text: "Importar datos" }),
    h("ol", { class: "vid-ayuda" }, h("li", { text: "En el Mac: Ajustes → Descarga de datos → «Llevar los datos al iPad» → Exportar." }), h("li", { text: "Pasa el archivo al iPad (AirDrop, iCloud Drive o cable)." }),
      h("li", { text: "Aquí: «Elegir archivo(s)» y selecciona ese archivo. Puedes importar varios; los datos se guardan en este iPad y funcionan sin conexión." })),
    h("div", { class: "vid-herr" }, h("button", { type: "button", class: "btn primario", onclick: () => input.click() }, "Elegir archivo(s)…")), input, msg),
    h("div", { class: "card" }, h("h2", { text: "Datos en este iPad" }),
      grupos.length ? h("table", { class: "dat-tabla" }, h("thead", null, h("tr", null, ["Competición", "Grupo", "Temporada", "Partidos", ""].map((t) => h("th", { text: t })))),
        h("tbody", null, grupos.map((g) => h("tr", null, h("td", { text: g.competicion }), h("td", { text: String(g.grupo).replace(/"/g, "") }), h("td", { text: g.temporada }), h("td", { text: g.partidos ?? "" }),
          h("td", null, g.publicado || g.incluido ? h("span", { class: "vid-ayuda", text: g.incluido ? "incluido en el archivo" : "publicado" }) : h("button", { type: "button", class: "btn fantasma", onclick: async () => { await invoke("borrar_grupo", { db: g.db }); await panelImportar(cont); } }, "Quitar")))))) : h("p", { class: "vid-ayuda", text: "Aún no hay datos. Importa un paquete." })));
}
