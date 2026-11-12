import { describe, expect, it } from 'vitest';
import {
  decrypt,
  deriveKey,
  encrypt,
  exportRawKey,
  fromBase64,
  gunzip,
  gzip,
  importRawKey,
  normalisePassword,
  randomBytes,
  toBase64,
} from './pack';

describe('gzip', () => {
  it('compresses text given in pieces and gives it back exactly, accents included', async () => {
    const parts = ['{"name":"Feijão manteiga — 1 kg",', '"price":140000}', 'ção'.repeat(10_000)];
    const packed = await gzip(parts);
    expect(packed.length).toBeLessThan(parts.join('').length / 10);
    expect(await gunzip(packed)).toBe(parts.join(''));
  });

  it('refuses bytes that are not gzip', async () => {
    await expect(gunzip(new Uint8Array([1, 2, 3, 4, 5]))).rejects.toThrow();
  });
});

/** Bytes that look random (every value appears), for any length. */
const someBytes = (n: number) => Uint8Array.from({ length: n }, (_, i) => (i * 7919 + (i >> 8) * 31) & 0xff);

describe('base64', () => {
  it('round-trips any bytes, of any length', () => {
    for (const n of [0, 1, 2, 3, 4, 5, 12_287, 12_288, 12_289, 100_000]) {
      const bytes = someBytes(n);
      expect(fromBase64(toBase64(bytes))).toEqual(bytes);
    }
  });

  it('matches the standard alphabet and ignores line breaks', () => {
    const bytes = new TextEncoder().encode('Caixa: «12.500 Kz»');
    const b64 = toBase64(bytes);
    expect(b64).toBe(Buffer.from(bytes).toString('base64'));
    expect(fromBase64(b64.slice(0, 8) + '\r\n' + b64.slice(8))).toEqual(bytes);
  });

  it('refuses text that is not base64', () => {
    expect(() => fromBase64('não é base64!')).toThrow('not_base64');
    expect(() => fromBase64('abc')).toThrow('not_base64');
  });
});

describe('password encryption', () => {
  const salt = randomBytes(16);
  // Few rounds in tests; the app uses KDF_ITERATIONS.
  const rounds = 1_000;

  it('the same password and salt give the same key; spaces around it and accent forms do not matter', async () => {
    const a = await exportRawKey(await deriveKey('pão com chouriço', salt, rounds, true));
    const b = await exportRawKey(await deriveKey('  pão com chouriço ', salt, rounds, true));
    const c = await exportRawKey(await deriveKey('pão com chouriço', salt, rounds, true));
    expect(b).toEqual(a);
    expect(c).toEqual(a);
    expect(normalisePassword(' x ')).toBe('x');
    const other = await exportRawKey(await deriveKey('pão com chouriço', randomBytes(16), rounds, true));
    expect(other).not.toEqual(a);
  });

  it('encrypts and decrypts; the wrong password, another context or a changed byte fail', async () => {
    const key = await deriveKey('frase secreta da loja', salt, rounds);
    const data = new TextEncoder().encode('vendas de hoje');
    const sealed = await encrypt(key, data, 'caixa:2:2026-11-12');
    expect(sealed.iv).toHaveLength(12);
    expect(new TextDecoder().decode(await decrypt(key, sealed.iv, sealed.data, 'caixa:2:2026-11-12'))).toBe('vendas de hoje');

    const wrong = await deriveKey('outra frase', salt, rounds);
    await expect(decrypt(wrong, sealed.iv, sealed.data, 'caixa:2:2026-11-12')).rejects.toThrow();
    await expect(decrypt(key, sealed.iv, sealed.data, 'caixa:2:2026-11-13')).rejects.toThrow();
    const changed = sealed.data.slice();
    changed[0]! ^= 1;
    await expect(decrypt(key, sealed.iv, changed, 'caixa:2:2026-11-12')).rejects.toThrow();
  });

  it('a key kept as raw bytes works like the derived one, and every encryption uses a new iv', async () => {
    const derived = await deriveKey('frase secreta da loja', salt, rounds, true);
    const kept = await importRawKey(await exportRawKey(derived));
    const data = new TextEncoder().encode('x');
    const one = await encrypt(kept, data, 'c');
    const two = await encrypt(kept, data, 'c');
    expect(one.iv).not.toEqual(two.iv);
    expect(await decrypt(derived, one.iv, one.data, 'c')).toEqual(data);
  });
});
