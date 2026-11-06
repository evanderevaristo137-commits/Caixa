export type StockChangeError = 'not_whole' | 'not_positive' | 'reason_required' | 'no_change';

/** Validates a stock entry (goods arriving): a positive whole number. */
export function validateEntry(quantity: number): StockChangeError | null {
  if (!Number.isInteger(quantity)) return 'not_whole';
  if (quantity <= 0) return 'not_positive';
  return null;
}

/**
 * Validates an adjustment where the shopkeeper states the real counted quantity.
 * Returns the delta to apply, or an error. A reason is always required.
 */
export function adjustmentDelta(
  currentStock: number,
  countedQuantity: number,
  reason: string,
): { delta: number } | { error: StockChangeError } {
  if (!Number.isInteger(countedQuantity)) return { error: 'not_whole' };
  if (countedQuantity < 0) return { error: 'not_positive' };
  if (reason.trim().length < 3) return { error: 'reason_required' };
  const delta = countedQuantity - currentStock;
  if (delta === 0) return { error: 'no_change' };
  return { delta };
}
