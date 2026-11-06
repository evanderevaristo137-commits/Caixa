import type { Product, Sale } from './types';

/** Alphabetical order the way people expect in Portuguese ("Água" next to "Arroz", not after "Z"). */
export const byName = (a: { name: string }, b: { name: string }) => a.name.localeCompare(b.name, 'pt', { sensitivity: 'base' });

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
