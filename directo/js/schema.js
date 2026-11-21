// Esquema SQLite del archivo .db exportado.
//
// Regla de oro: las tablas que ya existen en FEBstats se crean EXACTAMENTE con el esquema de
// feb_scraper/db.py (mismo orden de columnas). Lo nuevo se añade SIEMPRE al final con
// ALTER TABLE ... ADD COLUMN, y todo lo propio vive en tablas `directo_*`.
// tools/parity_test.py comprueba esta paridad contra el esquema de FEBstats.
import { FEB_BASE_SQL } from "./schema-base.js";

export const ADDITIVE = [
  ["tiros", "puntos", "INTEGER"],
  ["tiros", "evento_uid", "TEXT"],
  ["tiros", "sesion_uid", "TEXT"],
];

export const DIRECTO_SQL = `
CREATE TABLE IF NOT EXISTS directo_sesion (
  sesion_uid TEXT PRIMARY KEY,
  partido_id TEXT NOT NULL,
  grupo_db TEXT,
  competicion TEXT,
  grupo TEXT,
  temporada TEXT,
  jornada TEXT,
  fecha TEXT,
  equipo_local_id TEXT,
  equipo_local TEXT NOT NULL,
  equipo_visitante_id TEXT,
  equipo_visitante TEXT NOT NULL,
  pabellon TEXT,
  estado TEXT NOT NULL DEFAULT 'en_curso',
  cuarto INTEGER NOT NULL DEFAULT 1,
  tipo_periodo TEXT NOT NULL DEFAULT 'regular',
  reloj_seg REAL,
  pts_local INTEGER NOT NULL DEFAULT 0,
  pts_visitante INTEGER NOT NULL DEFAULT 0,
  inicio TEXT,
  fin TEXT,
  app_version TEXT,
  creado TEXT
);

CREATE TABLE IF NOT EXISTS directo_jugadores (
  sesion_uid TEXT NOT NULL,
  equipo_lado TEXT NOT NULL CHECK (equipo_lado IN ('local','visitante')),
  equipo_id TEXT,
  equipo TEXT NOT NULL,
  jugador_id TEXT,
  dorsal TEXT NOT NULL,
  nombre TEXT NOT NULL,
  titular INTEGER NOT NULL DEFAULT 0,
  orden INTEGER,
  PRIMARY KEY (sesion_uid, equipo_lado, dorsal)
);

CREATE TABLE IF NOT EXISTS directo_eventos (
  uid TEXT PRIMARY KEY,
  sesion_uid TEXT NOT NULL,
  numero INTEGER NOT NULL,
  ts INTEGER NOT NULL,
  tipo TEXT NOT NULL,
  cuarto INTEGER,
  tipo_periodo TEXT,
  reloj_seg REAL,
  equipo_lado TEXT,
  equipo_id TEXT,
  equipo TEXT,
  jugador_id TEXT,
  jugador TEXT,
  dorsal TEXT,
  datos TEXT
);
CREATE INDEX IF NOT EXISTS ix_directo_eventos_sesion ON directo_eventos(sesion_uid, numero);

CREATE TABLE IF NOT EXISTS directo_posesiones (
  uid TEXT PRIMARY KEY,
  sesion_uid TEXT NOT NULL,
  numero INTEGER NOT NULL,
  cuarto INTEGER NOT NULL,
  tipo_periodo TEXT NOT NULL,
  reloj_inicio REAL,
  reloj_fin REAL,
  equipo_lado TEXT,
  equipo_id TEXT,
  equipo TEXT,
  resultado TEXT,
  puntos INTEGER NOT NULL DEFAULT 0,
  evento_uid TEXT,
  ts INTEGER
);
CREATE INDEX IF NOT EXISTS ix_directo_posesiones_sesion ON directo_posesiones(sesion_uid, numero);

CREATE TABLE IF NOT EXISTS directo_tiros (
  sesion_uid TEXT NOT NULL,
  evento_uid TEXT NOT NULL,
  equipo_lado TEXT,
  partido_id TEXT,
  equipo TEXT,
  equipo_id TEXT,
  jugador TEXT,
  jugador_id TEXT,
  dorsal TEXT,
  cuarto INTEGER,
  resultado TEXT,
  X REAL, Y REAL, Xinv REAL, Yinv REAL,
  puntos INTEGER,
  tiempo_seg INTEGER,
  PRIMARY KEY (sesion_uid, evento_uid)
);

CREATE TABLE IF NOT EXISTS directo_notas (
  id TEXT PRIMARY KEY,
  titulo TEXT,
  cuerpo TEXT,
  temporada TEXT,
  grupo TEXT,
  partido TEXT,
  partido_txt TEXT,
  equipo TEXT,
  equipo_txt TEXT,
  jugador TEXT,
  jugador_txt TEXT,
  creada TEXT,
  modificada INTEGER
);

CREATE TABLE IF NOT EXISTS directo_imagenes (
  nombre TEXT PRIMARY KEY,
  mime TEXT NOT NULL,
  datos BLOB NOT NULL
);

CREATE TABLE IF NOT EXISTS directo_clasificacion (
  equipo_id TEXT PRIMARY KEY,
  equipo TEXT,
  posicion INTEGER,
  pj INTEGER,
  pg INTEGER,
  pp INTEGER,
  pf INTEGER,
  pc INTEGER,
  datos TEXT
);

CREATE TABLE IF NOT EXISTS directo_jugador_temporada (
  clave TEXT PRIMARY KEY,
  equipo_id TEXT,
  equipo TEXT,
  jugador_id TEXT,
  dorsal TEXT,
  nombre TEXT NOT NULL,
  partidos INTEGER,
  minutos_total REAL,
  puntos INTEGER,
  perfil TEXT,
  rol TEXT,
  uso_pct REAL,
  ts_pct REAL,
  datos TEXT
);
CREATE INDEX IF NOT EXISTS ix_directo_jugador_temporada_equipo ON directo_jugador_temporada(equipo_id);


CREATE TABLE IF NOT EXISTS directo_boxscore (
  sesion_uid TEXT NOT NULL,
  equipo_lado TEXT NOT NULL CHECK (equipo_lado IN ('local','visitante')),
  equipo_id TEXT,
  equipo TEXT,
  jugador_id TEXT,
  dorsal TEXT NOT NULL,
  nombre TEXT NOT NULL,
  titular INTEGER NOT NULL DEFAULT 0,
  minutos TEXT,
  segundos INTEGER NOT NULL DEFAULT 0,
  puntos INTEGER NOT NULL DEFAULT 0,
  t2_aciertos INTEGER NOT NULL DEFAULT 0, t2_intentos INTEGER NOT NULL DEFAULT 0, t2_pct REAL,
  t3_aciertos INTEGER NOT NULL DEFAULT 0, t3_intentos INTEGER NOT NULL DEFAULT 0, t3_pct REAL,
  tc_aciertos INTEGER NOT NULL DEFAULT 0, tc_intentos INTEGER NOT NULL DEFAULT 0, tc_pct REAL,
  tl_aciertos INTEGER NOT NULL DEFAULT 0, tl_intentos INTEGER NOT NULL DEFAULT 0, tl_pct REAL,
  reb_of INTEGER NOT NULL DEFAULT 0, reb_def INTEGER NOT NULL DEFAULT 0, reb_tot INTEGER NOT NULL DEFAULT 0,
  asistencias INTEGER NOT NULL DEFAULT 0, recuperaciones INTEGER NOT NULL DEFAULT 0, perdidas INTEGER NOT NULL DEFAULT 0,
  tapones_favor INTEGER NOT NULL DEFAULT 0, tapones_contra INTEGER NOT NULL DEFAULT 0, mates INTEGER NOT NULL DEFAULT 0,
  faltas_cometidas INTEGER NOT NULL DEFAULT 0, faltas_recibidas INTEGER NOT NULL DEFAULT 0,
  valoracion INTEGER NOT NULL DEFAULT 0, mas_menos INTEGER NOT NULL DEFAULT 0,
  PRIMARY KEY (sesion_uid, equipo_lado, dorsal)
);

CREATE TABLE IF NOT EXISTS directo_equipo_stats (
  sesion_uid TEXT NOT NULL,
  equipo_lado TEXT NOT NULL CHECK (equipo_lado IN ('local','visitante')),
  equipo_id TEXT,
  equipo TEXT,
  minutos TEXT,
  segundos INTEGER NOT NULL DEFAULT 0,
  acciones_equipo TEXT,
  tl_aciertos INTEGER NOT NULL DEFAULT 0, tl_intentos INTEGER NOT NULL DEFAULT 0, tl_pct REAL,
  t2_aciertos INTEGER NOT NULL DEFAULT 0, t2_intentos INTEGER NOT NULL DEFAULT 0, t2_pct REAL,
  t3_aciertos INTEGER NOT NULL DEFAULT 0, t3_intentos INTEGER NOT NULL DEFAULT 0, t3_pct REAL,
  tc_aciertos INTEGER NOT NULL DEFAULT 0, tc_intentos INTEGER NOT NULL DEFAULT 0, tc_pct REAL,
  asistencias INTEGER NOT NULL DEFAULT 0, tapones_favor INTEGER NOT NULL DEFAULT 0, tapones_contra INTEGER NOT NULL DEFAULT 0, mates INTEGER NOT NULL DEFAULT 0,
  reb_of INTEGER NOT NULL DEFAULT 0, reb_def INTEGER NOT NULL DEFAULT 0, reb_tot INTEGER NOT NULL DEFAULT 0,
  faltas_cometidas INTEGER NOT NULL DEFAULT 0, faltas_recibidas INTEGER NOT NULL DEFAULT 0,
  perdidas INTEGER NOT NULL DEFAULT 0, recuperaciones INTEGER NOT NULL DEFAULT 0,
  valoracion INTEGER NOT NULL DEFAULT 0, puntos INTEGER NOT NULL DEFAULT 0,
  PRIMARY KEY (sesion_uid, equipo_lado)
);

CREATE TABLE IF NOT EXISTS directo_meta (
  clave TEXT PRIMARY KEY,
  valor TEXT
);
`;

const columnas = (db, tabla) => {
  try {
    return db.exec(`PRAGMA table_info(${tabla})`)[0]?.values.map((v) => v[1]) || [];
  } catch { return []; }
};

/** Crea el esquema base y añade lo aditivo. Idempotente: se puede llamar en cada apertura. */
export function aplicarEsquema(db) {
  db.exec(FEB_BASE_SQL);
  for (const [tabla, col, tipo] of ADDITIVE) {
    if (!columnas(db, tabla).includes(col)) db.run(`ALTER TABLE ${tabla} ADD COLUMN ${col} ${tipo}`);
  }
  db.exec(DIRECTO_SQL);
  db.run("PRAGMA user_version = 1");
}

export function tablasBase() {
  return ["tiros", "jugador_stats", "grupo_seguido", "partidos", "equipo_stats", "equipos", "equipos_info", "plantilla"];
}
