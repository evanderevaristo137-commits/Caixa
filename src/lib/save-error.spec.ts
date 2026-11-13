import { describe, expect, it } from 'vitest';
import { isNoSpace, saveFailedText } from './save-error';

describe('a full phone', () => {
  it('is recognised however the database wraps it, and said plainly', () => {
    const full = new DOMException('Disk full', 'QuotaExceededError');
    expect(isNoSpace(full)).toBe(true);
    // Dexie wraps what the browser says (a transaction that aborted because the phone was full).
    expect(isNoSpace({ name: 'AbortError', inner: full })).toBe(true);
    expect(isNoSpace({ name: 'DatabaseClosedError', inner: { name: 'AbortError', inner: full } })).toBe(true);
    expect(isNoSpace(new Error('a bug'))).toBe(false);
    expect(isNoSpace(undefined)).toBe(false);
    expect(saveFailedText(full)).toMatch(/^O telemóvel está sem espaço livre e nada foi guardado\./);
    expect(saveFailedText(new Error('a bug'))).toBe('Não foi possível guardar. Tente outra vez.');
  });
});
