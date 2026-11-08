/**
 * Owner code (PIN) for sensitive actions. Stored only as a salted SHA-256 hash, on the phone.
 * It is a deterrent against casual misuse, not a vault: whoever controls the phone can wipe the app.
 */
export const PIN_MIN = 4;
export const PIN_MAX = 6;

export function isValidPin(pin: string): boolean {
  return new RegExp(`^\\d{${PIN_MIN},${PIN_MAX}}$`).test(pin);
}

function toHex(buf: ArrayBuffer): string {
  return Array.from(new Uint8Array(buf), (b) => b.toString(16).padStart(2, '0')).join('');
}

export function newSalt(): string {
  return toHex(crypto.getRandomValues(new Uint8Array(16)).buffer);
}

export async function hashPin(pin: string, salt: string): Promise<string> {
  const data = new TextEncoder().encode(`${salt}:${pin}`);
  return toHex(await crypto.subtle.digest('SHA-256', data));
}

export async function verifyPin(pin: string, salt: string, hash: string): Promise<boolean> {
  return (await hashPin(pin, salt)) === hash;
}
