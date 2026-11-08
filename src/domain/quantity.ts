import type { Cents } from './types';

/**
 * Products are sold by the unit or by weight (kg). Weights are kept in whole GRAMS,
 * so all the maths stays in integers (no floating point).
 */
export type SoldBy = 'unit' | 'weight';
export const GRAMS_PER_KG = 1000;
/** Largest weight in one line: 1 000 kg. */
export const MAX_GRAMS = 1_000_000;

/**
 * Money for a line, in cêntimos. Units: units × price. Weight: grams × price per kg ÷ 1000,
 * rounded to the whole kwanza, because there are no cêntimo coins in daily use.
 */
export function lineTotalFor(unitPriceCents: Cents, quantity: number, soldBy: SoldBy = 'unit'): Cents {
  if (!Number.isInteger(unitPriceCents) || !Number.isInteger(quantity)) throw new Error('Price and quantity must be integers');
  if (soldBy === 'unit') return unitPriceCents * quantity;
  return Math.round((unitPriceCents * quantity) / GRAMS_PER_KG / 100) * 100;
}

/** "0,75", "12,5", "1", "0,333" (kg, without trailing zeros). */
export function formatKg(grams: number): string {
  const sign = grams < 0 ? '-' : '';
  const abs = Math.abs(grams);
  const kg = Math.floor(abs / GRAMS_PER_KG);
  const rest = String(abs % GRAMS_PER_KG)
    .padStart(3, '0')
    .replace(/0+$/, '');
  return `${sign}${kg}${rest ? `,${rest}` : ''}`;
}

/** "3" for units, "0,75 kg" for weight. */
export function formatQuantity(quantity: number, soldBy: SoldBy = 'unit'): string {
  return soldBy === 'weight' ? `${formatKg(quantity)} kg` : String(quantity);
}

/** What people type for a weight: "0,75" or "0.75" (kg), "1,5 kg", "750 g". Returns grams, or null. */
export function parseWeight(input: string): number | null {
  const text = input.toLowerCase().replace(/\s/g, '');
  if (text === '') return null;
  const grams = /^(\d{1,7})g$/.exec(text);
  if (grams) return Number(grams[1]) <= MAX_GRAMS ? Number(grams[1]) : null;
  const kg = /^(\d{1,4})(?:[.,](\d{1,3}))?(?:kg)?$/.exec(text);
  if (!kg) return null;
  const value = Number(kg[1]) * GRAMS_PER_KG + Number((kg[2] ?? '').padEnd(3, '0'));
  return value <= MAX_GRAMS ? value : null;
}

/** "500 Kz de feijão": the weight to hand over for an amount, rounded to the gram. */
export function gramsForAmount(amountCents: Cents, pricePerKgCents: Cents): number {
  if (pricePerKgCents <= 0) return 0;
  return Math.round((amountCents * GRAMS_PER_KG) / pricePerKgCents);
}

/** Lines count as articles: units count one by one, a weighed line counts as one. */
export function articleCount(lines: { quantity: number; soldBy?: SoldBy }[]): number {
  return lines.reduce((acc, l) => acc + (l.soldBy === 'weight' ? 1 : l.quantity), 0);
}
