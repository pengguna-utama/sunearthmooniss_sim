import * as A from 'astronomy-engine';
import { eqjToEclKm } from './convert';
import { issState } from './iss';
import { vecAdd, vecLen, vecSub, type Vec3 } from './types';

export interface Ephemeris {
  // Posisi heliosentris bidang ekliptika (km). Matahari di titik asal.
  earth: Vec3;
  // Posisi heliosentris Bulan (km).
  moon: Vec3;
  // ISS relatif terhadap pusat Bumi (km).
  issGeo: Vec3;
  issLatDeg: number;
  issLonDeg: number;
  issAltKm: number;
  issMode: 'sgp4' | 'analitik';
  // Jarak momen
  earthSunKm: number;
  moonEarthKm: number;
  issEarthKm: number;
  sunFromEarth: Vec3;
  /**
   * Menyimpan api longitude/latitude Bulan untuk panel info bila diperlukan
   * (fase Bulan dihitung terpisah).
   */
}

/** Hitung posisi akurat Matahari/Bumi/Bulan/ISS untuk satu tanggal. */
export function computeEphemeris(date: Date): Ephemeris {
  const earthHelioEqj = A.HelioVector(A.Body.Earth, date);
  const moonGeoEqj = A.GeoVector(A.Body.Moon, date, false);

  const earth = eqjToEclKm(earthHelioEqj);
  const moonGeo = eqjToEclKm(moonGeoEqj);
  const moon = vecAdd(earth, moonGeo);

  const iss = issState(date);
  const issGeo = iss.eclVec;

  const sunFromEarth: Vec3 = { x: -earth.x, y: -earth.y, z: -earth.z };

  return {
    earth,
    moon,
    issGeo,
    issLatDeg: iss.latDeg,
    issLonDeg: iss.lonDeg,
    issAltKm: iss.altKm,
    issMode: iss.mode,
    earthSunKm: vecLen(earth),
    moonEarthKm: vecLen(moonGeo),
    issEarthKm: vecLen(issGeo),
    sunFromEarth,
  };
}

/** Jarak total cahaya Matahari → Bulan → Bumi (konfigurasi gerhana), km. */
export function sunMoonDistanceKm(sun: Vec3, moon: Vec3): number {
  return vecLen(vecSub(moon, sun));
}

/** Kecepatan linear rata-rata ISS (km/s) dari jari-jari orbit.
 * Untuk orbit melingkar: v = √(μ/r), dengan μ = GM_Bumi = 398600,4418 km³/s².
 */
export function issSpeedKmS(issGeo: Vec3): number {
  const r = Math.max(vecLen(issGeo), 6500);
  return Math.sqrt(398600.4418 / r);
}

/** Kecepatan linear Bumi mengelilingi Matahari (km/s).
 * Untuk orbit melingkar di sekitar Matahari: v = √(μ_sun / r), dengan μ_sun = GM_Matahari = 1,32712440018 × 10¹¹ km³/s².
 */
export function earthSpeedKmS(earth: Vec3): number {
  const r = Math.max(vecLen(earth), 1e6);
  return Math.sqrt(1.32712440018e11 / r);
}