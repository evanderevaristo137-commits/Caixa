import { describe, expect, it } from 'vitest';
import { addDays, calendarDaysBetween, dayLabel, formatDate, isSameLocalDay } from './dates';

const now = new Date(2026, 10, 6, 15, 0); // Friday 6 Nov 2026

describe('dates', () => {
  it('labels days the way people say them', () => {
    expect(dayLabel(now, now)).toBe('Hoje');
    expect(dayLabel(addDays(now, -1), now)).toBe('Ontem');
    expect(dayLabel(addDays(now, -2), now)).toBe('qua., 04/11');
  });
  it('compares calendar days, not 24-hour periods', () => {
    expect(calendarDaysBetween(new Date(2026, 10, 5, 23, 59), new Date(2026, 10, 6, 0, 1))).toBe(1);
    expect(isSameLocalDay(new Date(2026, 10, 6, 0, 0), new Date(2026, 10, 6, 23, 59))).toBe(true);
    expect(formatDate(new Date(2026, 0, 2).toISOString())).toBe('02/01/2026');
  });
});
