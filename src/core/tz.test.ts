import { describe, it, expect } from 'vitest';
import { toInputValue, fromInputValue, formatFull, TIMEZONES } from './tz';

describe('zona waktu', () => {
  it('round-trip input → Date → input untuk semua zona', () => {
    for (const tz of ['UTC', 'WIB', 'WITA', 'WIT'] as const) {
      const v = '2024-04-08T18:30';
      const d = fromInputValue(v, tz);
      // instan yang benar: wall time minus offset
      expect(d.toISOString()).toBe(
        `2024-04-08T${String(18 - TIMEZONES[tz].offsetH).padStart(2, '0')}:30:00.000Z`,
      );
      // round-trip
      expect(toInputValue(d, tz)).toBe(v);
    }
  });

  it('toInputValue merepresentasikan instan yang sama di semua zona', () => {
    const instant = new Date('2025-01-01T12:00:00Z');
    const utc = toInputValue(instant, 'UTC');
    const wib = toInputValue(instant, 'WIB');
    const wit = toInputValue(instant, 'WIT');
    expect(utc).toBe('2025-01-01T12:00');
    expect(wib).toBe('2025-01-01T19:00');
    expect(wit).toBe('2025-01-01T21:00');
  });

  it('formatFull memakai zona IANA yang benar', () => {
    const d = new Date('2025-01-01T12:00:00Z');
    const s = formatFull(d, 'WIB');
    // harus berisi tanggal lokal WIB (19:00)
    expect(s).toContain('19');
  });
});