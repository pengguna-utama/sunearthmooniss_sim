export type TimezoneKey = 'UTC' | 'WIB' | 'WITA' | 'WIT';

export const TIMEZONES: Record<TimezoneKey, { label: string; offsetH: number; iana: string }> = {
  UTC: { label: 'UTC', offsetH: 0, iana: 'UTC' },
  WIB: { label: 'WIB (UTC+7)', offsetH: 7, iana: 'Asia/Jakarta' },
  WITA: { label: 'WITA (UTC+8)', offsetH: 8, iana: 'Asia/Makassar' },
  WIT: { label: 'WIT (UTC+9)', offsetH: 9, iana: 'Asia/Jayapura' },
};

export const TZ_KEYS: TimezoneKey[] = ['UTC', 'WIB', 'WITA', 'WIT'];

/** Tanggal (instan) → nilai input datetime-local dalam zona tertentu. */
export function toInputValue(d: Date, tz: TimezoneKey): string {
  const x = new Date(d.getTime() + TIMEZONES[tz].offsetH * 3600000);
  const p = (n: number) => String(n).padStart(2, '0');
  return `${x.getUTCFullYear()}-${p(x.getUTCMonth() + 1)}-${p(x.getUTCDate())}T${p(x.getUTCHours())}:${p(x.getUTCMinutes())}`;
}

/** Nilai input datetime-local (wall time zona tz) → instan Date. */
export function fromInputValue(v: string, tz: TimezoneKey): Date {
  const [date, time] = v.split('T');
  const [y, mo, d] = date.split('-').map(Number);
  const [h, mi] = time.split(':').map(Number);
  return new Date(Date.UTC(y, mo - 1, d, h - TIMEZONES[tz].offsetH, mi));
}

/** Format tanggal lengkap untuk zona tertentu (id-ID). */
export function formatFull(d: Date, tz: TimezoneKey): string {
  return d.toLocaleString('id-ID', {
    timeZone: TIMEZONES[tz].iana,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
    hour12: false,
  });
}