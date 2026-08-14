import { SUN_RADIUS, MOON_RADIUS, EARTH_RADIUS } from '../constants';
import { vecCross, vecDot, vecLen, vecNorm, vecScale, vecSub, type Vec3 } from './types';

export interface ShadowGeom {
  /** Arah sumbu bayangan (satuan, dari Matahari menembus Bulan ke sisi jauh). */
  axis: Vec3;
  /** Dua vektor basis tegak-lurus sumbu, untuk menggambar piringan footprint. */
  u: Vec3;
  v: Vec3;
  /** Setengah diameter sudut Matahari dari Bulan (rad). */
  alpha: number;
  /** Setengah sudut kerucut penumbra (rad). */
  beta: number;
  /** Jarak puncak umbra dari pusat Bulan (km). */
  umbraApexKm: number;
  /** Jarak pusat Bumi dari pusat Bulan sepanjang sumbu bayangan (km). */
  tEarthKm: number;
  /** Jarak lateral pusat Bumi dari sumbu bayangan (km). */
  offsetKm: number;
  /** Jari-jari umbra di penampang melewati pusat Bumi (km), negatif bila ujung umbra tak sampai. */
  umbraAtEarthKm: number;
  /** Jari-jari penumbra di penampang melewati pusat Bumi (km). */
  penumbraAtEarthKm: number;
  /** Apakah pusat Bumi berada di dalam kerucut umbra/penumbra. */
  earthInUmbra: boolean;
  earthInPenumbra: boolean;
  /** Apakah bayangan (umbra/penumbra) menyentuh bola Bumi (ada kejadian gerhana). */
  shadowTouchesEarth: boolean;
  /** Klasifikasi: 'total' | 'annular' | 'partial' | 'penumbral' | 'none'. */
  eclipseType: 'total' | 'annular' | 'partial' | 'penumbral' | 'none';
  /** Jarak Matahari–Bulan (km). */
  sunMoonKm: number;
}

/**
 * Geometri bayangan Bulan (umbra & penumbra) untuk konfigurasi Matahari (sun),
 * Bulan (moon), dan Bumi (earth), semua dalam km (ECL).
 */
export function computeShadow(sun: Vec3, moon: Vec3, earth: Vec3): ShadowGeom {
  const axis = vecNorm(vecSub(moon, sun)); // dari Matahari menuju Bulan

  const sunMoonKm = vecLen(vecSub(moon, sun));
  const moonEarth = vecSub(earth, moon);
  const tEarthKm = vecDot(moonEarth, axis);
  const offset = vecSub(moonEarth, vecScale(axis, tEarthKm));
  const offsetKm = vecLen(offset);

  // Sudut setengah piringan Matahari saat dilihat dari Bulan:
  // α = asin(R_sun / d_sun-moon), karena sin α = radius Matahari / jarak Matahari-Bulan.
  const alpha = Math.asin(SUN_RADIUS / sunMoonKm); // diameter sudut Matahari dari Bulan
  // Sudut setengah penumbra (sudut pembatas antara umbra dan penumbra):
  // β = asin((R_sun + R_moon) / d_sun-moon)
  const beta = Math.asin((SUN_RADIUS + MOON_RADIUS) / sunMoonKm); // semi-sudut penumbra

  // Panjang umbra adalah jarak dari pusat Bulan ke puncak kerucut umbra, ketika radius bayangan menjadi nol:
  // L_umbra = R_moon / tan α
  const umbraApexKm = MOON_RADIUS / Math.tan(alpha);

  // Radius bayangan pada penampang yang melalui pusat Bumi:
  // r_umbra = R_moon - d × tan α
  // r_penumbra = R_moon + d × tan β
  const umbraAtEarthKm = MOON_RADIUS - tEarthKm * Math.tan(alpha);
  const penumbraAtEarthKm = MOON_RADIUS + tEarthKm * Math.tan(beta);

  const earthInUmbra = umbraAtEarthKm > 0 && offsetKm < umbraAtEarthKm;
  const earthInPenumbra = offsetKm < penumbraAtEarthKm;

  // Bayangan menyentuh Bumi?
  const shadowTouchesEarth =
    penumbraAtEarthKm > 0 && offsetKm < penumbraAtEarthKm + EARTH_RADIUS + 200;

  // Klasifikasi gerhana:
  //  - total  : puncak umbra berada di dalam (atau menembus) bola Bumi pada sisi sumbu yang
  //             melewati Bumi (ada pengamat di permukaan yang melihat totalitas).
  //  - annular: sumbu melewati Bumi, tapi puncak umbra berhenti sebelum sisi dekat bola Bumi.
  //  - partial: sumbu meleset dari bola Bumi, hanya penumbra yang menyentuh.
  //  - penumbral: hanya tepi penumbra yang menyentuh bola Bumi.
  let eclipseType: ShadowGeom['eclipseType'] = 'none';
  if (shadowTouchesEarth) {
    const axisHitsSphere = offsetKm < EARTH_RADIUS;
    if (axisHitsSphere) {
      const halfChord = Math.sqrt(Math.max(0, EARTH_RADIUS * EARTH_RADIUS - offsetKm * offsetKm));
      const tNear = tEarthKm - halfChord;
      eclipseType = umbraApexKm < tNear ? 'annular' : 'total';
    } else {
      eclipseType = 'partial';
    }
  }

  // Basis ortonormal (u, v) tegak-lurus sumbu bayangan
  let u = vecCross(axis, { x: 0, y: 0, z: 1 });
  if (vecLen(u) < 1e-9) u = vecCross(axis, { x: 0, y: 1, z: 0 });
  u = vecNorm(u);
  const v = vecCross(axis, u);

  return {
    axis,
    u,
    v,
    alpha,
    beta,
    umbraApexKm,
    tEarthKm,
    offsetKm,
    umbraAtEarthKm,
    penumbraAtEarthKm,
    earthInUmbra,
    earthInPenumbra,
    shadowTouchesEarth,
    eclipseType,
    sunMoonKm,
  };
}

export function shadowLabel(t: ShadowGeom): string {
  switch (t.eclipseType) {
    case 'total':
      return 'Gerhana Matahari Total';
    case 'annular':
      return 'Gerhana Matahari Cincin (Annular)';
    case 'partial':
      return 'Gerhana Matahari Parsial';
    case 'penumbral':
      return 'Gerhana Penumbra Bulan';
    default:
      return 'Bayangan Bulan tidak menyentuh Bumi';
  }
}

export interface LightRayPair {
  start: Vec3;
  end: Vec3;
}

export interface LightRays {
  /** Sinar dari tepi piringan Matahari menyinggung tepi Bulan sisi sama → konvergen ke puncak umbra. */
  umbra: LightRayPair[];
  /** Sinar dari tepi piringan Matahari menyinggung tepi Bulan sisi lawan → divergen (penumbra). */
  penumbra: LightRayPair[];
}

/**
 * Sinar cahaya sungguhan dari piringan Matahari (di titik asal) yang menyinggung
 * Bulan dan membentuk batas umbra & penumbra. Dalam koordinat absolut (km, ECL).
 */
export function shadowLightRays(sh: ShadowGeom, moon: Vec3, n = 8): LightRays {
  const apex: Vec3 = {
    x: moon.x + sh.axis.x * sh.umbraApexKm,
    y: moon.y + sh.axis.y * sh.umbraApexKm,
    z: moon.z + sh.axis.z * sh.umbraApexKm,
  };
  const rayLen = Math.max(sh.tEarthKm, 0) + EARTH_RADIUS + MOON_RADIUS;
  const umbra: LightRayPair[] = [];
  const penumbra: LightRayPair[] = [];

  for (let k = 0; k < n; k++) {
    const th = (k / n) * Math.PI * 2;
    const c = Math.cos(th);
    const s = Math.sin(th);
    const dir: Vec3 = {
      x: sh.u.x * c + sh.v.x * s,
      y: sh.u.y * c + sh.v.y * s,
      z: sh.u.z * c + sh.v.z * s,
    };
    const sunLimb: Vec3 = { x: dir.x * SUN_RADIUS, y: dir.y * SUN_RADIUS, z: dir.z * SUN_RADIUS };
    umbra.push({ start: sunLimb, end: apex });

    const moonEdge: Vec3 = {
      x: moon.x - dir.x * MOON_RADIUS,
      y: moon.y - dir.y * MOON_RADIUS,
      z: moon.z - dir.z * MOON_RADIUS,
    };
    const d = vecNorm(vecSub(moonEdge, sunLimb));
    penumbra.push({
      start: sunLimb,
      end: { x: moonEdge.x + d.x * rayLen, y: moonEdge.y + d.y * rayLen, z: moonEdge.z + d.z * rayLen },
    });
  }
  return { umbra, penumbra };
}