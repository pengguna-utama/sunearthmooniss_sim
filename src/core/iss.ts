import {
  twoline2satrec,
  propagate,
  eciToGeodetic,
  gstime,
  degreesLat,
  degreesLong,
  type SatRec,
  type PositionAndVelocity,
} from 'satellite.js';
import type { Vec3 } from './types';
import { eqjToEcl } from './convert';

/**
 * TLE ISS (ZARYA / NORAD 25544).
 * Default: diunduh dari Celestrak saat pembangunan (epoch ≈ 2026.224).
 * Pengguna dapat meng-update lewat tombol "Perbarui TLE" di UI.
 */
export const DEFAULT_TLE_NAME = 'ISS (ZARYA)';
export const DEFAULT_TLE_LINE1 = '1 25544U 98067A   26224.43930095  .00003626  00000+0  72910-4 0  9998';
export const DEFAULT_TLE_LINE2 = '2 25544  51.6323  21.6951 0007516  39.2646 320.8886 15.49419670580470';

// SGP4 valid dalam jendela ±SEKITAR epoch TLE. Di luar itu, SGP4 memberi hasil
// menyimpang → fallback model analitik Kepler + regresi nodal J2 agar orbit tetap
// stabil (bidang & arah yang benar) untuk tanggal jauh.
const SGP4_WINDOW_DAYS = 30;

// Parameter gravitasi dan bentuk Bumi.
// GM_EARTH = μ_Bumi = 398600,4418 km³/s², konstanta gravitasi standar untuk Bumi.
const GM_EARTH = 398600.4418; // km³/s²
// J2 = koefisien oblateness Bumi ≈ 1,08262668 × 10⁻³, yang menghasilkan presesi node orbit.
const J2 = 1.08262668e-3;
// R_E = radius referensi Bumi = 6378,137 km, dipakai untuk model orbit dan J2.
const R_E = 6378.137; // km (radius referensi standar)

let satrec: SatRec | null = null;

/** Inisialisasi (atau reset) propagator dengan sepasang TLE. */
export function setTle(tle1: string, tle2: string): void {
  satrec = twoline2satrec(tle1, tle2);
}

/** Parse satu blok TLE (3 baris: nama + 2 baris elemen) atau hanya 2 baris. */
export function parseTleBlock(block: string): { name: string; line1: string; line2: string } | null {
  const lines = block
    .trim()
    .split(/\r?\n/)
    .map((l) => l.trim())
    .filter((l) => l.length > 0);
  if (lines.length === 2) return { name: DEFAULT_TLE_NAME, line1: lines[0], line2: lines[1] };
  if (lines.length >= 3) return { name: lines[0], line1: lines[1], line2: lines[2] };
  return null;
}

function getSatrec(): SatRec {
  if (!satrec) setTle(DEFAULT_TLE_LINE1, DEFAULT_TLE_LINE2);
  return satrec!;
}

/** JD sebuah tanggal. */
function jdOf(date: Date): number {
  // Days since J2000 epoch + 2451545.0
  return date.getTime() / 86400000 + 2440587.5;
}

/**
 * Model analitik posisi ISS (ECI ≈ TEME) dari elemen-mean TLE dengan regresi
 * nodal J2. Digunakan saat tanggal jauh dari epoch TLE di mana SGP4 tidak valid.
 */
function analyticIssEci(rec: SatRec, date: Date): Vec3 {
  // rec.no = mean motion n, satuan rad/menit.
  const nRadMin = rec.no; // rad/menit
  const nRadSec = nRadMin / 60;
  // Hukum Kepler III: a³ = μ / n² ⇒ a = (μ / n²)^(1/3).
  // Ini menghasilkan semimajor axis orbit dari mean motion.
  const a = Math.cbrt(GM_EARTH / (nRadSec * nRadSec)); // km
  const e = rec.ecco;
  const i = rec.inclo;
  const p = a * (1 - e * e);
  // Regresi nodal J2 (rad/menit), berasal dari perturbasi geopotensial zonal J2:
  // Ω̇ = -3/2 J₂ (R_E/p)² n cos i
  const nodeDot = -1.5 * J2 * (R_E / p) * (R_E / p) * nRadMin * Math.cos(i);

  const dtMin = (jdOf(date) - rec.jdsatepoch) * 1440;
  const Omega = rec.nodeo + nodeDot * dtMin;
  const omega = rec.argpo;
  const M0 = rec.mo;
  const M = M0 + nRadMin * dtMin;

  // Persamaan Kepler: E - e sin E = M, diselesaikan numerik dengan Newton-Raphson.
  let E = M;
  for (let k = 0; k < 40; k++) {
    const dE = (E - e * Math.sin(E) - M) / (1 - e * Math.cos(E));
    E -= dE;
    if (Math.abs(dE) < 1e-12) break;
  }

  const cosE = Math.cos(E);
  const sinE = Math.sin(E);
  const nu = Math.atan2(Math.sqrt(1 - e * e) * sinE, cosE - e);
  const r = a * (1 - e * cosE);
  const xp = r * Math.cos(nu);
  const yp = r * Math.sin(nu);

  const cO = Math.cos(Omega);
  const sO = Math.sin(Omega);
  const cw = Math.cos(omega);
  const sw = Math.sin(omega);
  const ci = Math.cos(i);
  const si = Math.sin(i);

  // Rotasi perifokal → ECI
  return {
    x: (cO * cw - sO * sw * ci) * xp + (-cO * sw - sO * cw * ci) * yp,
    y: (sO * cw + cO * sw * ci) * xp + (-sO * sw + cO * cw * ci) * yp,
    z: sw * si * xp + cw * si * yp,
  };
}

export interface IssState {
  /** Posisi relatif ke pusat Bumi, ECL, km. */
  eclVec: Vec3;
  /** Posisi ECI (≈TEME) km. */
  eciVec: Vec3;
  /** Kecepatan ECI km/s (dari SGP4; nol bila fallback analitik). */
  eciVel: Vec3;
  /** Lintang derajat, bujur derajat, ketinggian km. */
  latDeg: number;
  lonDeg: number;
  altKm: number;
  propagasiOk: boolean;
  /** 'sgp4' bila akurat; 'analitik' bila model Kepler+J2. */
  mode: 'sgp4' | 'analitik';
}

/**
 * Propagasi posisi ISS untuk tanggal tertentu.
 * Catatan: frame TEME dari SGP4 didekati sebagai EQJ lalu dirotasi ke ECL —
 * perbedaan TEME vs J2000 sangat kecil (~0,3°) sehingga tidak terlihat dalam visualisasi.
 */
export function issState(date: Date): IssState {
  const rec = getSatrec();
  const dtDays = (jdOf(date) - rec.jdsatepoch);

  let eci: Vec3;
  let eciVel: Vec3;
  let mode: 'sgp4' | 'analitik';
  let propagasiOk = true;

  if (Math.abs(dtDays) <= SGP4_WINDOW_DAYS) {
    const pv: PositionAndVelocity = propagate(rec, date);
    const pos = pv.position;
    const vel = pv.velocity;
    if (typeof pos === 'boolean' || typeof vel === 'boolean') {
      eci = { x: 0, y: 0, z: R_E + 420 };
      eciVel = { x: 0, y: 0, z: 0 };
      propagasiOk = false;
    } else {
      eci = { x: pos.x, y: pos.y, z: pos.z };
      eciVel = { x: vel.x, y: vel.y, z: vel.z };
    }
    mode = 'sgp4';
  } else {
    eci = analyticIssEci(rec, date);
    eciVel = { x: 0, y: 0, z: 0 };
    mode = 'analitik';
  }

  const gmst = gstime(date);
  const gd = eciToGeodetic(eci, gmst);

  return {
    eclVec: eqjToEcl(eci),
    eciVec: eci,
    eciVel,
    latDeg: degreesLat(gd.latitude),
    lonDeg: degreesLong(gd.longitude),
    altKm: gd.height,
    propagasiOk,
    mode,
  };
}

/** Ambil TLE ISS terkini dari Celestrak (membutuhkan internet). */
export async function fetchIssTle(): Promise<string> {
  const url = 'https://celestrak.org/NORAD/elements/gp.php?CATNR=25544&FORMAT=TLE';
  const res = await fetch(url, { cache: 'no-store' });
  if (!res.ok) throw new Error(`Celestrak HTTP ${res.status}`);
  const text = await res.text();
  const parsed = parseTleBlock(text);
  if (!parsed) throw new Error('Format TLE tidak dikenali');
  setTle(parsed.line1, parsed.line2);
  return text;
}