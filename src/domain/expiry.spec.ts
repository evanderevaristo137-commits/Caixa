import { describe, expect, it } from 'vitest';
import { batchesOnShelf, daysBetween, expiringStock } from './expiry';

const batch = (quantity: number, expiresOn: string | undefined, createdAt: string, source: 'entry' | 'purchase' | 'shelf' = 'entry') => ({
  quantity,
  ...(expiresOn ? { expiresOn } : {}),
  createdAt,
  source,
});

describe('what is left of each batch', () => {
  it('the oldest goods leave first: the newest batches are the ones on the shelf', () => {
    const batches = [batch(10, '2026-12-01', '2026-11-01T10:00:00Z'), batch(10, '2027-03-01', '2026-11-05T10:00:00Z')];
    expect(batchesOnShelf(15, batches)).toEqual([
      { quantity: 5, expiresOn: '2026-12-01' },
      { quantity: 10, expiresOn: '2027-03-01' },
    ]);
    expect(batchesOnShelf(8, batches)).toEqual([{ quantity: 8, expiresOn: '2027-03-01' }]);
    expect(batchesOnShelf(0, batches)).toEqual([]);
  });

  it('stock older than every batch has no date; a batch that came in without one neither', () => {
    expect(batchesOnShelf(12, [batch(5, undefined, '2026-11-05T10:00:00Z'), batch(4, '2027-01-01', '2026-11-01T10:00:00Z')])).toEqual([
      { quantity: 4, expiresOn: '2027-01-01' },
      { quantity: 5 },
      { quantity: 3 },
    ]);
  });

  it('dates given to stock already on the shelf are the oldest stock; voided batches never count', () => {
    const batches = [
      batch(10, '2027-03-01', '2026-11-01T10:00:00Z'), // came in on 1 November
      batch(5, '2026-12-01', '2026-11-10T10:00:00Z', 'shelf'), // the old stock, dated later
      { ...batch(50, '2026-11-20', '2026-11-11T10:00:00Z'), voidedAt: 'x' },
    ];
    expect(batchesOnShelf(12, batches)).toEqual([
      { quantity: 2, expiresOn: '2026-12-01' },
      { quantity: 10, expiresOn: '2027-03-01' },
    ]);
  });
});

describe('expired and about to expire', () => {
  const products = [
    { id: 'milk', name: 'Leite UHT 1 L', stock: 14, tracksExpiry: true },
    { id: 'rice', name: 'Arroz 1 kg', stock: 30 }, // does not follow dates
    { id: 'beans', name: 'Feijão a granel', stock: 1_500, soldBy: 'weight' as const, tracksExpiry: true },
  ];
  const batches = [
    { productId: 'milk', ...batch(4, '2026-11-17', '2026-11-01T10:00:00Z', 'shelf') },
    { productId: 'milk', ...batch(10, '2027-01-01', '2026-11-01T10:00:00Z', 'shelf') },
    { productId: 'rice', ...batch(30, '2026-11-13', '2026-11-01T10:00:00Z') },
    { productId: 'beans', ...batch(1_500, '2026-11-10', '2026-11-01T10:00:00Z') },
  ];

  it('lists the lots within 30 days, expired first, only for products that follow their dates', () => {
    expect(expiringStock(products, batches, '2026-11-12')).toEqual([
      { productId: 'beans', name: 'Feijão a granel', soldBy: 'weight', quantity: 1_500, expiresOn: '2026-11-10', daysLeft: -2 },
      { productId: 'milk', name: 'Leite UHT 1 L', quantity: 4, expiresOn: '2026-11-17', daysLeft: 5 },
    ]);
    expect(expiringStock(products, batches, '2026-11-12', 60).map((l) => l.expiresOn)).toEqual(['2026-11-10', '2026-11-17', '2027-01-01']);
  });

  it('counts calendar days', () => {
    expect(daysBetween('2026-11-12', '2026-11-17')).toBe(5);
    expect(daysBetween('2026-11-12', '2026-11-10')).toBe(-2);
    expect(daysBetween('2026-12-31', '2027-01-01')).toBe(1);
  });
});
