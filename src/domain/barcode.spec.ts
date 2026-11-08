import { describe, expect, it } from 'vitest';
import { barRuns, ean13CheckDigit, ean13Modules, internalBarcode, isInternalBarcode, isValidEan13 } from './barcode';

describe('EAN-13', () => {
  it('computes the check digit of real product codes', () => {
    expect(ean13CheckDigit('400638133393')).toBe(1);
    expect(ean13CheckDigit('590123412345')).toBe(7);
    expect(ean13CheckDigit('978030640615')).toBe(7);
    expect(() => ean13CheckDigit('12345')).toThrow();
  });

  it('validates codes', () => {
    expect(isValidEan13('4006381333931')).toBe(true);
    expect(isValidEan13('4006381333932')).toBe(false);
    expect(isValidEan13('400638133393')).toBe(false);
    expect(isValidEan13('40063813339a1')).toBe(false);
  });

  it('makes in-store codes with the restricted-circulation prefix 20', () => {
    expect(internalBarcode(1)).toBe('2000000000015');
    expect(internalBarcode(1234)).toBe('2000000012346');
    for (const n of [1, 2, 99, 123_456, 9_999_999_999]) {
      const code = internalBarcode(n);
      expect(code).toHaveLength(13);
      expect(isValidEan13(code)).toBe(true);
      expect(isInternalBarcode(code)).toBe(true);
    }
    expect(isInternalBarcode('4006381333931')).toBe(false);
    expect(isInternalBarcode(undefined)).toBe(false);
    expect(() => internalBarcode(0)).toThrow();
    expect(() => internalBarcode(1.5)).toThrow();
  });

  it('draws 95 modules with the start, centre and end guards', () => {
    const m = ean13Modules('4006381333931');
    expect(m).toHaveLength(95);
    expect(m.slice(0, 3)).toBe('101');
    expect(m.slice(45, 50)).toBe('01010');
    expect(m.slice(92)).toBe('101');
    // First digit 0 → every left digit uses the L table; "0" is 0001101 on the left, 1110010 on the right.
    expect(ean13Modules('0000000000000')).toBe('101' + '0001101'.repeat(6) + '01010' + '1110010'.repeat(6) + '101');
    expect(() => ean13Modules('1234567890123')).toThrow();
  });

  it('turns modules into bars', () => {
    expect(barRuns('1011100')).toEqual([
      [0, 1],
      [2, 3],
    ]);
    // An EAN-13 symbol always has 30 bars.
    expect(barRuns(ean13Modules(internalBarcode(42)))).toHaveLength(30);
  });
});
