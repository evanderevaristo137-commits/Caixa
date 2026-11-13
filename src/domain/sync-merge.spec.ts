import { describe, expect, it } from 'vitest';
import { mergeRecords, type SyncRecord } from './sync-merge';

const t = (minute: number) => new Date(Date.UTC(2026, 10, 13, 10, minute)).toISOString();

describe('joining two copies of a record', () => {
  it('a record this phone does not have yet is taken as it is', () => {
    const remote = { id: 's1', totalCents: 100, createdAt: t(0), updatedAt: t(0) };
    expect(mergeRecords('fact', undefined, remote)).toEqual({ record: remote, changed: true });
  });

  it('a sale voided on the other phone is voided here too, and a void is never undone', () => {
    const here = { id: 's1', totalCents: 100, createdAt: t(0), updatedAt: t(0) };
    const there = { ...here, voidedAt: t(5), voidReason: 'Engano', updatedAt: t(5) };
    expect(mergeRecords('fact', here, there).record).toEqual(there);
    // The other way round (an old copy arriving after the void): still voided.
    expect(mergeRecords('fact', there, here)).toEqual({ record: there, changed: false });
  });

  it('voided on both phones: the first void counts, with its reason, whatever the order', () => {
    const base = { id: 's1', totalCents: 100, createdAt: t(0) };
    const first: SyncRecord = { ...base, voidedAt: t(3), voidReason: 'Cliente desistiu', updatedAt: t(3) };
    const second: SyncRecord = { ...base, voidedAt: t(7), voidReason: 'Engano', replacedBySaleId: 's9', updatedAt: t(7) };
    const ab = mergeRecords('fact', first, second).record;
    const ba = mergeRecords('fact', second, first).record;
    expect(ab).toEqual(ba);
    expect(ab).toMatchObject({ voidedAt: t(3), voidReason: 'Cliente desistiu', updatedAt: t(7) });
    expect(ab.replacedBySaleId).toBeUndefined();
  });

  it('a payment confirmed on one phone and voided on the other keeps both steps', () => {
    const base = { id: 's1', createdAt: t(0), pendingSince: t(0) };
    const confirmed: SyncRecord = { ...base, confirmedAt: t(4), updatedAt: t(4) };
    const voided: SyncRecord = { ...base, voidedAt: t(6), voidReason: 'Engano', updatedAt: t(6) };
    const merged = mergeRecords('fact', confirmed, voided).record;
    expect(merged).toMatchObject({ confirmedAt: t(4), voidedAt: t(6), voidReason: 'Engano' });
    expect(mergeRecords('fact', voided, confirmed).record).toEqual(merged);
  });

  it('an edited product keeps the most recent version, says which one lost, and never takes the other stock', () => {
    const here: SyncRecord = { id: 'p1', name: 'Arroz 1 kg', priceCents: 120_000, stock: 14, updatedAt: t(2) };
    const there: SyncRecord = { id: 'p1', name: 'Arroz 1 kg', priceCents: 130_000, stock: 20, updatedAt: t(5) };
    const m = mergeRecords('editable', here, there, ['stock']);
    expect(m.record).toEqual({ id: 'p1', name: 'Arroz 1 kg', priceCents: 130_000, stock: 14, updatedAt: t(5) });
    expect(m.overwritten).toEqual(here);
    // An older edit arriving later changes nothing.
    const back = mergeRecords('editable', m.record, here, ['stock']);
    expect(back.changed).toBe(false);
    expect(back.overwritten).toBeUndefined();
  });

  it('two edits at the same moment: the same winner on both phones', () => {
    const a: SyncRecord = { id: 'c1', name: 'Joana', updatedAt: t(1) };
    const b: SyncRecord = { id: 'c1', name: 'Joana Mateus', updatedAt: t(1) };
    expect(mergeRecords('editable', a, b).record).toEqual(mergeRecords('editable', b, a).record);
  });

  it('archived on one phone stays archived after a later edit on the other; the latest reminder counts', () => {
    const archived: SyncRecord = { id: 'p1', name: 'Velas', archivedAt: t(3), updatedAt: t(3) };
    const edited: SyncRecord = { id: 'p1', name: 'Velas (caixa)', updatedAt: t(8) };
    expect(mergeRecords('editable', archived, edited).record).toMatchObject({ name: 'Velas (caixa)', archivedAt: t(3) });
    expect(mergeRecords('editable', edited, archived).record).toMatchObject({ name: 'Velas (caixa)', archivedAt: t(3) });
    const c1: SyncRecord = { id: 'c1', name: 'Joana', lastRemindedAt: t(9), updatedAt: t(1) };
    const c2: SyncRecord = { id: 'c1', name: 'Joana', lastRemindedAt: t(4), updatedAt: t(1) };
    expect(mergeRecords('editable', c2, c1).record.lastRemindedAt).toBe(t(9));
    expect(mergeRecords('editable', c1, c2).record.lastRemindedAt).toBe(t(9));
  });
});
