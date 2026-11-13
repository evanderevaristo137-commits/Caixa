import { t } from '../i18n/pt-AO';

/** The phone ran out of space for the app's data, however the database wrapped the error. */
export function isNoSpace(e: unknown): boolean {
  let x: unknown = e;
  for (let depth = 0; depth < 5 && typeof x === 'object' && x !== null; depth++) {
    if ((x as { name?: unknown }).name === 'QuotaExceededError') return true;
    x = (x as { inner?: unknown }).inner;
  }
  return false;
}

/** What to say when saving failed: a full phone says so, and what to do; anything else, try again. */
export const saveFailedText = (e: unknown) => (isNoSpace(e) ? t.errors.noSpace : t.errors.saveFailed);
