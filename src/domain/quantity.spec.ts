import { describe, expect, it } from 'vitest';
import { articleCount, formatKg, formatQuantity, gramsForAmount, lineTotalFor, parseWeight } from './quantity';

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
