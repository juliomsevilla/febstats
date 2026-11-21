// Generado desde feb_scraper/db.py (FEBstats). No editar a mano.
// Comprueba la paridad con tools/parity_test.mjs.
export const FEB_BASE_SQL = `
CREATE TABLE IF NOT EXISTS tiros (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    partido_id TEXT NOT NULL,
    equipo TEXT NOT NULL,
    jugador TEXT NOT NULL,
    dorsal TEXT NOT NULL,
    cuarto INTEGER NOT NULL,
    resultado TEXT NOT NULL CHECK (resultado IN ('acierto', 'fallo')),
    X REAL NOT NULL,
    Y REAL NOT NULL,
    Xinv REAL NOT NULL,
    Yinv REAL NOT NULL,
    fuente TEXT NOT NULL,
    confianza_deteccion REAL NOT NULL,
    jugador_id TEXT,
    equipo_id TEXT,
    tiempo TEXT,
    tiempo_seg INTEGER
);

CREATE TABLE IF NOT EXISTS jugador_stats (
    partido_id TEXT NOT NULL,
    equipo TEXT NOT NULL,
    jugador TEXT NOT NULL,
    dorsal TEXT NOT NULL,
    titular INTEGER NOT NULL,
    minutos TEXT,
    puntos INTEGER NOT NULL,
    t2_aciertos INTEGER NOT NULL,
    t2_intentos INTEGER NOT NULL,
    t2_pct REAL NOT NULL,
    t3_aciertos INTEGER NOT NULL,
    t3_intentos INTEGER NOT NULL,
    t3_pct REAL NOT NULL,
    tc_aciertos INTEGER NOT NULL,
    tc_intentos INTEGER NOT NULL,
    tc_pct REAL NOT NULL,
    tl_aciertos INTEGER NOT NULL,
    tl_intentos INTEGER NOT NULL,
    tl_pct REAL NOT NULL,
    reb_of INTEGER NOT NULL,
    reb_def INTEGER NOT NULL,
    reb_tot INTEGER NOT NULL,
    asistencias INTEGER NOT NULL,
    recuperaciones INTEGER NOT NULL,
    perdidas INTEGER NOT NULL,
    tapones_favor INTEGER NOT NULL,
    tapones_contra INTEGER NOT NULL,
    mates INTEGER NOT NULL,
    faltas_cometidas INTEGER NOT NULL,
    faltas_recibidas INTEGER NOT NULL,
    valoracion INTEGER NOT NULL,
    mas_menos INTEGER NOT NULL,
    jugador_id TEXT,
    equipo_id TEXT,
    capitan INTEGER,
    segundos INTEGER,
    sta TEXT,
    ind TEXT,
    PRIMARY KEY (partido_id, equipo, dorsal)
);

CREATE TABLE IF NOT EXISTS grupo_seguido (
    id INTEGER PRIMARY KEY CHECK (id = 0),
    competicion TEXT NOT NULL,
    grupo TEXT NOT NULL,
    temporada TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS partidos (
    partido_id TEXT PRIMARY KEY,
    competicion TEXT,
    jornada TEXT,
    fecha TEXT,
    lugar TEXT,
    equipo_local TEXT NOT NULL,
    equipo_visitante TEXT NOT NULL,
    pts_local INTEGER NOT NULL,
    pts_visitante INTEGER NOT NULL,
    parciales TEXT,
    local_id TEXT,
    visitante_id TEXT,
    competicion_id TEXT,
    arbitro1 TEXT,
    arbitro2 TEXT,
    arbitro3 TEXT,
    estado TEXT,
    estado_codigo TEXT,
    cuartos INTEGER,
    tiempo_estado TEXT,
    pabellon TEXT,
    direccion TEXT,
    local_feb_id TEXT,
    visitante_feb_id TEXT,
    local_club TEXT,
    visitante_club TEXT,
    local_color TEXT,
    visitante_color TEXT,
    local_logo TEXT,
    visitante_logo TEXT,
    local_faltas TEXT,
    visitante_faltas TEXT,
    datos_v INTEGER
);

-- Totales de equipo por partido (BOXSCORE.TEAM[i].TOTAL) + acciones de equipo (TEAMACTIONS: las que el acta no asigna a un jugador).
-- NULL = la FEB no lo rellena (en Tercera FEB: contraataque, puntos tras pérdida, 2ª oportunidad, banquillo y pintura).
CREATE TABLE IF NOT EXISTS equipo_stats (
    partido_id TEXT NOT NULL,
    equipo TEXT NOT NULL,
    equipo_id TEXT NOT NULL,
    indice INTEGER,
    minutos TEXT,
    segundos INTEGER,
    acciones_equipo TEXT,
    tl_aciertos INTEGER, tl_intentos INTEGER, tl_pct REAL,
    t2_aciertos INTEGER, t2_intentos INTEGER, t2_pct REAL,
    t3_aciertos INTEGER, t3_intentos INTEGER, t3_pct REAL,
    tc_aciertos INTEGER, tc_intentos INTEGER, tc_pct REAL,
    asistencias INTEGER, tapones_favor INTEGER, tapones_contra INTEGER, mates INTEGER,
    reb_of INTEGER, reb_def INTEGER, reb_tot INTEGER,
    faltas_cometidas INTEGER, faltas_recibidas INTEGER, perdidas INTEGER, recuperaciones INTEGER,
    contraataque INTEGER, pts_tras_perdida INTEGER, pts_segunda_oportunidad INTEGER,
    pts_banquillo INTEGER, pts_pintura INTEGER, valoracion INTEGER, puntos INTEGER, faltas INTEGER,
    ea_reb_of INTEGER, ea_reb_def INTEGER, ea_reb_tot INTEGER,
    ea_faltas_cometidas INTEGER, ea_faltas_recibidas INTEGER, ea_perdidas INTEGER, ea_recuperaciones INTEGER,
    PRIMARY KEY (partido_id, equipo_id)
);

-- Identidad de cada equipo: equipo_id = teamCode (el de jugador_stats/partidos), feb_id = id de Equipo.aspx?i=
CREATE TABLE IF NOT EXISTS equipos (
    equipo_id TEXT PRIMARY KEY,
    feb_id TEXT,
    nombre TEXT NOT NULL,
    club_id TEXT,
    color TEXT,
    logo TEXT
);

-- Página del equipo (Equipo.aspx): entrenador y bloques «Datos del Club / Campo de Juego / Datos de Juego» (JSON).
CREATE TABLE IF NOT EXISTS equipos_info (
    equipo_feb_id TEXT PRIMARY KEY,
    equipo TEXT,
    entrenador TEXT,
    entrenador_nacimiento TEXT,
    info_json TEXT
);

-- Plantilla (Equipo.aspx): una fila por jugador y equipo. jugador_id = jugador_stats.jugador_id. Todo vacío -> NULL.
CREATE TABLE IF NOT EXISTS plantilla (
    equipo_feb_id TEXT NOT NULL,
    equipo TEXT,
    jugador_id TEXT NOT NULL,
    nombre TEXT,
    puesto TEXT,
    dorsal TEXT,
    nacimiento TEXT,
    fecha_nacimiento TEXT,
    lugar_nacimiento TEXT,
    nacionalidad TEXT,
    formacion TEXT,
    altura TEXT,
    peso TEXT,
    PRIMARY KEY (equipo_feb_id, jugador_id)
);
`;
