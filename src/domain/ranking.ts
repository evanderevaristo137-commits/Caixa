import type { Product, Sale } from './types';

// localeCompare(x, 'pt') prepares the Portuguese rules again on every comparison, which is slow on
// cheap phones (a list of 300 products is sorted on every screen). One collator, made once, is reused.
const PT = new Intl.Collator('pt');
const PT_BASE = new Intl.Collator('pt', { sensitivity: 'base' });

/** Alphabetical order the way people expect in Portuguese ("Água" next to "Arroz", not after "Z"). */
export const comparePt = (a: string, b: string) => PT.compare(a, b);
export const byName = (a: { name: string }, b: { name: string }) => PT_BASE.compare(a.name, b.name);

/** Plain text order, for dates written as "2026-11-09T10:00:00.000Z" (no language rules needed). */
export const compareText = (a: string, b: string) => (a < b ? -1 : a > b ? 1 : 0);

/** In how many (valid) sales each product appears. */
export function salesFrequency(sales: Pick<Sale, 'items' | 'voidedAt'>[]): Map<string, number> {
  const freq = new Map<string, number>();
  for (const s of sales) {
    if (s.voidedAt) continue;
    for (const id of new Set(s.items.map((i) => i.productId))) freq.set(id, (freq.get(id) ?? 0) + 1);
  }
  return freq;
}

/** Best sellers first; ties (and products never sold) in alphabetical order. */
export function sortByFrequency<T extends Pick<Product, 'id' | 'name'>>(products: T[], freq: Map<string, number> | undefined): T[] {
  return [...products].sort((a, b) => (freq?.get(b.id) ?? 0) - (freq?.get(a.id) ?? 0) || byName(a, b));
}

/** Saved ranking: the best sellers first, at most 300 (the others count as never sold). */
export function serialiseRanking(freq: Map<string, number>): string {
  return JSON.stringify([...freq].sort((a, b) => b[1] - a[1]).slice(0, 300));
}

export function parseRanking(text: string | null): Map<string, number> | null {
  if (!text) return null;
  try {
    const value: unknown = JSON.parse(text);
    if (!Array.isArray(value)) return null;
    const pairs = value.filter((e): e is [string, number] => Array.isArray(e) && typeof e[0] === 'string' && typeof e[1] === 'number');
    return new Map(pairs);
  } catch {
    return null;
  }
}
