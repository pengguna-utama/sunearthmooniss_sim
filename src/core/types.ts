export interface Vec3 {
  x: number;
  y: number;
  z: number;
}

export type Vec3Tuple = [number, number, number];

export function vecAdd(a: Vec3, b: Vec3): Vec3 {
  return { x: a.x + b.x, y: a.y + b.y, z: a.z + b.z };
}

export function vecSub(a: Vec3, b: Vec3): Vec3 {
  return { x: a.x - b.x, y: a.y - b.y, z: a.z - b.z };
}

export function vecScale(a: Vec3, s: number): Vec3 {
  return { x: a.x * s, y: a.y * s, z: a.z * s };
}

export function vecLen(a: Vec3): number {
  return Math.sqrt(a.x * a.x + a.y * a.y + a.z * a.z);
}

export function vecNorm(a: Vec3): Vec3 {
  const l = vecLen(a);
  if (l === 0) return { x: 0, y: 0, z: 0 };
  return vecScale(a, 1 / l);
}

export function vecDot(a: Vec3, b: Vec3): number {
  return a.x * b.x + a.y * b.y + a.z * b.z;
}

export function vecCross(a: Vec3, b: Vec3): Vec3 {
  return {
    x: a.y * b.z - a.z * b.y,
    y: a.z * b.x - a.x * b.z,
    z: a.x * b.y - a.y * b.x,
  };
}

export function toTuple(v: Vec3): Vec3Tuple {
  return [v.x, v.y, v.z];
}
