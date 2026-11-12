/**
 * Owner code (PIN) for sensitive actions. Kept only as a salted PBKDF2-SHA256 hash, on the phone,
 * and checked by the Store itself (not only by the screens), with a growing wait after wrong codes.
 * It is a deterrent against casual misuse, not a vault: whoever controls the phone can wipe the app.
 */
export const PIN_MIN = 4;
export const PIN_MAX = 6;
/** Rounds of PBKDF2: about a quarter of a second on a cheap phone, each time the code is checked. */
export const PIN_ITERATIONS = 150_000;
const PREFIX = 'pbkdf2-sha256';

export function isValidPin(pin: string): boolean {
  return new RegExp(`^\\d{${PIN_MIN},${PIN_MAX}}$`).test(pin);
}

function toHex(buf: ArrayBuffer): string {
  return Array.from(new Uint8Array(buf), (b) => b.toString(16).padStart(2, '0')).join('');
}

export function newSalt(): string {
  return toHex(crypto.getRandomValues(new Uint8Array(16)).buffer);
}

/** "pbkdf2-sha256$150000$<hex>": the rounds travel with the hash, so they can grow later. */
export async function hashPin(pin: string, salt: string, iterations = PIN_ITERATIONS): Promise<string> {
  const material = await crypto.subtle.importKey('raw', new TextEncoder().encode(pin), 'PBKDF2', false, ['deriveBits']);
  const bits = await crypto.subtle.deriveBits(
    { name: 'PBKDF2', hash: 'SHA-256', salt: new TextEncoder().encode(salt), iterations },
    material,
    256,
  );
  return `${PREFIX}$${iterations}$${toHex(bits)}`;
}

/** How codes were kept until November 2026 (one round of SHA-256). Only read, to upgrade them. */
export async function legacyHashPin(pin: string, salt: string): Promise<string> {
  return toHex(await crypto.subtle.digest('SHA-256', new TextEncoder().encode(`${salt}:${pin}`)));
}

/** Compares without stopping at the first different character. */
const sameText = (a: string, b: string) => {
  if (a.length !== b.length) return false;
  let diff = 0;
  for (let i = 0; i < a.length; i++) diff |= a.charCodeAt(i) ^ b.charCodeAt(i);
  return diff === 0;
};

/** Checks a code against what is kept. `upgrade`: right, but kept the old way (or with fewer rounds). */
export async function verifyPin(pin: string, salt: string, stored: string): Promise<{ ok: boolean; upgrade: boolean }> {
  const m = /^pbkdf2-sha256\$(\d+)\$[0-9a-f]{64}$/.exec(stored);
  if (m) {
    const rounds = Number(m[1]);
    return { ok: sameText(await hashPin(pin, salt, rounds), stored), upgrade: rounds < PIN_ITERATIONS };
  }
  return { ok: sameText(await legacyHashPin(pin, salt), stored), upgrade: true };
}

/** Wrong codes allowed in a row before having to wait. */
export const PIN_FREE_TRIES = 3;

/** After 3 wrong codes in a row, wait 30 s; each new wrong code doubles the wait, up to an hour. */
export function pinWaitMs(fails: number): number {
  if (fails < PIN_FREE_TRIES) return 0;
  return Math.min(30_000 * 2 ** (fails - PIN_FREE_TRIES), 3_600_000);
}
