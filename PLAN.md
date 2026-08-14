# Tata Surya Simulator — Matahari, Bumi, Bulan & ISS

Aplikasi simulasi 3D skala nyata (jarak asli, ukuran adaptif untuk ISS) berbasis
React + TypeScript + Three.js + Vite, dengan posisi astronomis akurat per tanggal.

## Tujuan Fitur

- Tampilkan Matahari, Bumi, Bulan, dan ISS (hanya itu) pada skala nyata.
- Posisi asli sesuai tanggal & jam yang ditentukan (ephemeris akurat).
- Kamera: rotasi, pan, zoom; pilih objek (tombol atau klik langsung) lalu kamera mengikuti.
- Garis orbit Bumi & Bulan, ring/trail ISS, label objek (toggle).
- Posisi jatuh **umbra & penumbra Bulan** di Bumi (toggle) + status gerhana.
- **FoV ISS**: wilayah yang terlihat dari ISS + slider elevasi minimum.
- Kontrol waktu: play/pause, kecepatan, loncat tanggal, TLE ISS dapat diperbarui.

## Keputusan Desain

- Satuan dunia: **km** (double precision di JS), orientasi **bidang ekliptika** (ECL J2000).
- Presisi GPU: **floating-origin (RTE)** + `logarithmicDepthBuffer`.
- Skala: jarak & ukuran asli; **ISS ukuran adaptif** (tetap terlihat/klik/difokus).
- Posisi: `astronomy-engine` (VSOP87) utk Matahari/Bumi/Bulan, `satellite.js` (SGP4) utk ISS.
- ISS valid di jendela ±30 hari dari epoch TLE; di luar itu fallback analitik Kepler+J2.
- UI bahasa Indonesia, gaya dark.

## Arsitektur

```
simulator/
├─ index.html / vite.config.ts / tsconfig.json / package.json
├─ public/textures/          earth_atmos_2048.jpg, moon_1024.jpg
└─ src/
   ├─ main.tsx / App.tsx / styles.css
   ├─ constants.ts            konstanta & daftar objek
   ├─ core/
   │  ├─ types.ts             Vec3 + helper vektor
   │  ├─ convert.ts           EQJ→ECL (dgn/tanpa skala AU→km)
   │  ├─ science.ts           ephemeris gabungan (Bumi/Bulan/ISS + jarak)
   │  ├─ iss.ts               SGP4 + fallback analitik + TLE + fetch Celestrak
   │  ├─ shadow.ts            geometri umbra/penumbra + klasifikasi gerhana
   │  ├─ fov.ts               FoV ISS (λ, footprint, luas, kerucut)
   │  └─ *.test.ts            uji unit (vitest)
   ├─ engine/
   │  ├─ store.ts             store + hook React (useSyncExternalStore)
   │  ├─ textures.ts          tekstur procedural (matahari, glow, bintang)
   │  └─ SceneEngine.ts       renderer, kamera, kontrol, floating-origin, loop
   └─ components/             PanelWaktu, PanelObjek, PanelInfo, PanelPengaturan
```

## Rumus Kunci

- Umbra: `α = asin(R_sun / |S·M|)`, panjang `L_u = R_moon / tan(α) ≈ 373.000 km`.
- Penumbra: `β = asin((R_sun+R_moon)/|S·M|)`.
- Klasifikasi gerhana: puncak umbra vs masuk sumbu bayangan ke bola Bumi
  (total/annular/partial/penumbral/none).
- FoV ISS: `λ(ε) = arccos((R_e/r)·cos ε) − ε`, footprint `= 2·R_e·λ`,
  luas `≈ 2π·R_e²·(1−cos λ)`, setengah sudut kerucut `η = asin(R_e/r)`.
- SGP4 valid ±30 hari dari epoch TLE; fallback Kepler + regresi nodal J2.

---

## STATUS PENGERJAAN

### ✅ 1. Scaffold (SELESAI)
- Vite + React + TS + deps: `three@0.170`, `astronomy-engine@2.1.19`,
  `satellite.js@5.0.0`, `vitest`, `@vitejs/plugin-react`.
- `npm install` OK.

### ✅ 2. Pipeline sains + uji unit (SELESAI — 13/13 lulus)
- `core/science.ts` — posisi heliosentris ECL (km) utk Bumi, Bulan, ISS + jarak.
- `core/iss.ts` — `twoline2satrec` → `propagate` (SGP4) dlm jendela ±30 hari,
  fallback analitik Kepler+J2 (regresi nodal) di luar itu; geodetik via
  `eciToGeodetic`; `fetchIssTle()` dari Celestrak.
- `core/shadow.ts` — umbra/penumbra, panjang, radius di Bumi, klasifikasi gerhana.
- `core/fov.ts` — FoV ISS.
- **Bug ditemukan & diperbaiki**: vektor ECI ISS ter-*double*-skala (×KM_PER_AU)
  jadi ~1e12 km → ditambah `eqjToEcl()` tanpa skala. Klasifikasi gerhana 2024-04-08
  (total) terdeteksi benar setelah aturan puncak-umbra vs sumbu.
- Tes: jarak Bumi–Matahari 0.98–1.02 AU, Bumi–Bulan 356–407 ribu km, ISS alt
  380–470 km, umbra ≈ 373.000 km, gerhana total 2024-04-08, FoV ≈ 4.400 km.

### ✅ 3. Render & scene 3D (SELESAI)
- `engine/store.ts` (store + hook), `engine/textures.ts`
  (matahari/glow/bintang procedural), tekstur Bumi & Bulan di `public/textures`.
- `engine/SceneEngine.ts` — renderer (log-depth), kamera, OrbitControls,
  floating-origin, objek (Matahari+Bumi+Bulan+ISS), garis orbit, ring/trail ISS,
  kerucut & footprint bayangan, FoV ring/cap, starfield, label CSS2D, pick
  raycaster (klik dengan guard anti-drag), fokus + follow, `publishInfo` 4 Hz.

### ✅ 4. Kamera & interaksi (SELESAI)
- Orbit/pan/zoom + fokus animasi + follow objek terpilih (anchor floating-origin
  mengikuti objek); fokus via tombol panel atau klik langsung di canvas.

### ✅ 5. Garis orbit & label (SELESAI)
- Orbit Bumi (sampling ephemeris/tahun), orbit Bulan (sampling geo/bulan),
  ring + trail ISS, sumbu Bumi (anak grup Bumi), bidang ekliptika, label CSS2D;
  semua toggleable.

### ✅ 6. Umbra/penumbra Bulan + footprint di Bumi (+ bayangan Bumi bonus)
- Kerucut umbra (mengecil→titik) & penumbra (melebar) dari Bulan; footprint
  piringan umbra/penumbra di permukaan Bumi (posisi sumbu menembus bola, hit via
  akar persamaan |·|=R_e); status gerhana (total/annular/partial/penumbral/none);
  bayangan Bumi (gerhana bulan) opsional.

### ✅ 7. FoV ISS (ring+cap+slider elevasi)
- Ring + cap area terlihat di permukaan Bumi (radius R_e·sinλ), kerucut pandang
  dihitung dari posisi SSP; slider elevasi minimum 0–20°; info Ø & luas (km²).

### ✅ 8. UI — dark, Bahasa Indonesia
- `ObjectPanel` (pilih objek + lepas), `ControlPanel` (9 toggle, slider FoV,
  TLE Celestrak/kustom), `TimePanel` (play/jeda, 6 kecepatan, ±1 hari, datetime,
  "Sekarang", UTC), `InfoPanel` (jarak/kecepatan/koordinat/ISS lat-lon-alt/FoV/
  status gerhana/umbra-penumbra + ringkas global).

### ✅ 9. Floating-origin + log-depth + ukuran adaptif ISS
- RTE (anchor per objek) + `logarithmicDepthBuffer`; ISS skala adaptif
  (stabil bila biasa, diperbesar saat fokus) + toggle hemat.

### ✅ 10. Build + lint + tes akhir (SELESAI)
- `npx tsc --noEmit` bersih, 13/13 tes lulus, `vite build` sukses.
- Smoke test headless Chrome: canvas WebGL ter-render, 4 label objek muncul,
  tidak ada error uncaught; screenshot ~115 KB.
- **Bug runtime ditemukan & diperbaiki selama smoke test**: `getSettings`/
  `getLive` tak ter-bound `this` saat jadi callback `useSyncExternalStore` →
  diubah jadi arrow-field.

## Cara Menjalankan

```bash
npm install
npm run dev      # dev server http://localhost:5173
npm run test     # uji unit (vitest)
npm run build    # tsc --noEmit + vite build
```

## Catatan / Batasan

- ISS hanya akurat dekat epoch TLE bawaan (≈ 2026-08-12); jauh dari itu memakai
  model analitik. Tombol "Perbarui TLE" mengambil TLE terkini dari Celestrak
  (butuh internet).
- Frame TEME SGP4 didekati sebagai EQJ → ECL (beda ~0,3°), tak terlihat dlm visual.
- ISS diperbesar secara adaptif agar tetap terlihat/klik/difokus (keputusan pengguna).
- Matahari tekstur procedural; Bumi & Bulan dari tekstur lisensi bebas (three.js).
