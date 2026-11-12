/**
 * The phone's clock decides the day of each sale. If it goes back (changed by hand, a flat battery
 * that lost the time), new records land on the wrong day and "Hoje" stops matching the till.
 * The app cannot know the right time without the internet, but it knows the time of the last thing
 * the shop recorded: a clock earlier than that is certainly wrong.
 */

/** A clock a few minutes off is normal; beyond this, the shop is told. */
export const CLOCK_TOLERANCE_MS = 10 * 60_000;

/** True when the phone's clock is earlier than the last record of the shop (beyond the tolerance). */
export function clockWentBack(lastRecordAt: string | undefined, now: Date): boolean {
  if (!lastRecordAt) return false;
  const last = Date.parse(lastRecordAt);
  return Number.isFinite(last) && last - now.getTime() > CLOCK_TOLERANCE_MS;
}
