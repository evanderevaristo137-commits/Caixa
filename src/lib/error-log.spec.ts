import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { errorsSince, MAX_ERRORS, readErrors, recordError } from './error-log';

/** The browser's small storage, in memory. */
function memoryStorage() {
  const data = new Map<string, string>();
  return {
    getItem: (k: string) => data.get(k) ?? null,
    setItem: (k: string, v: string) => void data.set(k, v),
    removeItem: (k: string) => void data.delete(k),
  };
}

beforeEach(() => {
  vi.stubGlobal('localStorage', memoryStorage());
});
afterEach(() => {
  vi.unstubAllGlobals();
});

describe('the local error log', () => {
  it('keeps the most recent errors first, with where they happened, and counts the last days', () => {
    recordError('screen', new TypeError('x is undefined'), new Date('2026-11-01T10:00:00Z'));
    recordError('sale', new DOMException('Disk full', 'QuotaExceededError'), new Date('2026-11-10T10:00:00Z'));
    recordError('promise', 'falhou', new Date('2026-11-12T10:00:00Z'));
    const errors = readErrors();
    expect(errors.map((e) => e.where)).toEqual(['promise', 'sale', 'screen']);
    expect(errors[1]!.message).toBe('QuotaExceededError: Disk full');
    expect(errors[2]!.message).toBe('TypeError: x is undefined');
    expect(errorsSince(errors, new Date('2026-11-05T10:00:00Z'))).toBe(2);
  });

  it('keeps at most 50, with short messages, and never fails', () => {
    for (let i = 0; i < MAX_ERRORS + 10; i++) recordError('page', new Error('a'.repeat(500)));
    const errors = readErrors();
    expect(errors).toHaveLength(MAX_ERRORS);
    expect(errors[0]!.message.length).toBeLessThanOrEqual(200);
    vi.stubGlobal('localStorage', {
      getItem: () => {
        throw new Error('blocked');
      },
      setItem: () => {
        throw new Error('blocked');
      },
    });
    expect(() => recordError('page', new Error('x'))).not.toThrow();
    expect(readErrors()).toEqual([]);
  });

  it('ignores anything malformed in the storage', () => {
    localStorage.setItem('caixa.errors', 'não é JSON');
    expect(readErrors()).toEqual([]);
    localStorage.setItem(
      'caixa.errors',
      JSON.stringify([
        { at: 'x', where: 'outro', message: 'y' },
        { at: 'x', where: 'page', message: 'ok' },
      ]),
    );
    expect(readErrors()).toEqual([{ at: 'x', where: 'page', message: 'ok' }]);
  });
});
