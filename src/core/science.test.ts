import { describe, it, expect } from 'vitest';
import { computeEphemeris, issSpeedKmS, earthSpeedKmS } from './science';
import { KM_PER_AU } from '../constants';
import { vecLen, vecSub } from './types';

describe('ephemeris posisi Bumi–Matahari', () => {
  it('jarak Bumi–Matahari berada dalam rentang orbit nyata (0.983–1.017 AU)', () => {
    for (const d of [
      '2024-01-15T12:00:00Z',
      '2024-04-08T18:18:00Z',
      '2024-07-15T12:00:00Z',
      '2024-10-15T12:00:00Z',
    ]) {
      const e = computeEphemeris(new Date(d));
      const au = e.earthSunKm / KM_PER_AU;
      expect(au).toBeGreaterThan(0.98);
      expect(au).toBeLessThan(1.02);
    }
  });

  it('jarak Bumi–Bulan berada dalam rentang perigee–apogee (356.400–406.700 km)', () => {
    const e = computeEphemeris(new Date('2024-06-01T00:00:00Z'));
    expect(e.moonEarthKm).toBeGreaterThan(356000);
    expect(e.moonEarthKm).toBeLessThan(407000);
    // Posisi Bulan heliosentris = Bumi + vektor geosentris
    expect(vecLen(vecSub(e.moon, e.earth))).toBeCloseTo(e.moonEarthKm, 3);
  });

  it('Matahari selalu di titik asal', () => {
    const e = computeEphemeris(new Date());
    expect(e.sunFromEarth).toBeDefined();
    expect(vecLen(e.sunFromEarth)).toBeCloseTo(e.earthSunKm, 2);
  });

  it('kecepatan orbital wajar', () => {
    const e = computeEphemeris(new Date('2024-04-01T00:00:00Z'));
    expect(earthSpeedKmS(e.earth)).toBeGreaterThan(28);
    expect(earthSpeedKmS(e.earth)).toBeLessThan(31);
    const iss = computeEphemeris(new Date());
    expect(issSpeedKmS(iss.issGeo)).toBeGreaterThan(7.4);
    expect(issSpeedKmS(iss.issGeo)).toBeLessThan(7.8);
  });
});