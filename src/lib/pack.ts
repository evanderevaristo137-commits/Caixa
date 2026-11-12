/**
 * Packing data for backups, with what Chrome already has (no libraries):
 * gzip (CompressionStream), base64, and AES-GCM with a key derived from a password (PBKDF2).
 */

/** Compresses text (or text already turned into a Blob) with gzip. */
export async function gzip(parts: BlobPart[]): Promise<Uint8Array<ArrayBuffer>> {
  const stream = new Blob(parts).stream().pipeThrough(new CompressionStream('gzip'));
  return new Uint8Array(await new Response(stream).arrayBuffer());
}

/** Undoes gzip and reads the result as UTF-8 text. Throws when the bytes are not valid gzip. */
export async function gunzip(bytes: Uint8Array<ArrayBuffer>): Promise<string> {
  const stream = new Blob([bytes]).stream().pipeThrough(new DecompressionStream('gzip'));
  return new Response(stream).text();
}

/** Base64, in pieces so that megabytes never go through one function call. */
export function toBase64(bytes: Uint8Array): string {
  const out: string[] = [];
  const step = 3 * 4096;
  for (let i = 0; i < bytes.length; i += step) {
    out.push(btoa(String.fromCharCode(...bytes.subarray(i, i + step))));
  }
  return out.join('');
}

/** Reads base64, ignoring spaces and line breaks. Throws on anything that is not base64. */
export function fromBase64(text: string): Uint8Array<ArrayBuffer> {
  const clean = text.replace(/\s+/g, '');
  if (clean.length % 4 !== 0 || !/^[A-Za-z0-9+/]*={0,2}$/.test(clean)) throw new Error('not_base64');
  const binary = atob(clean);
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i);
  return bytes;
}

/** PBKDF2-SHA256 rounds: slow enough that guessing passwords takes years, about a second on a cheap phone. */
export const KDF_ITERATIONS = 600_000;

/** The same password must give the same key on any phone: spaces around it are dropped, accents normalised. */
export const normalisePassword = (password: string) => password.normalize('NFC').trim();

export const randomBytes = (n: number) => crypto.getRandomValues(new Uint8Array(n));

/** AES-256 key derived from a password. `extractable` only when the raw key must be kept on the phone. */
export async function deriveKey(
  password: string,
  salt: Uint8Array<ArrayBuffer>,
  iterations: number,
  extractable = false,
): Promise<CryptoKey> {
  const material = await crypto.subtle.importKey('raw', new TextEncoder().encode(normalisePassword(password)), 'PBKDF2', false, [
    'deriveKey',
  ]);
  return crypto.subtle.deriveKey(
    { name: 'PBKDF2', hash: 'SHA-256', salt, iterations },
    material,
    { name: 'AES-GCM', length: 256 },
    extractable,
    ['encrypt', 'decrypt'],
  );
}

export async function exportRawKey(key: CryptoKey): Promise<Uint8Array<ArrayBuffer>> {
  return new Uint8Array(await crypto.subtle.exportKey('raw', key));
}

export function importRawKey(raw: Uint8Array<ArrayBuffer>): Promise<CryptoKey> {
  return crypto.subtle.importKey('raw', raw, 'AES-GCM', false, ['encrypt', 'decrypt']);
}

/**
 * AES-GCM: encrypts and seals. `context` is not secret but is sealed too: changing it (or one byte
 * of the data) makes decryption fail.
 */
export async function encrypt(
  key: CryptoKey,
  data: Uint8Array<ArrayBuffer>,
  context: string,
): Promise<{ iv: Uint8Array<ArrayBuffer>; data: Uint8Array<ArrayBuffer> }> {
  const iv = randomBytes(12);
  const sealed = await crypto.subtle.encrypt({ name: 'AES-GCM', iv, additionalData: new TextEncoder().encode(context) }, key, data);
  return { iv, data: new Uint8Array(sealed) };
}

/** Throws when the key is wrong or the data or context were changed. */
export async function decrypt(
  key: CryptoKey,
  iv: Uint8Array<ArrayBuffer>,
  data: Uint8Array<ArrayBuffer>,
  context: string,
): Promise<Uint8Array<ArrayBuffer>> {
  const plain = await crypto.subtle.decrypt({ name: 'AES-GCM', iv, additionalData: new TextEncoder().encode(context) }, key, data);
  return new Uint8Array(plain);
}
