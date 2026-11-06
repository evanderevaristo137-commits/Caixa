import type { Cents } from '../domain/types';

/** Formats cêntimos as "12.500 Kz" (or "12.500,50 Kz" when there are cêntimos). */
export function formatKz(cents: Cents): string {
  if (!Number.isInteger(cents)) throw new Error('Money must be an integer number of cents');
  const negative = cents < 0;
  const abs = Math.abs(cents);
  const kz = Math.floor(abs / 100);
  const rest = abs % 100;
  const whole = String(kz).replace(/\B(?=(\d{3})+(?!\d))/g, '.');
  const decimals = rest === 0 ? '' : ',' + String(rest).padStart(2, '0');
  return `${negative ? '-' : ''}${whole}${decimals} Kz`;
}

/**
 * Parses what a person types ("12.500", "12500", "12 500", "1.250,50") into cêntimos.
 * Returns null when the text is not a valid non-negative amount.
 */
export function parseKz(input: string): Cents | null {
  const text = input.replace(/kz/gi, '').replace(/\s/g, '').trim();
  if (text === '') return null;
  const match = /^(\d{1,3}(?:\.\d{3})+|\d+)(?:,(\d{1,2}))?$/.exec(text);
  if (!match) return null;
  const whole = Number(match[1]!.replace(/\./g, ''));
  const decimals = match[2] ? Number(match[2].padEnd(2, '0')) : 0;
  const cents = whole * 100 + decimals;
  return Number.isSafeInteger(cents) ? cents : null;
}

/** Multiplies a unit price by a whole quantity, staying in integers. */
export function lineTotal(unitPriceCents: Cents, quantity: number): Cents {
  if (!Number.isInteger(unitPriceCents) || !Number.isInteger(quantity)) {
    throw new Error('Price and quantity must be integers');
  }
  return unitPriceCents * quantity;
}

export function sumCents(values: Cents[]): Cents {
  return values.reduce((acc, v) => acc + v, 0);
}
