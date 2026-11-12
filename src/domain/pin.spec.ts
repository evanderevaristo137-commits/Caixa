import { describe, expect, it } from 'vitest';
import { hashPin, isValidPin, legacyHashPin, newSalt, PIN_ITERATIONS, pinWaitMs, verifyPin } from './pin';

describe('owner PIN', () => {
  it('accepts 4 to 6 digits only', () => {
    expect(isValidPin('1234')).toBe(true);
    expect(isValidPin('123456')).toBe(true);
    expect(isValidPin('123')).toBe(false);
    expect(isValidPin('1234567')).toBe(false);
    expect(isValidPin('12a4')).toBe(false);
  });

  it('is kept only as a slow hash (PBKDF2) with its rounds, and verifies only the right code', async () => {
    const salt = newSalt();
    const hash = await hashPin('2580', salt);
    const [kind, rounds, hex] = hash.split('$');
    expect(kind).toBe('pbkdf2-sha256');
    expect(Number(rounds)).toBe(PIN_ITERATIONS);
    expect(hex).toMatch(/^[0-9a-f]{64}$/);
    expect(hash).not.toContain('2580');
    expect(await verifyPin('2580', salt, hash)).toEqual({ ok: true, upgrade: false });
    expect(await verifyPin('2581', salt, hash)).toEqual({ ok: false, upgrade: false });
    expect(await hashPin('2580', newSalt())).not.toBe(hash);
  });

  it('still reads codes kept the old way (one round of SHA-256), and asks to keep them the new way', async () => {
    const salt = newSalt();
    const old = await legacyHashPin('2580', salt);
    expect(old).toHaveLength(64);
    expect(await verifyPin('2580', salt, old)).toEqual({ ok: true, upgrade: true });
    expect((await verifyPin('0000', salt, old)).ok).toBe(false);
    // Fewer rounds than today: also kept again.
    expect(await verifyPin('2580', salt, await hashPin('2580', salt, 1_000))).toEqual({ ok: true, upgrade: true });
  });

  it('after 3 wrong codes, the wait doubles each time, up to an hour', () => {
    expect([0, 1, 2].map(pinWaitMs)).toEqual([0, 0, 0]);
    expect([3, 4, 5, 6].map(pinWaitMs)).toEqual([30_000, 60_000, 120_000, 240_000]);
    expect(pinWaitMs(20)).toBe(3_600_000);
  });
});
