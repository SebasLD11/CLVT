// HEX → nombre (ES). Añade tus valores si usas más.
const HEX2NAME: Record<string,string> = {
  '#000': 'Negro', '#000000': 'Negro',
  '#fff': 'Blanco', '#ffffff': 'Blanco',
  '#ff0000': 'Rojo',
  '#0000ff': 'Azul',
  '#ffff00': 'Amarillo',
  '#da70d6': 'Orquídea',
};

/** Devuelve etiqueta legible del color.
 * Soporta: "Nombre|#HEX", solo "Nombre", o solo "#HEX".
 */
export function colorLabel(value: string | null | undefined): string | null {
  if (!value) return null;
  let v = String(value).trim();
  if (!v) return null;
  if (v.includes('|')) return v.split('|',2)[0].trim() || null;
  if (!v.startsWith('#')) return v.charAt(0).toUpperCase() + v.slice(1);
  return HEX2NAME[v.toLowerCase()] || v; // fallback al valor
}

/** Valor “real” del color para swatch (si hay pipe, devuelve la parte #HEX) */
export function colorValue(value: string | null | undefined): string | null {
  if (!value) return null;
  let v = String(value).trim();
  if (!v) return null;
  if (v.includes('|')) {
    const [,hex] = v.split('|',2);
    return (hex || v).trim();
  }
  return v;
}