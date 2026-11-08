const DAY_MS = 24 * 60 * 60 * 1000;

/** Start of the local day (midnight on the phone's clock) for a given instant. */
export function startOfLocalDay(date: Date): Date {
  const d = new Date(date);
  d.setHours(0, 0, 0, 0);
  return d;
}

export function addDays(date: Date, days: number): Date {
  const d = new Date(date);
  d.setDate(d.getDate() + days);
  return d;
}

/** Whole calendar days between two instants, in local time (0 = same day). */
export function calendarDaysBetween(from: Date, to: Date): number {
  const a = startOfLocalDay(from).getTime();
  const b = startOfLocalDay(to).getTime();
  return Math.round((b - a) / DAY_MS);
}

export function formatDate(iso: string): string {
  const d = new Date(iso);
  const dd = String(d.getDate()).padStart(2, '0');
  const mm = String(d.getMonth() + 1).padStart(2, '0');
  return `${dd}/${mm}/${d.getFullYear()}`;
}

export function formatDateTime(iso: string): string {
  const d = new Date(iso);
  const hh = String(d.getHours()).padStart(2, '0');
  const mi = String(d.getMinutes()).padStart(2, '0');
  return `${formatDate(iso)} ${hh}:${mi}`;
}

/** "09:05" */
export function formatTime(iso: string): string {
  const d = new Date(iso);
  return `${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}`;
}

export function isSameLocalDay(a: Date, b: Date): boolean {
  return startOfLocalDay(a).getTime() === startOfLocalDay(b).getTime();
}

const WEEKDAYS = ['dom.', 'seg.', 'ter.', 'qua.', 'qui.', 'sex.', 'sáb.'];

/** "Hoje", "Ontem", or e.g. "qua., 04/11" for older days. */
export function dayLabel(day: Date, now: Date): string {
  const diff = calendarDaysBetween(day, now);
  if (diff === 0) return 'Hoje';
  if (diff === 1) return 'Ontem';
  const dd = String(day.getDate()).padStart(2, '0');
  const mm = String(day.getMonth() + 1).padStart(2, '0');
  return `${WEEKDAYS[day.getDay()]}, ${dd}/${mm}`;
}

// ---- Calendar dates without time ("YYYY-MM-DD", the phone's local calendar) ----
// Used for payment due dates: a due date is a day, not an instant.

const pad = (n: number) => String(n).padStart(2, '0');

export function toLocalDateString(d: Date): string {
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
}

export function isValidDateString(s: string | undefined): s is string {
  if (!s || !/^\d{4}-\d{2}-\d{2}$/.test(s)) return false;
  const d = fromLocalDateString(s);
  return toLocalDateString(d) === s;
}

/** Local midnight of a "YYYY-MM-DD" date. */
export function fromLocalDateString(s: string): Date {
  const [y, m, d] = s.split('-').map(Number);
  return new Date(y!, m! - 1, d!);
}

export function addDaysToDateString(s: string, days: number): string {
  return toLocalDateString(addDays(fromLocalDateString(s), days));
}

/** Whole days from `from` to `to` (negative when `to` is earlier). */
export function daysBetweenDateStrings(from: string, to: string): number {
  return calendarDaysBetween(fromLocalDateString(from), fromLocalDateString(to));
}

export function endOfMonthDateString(d: Date): string {
  return toLocalDateString(new Date(d.getFullYear(), d.getMonth() + 1, 0));
}

/** "21/11/2026" */
export function formatDateString(s: string): string {
  const [y, m, d] = s.split('-');
  return `${d}/${m}/${y}`;
}

/** "sex., 21/11/2026" */
export function formatDateStringLong(s: string): string {
  return `${WEEKDAYS[fromLocalDateString(s).getDay()]}, ${formatDateString(s)}`;
}
