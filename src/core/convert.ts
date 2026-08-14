import * as A from 'astronomy-engine';
import { KM_PER_AU } from '../constants';
import type { Vec3 } from './types';

// Rotasi sekali hitung dari EQJ (J2000 mean equator) ke ECL (J2000 mean ecliptic).
const ECL_ROT = A.Rotation_EQJ_ECL();
const DUMMY_T = new A.AstroTime(0);

export interface EqjVec {
  x: number;
  y: number;
  z: number;
}

/** Konversi vektor EQJ (AU) ke ECL (km) — orientasi layar: bidang ekliptika = X-Y, Z = kutub utara ekliptika. */
export function eqjToEclKm(v: EqjVec): Vec3 {
  const r = A.RotateVector(ECL_ROT, new A.Vector(v.x, v.y, v.z, DUMMY_T));
  return { x: r.x * KM_PER_AU, y: r.y * KM_PER_AU, z: r.z * KM_PER_AU };
}

/** Rotasi EQJ→ECL TANPA perubahan skala (untuk vektor yang sudah dalam km, mis. ECI ISS). */
export function eqjToEcl(v: EqjVec): Vec3 {
  const r = A.RotateVector(ECL_ROT, new A.Vector(v.x, v.y, v.z, DUMMY_T));
  return { x: r.x, y: r.y, z: r.z };
}