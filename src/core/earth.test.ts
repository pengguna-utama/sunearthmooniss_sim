import { describe, it, expect } from 'vitest';
import { uToLonEastDeg, vToLatDeg, latLonToUv, localDirAt, gmstRad } from './earth';
import { vecLen } from './types';

describe('pemetaan tekstur Bumi', () => {
  it('u ↔ bujur timur positif (u=0.5 → 0°, u=0.75 → +90°, u=0.25 → −90°)', () => {
    expect(uToLonEastDeg(0.5)).toBe(0);
    expect(uToLonEastDeg(0.75)).toBe(90);
    expect(uToLonEastDeg(0.25)).toBe(-90);
    expect(uToLonEastDeg(1)).toBe(180);
  });

  it('v ↔ lintang utara positif (v=0 → selatan, v=0.5 → 0, v=1 → utara)', () => {
    expect(vToLatDeg(0)).toBe(-90);
    expect(vToLatDeg(0.5)).toBe(0);
    expect(vToLatDeg(1)).toBe(90);
  });

  it('arah lokal mengikuti pemetaan SphereGeometry (0°E→+X, 90°T→−Z, 90°B→+Z, utara→+Y)', () => {
    const z = localDirAt(0, 0);
    expect(z.x).toBeCloseTo(1, 10);
    expect(z.y).toBeCloseTo(0, 10);
    expect(z.z).toBeCloseTo(0, 10);
    const e = localDirAt(0, 90);
    expect(e.z).toBeCloseTo(-1, 10);
    const w = localDirAt(0, -90);
    expect(w.z).toBeCloseTo(1, 10);
    const n = localDirAt(90, 0);
    expect(n.y).toBeCloseTo(1, 10);
    expect(vecLen(localDirAt(30, 120))).toBeCloseTo(1, 8);
  });

  it('latLonToUv adalah invers dari u/v', () => {
    expect(latLonToUv(0, 0)).toEqual({ u: 0.5, v: 0.5 });
    const { u, v } = latLonToUv(-30, 120);
    expect(uToLonEastDeg(u)).toBeCloseTo(120, 8);
    expect(vToLatDeg(v)).toBeCloseTo(-30, 8);
  });

  it('GMST masuk akal (≈18,76 jam sidereal di 2025-01-01 12:00 UTC)', () => {
    const h = gmstRad(new Date('2025-01-01T12:00:00Z')) * (12 / Math.PI);
    expect(h).toBeGreaterThan(18.4);
    expect(h).toBeLessThan(19.0);
  });
});