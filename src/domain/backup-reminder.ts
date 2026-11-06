import { calendarDaysBetween } from '../lib/dates';

export const FIRST_REMINDER_DAYS = 3;
export const REMINDER_EVERY_DAYS = 7;

/**
 * Decides whether to remind the shopkeeper to make a backup.
 * Never before there is data; first reminder 3 days after the first sale; then every 7 days.
 * Returns the number of days since the last backup (or since the first sale), or null for "no reminder".
 */
export function backupReminderDays(input: { lastBackupAt?: string; firstSaleAt?: string; now: Date }): number | null {
  const { lastBackupAt, firstSaleAt, now } = input;
  if (!firstSaleAt) return null;
  if (lastBackupAt) {
    const days = calendarDaysBetween(new Date(lastBackupAt), now);
    return days >= REMINDER_EVERY_DAYS ? days : null;
  }
  const days = calendarDaysBetween(new Date(firstSaleAt), now);
  return days >= FIRST_REMINDER_DAYS ? days : null;
}
