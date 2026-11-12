/** Text for searching: no accents, lower case, no spaces around ("Feijão " → "feijao"). */
export function normalise(s: string): string {
  return s
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .trim();
}
