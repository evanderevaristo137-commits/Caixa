import { describe, expect, it } from 'vitest';
import { digitalStatus, receipts } from './digital-watch';
import type { PaymentMethod } from './types';

const now = new Date(2026, 10, 9, 10); // Monday 9 November 2026, 10:00
const at = (daysAgo: number) => new Date(2026, 10, 9 - daysAgo, 12).toISOString();
const sale = (daysAgo: number, totalCents: number, method: PaymentMethod, voidedAt?: string) => ({
  createdAt: at(daysAgo),
  totalCents,
  method,
  voidedAt,
});

/** Days ago 1..7 = the measured week; 8..35 = the 4 weeks before. */
function history(dayFrom: number, dayTo: number, cashKz: number, digitalKz: number) {
  const out = [];
  for (let d = dayFrom; d <= dayTo; d++) {
    out.push(sale(d, cashKz * 100, 'cash'));
    out.push(sale(d, digitalKz * 100, 'multicaixa_express'));
  }
  return out;
}

describe('digital receipts', () => {
  it('counts money that came in: sales paid at once and customers paying, never credit sales or voids', () => {
    const r = receipts(
      [sale(1, 100_000, 'cash'), sale(1, 60_000, 'kwik'), sale(1, 50_000, 'credit'), sale(1, 40_000, 'paypay', 'x')],
      [{ createdAt: at(1), amountCents: 40_000, method: 'unitel_money' }],
      0,
      Date.now() * 2,
    );
    expect(r).toEqual({ digitalCents: 100_000, totalCents: 200_000, activeDays: 1, shareBp: 5000 });
  });

  it('is calm when the shop keeps its usual mix', () => {
    const s = digitalStatus([...history(8, 35, 6_000, 4_000), ...history(1, 7, 6_200, 3_900)], [], now, 3000);
    expect(s.week.shareBp).toBe(3861);
    expect(s.baseline).toEqual({ weeklyDigitalCents: 2_800_000, weeklyTotalCents: 7_000_000, shareBp: 4000 });
    expect(s).toMatchObject({ belowMinimum: false, suddenDrop: false, alarm: false });
  });

  it('raises the alarm when digital receipts fall suddenly but sales do not (money moved to cash)', () => {
    const s = digitalStatus([...history(8, 35, 6_000, 4_000), ...history(1, 7, 9_000, 1_000)], [], now);
    expect(s.digitalChangeBp).toBe(-7500);
    expect(s.totalChangeBp).toBe(0);
    expect(s).toMatchObject({ suddenDrop: true, alarm: true, belowMinimum: false });
  });

  it('does not blame the shop when all sales fall together (a quiet week, a power cut)', () => {
    const s = digitalStatus([...history(8, 35, 6_000, 4_000), ...history(1, 7, 3_000, 2_000)], [], now);
    expect(s.digitalChangeBp).toBe(-5000);
    expect(s.totalChangeBp).toBe(-5000);
    expect(s.suddenDrop).toBe(false);
  });

  it('raises the alarm when the digital share falls 15 points or more', () => {
    const s = digitalStatus([...history(8, 35, 6_000, 4_000), ...history(1, 7, 8_000, 2_500)], [], now);
    expect(s.week.shareBp).toBe(2381);
    expect(s.suddenDrop).toBe(true);
  });

  it('checks the minimum of the contract even without history, and skips the drop rule then', () => {
    const s = digitalStatus(history(1, 7, 8_000, 2_000), [], now, 3000);
    expect(s.baseline).toBeUndefined();
    expect(s.week.shareBp).toBe(2000);
    expect(s).toMatchObject({ belowMinimum: true, suddenDrop: false, alarm: true });
    // Today does not count yet: the measure changes once a day.
    expect(digitalStatus([sale(0, 999_000, 'cash')], [], now, 3000).week.totalCents).toBe(0);
  });
});
