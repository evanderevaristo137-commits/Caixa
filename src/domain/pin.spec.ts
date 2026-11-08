import { describe, expect, it } from 'vitest';
import { hashPin, isValidPin, newSalt, verifyPin } from './pin';

describe('owner PIN', () => {
  it('accepts 4 to 6 digits only', () => {
    expect(isValidPin('1234')).toBe(true);
    expect(isValidPin('123456')).toBe(true);
    expect(isValidPin('123')).toBe(false);
    expect(isValidPin('1234567')).toBe(false);
    expect(isValidPin('12a4')).toBe(false);
  });
  it('is never stored in clear and verifies only the right code', async () => {
    const salt = newSalt();
    const hash = await hashPin('2580', salt);
    expect(hash).not.toContain('2580');
    expect(hash).toHaveLength(64);
    expect(await verifyPin('2580', salt, hash)).toBe(true);
    expect(await verifyPin('2581', salt, hash)).toBe(false);
    expect(await hashPin('2580', newSalt())).not.toBe(hash);
  });
});
