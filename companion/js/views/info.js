// Pestañas de Ajustes: Ayuda (guía + novedades), Autoría y Licencia de uso. Texto incluido en la propia aplicación (también en el iPad).
import { h } from "../util.js";
import { md } from "../md.js";
import { AYUDA, LICENCIA } from "../ayuda-datos.js";
import { MODO } from "../api.js";

const AUTOR = { nombre: "Julio M. Sevilla", correo: "julio@jsevilla.es", anio: "2026" };

export async function panelAyuda(cont) {
  let actual = AYUDA[0].id;
  const nav = h("nav", { class: "ayu-nav", "aria-label": "Capítulos de la ayuda" });
  const cuerpo = h("article", { class: "ayu-cuerpo md" });
  const ir = (id) => {
    actual = AYUDA.some((c) => c.id === id) ? id : AYUDA[0].id;
    nav.replaceChildren(...AYUDA.map((c) => h("button", { type: "button", class: "ayu-cap", "aria-current": c.id === actual ? "true" : null, onclick: () => ir(c.id) }, c.titulo)));
    const cap = AYUDA.find((c) => c.id === actual);
    cuerpo.innerHTML = md(cap.md, { blando: true });
    cuerpo.querySelectorAll(".md-cap").forEach((a) => a.addEventListener("click", (e) => { e.preventDefault(); ir(a.dataset.cap); window.scrollTo(0, 0); }));
    cuerpo.scrollTop = 0;
    const i = AYUDA.findIndex((c) => c.id === actual);
    cuerpo.append(h("div", { class: "ayu-pie" },
      i > 0 ? h("button", { type: "button", class: "btn", onclick: () => { ir(AYUDA[i - 1].id); window.scrollTo(0, 0); } }, `← ${AYUDA[i - 1].titulo}`) : h("span"),
      i < AYUDA.length - 1 ? h("button", { type: "button", class: "btn", onclick: () => { ir(AYUDA[i + 1].id); window.scrollTo(0, 0); } }, `${AYUDA[i + 1].titulo} →`) : null));
  };
  cont.replaceChildren(h("div", { class: "ayu" }, nav, cuerpo));
  ir(actual);
}

export async function panelAutoria(cont) {
  let version = ""; try { version = window.__TAURI__?.app ? await window.__TAURI__.app.getVersion() : ""; } catch { /* sin versión */ }
  const msg = h("span", { class: "vid-ayuda" });
  cont.replaceChildren(h("div", { class: "card ayu-autoria" },
    h("h2", { text: "FEBstats" }),
    h("p", { class: "vid-ayuda", text: `Estadísticas, consulta en el banquillo, análisis de vídeo y asistente de IA para entrenadores de baloncesto.${version ? " · Versión " + version : ""}${MODO === "local" ? " · aplicación para iPad" : ""}` }),
    h("dl", { class: "ayu-dl" },
      h("dt", { text: "Autor" }), h("dd", { text: AUTOR.nombre }),
      h("dt", { text: "Contacto" }), h("dd", null, AUTOR.correo, " ", h("button", { type: "button", class: "btn fantasma", onclick: async () => { try { await navigator.clipboard.writeText(AUTOR.correo); msg.textContent = "Copiado."; } catch { msg.textContent = AUTOR.correo; } } }, "Copiar"), msg),
      h("dt", { text: "Derechos" }), h("dd", { text: `© ${AUTOR.anio} ${AUTOR.nombre}. Todos los derechos reservados.` })),
    h("p", { class: "vid-ayuda", text: "Aplicación protegida por derechos de autor. No puede usarse, copiarse, distribuirse ni comercializarse sin el consentimiento previo y por escrito del autor. Consulta la pestaña Licencia." }),
    h("h3", { text: "Componentes de terceros" }),
    h("p", { class: "vid-ayuda", text: "Incluye componentes de código abierto (entre ellos Tauri, Rust y SQLite), que se rigen por sus propias licencias. FEBstats es independiente y no está afiliado ni respaldado por la Federación Española de Baloncesto; los datos de competiciones pertenecen a sus titulares." })));
}

export async function panelLicencia(cont) {
  const cuerpo = h("article", { class: "ayu-cuerpo md" });
  cuerpo.innerHTML = md(LICENCIA, { blando: true });
  cont.replaceChildren(h("div", { class: "card" }, cuerpo));
}
