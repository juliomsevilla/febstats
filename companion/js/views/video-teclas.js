// Atajos de teclado del vídeo.
export const RESERVADAS = new Set([" ", "ArrowLeft", "ArrowRight", "C", "I", "O", "Escape"]);

/** Identificador de tecla independiente del teclado/idioma. */
export function idTecla(ev) {
  const c = ev.code || "";
  let k = c.startsWith("Key") ? c.slice(3) : c.startsWith("Digit") ? c.slice(5) : c.startsWith("Numpad") ? "Num" + c.slice(6) : /^F\d+$/.test(c) ? c : ev.key.length === 1 ? ev.key.toUpperCase() : ev.key;
  if (["Shift", "Control", "Alt", "Meta"].includes(ev.key)) return null;
  return (ev.shiftKey ? "Shift+" : "") + k;
}
