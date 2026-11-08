import { describe, expect, it } from 'vitest';
import { hold, MAX_HELD, parseHeld, resume } from './held';

const line = (productId: string, quantity = 1) => ({ productId, name: productId, unitPriceCents: 100_000, quantity });
const now = new Date('2026-11-08T10:30:00Z');

describe('sales on hold', () => {
  it('puts carts on hold, newest first, up to a limit', () => {
    let list = hold([], [line('arroz', 2)], 'a', now)!;
    list = hold(list, [line('oleo')], 'b', now)!;
    expect(list.map((h) => h.id)).toEqual(['b', 'a']);
    expect(hold(list, [], 'c', now)).toBeNull();
    let full = list;
    for (let i = 0; full.length < MAX_HELD; i++) full = hold(full, [line('x')], `x${i}`, now)!;
    expect(hold(full, [line('y')], 'y', now)).toBeNull();
  });

  it('resuming swaps with the cart being served, so nothing is lost', () => {
    const list = hold(hold([], [line('arroz', 2)], 'a', now)!, [line('oleo')], 'b', now)!;
    const r = resume(list, 'a', [line('sal', 3)], 'c', now)!;
    expect(r.cart).toEqual([line('arroz', 2)]);
    expect(r.held.map((h) => h.id)).toEqual(['c', 'b']);
    expect(r.held[0]!.cart).toEqual([line('sal', 3)]);
    // With an empty cart, nothing new goes on hold.
    expect(resume(list, 'b', [], 'd', now)!.held.map((h) => h.id)).toEqual(['a']);
    expect(resume(list, 'zzz', [], 'd', now)).toBeNull();
  });

  it('reads back only valid held sales', () => {
    const saved = JSON.stringify([
      { id: 'a', at: now.toISOString(), cart: [line('arroz', 2)] },
      { id: 'b', at: now.toISOString(), cart: [{ productId: 'x', quantity: -1 }] },
      { nonsense: true },
    ]);
    expect(parseHeld(saved).map((h) => h.id)).toEqual(['a']);
    expect(parseHeld('not json')).toEqual([]);
    expect(parseHeld(null)).toEqual([]);
  });
});
