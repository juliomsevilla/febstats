// IndexedDB: fuente de verdad de la sesión (registro de eventos append-only) y almacén de
// grupos importados. Todo local; nada sale del iPad.

const NOMBRE = "febstats-directo";
const VERSION = 2;
let _db = null;

function abrir() {
  if (_db) return Promise.resolve(_db);
  return new Promise((resolver, rechazar) => {
    const r = indexedDB.open(NOMBRE, VERSION);
    r.onupgradeneeded = () => {
      const db = r.result;
      if (!db.objectStoreNames.contains("grupos")) db.createObjectStore("grupos", { keyPath: "id" });
      if (!db.objectStoreNames.contains("sesiones")) {
        const s = db.createObjectStore("sesiones", { keyPath: "id" });
        s.createIndex("grupo", "grupo");
      }
      if (!db.objectStoreNames.contains("eventos")) {
        const e = db.createObjectStore("eventos", { keyPath: "uid" });
        e.createIndex("sesion", "sesion");
      }
      if (!db.objectStoreNames.contains("extras")) db.createObjectStore("extras", { keyPath: "id" });
      if (!db.objectStoreNames.contains("meta")) db.createObjectStore("meta", { keyPath: "clave" });
      if (!db.objectStoreNames.contains("notas")) {
        const n = db.createObjectStore("notas", { keyPath: "id" });
        n.createIndex("partido", "partido");
        n.createIndex("modificada", "modificada");
      }
    };
    r.onsuccess = () => { _db = r.result; resolver(_db); };
    r.onerror = () => rechazar(r.error);
  });
}

function tx(store, modo, fn) {
  return abrir().then((db) => new Promise((resolver, rechazar) => {
    const t = db.transaction(store, modo);
    const s = t.objectStore(store);
    let out;
    try { out = fn(s); } catch (e) { rechazar(e); return; }
    t.oncomplete = () => resolver(out && out.result !== undefined ? out.result : out);
    t.onerror = () => rechazar(t.error);
    t.onabort = () => rechazar(t.error);
  }));
}

const pedir = (req) => new Promise((resolver, rechazar) => { req.onsuccess = () => resolver(req.result); req.onerror = () => rechazar(req.error); });

export const idb = {
  async get(store, clave) { return tx(store, "readonly", (s) => pedir(s.get(clave))); },
  async put(store, valor) { return tx(store, "readwrite", (s) => pedir(s.put(valor))); },
  async del(store, clave) { return tx(store, "readwrite", (s) => pedir(s.delete(clave))); },
  async todos(store) { return tx(store, "readonly", (s) => pedir(s.getAll())); },
  async porIndice(store, indice, valor) {
    return tx(store, "readonly", (s) => pedir(s.index(indice).getAll(valor)));
  },
  async contar(store) { return tx(store, "readonly", (s) => pedir(s.count())); },
  async borrarSesion(sesion) {
    const db = await abrir();
    return new Promise((resolver, rechazar) => {
      const t = db.transaction(["sesiones", "eventos"], "readwrite");
      t.objectStore("sesiones").delete(sesion);
      const idx = t.objectStore("eventos").index("sesion");
      const req = idx.openKeyCursor(IDBKeyRange.only(sesion));
      req.onsuccess = () => {
        const c = req.result;
        if (!c) return;
        t.objectStore("eventos").delete(c.primaryKey);
        c.continue();
      };
      t.oncomplete = resolver; t.onerror = () => rechazar(t.error);
    });
  },
};

/** Pide al sistema que no purgue el almacenamiento (iOS puede hacerlo si falta espacio). */
export async function pedirPersistencia() {
  try {
    if (!navigator.storage) return { soportado: false, persistido: false };
    let persistido = await navigator.storage.persisted?.();
    if (!persistido) persistido = await navigator.storage.persist?.();
    const est = await navigator.storage.estimate?.();
    return { soportado: true, persistido: !!persistido, uso: est?.usage, cuota: est?.quota };
  } catch { return { soportado: false, persistido: false }; }
}
