// Satuan & konstanta fisika (km, derajat)
// 1 AU = rata-rata jarak Bumi–Matahari, dipakai untuk mengubah koordinat heliosentrik
// dari satuan astronomi (AU) ke kilometer agar semua vektor visual berada dalam skala km.
export const KM_PER_AU = 149597870.69098932;

// Jari-jari benda langit dalam kilometer.
// Radius Matahari: ~696.340 km, dipakai untuk sudut piringan Matahari saat menghitung bayangan.
export const SUN_RADIUS = 696340;
// Radius Bumi: ~6.371,0088 km, dipakai sebagai panjang radius bola Bumi dalam model geometri.
export const EARTH_RADIUS = 6371.0088;
// Radius Bulan: ~1.737,4 km, dipakai untuk menghitung umbra/penumbra dan gerhana.
export const MOON_RADIUS = 1737.4;

// Kemiringan sumbu Bumi terhadap bidang ekliptika (derajat).
// Nilai ini ≈ 23,4392911° dan menentukan rotasi antara ekuator dan bidang ekliptika.
export const ECLIPTIC_OBLIQUITY_DEG = 23.4392911;
export const ECLIPTIC_OBLIQUITY_RAD = (ECLIPTIC_OBLIQUITY_DEG * Math.PI) / 180;

// Nama objek yang dikelola simulator
export type BodyId = 'sun' | 'earth' | 'moon' | 'iss';

export interface BodyInfo {
  id: BodyId;
  nama: string;
  emoji: string;
  warna: number;
  radiusKm: number;
}

export const BODIES: BodyInfo[] = [
  { id: 'sun', nama: 'Matahari', emoji: '☀️', warna: 0xffaa00, radiusKm: SUN_RADIUS },
  { id: 'earth', nama: 'Bumi', emoji: '🌍', warna: 0x3388ff, radiusKm: EARTH_RADIUS },
  { id: 'moon', nama: 'Bulan', emoji: '🌙', warna: 0xaaaaaa, radiusKm: MOON_RADIUS },
  { id: 'iss', nama: 'ISS', emoji: '🛰️', warna: 0x33ffcc, radiusKm: 0.05 },
];

export const BODY_MAP: Record<BodyId, BodyInfo> = Object.fromEntries(
  BODIES.map((b) => [b.id, b]),
) as Record<BodyId, BodyInfo>;
