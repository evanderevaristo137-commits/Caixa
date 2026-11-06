import { describe, expect, it } from 'vitest';
import { formatKz, lineTotal, parseKz, sumCents } from './money';

describe('formatKz', () => {
  it('formats whole kwanzas with thousands separator', () => {
    expect(formatKz(1_250_000)).toBe('12.500 Kz');
    expect(formatKz(0)).toBe('0 Kz');
    expect(formatKz(50_000)).toBe('500 Kz');
    expect(formatKz(123_456_700)).toBe('1.234.567 Kz');
  });
  it('shows cêntimos only when present', () => {
    expect(formatKz(1_250_050)).toBe('12.500,50 Kz');
    expect(formatKz(5)).toBe('0,05 Kz');
  });
  it('formats negative values', () => {
    expect(formatKz(-30_000)).toBe('-300 Kz');
  });
  it('rejects non-integer values', () => {
    expect(() => formatKz(10.5)).toThrow();
  });
});

describe('parseKz', () => {
  it('accepts common ways of typing amounts', () => {
    expect(parseKz('12500')).toBe(1_250_000);
    expect(parseKz('12.500')).toBe(1_250_000);
    expect(parseKz('12 500 Kz')).toBe(1_250_000);
    expect(parseKz('1.250,5')).toBe(125_050);
    expect(parseKz('0,05')).toBe(5);
  });
  it('rejects invalid input', () => {
    expect(parseKz('')).toBeNull();
    expect(parseKz('abc')).toBeNull();
    expect(parseKz('-5')).toBeNull();
    expect(parseKz('1,234')).toBeNull();
    expect(parseKz('12.50')).toBeNull();
  });
});

describe('lineTotal / sumCents', () => {
  it('multiplies in integers', () => {
    expect(lineTotal(35_000, 3)).toBe(105_000);
    expect(sumCents([105_000, 20_000, 1])).toBe(125_001);
  });
  it('rejects fractional quantities', () => {
    expect(() => lineTotal(100, 1.5)).toThrow();
  });
});
