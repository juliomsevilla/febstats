// Ajustes: almacenamiento, persistencia, datos y diagnóstico.
import { h, limpiar, btn, toast, confirmar, dialogo } from "../util.js";
import { app, cargarTodo, borrarSesion } from "../estado.js";
import { idb, pedirPersistencia } from "../idb.js";
import { APP_VERSION } from "../grupo.js";
import { navegar } from "../app.js";

export function vistaAjustes(cont) {
  const raiz = h("div", { class: "ajustes" });
  cont.append(raiz);
  const pintar = () => { limpiar(raiz); construir(); };
  construir();
  return null;

  function construir() {
    const p = app.persistencia || {};
    raiz.append(
      h("div", { class: "lista-cab" },
        h("div", null, h("h1", { text: "Ajustes" }), h("p", { class: "sub", text: "Todo se guarda en este iPad. No hay cuentas, ni nube, ni red." })),
        h("span", { class: "pill ok", text: `v${APP_VERSION}` })),
      h("div", { class: "rejilla dos" },
        h("article", { class: "card" },
          h("h2", { text: "Almacenamiento" }),
          h("dl", { class: "datos-clave" },
            h("div", null, h("dt", { text: "Persistencia" }), h("dd", null, p.persistido ? h("span", { class: "pill ok", text: "Concedida" }) : h("span", { class: "pill aviso", text: "No concedida" }))),
            h("div", null, h("dt", { text: "Uso" }), h("dd", { text: p.uso != null ? `${(p.uso / 1048576).toFixed(1)} MB` : "—" })),
            h("div", null, h("dt", { text: "Cuota" }), h("dd", { text: p.cuota ? `${(p.cuota / 1048576).toFixed(0)} MB` : "—" })),
            h("div", null, h("dt", { text: "Grupos" }), h("dd", { text: String(app.grupos.length) })),
            h("div", null, h("dt", { text: "Sesiones" }), h("dd", { text: String(app.sesiones.length) }))),
          h("p", { class: "sub", text: "iOS puede liberar almacenamiento si no usas la app durante semanas. Instálala en la pantalla de inicio y exporta el .db de cada partido finalizado desde Inicio." }),
          h("div", { class: "acciones" },
            btn("Volver a pedir persistencia", async () => { app.persistencia = await pedirPersistencia(); toast(app.persistencia.persistido ? "Persistencia concedida." : "El sistema no la ha concedido.", app.persistencia.persistido ? "ok" : "aviso"); pintar(); }, { clase: "btn" }),
            btn("Ver estado del esquema", diagnostico, { clase: "btn" }))),
        h("article", { class: "card" },
          h("h2", { text: "Datos importados" }),
          app.grupos.length ? h("ul", { class: "lista-simple" }, app.grupos.map((g) => h("li", null,
            h("div", null, h("b", { text: `${g.resumen?.competicion || ""} · ${g.resumen?.grupo || ""}` }), h("span", { class: "sub", text: `${g.resumen?.temporada || ""} · ${g.resumen?.partidos || 0} partidos · ${g.resumen?.tiros || 0} tiros` })),
            h("div", { class: "acciones" },
              btn("Quitar", async () => {
                const ok = await confirmar("Quitar grupo", `Se borrarán los datos de «${g.resumen?.competicion}» de este iPad.`, { ok: "Quitar", peligro: true });
                if (!ok) return;
                await idb.del("grupos", g.id);
                if (app.grupoId === g.id) { app.grupo = null; app.grupoId = null; }
                await cargarTodo(); pintar();
              }, { clase: "btn pequeno fantasma" }))))) : h("p", { class: "sub", text: "No hay grupos." }),
          h("div", { class: "acciones" }, btn("Importar otro archivo", () => navegar("inicio"), { clase: "btn", icon: "importar" }))),
        h("article", { class: "card" },
          h("h2", { text: "Sesiones" }),
          app.sesiones.length ? h("ul", { class: "lista-simple" }, app.sesiones.slice(0, 12).map((s) => h("li", null,
            h("div", null, h("b", { text: `${s.local.nombre} vs ${s.visitante.nombre}` }), h("span", { class: "sub", text: `${s.estado || ""} · ${s.inicio || ""}` })),
            h("div", { class: "acciones" },
              btn("Borrar", async () => {
                const ok = await confirmar("Borrar sesión", "Se borrará esta sesión del iPad. La exportación de partidos finalizados está en Inicio y solo está disponible para partidos finalizados.", { ok: "Borrar", peligro: true });
                if (ok) { await borrarSesion(s.id); await cargarTodo(); pintar(); }
              }, { clase: "btn pequeno fantasma" }))))) : h("p", { class: "sub", text: "No hay sesiones." })),
        h("article", { class: "card" },
          h("h2", { text: "Cómo funciona" }),
          h("div", { class: "md", html: `
<p><b>Fuente de verdad:</b> cada toque se añade a un registro de eventos en IndexedDB y se proyecta al instante al boxscore. Si cierras la app, se rejuega al abrir.</p>
<p><b>Exportación:</b> el .db contiene las tablas de FEBstats (mismo esquema y orden de columnas) más las tablas <code>directo_*</code> y tres columnas aditivas: <code>tiros.puntos</code>, <code>tiros.evento_uid</code> y <code>tiros.sesion_uid</code>.</p>
<p><b>Importación en el Mac:</b> el comando <code>importar_directo(ruta)</code> copia solo el namespace <code>directo_*</code> a <code>usuario.db</code>. No toca las tablas FEB.</p>
<p><b>Privacidad:</b> no hay telemetría, ni CDN, ni peticiones de red. La única red es la descarga inicial de la app desde GitHub Pages.</p>`})
      )),
      h("p", { class: "nota-pie", text: "FEBstats Directo · PWA offline para iPad. Pista FIBA, coordenadas plegadas Xinv/Yinv, prórrogas de 5:00." }),
    );
  }

  function diagnostico() {
    try {
      const db = app.grupo;
      if (!db) { toast("No hay grupo cargado.", "aviso"); return; }
      const integ = db.all("PRAGMA integrity_check")[0];
      const tablas = db.all("SELECT name FROM sqlite_master WHERE type='table' ORDER BY name").map((r) => r.name);
      const cols = {};
      for (const t of ["tiros", "jugador_stats", "partidos", "equipos", "plantilla"]) cols[t] = db.all(`PRAGMA table_info(${t})`).map((c) => c.name);
      dialogo("Estado del esquema", h("div", { class: "diagnostico" },
        h("p", null, h("b", { text: "Integridad: " }), String(Object.values(integ || {})[0] || "—")),
        h("p", null, h("b", { text: "Tablas: " }), tablas.join(", ")),
        h("div", { class: "tabla-wrap" }, h("table", { class: "tabla" },
          h("thead", null, h("tr", null, h("th", { text: "Tabla" }), h("th", { text: "Columnas" }))),
          h("tbody", null, Object.entries(cols).map(([t, c]) => h("tr", null, h("td", { text: t }), h("td", { class: "cols", text: c.join(", ") }))))))));
    } catch (e) { toast("Diagnóstico: " + e.message, "error"); }
  }
}
