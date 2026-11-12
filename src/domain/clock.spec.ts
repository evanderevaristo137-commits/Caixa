import { describe, expect, it } from 'vitest';
import { CLOCK_TOLERANCE_MS, clockWentBack } from './clock';

describe("the phone's clock", () => {
  const last = '2026-11-12T15:30:00.000Z';

  it('is fine when it is after the last record, or a few minutes before it', () => {
    expect(clockWentBack(last, new Date('2026-11-12T16:00:00Z'))).toBe(false);
    expect(clockWentBack(last, new Date(Date.parse(last) - CLOCK_TOLERANCE_MS))).toBe(false);
    expect(clockWentBack(undefined, new Date('2020-01-01T00:00:00Z'))).toBe(false); // nothing recorded yet
    expect(clockWentBack('não é uma data', new Date())).toBe(false);
  });

  it('went back when it is earlier than the last record', () => {
    expect(clockWentBack(last, new Date(Date.parse(last) - CLOCK_TOLERANCE_MS - 1))).toBe(true);
    expect(clockWentBack(last, new Date('2026-11-10T09:00:00Z'))).toBe(true);
  });
});
