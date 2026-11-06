import { describe, expect, it } from 'vitest';
import { backupReminderDays } from './backup-reminder';

const now = new Date(2026, 10, 20, 10, 0);
const daysAgo = (n: number) => new Date(2026, 10, 20 - n, 9, 0).toISOString();

describe('backupReminderDays', () => {
  it('stays quiet when there are no sales yet', () => {
    expect(backupReminderDays({ now })).toBeNull();
  });
  it('first reminder 3 days after the first sale when there was never a backup', () => {
    expect(backupReminderDays({ firstSaleAt: daysAgo(2), now })).toBeNull();
    expect(backupReminderDays({ firstSaleAt: daysAgo(3), now })).toBe(3);
  });
  it('then reminds every 7 days after the last backup', () => {
    expect(backupReminderDays({ firstSaleAt: daysAgo(30), lastBackupAt: daysAgo(6), now })).toBeNull();
    expect(backupReminderDays({ firstSaleAt: daysAgo(30), lastBackupAt: daysAgo(9), now })).toBe(9);
  });
});
