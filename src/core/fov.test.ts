import { describe, it, expect } from 'vitest';
import { computeIssFov } from './fov';

describe('FoV ISS', () => {
  it('elevasi 0°, altitude ±400 km → diameter footprint ≈ 4.400 km', () => {
    // ISS pada vektor geosentrik 6771 km
    const fov = computeIssFov({ x: 0, y: 0, z: 6771 });
    const lambdaDeg = (fov.centralAngleRad(0) * 180) / Math.PI;
    expect(lambdaDeg).toBeCloseTo(Math.acos(6371.0088 / 6771) * (180 / Math.PI), 1);
    const fp = fov.footprintKm(0);
    expect(fp).toBeGreaterThan(4200);
    expect(fp).toBeLessThan(4600);
    expect(fov.coneHalfAngleRad * (180 / Math.PI)).toBeGreaterThan(69);
  });

  it('elevasi minimum naik → footprint mengecil', () => {
    const fov = computeIssFov({ x: 7000, y: 0, z: 0 });
    const fp0 = fov.footprintKm(0);
    const fp10 = fov.footprintKm(10);
    const fp20 = fov.footprintKm(20);
    expect(fp20).toBeLessThan(fp10);
    expect(fp10).toBeLessThan(fp0);
    expect(fp0).toBeGreaterThan(0);
  });

  it('luas wilayah terlihat masuk akal (juta-an km²)', () => {
    const fov = computeIssFov({ x: 0, y: 0, z: 6771 });
    const a = fov.areaKm2(0);
    expect(a).toBeGreaterThan(1.3e7);
    expect(a).toBeLessThan(1.6e7);
  });
});