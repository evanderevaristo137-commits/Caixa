import { describe, expect, it } from 'vitest';
import { normaliseNif } from './nif';

describe('normaliseNif', () => {
  it('accepts digits only (companies) and letters + digits (individuals)', () => {
    expect(normaliseNif('5000000000')).toEqual({ ok: true, value: '5000000000' });
    expect(normaliseNif('000000000aa000')).toEqual({ ok: true, value: '000000000AA000' });
  });
  it('ignores spaces, dots and hyphens', () => {
    expect(normaliseNif(' 000 000 000-aa.000 ')).toEqual({ ok: true, value: '000000000AA000' });
  });
  it('is optional', () => {
    expect(normaliseNif('')).toEqual({ ok: true });
    expect(normaliseNif(undefined)).toEqual({ ok: true });
  });
  it('rejects other characters and implausible lengths', () => {
    expect(normaliseNif('12AB#')).toEqual({ ok: false });
    expect(normaliseNif('123')).toEqual({ ok: false });
  });
});
