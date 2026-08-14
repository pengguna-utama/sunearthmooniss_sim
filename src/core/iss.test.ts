import { describe, it, expect } from 'vitest';
import { issState, parseTleBlock, DEFAULT_TLE_LINE1, DEFAULT_TLE_LINE2 } from './iss';
import { vecLen } from './types';
import { EARTH_RADIUS } from '../constants';

describe('ISS SGP4', () => {
  it('propagasi dekat epoch menghasilkan ketinggian orbit nyata (380–470 km)', () => {
    // Epoch TLE ≈ 26224.43930095 → 2026 utk dihitung via jday? gunakan +2 hari dari now.
    const d = new Date();
    d.setUTCDate(d.getUTCDate() + 2);
    const s = issState(d);
    expect(s.propagasiOk).toBe(true);
    expect(s.altKm).toBeGreaterThan(380);
    expect(s.altKm).toBeLessThan(470);
    expect(Math.abs(s.latDeg)).toBeLessThanOrEqual(51.7);
    expect(s.lonDeg).toBeGreaterThanOrEqual(-180);
    expect(s.lonDeg).toBeLessThanOrEqual(180);
    // Posisi ECI harus seukuran orbit Bumi
    const rEci = vecLen({ x: s.eciVec.x, y: s.eciVec.y, z: s.eciVec.z });
    expect(rEci).toBeGreaterThan(EARTH_RADIUS + 350);
    expect(rEci).toBeLessThan(EARTH_RADIUS + 500);
  });

  it('parseTleBlock menangani blok 3 baris dan 2 baris', () => {
    const three = parseTleBlock(`ISS\n${DEFAULT_TLE_LINE1}\n${DEFAULT_TLE_LINE2}`);
    expect(three).not.toBeNull();
    expect(three!.line1).toBe(DEFAULT_TLE_LINE1);
    const two = parseTleBlock(`${DEFAULT_TLE_LINE1}\n${DEFAULT_TLE_LINE2}`);
    expect(two!.line1).toBe(DEFAULT_TLE_LINE1);
  });
});