import { EARTH_RADIUS } from '../constants';
import { vecLen, vecNorm, type Vec3 } from './types';

export interface IssFov {
  /** Jari-jari orbit ISS dari pusat Bumi (km). */
  rKm: number;
  /** Ketinggian ISS di atas permukaan (km). */
  altKm: number;
  /** Arah nadir (satuan). */
  nadir: Vec3;
  /** Setengah sudut kerucut pandang ISS (rad) = asin(R_e / r). */
  coneHalfAngleRad: number;
  /** Sudut pusat λ(ε) = arccos((R_e/r)·cos ε) − ε (rad). */
  centralAngleRad: (elevMinDeg: number) => number;
  /** Diameter footprint (km). */
  footprintKm: (elevMinDeg: number) => number;
  /** Luas region terlihat (km²) ≈ 2π·R_e²·(1−cos λ). */
  areaKm2: (elevMinDeg: number) => number;
}

export function computeIssFov(issGeo: Vec3): IssFov {
  const rKm = Math.max(vecLen(issGeo), EARTH_RADIUS + 350);
  const altKm = rKm - EARTH_RADIUS;
  const nadir = vecNorm(issGeo);
  // Sudut setengah kerucut pandang dari satelit:
  // α = asin(R_Bumi / r), dengan r = jarak satelit ke pusat Bumi.
  const coneHalfAngleRad = Math.asin(EARTH_RADIUS / rKm);

  const centralAngle = (elevMinDeg: number): number => {
    const eps = elevMinDeg * (Math.PI / 180);
    // λ = arccos((R/r) cos ε) − ε, dari geometri segitiga Bumi-satelit-horizon.
    const inside = (EARTH_RADIUS / rKm) * Math.cos(eps);
    const lambda = Math.acos(Math.min(1, Math.max(-1, inside))) - eps;
    return Math.max(0, lambda);
  };

  // Diameter footprint di permukaan Bumi: 2R λ, dengan λ = sudut pusat wilayah yang terlihat.
  const footprint = (elev: number) => 2 * EARTH_RADIUS * centralAngle(elev);
  const area = (elev: number) => {
    const lamb = centralAngle(elev);
    // Luas zona terlihat pada bola: A = 2πR²(1 − cos λ)
    return 2 * Math.PI * EARTH_RADIUS * EARTH_RADIUS * (1 - Math.cos(lamb));
  };

  return {
    rKm,
    altKm,
    nadir,
    coneHalfAngleRad,
    centralAngleRad: centralAngle,
    footprintKm: footprint,
    areaKm2: area,
  };
}