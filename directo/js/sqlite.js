// Envoltorio de sql.js (SQLite compilado a WebAssembly). El .wasm se sirve desde vendor/,
// nunca desde una CDN: la app funciona sin conexión.

let SQL = null;
let cargando = null;

export function initSQL() {
  if (SQL) return Promise.resolve(SQL);
  if (cargando) return cargando;
  cargando = new Promise((resolver, rechazar) => {
    if (!window.initSqlJs) { rechazar(new Error("Falta vendor/sql-wasm.js")); return; }
    window.initSqlJs({ locateFile: (f) => new URL(`../vendor/${f}`, import.meta.url).href })
      .then((m) => { SQL = m; resolver(m); })
      .catch(rechazar);
  });
  return cargando;
}

export class DB {
  constructor(sqlDb) { this.db = sqlDb; }

  static async nuevo() {
    const SQL = await initSQL();
    return new DB(new SQL.Database());
  }

  static async desdeBytes(bytes) {
    const SQL = await initSQL();
    return new DB(new SQL.Database(bytes));
  }

  run(sql, params = []) { this.db.run(sql, params); }

  exec(sql) { return this.db.exec(sql); }

  /** Filas como objetos. */
  all(sql, params = []) {
    const st = this.db.prepare(sql);
    try {
      st.bind(params);
      const out = [];
      while (st.step()) out.push(st.getAsObject());
      return out;
    } finally { st.free(); }
  }

  one(sql, params = []) { return this.all(sql, params)[0] || null; }

  valor(sql, params = []) {
    const r = this.all(sql, params)[0];
    return r ? Object.values(r)[0] : null;
  }

  columnas(tabla) {
    try { return this.all(`PRAGMA table_info(${tabla})`).map((r) => r.name); } catch { return []; }
  }

  /** Inserta muchas filas con una sola sentencia preparada. */
  insertar(tabla, filas, { reemplazar = false } = {}) {
    if (!filas || !filas.length) return 0;
    const cols = Object.keys(filas[0]);
    const sql = `${reemplazar ? "INSERT OR REPLACE" : "INSERT"} INTO ${tabla} (${cols.join(",")}) VALUES (${cols.map(() => "?").join(",")})`;
    const st = this.db.prepare(sql);
    try {
      for (const f of filas) st.run(cols.map((c) => (f[c] === undefined ? null : f[c])));
    } finally { st.free(); }
    return filas.length;
  }

  transaccion(fn) {
    this.db.run("BEGIN");
    try { const r = fn(); this.db.run("COMMIT"); return r; }
    catch (e) { try { this.db.run("ROLLBACK"); } catch { /* nada */ } throw e; }
  }

  /** Uint8Array con la base completa (snapshot). */
  bytes() {
    try { this.db.run("VACUUM"); } catch { /* no crítico */ }
    return this.db.export();
  }

  cerrar() { try { this.db.close(); } catch { /* ya cerrada */ } }
}

export const bytesABlob = (bytes, tipo = "application/vnd.sqlite3") => new Blob([bytes], { type: tipo });
export const blobABytes = async (blob) => new Uint8Array(await blob.arrayBuffer());
export const bytesABase64 = (bytes) => {
  let s = "";
  const paso = 0x8000;
  for (let i = 0; i < bytes.length; i += paso) s += String.fromCharCode.apply(null, bytes.subarray(i, i + paso));
  return btoa(s);
};
export const base64ABytes = (b64) => {
  const s = atob(b64);
  const out = new Uint8Array(s.length);
  for (let i = 0; i < s.length; i++) out[i] = s.charCodeAt(i);
  return out;
};
