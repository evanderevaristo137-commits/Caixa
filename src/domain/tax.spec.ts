import { describe, expect, it } from 'vitest';
import { formatBpAsPercent, parsePercentToBp } from './tax';

describe('IVA percentages', () => {
  it('parses what people type', () => {
    expect(parsePercentToBp('14')).toBe(1400);
    expect(parsePercentToBp('14 %')).toBe(1400);
    expect(parsePercentToBp('7,5')).toBe(750);
    expect(parsePercentToBp('0')).toBe(0);
    expect(parsePercentToBp('')).toBeUndefined();
    expect(parsePercentToBp('abc')).toBeNull();
    expect(parsePercentToBp('101')).toBeNull();
  });
  it('formats back', () => {
    expect(formatBpAsPercent(1400)).toBe('14');
    expect(formatBpAsPercent(750)).toBe('7,5');
    expect(formatBpAsPercent(725)).toBe('7,25');
    expect(formatBpAsPercent(0)).toBe('0');
  });
});
