/**
 * EAN-13 barcodes: check digit, validation, in-store codes and the bar pattern for printed labels.
 * No library: the encoding is a few small tables (GS1 General Specifications).
 */

// Left half: odd parity (L) or even parity (G); right half: R. One 7-module pattern per digit.
const L = ['0001101', '0011001', '0010011', '0111101', '0100011', '0110001', '0101111', '0111011', '0110111', '0001011'];
const G = ['0100111', '0110011', '0011011', '0100001', '0011101', '0111001', '0000101', '0010001', '0001001', '0010111'];
const R = ['1110010', '1100110', '1101100', '1000010', '1011100', '1001110', '1010000', '1000100', '1001000', '1110100'];
/** The first digit is not drawn: it sets which left-half digits use L or G. */
const PARITY = ['LLLLLL', 'LLGLGG', 'LLGGLG', 'LLGGGL', 'LGLLGG', 'LGGLLG', 'LGGGLL', 'LGLGLG', 'LGLGGL', 'LGGLGL'];

/** Check digit of the first 12 digits (weights 1 and 3, alternating from the left). */
export function ean13CheckDigit(first12: string): number {
  if (!/^\d{12}$/.test(first12)) throw new Error('EAN-13 needs 12 digits before the check digit');
  let sum = 0;
  for (let i = 0; i < 12; i++) sum += Number(first12[i]) * (i % 2 === 0 ? 1 : 3);
  return (10 - (sum % 10)) % 10;
}

export function isValidEan13(code: string): boolean {
  return /^\d{13}$/.test(code) && ean13CheckDigit(code.slice(0, 12)) === Number(code[12]);
}

/**
 * Codes made by the app start with 20: the GS1 range for "restricted circulation", meant for use
 * inside one shop. They never clash with a manufacturer's code, but are worthless outside the shop.
 */
export const INTERNAL_PREFIX = '20';
const MAX_SEQUENCE = 9_999_999_999;

/** The in-store code number `sequence` (1, 2, 3…): "20" + 10 digits + check digit. */
export function internalBarcode(sequence: number): string {
  if (!Number.isInteger(sequence) || sequence < 1 || sequence > MAX_SEQUENCE) throw new Error('Invalid barcode sequence');
  const body = INTERNAL_PREFIX + String(sequence).padStart(10, '0');
  return body + String(ean13CheckDigit(body));
}

export const isInternalBarcode = (code: string | undefined): boolean => !!code && isValidEan13(code) && code.startsWith(INTERNAL_PREFIX);

/** The 95 modules of an EAN-13 symbol, guards included ('1' = a black module). */
export function ean13Modules(code: string): string {
  if (!isValidEan13(code)) throw new Error('Invalid EAN-13 code');
  const d = [...code].map(Number);
  const parity = PARITY[d[0]!]!;
  let out = '101';
  for (let i = 1; i <= 6; i++) out += (parity[i - 1] === 'L' ? L : G)[d[i]!]!;
  out += '01010';
  for (let i = 7; i <= 12; i++) out += R[d[i]!]!;
  return out + '101';
}

/** Black bars as [start, width] in modules, to draw with one rectangle each. */
export function barRuns(modules: string): [number, number][] {
  const runs: [number, number][] = [];
  let i = 0;
  while (i < modules.length) {
    if (modules[i] !== '1') {
      i += 1;
      continue;
    }
    const start = i;
    while (modules[i] === '1') i += 1;
    runs.push([start, i - start]);
  }
  return runs;
}
