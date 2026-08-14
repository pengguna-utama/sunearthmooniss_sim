import { describe, it, expect } from 'vitest';
import { computeShadow, shadowLabel, shadowLightRays } from './shadow';
import { computeEphemeris } from './science';
import { EARTH_RADIUS, MOON_RADIUS, SUN_RADIUS } from '../constants';
import { vecLen, vecNorm, vecSub, vecCross, vecDot, type Vec3 } from './types';

function distPointToLine(p: Vec3, a: Vec3, b: Vec3): number {
  const ab = vecSub(b, a);
  const ap = vecSub(p, a);
  return vecLen(vecCross(ab, ap)) / Math.max(vecLen(ab), 1e-9);
}

describe('bayangan Bulan (umbra & penumbra)', () => {
  it('panjang umbra ≈ 373.000 km (jauh lebih pendek dari jarak Bumi–Matahari)', () => {
    const sun = { x: 0, y: 0, z: 0 };
    const moon = { x: 1.491e8, y: 0, z: 0 };
    const earth = { x: 1.5e8, y: 0, z: 0 };
    const s = computeShadow(sun, moon, earth);
    expect(s.alpha).toBeCloseTo(696340 / 1.491e8, 2);
    expect(s.umbraApexKm).toBeGreaterThan(360000);
    expect(s.umbraApexKm).toBeLessThan(390000);
  });

  it('gerhana total matahari 2024-04-08 terdeteksi', () => {
    const e = computeEphemeris(new Date('2024-04-08T18:18:00Z'));
    const s = computeShadow({ x: 0, y: 0, z: 0 }, e.moon, e.earth);
    expect(s.eclipseType === 'total' || s.eclipseType === 'annular').toBe(true);
    expect(s.shadowTouchesEarth).toBe(true);
    expect(shadowLabel(s)).toMatch(/Gerhana/);
  });

  it('bayangan normalnya tidak menyentuh Bumi (kasus acak jauh dari eklipse)', () => {
    // Asumsikan sebagian besar waktu bayangan meleset; gunakan tanggal tanpa gerhana.
    const e = computeEphemeris(new Date('2026-01-15T12:00:00Z'));
    const s = computeShadow({ x: 0, y: 0, z: 0 }, e.moon, e.earth);
    expect(['total', 'annular', 'partial']).not.toContain(s.eclipseType);
  });

  it('basis u,v ortogonal terhadap sumbu', () => {
    const s = computeShadow(
      { x: 0, y: 0, z: 0 },
      { x: 1.48e8, y: 5e6, z: -3e6 },
      { x: 1.495e8, y: -4e6, z: 2e6 },
    );
    const dotAv = s.axis.x * s.v.x + s.axis.y * s.v.y + s.axis.z * s.v.z;
    const dotUv = s.u.x * s.v.x + s.u.y * s.v.y + s.u.z * s.v.z;
    expect(dotAv).toBeCloseTo(0, 5);
    expect(dotUv).toBeCloseTo(0, 5);
  });

  it('sumbu bayangan menunjuk dari Matahari menembus Bulan (kerucut harus menjauhi Matahari)', () => {
    const sun = { x: 0, y: 0, z: 0 };
    const moon = { x: 1.49e8, y: 0, z: 0 };
    const earth = { x: 1.5e8, y: 2e6, z: 0 };
    const s = computeShadow(sun, moon, earth);
    // dot(axis, moon - sun) harus positif → arah menjauhi Matahari
    const d = s.axis.x * (moon.x - sun.x) + s.axis.y * (moon.y - sun.y) + s.axis.z * (moon.z - sun.z);
    expect(d).toBeGreaterThan(0);
    // jarak Bumi sepanjang sumbu positif → Bumi di sisi jauh dari Matahari
    expect(s.tEarthKm).toBeGreaterThan(0);
  });

  it('sinar umbra menyinggung tepi Bulan sisi sama dan berakhir di puncak umbra', () => {
    const sun = { x: 0, y: 0, z: 0 };
    const moon = { x: 1.49e8, y: 3e6, z: -2e6 };
    const earth = { x: 1.499e8, y: -5e6, z: 4e6 };
    const sh = computeShadow(sun, moon, earth);
    const { umbra } = shadowLightRays(sh, moon, 8);
    for (const r of umbra) {
      // start di tepi piringan Matahari
      expect(vecLen(r.start)).toBeCloseTo(SUN_RADIUS, -4); // toleransi relatif ~1e-4
      // end = puncak umbra (konvergen, semua ray berbagi titik ujung)
      expect(r.end.x).toBeCloseTo(moon.x + sh.axis.x * sh.umbraApexKm, 3);
      // sinar harus melalui tepi Bulan sisi sama: |M + dir*R_moon - garis| ≈ 0
      const dir = vecNorm(r.start);
      const limb: Vec3 = {
        x: moon.x + dir.x * MOON_RADIUS,
        y: moon.y + dir.y * MOON_RADIUS,
        z: moon.z + dir.z * MOON_RADIUS,
      };
      expect(distPointToLine(limb, r.start, r.end)).toBeLessThan(2e4); // km
    }
  });

  it('sinar penumbra menyinggung tepi Bulan sisi lawan dan menyebar', () => {
    const sun = { x: 0, y: 0, z: 0 };
    const moon = { x: 1.49e8, y: 3e6, z: -2e6 };
    const earth = { x: 1.499e8, y: -5e6, z: 4e6 };
    const sh = computeShadow(sun, moon, earth);
    const { penumbra } = shadowLightRays(sh, moon, 8);
    let maxSpread = 0;
    for (const r of penumbra) {
      const dir = vecNorm(r.start);
      const limb: Vec3 = {
        x: moon.x - dir.x * MOON_RADIUS,
        y: moon.y - dir.y * MOON_RADIUS,
        z: moon.z - dir.z * MOON_RADIUS,
      };
      expect(distPointToLine(limb, r.start, r.end)).toBeLessThan(2e4);
      // menyebar: jarak ujung dari sumbu bayangan > jarak titik singgung dari sumbu
      const dEnd = vecDot(r.end, sh.axis);
      const dLimb = vecDot(limb, sh.axis);
      maxSpread = Math.max(maxSpread, dEnd - dLimb);
    }
    expect(maxSpread).toBeGreaterThan(EARTH_RADIUS); // sinar menyebar hingga melewati Bumi
  });
});