// Arranque, navegación y latido del reloj.
import { h, limpiar, icono, toast } from "./util.js";
import { app, cargarTodo, cargarSesion, relojAhora, pararReloj, suscribir, etiquetaPeriodo } from "./estado.js";
import { pedirPersistencia } from "./idb.js";
import { vistaInicio } from "./views/inicio.js";
import { vistaNuevo } from "./views/nuevo.js";
import { vistaPartido } from "./views/partido.js";
import { vistaBoxscore } from "./views/boxscore.js";
import { vistaNotas } from "./views/notas.js";
import { vistaAjustes } from "./views/ajustes.js";

const RUTAS = {
  inicio: vistaInicio,
  nuevo: vistaNuevo,
  partido: vistaPartido,
  boxscore: vistaBoxscore,
  notas: vistaNotas,
  ajustes: vistaAjustes,
};

const NAV = [
  ["inicio", "Inicio", "inicio"],
  ["partido", "Directo", "partido"],
  ["boxscore", "Boxscore", "boxscore"],
  ["notas", "Notas", "notas"],
  ["ajustes", "Ajustes", "ajustes"],
];

let vistaActual = null;
let limpiarVista = null;

function rutaActual() {
  const t = location.hash.replace(/^#\/?/, "").split("/");
  return { nombre: RUTAS[t[0]] ? t[0] : "inicio", params: t.slice(1) };
}

export function navegar(nombre, ...params) {
  const destino = "#/" + [nombre, ...params].filter(Boolean).join("/");
  if (location.hash === destino) renderRuta(); else location.hash = destino;
}

function aplicarTema(t) {
  if (t === "light" || t === "dark") document.documentElement.dataset.theme = t;
  else delete document.documentElement.dataset.theme;
}

function alternarTema() {
  const actual = document.documentElement.dataset.theme;
  const oscuro = actual ? actual === "dark" : matchMedia("(prefers-color-scheme: dark)").matches;
  const nuevo = oscuro ? "light" : "dark";
  aplicarTema(nuevo);
  try { localStorage.setItem("tema", nuevo); } catch { /* sin almacenamiento */ }
}

function construirShell() {
  const cab = h("header", { class: "cab" },
    h("a", { class: "marca", href: "#/inicio", "aria-label": "FEBstats Directo" },
      h("img", { src: "icons/icon.svg", alt: "", class: "logo" }),
      h("div", null, h("b", { text: "FEBstats" }), h("span", { text: "DIRECTO" }))),
    h("div", { class: "cab-sesion", id: "cab-sesion" }),
    h("button", { type: "button", class: "btn fantasma tema-btn", title: "Cambiar tema claro/oscuro", "aria-label": "Cambiar tema claro/oscuro", onclick: alternarTema }, icono("sol")),
    h("nav", { class: "nav", role: "navigation", "aria-label": "Secciones" },
      NAV.map(([ruta, etiqueta, ic]) => h("a", { href: `#/${ruta}`, dataset: { ruta }, "aria-label": etiqueta, title: etiqueta }, icono(ic), h("span", { text: etiqueta })))));
  document.body.prepend(cab);
  const main = h("main", { id: "vista", tabindex: "-1" });
  document.body.append(main);
  document.body.append(h("dialog", { id: "dlg", class: "dlg" }));
  document.body.append(h("div", { id: "toast", class: "toast", role: "status", "aria-live": "polite" }));
}

function renderRuta() {
  const { nombre, params } = rutaActual();
  vistaActual = nombre;
  if (limpiarVista) { try { limpiarVista(); } catch (e) { console.error(e); } limpiarVista = null; }
  const cont = document.getElementById("vista");
  limpiar(cont);
  document.querySelectorAll(".nav a").forEach((a) => a.setAttribute("aria-current", a.dataset.ruta === nombre ? "page" : "false"));
  const vista = RUTAS[nombre];
  try {
    const r = vista(cont, params);
    if (typeof r === "function") limpiarVista = r;
    else if (r && typeof r.limpiar === "function") limpiarVista = r.limpiar;
  } catch (e) {
    console.error(e);
    cont.append(h("div", { class: "vacio" }, h("strong", { text: "No se pudo abrir esta pantalla" }), h("p", { text: e.message })));
  }
  cont.focus({ preventScroll: true });
  actualizarCabecera();
  window.scrollTo(0, 0);
}

export function actualizarCabecera() {
  const c = document.getElementById("cab-sesion");
  if (!c) return;
  limpiar(c);
  if (!app.sesion) {
    c.append(h("span", { class: "pill suave", text: app.grupos.length ? `${app.grupos.length} grupo(s) importado(s)` : "Sin datos importados" }));
    return;
  }
  const s = app.sesion;
  const proy = app.proy;
  const pts = proy ? `${proy.pts.local}–${proy.pts.visitante}` : "0–0";
  c.append(
    h("a", { href: "#/partido", class: "cab-partido", title: "Volver al partido en directo", "aria-label": "Volver al partido en directo" },
      h("span", { class: "cab-eq", text: s.local.nombre }),
      h("b", { text: pts }),
      h("span", { class: "cab-eq der", text: s.visitante.nombre }),
      h("span", { class: "cab-reloj" },
        h("span", { text: etiquetaPeriodo(s.reloj), class: "pill" }),
        h("b", { "data-reloj": "cab", text: "0:00" }))),
  );
  actualizarRelojes();
}

function actualizarRelojes() {
  if (!app.sesion) return;
  const v = relojAhora(app.sesion.reloj);
  const m = Math.floor(Math.max(0, v) / 60), sg = Math.floor(Math.max(0, v) % 60);
  const texto = `${m}:${String(sg).padStart(2, "0")}`;
  document.querySelectorAll("[data-reloj]").forEach((el) => { el.textContent = texto; });
  const s = app.sesion;
  document.querySelectorAll("[data-barra-reloj]").forEach((el) => {
    const dur = s.reloj.tipoPeriodo === "prorroga" ? 300 : 600;
    el.style.setProperty("--pct", `${Math.max(0, Math.min(100, (v / dur) * 100))}%`);
  });
}

let ultimoTick = 0;
function latido() {
  if (!app.sesion) return;
  actualizarRelojes();
  const v = relojAhora(app.sesion.reloj);
  if (!app.soloConsulta && app.sesion.reloj.corriendo && v <= 0.05 && Date.now() - ultimoTick > 1200) {
    ultimoTick = Date.now();
    pararReloj({ automatico: true }).then(() => {
      toast("Fin del tiempo. Pulsa «Siguiente cuarto» o ajusta el reloj.", "aviso");
    });
  }
  const m = Math.floor(Math.max(0, v) / 60), sg = Math.floor(Math.max(0, v) % 60);
  if (app.sesion.reloj.corriendo) document.title = `${m}:${String(sg).padStart(2, "0")} · FEBstats Directo`;
  else document.title = "FEBstats Directo";
}

async function arrancar() {
  try { app.soloConsulta = new URL(location.href).searchParams.has("notas"); } catch { app.soloConsulta = false; }
  try { aplicarTema(localStorage.getItem("tema")); } catch { /* sin almacenamiento */ }
  construirShell();
  const main = document.getElementById("vista");
  main.append(h("div", { class: "vacio" }, h("strong", { text: "Cargando…" }), h("p", { text: "Abriendo los datos del iPad." })));
  try {
    await Promise.race([
      cargarTodo(),
      new Promise((_, rechazar) => setTimeout(() => rechazar(new Error("La base de datos está abierta en otra pestaña de FEBstats Directo. Ciérrala y vuelve a abrir esta.")), 8000)),
    ]);
  } catch (e) {
    console.error(e);
    toast("No se pudo abrir el almacenamiento local.", "error");
    const m = document.getElementById("vista");
    if (m) m.replaceChildren(h("div", { class: "vacio" }, h("strong", { text: "No se pudo abrir la base de datos" }), h("p", { text: e.message }), h("button", { type: "button", class: "btn primario", onclick: () => location.reload() }, "Recargar")));
  }
  const ultima = (() => { try { return localStorage.getItem("fd:sesion"); } catch { return null; } })();
  if (ultima) {
    try { await cargarSesion(ultima); } catch { /* sesión borrada */ }
  }
  window.addEventListener("hashchange", renderRuta);
  suscribir(() => { actualizarCabecera(); });
  if (!location.hash) location.hash = "#/inicio";
  renderRuta();
  setInterval(latido, 500);
  const guardarReloj = () => {
    if (app.soloConsulta) return;
    if (app.sesion?.reloj.corriendo) {
      // Al salir de la app el reloj se para en el valor actual: no debe seguir
      // descontando mientras el iPad está bloqueado o en otra app.
      const v = relojAhora(app.sesion.reloj);
      app.sesion.reloj = { ...app.sesion.reloj, reloj: Math.max(0, v), corriendo: false, desde: null };
      import("./estado.js").then((m) => m.guardarSesion()).catch(() => {});
    }
  };
  document.addEventListener("visibilitychange", () => { if (document.visibilityState === "hidden") guardarReloj(); });
  window.addEventListener("pagehide", guardarReloj);
  const p = await pedirPersistencia();
  app.persistencia = p;
  registrarSW();
}

function registrarSW() {
  if (!("serviceWorker" in navigator)) return;
  const registrar = () => navigator.serviceWorker.register("sw.js").catch((e) => console.warn("SW:", e.message));
  // `arrancar` es asíncrono: el evento load puede haber pasado ya.
  if (document.readyState === "complete") registrar();
  else window.addEventListener("load", registrar, { once: true });
}

document.addEventListener("DOMContentLoaded", arrancar);
