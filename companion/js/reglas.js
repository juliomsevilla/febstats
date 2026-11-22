// Resumen de las Reglas Oficiales de Baloncesto FIBA 2026 (en vigor desde el 1-10-2026) que importan al analizar datos.
// Fuente única: la usan la pestaña «Reglas» de Equipo y el texto de referencia del asistente de IA.
export const REGLAS = [
  { titulo: "Tiempo de juego", items: [
    "4 cuartos de 10 minutos. Descanso de 2 min entre 1.º-2.º y 3.º-4.º, y de 15 min en el descanso (art. 8).",
    "Empate al final del 4.º: prórrogas de 5 minutos las que hagan falta (art. 8.7).",
    "Tiempos muertos de 1 minuto: 2 en la primera parte; 3 en la segunda (máximo 2 con 2:00 o menos en el 4.º); 1 por prórroga. Los no usados no se acumulan (art. 18).",
  ] },
  { titulo: "Puntuación y pista", items: [
    "Tiro libre 1 punto; canasta desde zona de 2 puntos, 2; desde zona de 3 puntos, 3 (art. 16).",
    "Pista 28 × 15 m. Línea de triple: arco de 6,75 m desde el centro del aro, con rectas a 0,90 m de la banda (esquinas). El aro está a 1,575 m de la línea de fondo (art. 2.5.4).",
    "Zona restringida 4,9 m de ancho; línea de tiros libres a 5,80 m de la línea de fondo. Semicírculo de no carga de 1,30 m (art. 2.5).",
    "Un tiro con 0,2 o 0,1 s solo puede ser canasta válida si se palmea o se machaca directamente (art. 16.2.5).",
  ] },
  { titulo: "Relojes", items: [
    "Posesión de 24 segundos. Tras balón en el aro, o saque en pista contraria por falta o violación del rival: 14 segundos (art. 29).",
    "8 segundos para pasar a pista contraria; 3 segundos en la zona rival; 5 segundos para sacar, para pasar/tirar/botar si estás muy defendido, y para lanzar un tiro libre (arts. 17, 26-28, 44).",
  ] },
  { titulo: "Faltas", items: [
    "Personal (P): contacto ilegal. Con 5 faltas el jugador queda excluido (arts. 34, 41).",
    "Técnica: categoría 1 (conducta; cuenta para la descalificación) y categoría 2 (administrativa; no cuenta). Dos de cat. 1, dos flagrantes o una de cada = descalificación del jugador (art. 36).",
    "Antideportiva (término antiguo): desaparece. Ahora hay falta disruptiva (DI) y falta flagrante (FL), cada una con 2 tiros libres (o canasta + 1 / 2-3 tiros libres si es en acción de tiro) y saque en pista de ataque (arts. 37-38).",
    "Descalificante (D): acción antideportiva flagrante grave (art. 39). Falta en saque: 1 tiro libre en los últimos 2:00 del 4.º y prórrogas (art. 34.1.2).",
    "Faltas de equipo: a la 4.ª falta del equipo en un cuarto, las siguientes personales sobre un jugador que no tira son 2 tiros libres (bonus). Las de prórroga cuentan en el 4.º (art. 42).",
  ] },
  { titulo: "Clasificación", items: [
    "Puntos de clasificación FIBA (Apéndice D): 2 por victoria, 1 por derrota (también por defecto) y 0 por derrota por incomparecencia (20-0). Es la columna «Pts».",
    "El orden de la tabla es el de la FEB: victorias y, a igualdad, diferencia de puntos. El desempate oficial de cada competición lo fija su reglamento y puede diferir.",
  ] },
];

/** Texto plano de las reglas, para el asistente de IA. */
export const REGLAS_TEXTO = REGLAS.map((g) => g.titulo + ":\n- " + g.items.join("\n- ")).join("\n\n");
