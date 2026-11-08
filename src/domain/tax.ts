/** IVA rates are kept in basis points (1400 = 14%) so they stay whole numbers. */

/** "14" → 1400, "7,5" → 750, "" → undefined (not filled in), invalid → null. */
export function parsePercentToBp(input: string): number | undefined | null {
  const text = input.replace('%', '').replace(/\s/g, '');
  if (text === '') return undefined;
  const m = /^(\d{1,3})(?:[.,](\d{1,2}))?$/.exec(text);
  if (!m) return null;
  const bp = Number(m[1]) * 100 + Number((m[2] ?? '').padEnd(2, '0'));
  return bp <= 10_000 ? bp : null;
}

/** 1400 → "14", 750 → "7,5" */
export function formatBpAsPercent(bp: number): string {
  const whole = Math.floor(bp / 100);
  const rest = bp % 100;
  return rest === 0 ? String(whole) : `${whole},${String(rest).padStart(2, '0').replace(/0$/, '')}`;
}
