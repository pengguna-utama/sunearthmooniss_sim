import * as A from 'astronomy-engine';
import { ECLIPTIC_OBLIQUITY_RAD } from '../constants';
import type { Vec3 } from './types';

/** GMST (Greenwich Mean Sidereal Time) dalam radian untuk sebuah instan.
 * GMST adalah sudut sidereal Bumi relatif terhadap meridian Greenwich.
 * Rumus yang dipakai: θ = SiderealTime(date) × π/12, karena 1 jam sidereal = 15° = π/12 rad.
 */
export function gmstRad(date: Date): number {
  return A.SiderealTime(date) * (Math.PI / 12);
}

/** Kemiringan sumbu Bumi terhadap ekliptika (rad).
 * Ini adalah konversi dari kemiringan ekliptika 23,4392911° ke radian untuk rotasi koordinat.
 */
export const OBLIQUITY_RAD = ECLIPTIC_OBLIQUITY_RAD;

/**
 * u tekstur equirectangular → bujur (timur positif, Greenwich = 0).
 * u=0 ↔ 180°B, u=0.5 ↔ 0°, u=1 ↔ 180°T.
 * Transformasi linear: λ = 360u − 180°.
 */
export function uToLonEastDeg(u: number): number {
  return u * 360 - 180;
}

/**
 * v tekstur → lintang (utara positif).
 * v=0 ↔ −90° (selatan), v=0.5 ↔ 0° (khatulistiwa), v=1 ↔ +90° (utara).
 * Transformasi linear: φ = 180v − 90°.
 */
export function vToLatDeg(v: number): number {
  return v * 180 - 90;
}

/** lat/lon (timur positif) → (u,v) tekstur equirectangular.
 * Rumus: u = (λ + 180°)/360, v = (φ + 90°)/180.
 */
export function latLonToUv(latDeg: number, lonDeg: number): { u: number; v: number } {
  return { u: (lonDeg + 180) / 360, v: (latDeg + 90) / 180 };
}

/**
 * Arah unit di koordinat lokal bola (frame tekstur).
 * Setelah pemetaan SphereGeometry: lon 0 → +X, 90T → −Z, 90B → +Z, utara → +Y.
 * Koordinat dihitung dari:
 * x = cos φ cos λ
 * y = sin φ
 * z = −cos φ sin λ
 * dengan φ = lintang, λ = bujur dalam radian.
 */
export function localDirAt(latDeg: number, lonDeg: number): Vec3 {
  const phi = (latDeg * Math.PI) / 180;
  const lam = (lonDeg * Math.PI) / 180;
  return { x: Math.cos(phi) * Math.cos(lam), y: Math.sin(phi), z: -Math.cos(phi) * Math.sin(lam) };
}