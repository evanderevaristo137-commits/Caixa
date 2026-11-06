import { describe, expect, it } from 'vitest';
import { adjustmentDelta, validateEntry } from './stock';

describe('stock validation', () => {
  it('accepts positive whole entries only', () => {
    expect(validateEntry(12)).toBeNull();
    expect(validateEntry(0)).toBe('not_positive');
    expect(validateEntry(-3)).toBe('not_positive');
    expect(validateEntry(1.5)).toBe('not_whole');
  });

  it('computes the adjustment delta from the counted quantity', () => {
    expect(adjustmentDelta(10, 7, 'Partido')).toEqual({ delta: -3 });
    expect(adjustmentDelta(-2, 5, 'Contagem')).toEqual({ delta: 7 });
  });

  it('requires a reason and a real change', () => {
    expect(adjustmentDelta(10, 7, '  ')).toEqual({ error: 'reason_required' });
    expect(adjustmentDelta(10, 10, 'Contagem')).toEqual({ error: 'no_change' });
    expect(adjustmentDelta(10, -1, 'Contagem')).toEqual({ error: 'not_positive' });
  });
});
