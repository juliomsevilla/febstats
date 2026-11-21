// Capa de acceso a datos del usuario, FEB e IA. Tres modos:
//  - app de escritorio (Tauri): comandos nativos;
//  - remoto (iPad u otro dispositivo en la misma red): los mismos comandos por HTTP contra la app del Mac, con PIN;
//  - web estática publicada: sin backend (enEscritorio = false).
import { h, dialogo } from "./util.js";
import { llamarLocal, escucharLocal } from "./local.js";

const T = window.__TAURI__;

async function llamarRemoto(cmd, args) {
  const r = await fetch(`/rpc/${cmd}`, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify(args || {}) });
  if (r.status === 401) { pedirPin(); return new Promise(() => {}); }
  if (!r.ok) throw await r.text();
  const t = await r.text(); return t ? JSON.parse(t) : null;
}

// Pantalla de PIN para acceder a la app del Mac desde el iPad.
function pedirPin() {
  if (document.getElementById("pin-pantalla")) return;
  const msg = h("p", { class: "vid-ayuda" });
  const pin = h("input", { type: "password", inputmode: "numeric", autocomplete: "one-time-code", placeholder: "PIN", class: "pin-in" });
  const entrar = async () => {
    msg.textContent = "Comprobando…";
    const r = await fetch("/login", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ pin: pin.value }) });
    if (r.ok) location.reload(); else msg.textContent = r.status === 429 ? await r.text() : "PIN incorrecto.";
  };
  pin.addEventListener("keydown", (e) => { if (e.key === "Enter") entrar(); });
  document.body.append(h("div", { id: "pin-pantalla" }, h("div", { class: "pin-caja" }, h("b", { text: "FEBstats" }), h("p", { text: "Introduce el PIN que aparece en Ajustes → Acceso iPad del Mac." }), pin,
    h("button", { type: "button", class: "btn primario", onclick: entrar }, "Entrar"), msg)));
  pin.focus();
}

// Modos: "nativo" (app del Mac), "remoto" (otro dispositivo usando la app del Mac por red), "local" (iPad u otro navegador:
// todo en el propio dispositivo, sin Mac), "web" (servidor Python de desarrollo con su propia API).
let modo = T ? "nativo" : "local";
if (!T && location.protocol !== "file:") { // (como archivo suelto no hay servidor que consultar)
  try {
    const r = await fetch("/rpc/ping", { method: "POST", headers: { "content-type": "application/json" }, body: "{}" });
    if (r.status === 200) modo = "remoto"; else if (r.status === 401) { modo = "remoto"; pedirPin(); await new Promise(() => {}); }
  } catch { /* sin app del Mac */ }
  if (modo === "local") { try { const r = await fetch("/api/grupos"); if (r.ok && (r.headers.get("content-type") || "").includes("json")) modo = "web"; } catch { /* no hay servidor Python */ } }
}

export const MODO = modo;
export const enRemoto = modo === "remoto";
export const enLocal = modo === "local";
export const enEscritorio = modo !== "web";            // hay un backend (nativo, remoto o local)
export const conVideo = modo === "nativo" || modo === "remoto"; // vídeo y capturas solo con la app del Mac
export const puedeExportar = modo === "nativo" || modo === "web";     // CSV/PNG de tablas y gráficos: solo en el Mac (no en el iPad)
export const puedeDescargar = modo === "nativo" || modo === "remoto"; // el scraper solo corre en el Mac
export const invoke = (cmd, args) => (T ? T.core.invoke(cmd, args) : modo === "local" ? llamarLocal(cmd, args) : llamarRemoto(cmd, args));
export const urlVideo = (v) => (T ? T.core.convertFileSrc(v.ruta) : `/video/${v.id}`);

let fuente;
export async function escuchar(nombre, cb) {
  if (T) return T.event.listen(nombre, cb);
  if (modo === "local") return escucharLocal(nombre, cb);
  fuente ||= new EventSource("/eventos");
  fuente.addEventListener(nombre, (ev) => { try { cb({ payload: JSON.parse(ev.data) }); } catch { /* ignorar */ } });
}

export async function elegirCarpeta(inicial) { return T ? await T.dialog.open({ directory: true, multiple: false, defaultPath: inicial || undefined }) : null; }

export async function elegirVideo() {
  if (T) {
    let inicial; try { inicial = (await invoke("leer_rutas")).rutas.find((r) => r.clave === "videos")?.ruta; } catch { /* sin carpeta */ }
    return await T.dialog.open({ multiple: false, defaultPath: inicial, filters: [{ name: "Vídeo", extensions: ["mp4", "m4v", "mov", "webm", "mkv"] }] });
  }
  // iPad: el archivo está en el Mac; se elige entre los de su carpeta de vídeos
  const lista = await invoke("listar_videos_disponibles");
  return await new Promise((res) => {
    const d = dialogo("Elige un vídeo del Mac", lista.length ? h("div", { class: "vid-elegir" }, lista.map((v) => h("button", { type: "button", class: "btn", onclick: () => { res(v.ruta); d.close(); } }, `${v.nombre} · ${v.mb} MB`)))
      : h("p", { text: "No hay vídeos en la carpeta de vídeos del Mac. Copia ahí los archivos (Ajustes → Carpetas en el Mac) y vuelve a intentarlo." }));
    d.addEventListener("close", () => res(null), { once: true });
  });
}

// Guarda un archivo (CSV, PNG…) a partir de una URL de datos. En la app del Mac pregunta dónde; en un navegador lo descarga.
const aBase64 = (dataUrl) => {
  if (/;base64,/.test(dataUrl)) return dataUrl.split(",")[1];
  const bytes = new TextEncoder().encode(decodeURIComponent(dataUrl.slice(dataUrl.indexOf(",") + 1)));
  let bin = ""; for (let i = 0; i < bytes.length; i += 0x8000) bin += String.fromCharCode(...bytes.subarray(i, i + 0x8000)); return btoa(bin);
};
export async function guardarArchivo(nombre, dataUrl) {
  if (T) {
    const ext = nombre.split(".").pop();
    const ruta = await T.dialog.save({ defaultPath: nombre, filters: [{ name: ext.toUpperCase(), extensions: [ext] }] });
    if (!ruta) return false;
    await T.core.invoke("guardar_archivo", { ruta, base64: aBase64(dataUrl) });
    return true;
  }
  const a = h("a", { href: dataUrl, download: nombre }); document.body.append(a); a.click(); a.remove(); return true;
}
