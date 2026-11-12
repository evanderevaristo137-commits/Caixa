import { describe, expect, it } from 'vitest';
import { amountFitsWeight, articleCount, formatKg, formatQuantity, gramsForAmount, lineTotalFor, parseWeight } from './quantity';

describe('selling by weight', () => {
  it('computes line totals in integers, rounded to the whole kwanza', () => {
    expect(lineTotalFor(120_000, 750, 'weight')).toBe(90_000); // 0,75 kg × 1.200 Kz/kg = 900 Kz
    expect(lineTotalFor(125_000, 333, 'weight')).toBe(41_600); // 416,25 Kz → 416 Kz
    expect(lineTotalFor(125_000, 334, 'weight')).toBe(41_800); // 417,50 Kz → 418 Kz
    expect(lineTotalFor(120_000, 3)).toBe(360_000); // units unchanged
    expect(() => lineTotalFor(120_000, 0.5, 'weight')).toThrow();
  });

  it('shows kilos the Angolan way', () => {
    expect(formatKg(750)).toBe('0,75');
    expect(formatKg(12_500)).toBe('12,5');
    expect(formatKg(1_000)).toBe('1');
    expect(formatKg(333)).toBe('0,333');
    expect(formatKg(-250)).toBe('-0,25');
    expect(formatQuantity(750, 'weight')).toBe('0,75 kg');
    expect(formatQuantity(3)).toBe('3');
  });

  it('understands what people type', () => {
    expect(parseWeight('0,75')).toBe(750);
    expect(parseWeight('0.75')).toBe(750);
    expect(parseWeight('1,5 kg')).toBe(1_500);
    expect(parseWeight('2')).toBe(2_000);
    expect(parseWeight('750 g')).toBe(750);
    expect(parseWeight('0,3333')).toBeNull();
    expect(parseWeight('abc')).toBeNull();
    expect(parseWeight('')).toBeNull();
    expect(parseWeight('2000 kg')).toBeNull();
  });

  it('turns "500 Kz de feijão" into a weight', () => {
    expect(gramsForAmount(50_000, 120_000)).toBe(417);
    expect(gramsForAmount(100_000, 100_000)).toBe(1_000);
    expect(gramsForAmount(100, 0)).toBe(0);
  });

  it('counts a weighed line as one article', () => {
    expect(articleCount([{ quantity: 3 }, { quantity: 750, soldBy: 'weight' }])).toBe(4);
  });
});

describe('an amount asked by the customer must match the weight', () => {
  it('accepts the weight the app itself worked out, and refuses another one', () => {
    // 500 Kz of beans at 1.400 Kz/kg: 357 g.
    expect(gramsForAmount(50_000, 140_000)).toBe(357);
    expect(amountFitsWeight(50_000, 357, 140_000)).toBe(true);
    expect(amountFitsWeight(50_000, 400, 140_000)).toBe(false);
    expect(amountFitsWeight(10_000, 357, 140_000)).toBe(false);
    expect(amountFitsWeight(0, 357, 140_000)).toBe(false);
    expect(amountFitsWeight(50_000, 0, 140_000)).toBe(false);
    expect(amountFitsWeight(50_000.5, 357, 140_000)).toBe(false);
  });

  it('always accepts what the weighing sheet proposes, for any price and amount', () => {
    // Deterministic sweep over prices (per kg) and amounts, including awkward ones.
    const prices = [1, 7, 99, 100, 12_345, 35_000, 140_000, 199_999, 1_250_050, 99_999_999];
    const amounts = [1, 50, 99, 100, 5_000, 10_000, 33_333, 50_000, 100_000, 777_777, 5_000_000];
    for (const price of prices) {
      for (const amount of amounts) {
        const grams = gramsForAmount(amount, price);
        if (grams > 0) expect(amountFitsWeight(amount, grams, price), `${amount} at ${price}/kg`).toBe(true);
        // One gram more or less is another weight (unless a gram costs less than the rounding).
        if (grams > 1 && price >= 2_000) expect(amountFitsWeight(amount, grams + 2, price)).toBe(false);
      }
    }
  });
});
