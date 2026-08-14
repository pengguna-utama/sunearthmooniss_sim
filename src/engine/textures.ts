import * as THREE from 'three';

/** Tekstur Matahari procedural (gradien + bintik plasma) bila gambar eksternal tak tersedia. */
export function makeSunTexture(): THREE.Texture {
  const size = 1024;
  const canvas = document.createElement('canvas');
  canvas.width = size;
  canvas.height = size;
  const ctx = canvas.getContext('2d')!;
  const img = ctx.createImageData(size, size);
  const data = img.data;

  const cx = size / 2;
  const cy = size / 2;
  const maxR = size / 2;

  for (let y = 0; y < size; y++) {
    for (let x = 0; x < size; x++) {
      const dx = x - cx;
      const dy = y - cy;
      const r = Math.sqrt(dx * dx + dy * dy) / maxR; // 0..1 dari pusat
      const idx = (y * size + x) * 4;

      // Noise granular kecil
      const n1 = Math.sin(x * 12.9898 + y * 78.233) * 43758.5453;
      const n2 = Math.sin(x * 3.7 + y * 9.1) * 127.1;
      const noise = (Math.abs(n1) - Math.floor(Math.abs(n1))) * 0.5 + (Math.abs(n2) - Math.floor(Math.abs(n2))) * 0.5;

      // Profil radial: terang di tengah → lebih gelap di tepi (fotosfer)
      const fade = Math.pow(Math.max(0, 1 - r * r), 1.4);
      const base = 0.55 + 0.45 * fade + noise * 0.16;

      // Warna oranye-kuning dengan percikan di dekat tepi
      const heat = Math.min(1, Math.pow(Math.max(0, r), 2.2));
      const R = Math.min(255, base * 255 * (1.0 + 0.25 * heat));
      const G = Math.min(255, base * 235 * (1.0 + 0.05 * heat));
      const B = Math.min(255, base * 120 * (1.0 - 0.35 * heat));

      data[idx] = R;
      data[idx + 1] = G;
      data[idx + 2] = B;
      data[idx + 3] = 255;
    }
  }
  ctx.putImageData(img, 0, 0);

  const tex = new THREE.CanvasTexture(canvas);
  tex.colorSpace = THREE.SRGBColorSpace;
  tex.wrapS = THREE.RepeatWrapping;
  tex.wrapT = THREE.ClampToEdgeWrapping;
  return tex;
}

/** Glow corona (sprite radial). */
export function makeGlowTexture(colorTop = '255,180,60'): THREE.Texture {
  const size = 256;
  const canvas = document.createElement('canvas');
  canvas.width = size;
  canvas.height = size;
  const ctx = canvas.getContext('2d')!;
  const g = ctx.createRadialGradient(size / 2, size / 2, 0, size / 2, size / 2, size / 2);
  g.addColorStop(0, `rgba(${colorTop},1)`);
  g.addColorStop(0.25, `rgba(${colorTop},0.55)`);
  g.addColorStop(0.55, `rgba(${colorTop},0.16)`);
  g.addColorStop(1, 'rgba(0,0,0,0)');
  ctx.fillStyle = g;
  ctx.fillRect(0, 0, size, size);
  const tex = new THREE.CanvasTexture(canvas);
  tex.colorSpace = THREE.SRGBColorSpace;
  return tex;
}

/** Lintasan bintang procedural pada bola langit. */
export function makeStarfield(count = 3000, radius = 2.2e8): THREE.BufferGeometry {
  const positions = new Float32Array(count * 3);
  const colors = new Float32Array(count * 3);
  const c = new THREE.Color();
  for (let i = 0; i < count; i++) {
    // Titik seragam di permukaan bola
    const u = Math.random() * 2 - 1;
    const th = Math.random() * Math.PI * 2;
    const s = Math.sqrt(1 - u * u);
    positions[i * 3] = radius * s * Math.cos(th);
    positions[i * 3 + 1] = radius * u;
    positions[i * 3 + 2] = radius * s * Math.sin(th);
    // Lebih redup: luminansi rendah (0.12–0.4)
    const lum = 0.12 + Math.random() * 0.28;
    c.setHSL(0.58 + Math.random() * 0.18, 0.35, lum);
    colors[i * 3] = c.r;
    colors[i * 3 + 1] = c.g;
    colors[i * 3 + 2] = c.b;
  }
  const geo = new THREE.BufferGeometry();
  geo.setAttribute('position', new THREE.BufferAttribute(positions, 3));
  geo.setAttribute('color', new THREE.BufferAttribute(colors, 3));
  return geo;
}