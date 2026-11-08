import { describe, expect, it } from 'vitest';
import {
  addDays,
  addDaysToDateString,
  calendarDaysBetween,
  dayLabel,
  daysBetweenDateStrings,
  endOfMonthDateString,
  formatDate,
  formatDateString,
  formatDateStringLong,
  isSameLocalDay,
  isValidDateString,
  toLocalDateString,
} from './dates';

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

describe('calendar date strings', () => {
  it('round-trips and validates', () => {
    expect(toLocalDateString(new Date(2026, 0, 5, 23, 59))).toBe('2026-01-05');
    expect(isValidDateString('2026-02-28')).toBe(true);
    expect(isValidDateString('2026-02-30')).toBe(false);
    expect(isValidDateString('21/11/2026')).toBe(false);
  });
  it('adds days across months and years', () => {
    expect(addDaysToDateString('2026-12-25', 15)).toBe('2027-01-09');
    expect(daysBetweenDateStrings('2026-11-06', '2026-11-21')).toBe(15);
    expect(daysBetweenDateStrings('2026-11-21', '2026-11-06')).toBe(-15);
  });
  it('knows the end of the month and formats dates', () => {
    expect(endOfMonthDateString(new Date(2026, 1, 10))).toBe('2026-02-28');
    expect(formatDateString('2026-11-21')).toBe('21/11/2026');
    expect(formatDateStringLong('2026-11-21')).toBe('sáb., 21/11/2026');
  });
});
