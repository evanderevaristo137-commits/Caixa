/**
 * Angolan NIF: companies have digits only; individuals often have letters too
 * (it follows the identity card number). We accept letters and digits, ignore
 * spaces, dots and hyphens, and keep it in capitals. This is data only: the app
 * never validates anything for tax purposes.
 */
export function normaliseNif(input: string | undefined): { ok: true; value?: string } | { ok: false } {
  const value = (input ?? '').toUpperCase().replace(/[\s.\-/]/g, '');
  if (value === '') return { ok: true };
  return /^[A-Z0-9]{6,20}$/.test(value) ? { ok: true, value } : { ok: false };
}
