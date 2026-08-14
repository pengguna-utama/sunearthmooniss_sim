import * as THREE from 'three';
import { OrbitControls } from 'three/examples/jsm/controls/OrbitControls.js';
import { CSS2DRenderer, CSS2DObject } from 'three/examples/jsm/renderers/CSS2DRenderer.js';
import {
  SUN_RADIUS,
  EARTH_RADIUS,
  MOON_RADIUS,
  BODY_MAP,
  type BodyId,
} from '../constants';
import { computeEphemeris } from '../core/science';
import { computeShadow, shadowLabel, shadowLightRays } from '../core/shadow';
import { computeIssFov } from '../core/fov';
import { issState } from '../core/iss';
import { gmstRad, uToLonEastDeg, vToLatDeg, OBLIQUITY_RAD } from '../core/earth';
import { vecAdd, vecDot, vecLen, vecNorm, vecScale, vecSub, type Vec3 } from '../core/types';
import { makeSunTexture, makeGlowTexture, makeStarfield } from './textures';
import { simStore } from './store';

const EARTH_SPEED = 29.78;
const MOON_SPEED = 1.022;
const ISS_SPEED = 7.66;
/** Periode rotasi sideris Matahari di ekuator (≈ 25,38 hari). */
const SUN_ROTATION_PERIOD_MS = 25.38 * 24 * 60 * 60 * 1000;
const UP = new THREE.Vector3(0, 1, 0);

interface BodyRef {
  obj: THREE.Object3D;
  label: CSS2DObject;
  sizeKm: number;
}

const FOCUS_DIST: Record<BodyId, number> = {
  sun: 2.4e6,
  earth: 2.6e4,
  moon: 7e3,
  iss: 1500,
};

export class SceneEngine {
  private renderer!: THREE.WebGLRenderer;
  private labelRenderer!: CSS2DRenderer;
  private scene = new THREE.Scene();
  private camera!: THREE.PerspectiveCamera;
  private controls!: OrbitControls;
  private container!: HTMLElement;
  private raf = 0;
  private clock = new THREE.Clock();
  private disposed = false;

  private sun!: THREE.Mesh;
  private sunGlow!: THREE.Sprite;
  private sunLight!: THREE.PointLight;
  private earth!: THREE.Group;
  private earthMesh!: THREE.Mesh;
  private moon!: THREE.Mesh;
  private iss!: THREE.Group;
  private starfield!: THREE.Points;

  private bodies = new Map<BodyId, BodyRef>();
  private pickTargets: THREE.Object3D[] = [];

  private earthOrbitLine!: THREE.Line;
  private moonOrbitLine!: THREE.Line;
  private issRing!: THREE.Line;
  private issTrail!: THREE.Line;
  private axisEarth!: THREE.Line;

  private shadowUmbra!: THREE.Mesh;
  private shadowPenumbra!: THREE.Mesh;
  private umbraRays!: THREE.LineSegments;
  private penumbraRays!: THREE.LineSegments;
  private footprintUmbra!: THREE.Mesh;
  private footprintPenumbra!: THREE.Mesh;
  private earthShadowCone!: THREE.Mesh;
  private fovRing!: THREE.Line;
  private fovCap!: THREE.Mesh;

  // Anchor floating-origin
  private anchorAbs: Vec3 = { x: 0, y: 0, z: 0 };
  private followBody: BodyId | null = null;
  private focusTimer = 0;
  private focusOffset = new THREE.Vector3(0, 0.5, 1);

  private issTrailPts: Vec3[] = [];

  private selected: BodyId | null = null;
  private orbitDayKey = -1;
  private lastIssRingMs = -1;

  // Rotasi sidereal Bumi
  private earthPhaseK = 0;

  // PoV (point of view) di permukaan Bumi
  private pendingPov: { x: number; y: number; latDeg: number; lonDeg: number } | null = null;
  private povActive = false;
  private povLatDeg = 0;
  private povLonDeg = 0;
  private povGround!: THREE.Mesh;
  private povHorizon!: THREE.LineLoop;
  private povSunPath!: THREE.Line;
  private povMoonPath!: THREE.Line;
  private povCompass = new THREE.Group();
  private povVisuals = new THREE.Group();
  private lastPovPathMs = -1;

  private raycaster = new THREE.Raycaster();
  private pointer = new THREE.Vector2();
  private downX = 0;
  private downY = 0;
  private downT = 0;

  private ephem = computeEphemeris(new Date());
  private lastEphemMs = -1;
  private infoTimer = 0;

  // ---------- life ----------
  constructor(private root: HTMLElement) {}

  init(): void {
    const container = this.root;
    this.container = container;
    const w = container.clientWidth || window.innerWidth;
    const h = container.clientHeight || window.innerHeight;

    this.renderer = new THREE.WebGLRenderer({ antialias: true, logarithmicDepthBuffer: true });
    this.renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
    this.renderer.setSize(w, h);
    this.renderer.setClearColor(0x00000a, 1);
    container.appendChild(this.renderer.domElement);

    this.labelRenderer = new CSS2DRenderer();
    this.labelRenderer.setSize(w, h);
    this.labelRenderer.domElement.style.position = 'absolute';
    this.labelRenderer.domElement.style.top = '0';
    this.labelRenderer.domElement.style.left = '0';
    this.labelRenderer.domElement.style.pointerEvents = 'none';
    container.appendChild(this.labelRenderer.domElement);

    this.camera = new THREE.PerspectiveCamera(50, w / h, 1, 4e9);
    this.camera.position.set(0, 2.6e7, 4.4e7);

    this.controls = new OrbitControls(this.camera, this.renderer.domElement);
    this.controls.enableDamping = true;
    this.controls.dampingFactor = 0.08;
    this.controls.minDistance = 1e4;
    this.controls.maxDistance = 4e8;
    this.controls.target.set(0, 0, 0);

    this.buildScene();
    this.calibrateEarthPhase();

    window.addEventListener('resize', this.onResize);
    this.renderer.domElement.addEventListener('pointermove', this.onPointerMove);
    this.renderer.domElement.addEventListener('pointerdown', this.onPointerDown);
    this.renderer.domElement.addEventListener('click', this.onClick);

    this.loop();
  }

  // ---------- scene ----------
  private buildScene(): void {
    this.starfield = new THREE.Points(
      makeStarfield(2600, 8e8),
      new THREE.PointsMaterial({ size: 9e5, sizeAttenuation: true, vertexColors: true }),
    );
    this.scene.add(this.starfield);

    // Matahari
    this.sun = new THREE.Mesh(
      new THREE.SphereGeometry(SUN_RADIUS, 64, 64),
      new THREE.MeshBasicMaterial({ map: makeSunTexture() }),
    );
    this.scene.add(this.sun);
    this.sunGlow = new THREE.Sprite(
      new THREE.SpriteMaterial({
        map: makeGlowTexture(),
        blending: THREE.AdditiveBlending,
        depthWrite: false,
        transparent: true,
      }),
    );
    this.sunGlow.scale.set(SUN_RADIUS * 4, SUN_RADIUS * 4, 1);
    this.scene.add(this.sunGlow);
    this.sunLight = new THREE.PointLight(0xfff4e0, 3, 0, 0);
    this.scene.add(this.sunLight);
    this.scene.add(new THREE.AmbientLight(0x40506a, 0.35));

    // Bumi
    this.earth = new THREE.Group();
    const earthTex = new THREE.TextureLoader().load('/textures/earth_atmos_2048.jpg');
    earthTex.colorSpace = THREE.SRGBColorSpace;
    this.earthMesh = new THREE.Mesh(
      new THREE.SphereGeometry(EARTH_RADIUS, 64, 64),
      new THREE.MeshPhongMaterial({ map: earthTex, specular: 0x111111, shininess: 8 }),
    );
    this.earth.add(this.earthMesh);
    // Kemiringan sumbu: kutub utara (sumbu lokal +Y) → arah kutub ekliptika dunia (0, sin ε, cos ε).
    // Rotasi sidereal dilakukan pada earthMesh.rotation.y (sumbu putar = sumbu lokal Y yang sudah miring).
    this.earth.quaternion.setFromUnitVectors(
      new THREE.Vector3(0, 1, 0),
      new THREE.Vector3(0, Math.sin(OBLIQUITY_RAD), Math.cos(OBLIQUITY_RAD)),
    );

    // Sumbu putar Bumi (anak grup Bumi agar ikut posisi/tilt)
    this.axisEarth = new THREE.Line(
      new THREE.BufferGeometry().setFromPoints([
        new THREE.Vector3(0, -EARTH_RADIUS * 1.6, 0),
        new THREE.Vector3(0, EARTH_RADIUS * 1.6, 0),
      ]),
      new THREE.LineBasicMaterial({ color: 0x4499ff, transparent: true, opacity: 0.6 }),
    );
    this.earth.add(this.axisEarth);
    this.scene.add(this.earth);

    // Objek dekat kamera untuk pandangan dari permukaan Bumi. Semuanya
    // diposisikan ulang setiap frame PoV, sehingga tidak bercampur dengan skala tata surya.
    this.povGround = new THREE.Mesh(
      new THREE.CircleGeometry(85000, 96),
      new THREE.MeshBasicMaterial({ color: 0x07120e, transparent: true, opacity: 0.96, side: THREE.DoubleSide }),
    );
    this.povHorizon = new THREE.LineLoop(
      new THREE.BufferGeometry().setFromPoints(
        Array.from({ length: 97 }, (_, i) => new THREE.Vector3(Math.cos((i / 96) * Math.PI * 2) * 85000, Math.sin((i / 96) * Math.PI * 2) * 85000, 0)),
      ),
      new THREE.LineBasicMaterial({ color: 0x5a9b87, transparent: true, opacity: 0.7 }),
    );
    this.povSunPath = new THREE.Line(new THREE.BufferGeometry(), new THREE.LineBasicMaterial({ color: 0xffb34b, transparent: true, opacity: 0.85 }));
    this.povMoonPath = new THREE.Line(new THREE.BufferGeometry(), new THREE.LineBasicMaterial({ color: 0xb9d2ff, transparent: true, opacity: 0.8 }));
    this.povVisuals.add(this.povGround, this.povHorizon, this.povSunPath, this.povMoonPath, this.povCompass);
    this.povVisuals.visible = false;
    this.scene.add(this.povVisuals);
    for (const [name, color] of [['U', '#b9e9ff'], ['T', '#b9e9ff'], ['S', '#b9e9ff'], ['B', '#b9e9ff']] as const) {
      const el = document.createElement('div');
      el.className = 'pov-compass'; el.textContent = name; el.style.color = color;
      this.povCompass.add(new CSS2DObject(el));
    }

    // Bulan
    const moonTex = new THREE.TextureLoader().load('/textures/moon_1024.jpg');
    moonTex.colorSpace = THREE.SRGBColorSpace;
    this.moon = new THREE.Mesh(
      new THREE.SphereGeometry(MOON_RADIUS, 48, 48),
      new THREE.MeshPhongMaterial({ map: moonTex, specular: 0x111111, shininess: 4 }),
    );
    this.scene.add(this.moon);

    // ISS
    this.iss = new THREE.Group();
    const body = new THREE.Mesh(
      new THREE.CapsuleGeometry(0.5, 1.6, 6, 12),
      new THREE.MeshPhongMaterial({ color: 0xdfefff, emissive: 0x223344, specular: 0xffffff, shininess: 40 }),
    );
    const solar = new THREE.Mesh(
      new THREE.BoxGeometry(2.6, 0.08, 0.7),
      new THREE.MeshPhongMaterial({ color: 0x1c3f9e, emissive: 0x0a1a4e }),
    );
    solar.position.y = 0.9;
    this.iss.add(body, solar);
    this.scene.add(this.iss);

    this.registerBody('sun', this.sun, SUN_RADIUS);
    this.registerBody('earth', this.earth, EARTH_RADIUS);
    this.registerBody('moon', this.moon, MOON_RADIUS);
    this.registerBody('iss', this.iss, 6);

    // Garis orbit
    this.earthOrbitLine = new THREE.Line(
      new THREE.BufferGeometry(),
      new THREE.LineBasicMaterial({ color: 0x4488ff, transparent: true, opacity: 0.5 }),
    );
    this.scene.add(this.earthOrbitLine);
    this.moonOrbitLine = new THREE.Line(
      new THREE.BufferGeometry(),
      new THREE.LineBasicMaterial({ color: 0xcccccc, transparent: true, opacity: 0.45 }),
    );
    this.scene.add(this.moonOrbitLine);
    this.issRing = new THREE.Line(
      new THREE.BufferGeometry(),
      new THREE.LineBasicMaterial({ color: 0x33ffcc, transparent: true, opacity: 0.55 }),
    );
    this.scene.add(this.issRing);
    this.issTrail = new THREE.Line(
      new THREE.BufferGeometry(),
      new THREE.LineBasicMaterial({ color: 0x33ffcc, transparent: true, opacity: 0.9 }),
    );
    this.scene.add(this.issTrail);

    // Bayangan
    const coneMat = (color: number, opacity: number) =>
      new THREE.MeshBasicMaterial({ color, transparent: true, opacity, depthWrite: false, side: THREE.DoubleSide });
    this.shadowUmbra = new THREE.Mesh(new THREE.BufferGeometry(), coneMat(0x000000, 0.4));
    this.shadowPenumbra = new THREE.Mesh(new THREE.BufferGeometry(), coneMat(0x3a4a5e, 0.14));
    this.scene.add(this.shadowUmbra, this.shadowPenumbra);
    // Sinar cahaya sungguhan dari piringan Matahari yang menyinggung Bulan
    this.umbraRays = new THREE.LineSegments(
      new THREE.BufferGeometry(),
      new THREE.LineBasicMaterial({ color: 0xffcc66, transparent: true, opacity: 0.6 }),
    );
    this.penumbraRays = new THREE.LineSegments(
      new THREE.BufferGeometry(),
      new THREE.LineBasicMaterial({ color: 0xaac4ff, transparent: true, opacity: 0.35 }),
    );
    this.scene.add(this.umbraRays, this.penumbraRays);
    this.earthShadowCone = new THREE.Mesh(new THREE.BufferGeometry(), coneMat(0x1a2030, 0.3));
    this.scene.add(this.earthShadowCone);

    // Footprint
    this.footprintUmbra = new THREE.Mesh(new THREE.CircleGeometry(1, 48), coneMat(0x000000, 0.6));
    this.footprintPenumbra = new THREE.Mesh(new THREE.CircleGeometry(1, 48), coneMat(0x556677, 0.3));
    this.scene.add(this.footprintUmbra, this.footprintPenumbra);

    // FoV
    this.fovRing = new THREE.Line(new THREE.BufferGeometry(), new THREE.LineBasicMaterial({ color: 0x44ff88, transparent: true, opacity: 0.9 }));
    this.fovCap = new THREE.Mesh(new THREE.CircleGeometry(1, 48), coneMat(0x44ff88, 0.14));
    this.scene.add(this.fovRing, this.fovCap);

  }

  private registerBody(id: BodyId, obj: THREE.Object3D, sizeKm: number): void {
    const el = document.createElement('div');
    el.className = 'body-label';
    el.textContent = BODY_MAP[id].nama;
    el.style.color = `#${BODY_MAP[id].warna.toString(16).padStart(6, '0')}`;
    const label = new CSS2DObject(el);
    label.position.set(0, sizeKm * 1.6, 0);
    obj.add(label);
    this.bodies.set(id, { obj, label, sizeKm });
    this.pickTargets.push(obj);
  }

  /**
   * Kalibrasi fase rotasi: cari konstanta K sehingga meridian Greenwich (lon 0)
   * menunjuk ke arah dunia g_w(GMST) = (cosθ, sinθ·cosε, −sinθ·sinε).
   */
  private calibrateEarthPhase(): void {
    const theta = gmstRad(new Date());
    const gWorld = new THREE.Vector3(
      Math.cos(theta),
      Math.sin(theta) * Math.cos(OBLIQUITY_RAD),
      -Math.sin(theta) * Math.sin(OBLIQUITY_RAD),
    );
    const inv = this.earth.quaternion.clone().invert();
    const targetLocal = gWorld.clone().applyQuaternion(inv);
    // targetLocal = Ry(spin)·gLocal dengan gLocal=(1,0,0); bawa kembali -theta lalu cari K.
    targetLocal.applyAxisAngle(UP, -theta);
    // gLocal = (1,0,0) → aX=1,aZ=0; K = atan2(-bZ, bX)
    this.earthPhaseK = Math.atan2(-targetLocal.z, targetLocal.x);
  }

  /** Untuk validasi: bujur/lintang titik permukaan yang menghadap Matahari (subsolar). */
  subsolarLatLon(): { latDeg: number; lonDeg: number } {
    const e = this.ephem;
    const l = Math.hypot(e.earth.x, e.earth.y, e.earth.z);
    const s = new THREE.Vector3(-e.earth.x / l, -e.earth.y / l, -e.earth.z / l);
    const L = s.applyQuaternion(this.earth.quaternion.clone().invert());
    // L = (cosφ·cos(λ+spin), sinφ, −cosφ·sin(λ+spin))
    const phi = Math.asin(Math.min(1, Math.max(-1, L.y)));
    const spin = gmstRad(simStore.live.time) + this.earthPhaseK;
    const lam = Math.atan2(-L.z, L.x) - spin;
    return { latDeg: (phi * 180) / Math.PI, lonDeg: ((lam * 180) / Math.PI + 540) % 360 - 180 };
  }

  /** Debug: titik subsolar lewat raycast dari arah Matahari ke mesh Bumi (validasi render). */
  debugSubsolarUv(): { u: number; v: number; latDeg: number; lonDeg: number } | null {
    const e = this.ephem;
    const l = Math.hypot(e.earth.x, e.earth.y, e.earth.z);
    const earthRel = this.rel(e.earth);
    const dir = new THREE.Vector3(-e.earth.x / l, -e.earth.y / l, -e.earth.z / l);
    const ray = new THREE.Raycaster();
    ray.set(earthRel.clone().addScaledVector(dir, 4e8), dir.clone().multiplyScalar(-1));
    const hit = ray.intersectObject(this.earthMesh, false)[0];
    if (!hit || !hit.uv) return null;
    return { u: hit.uv.x, v: hit.uv.y, latDeg: vToLatDeg(hit.uv.y), lonDeg: uToLonEastDeg(hit.uv.x) };
  }

  // ---------- input ----------
  private onResize = (): void => {
    const w = this.container.clientWidth || window.innerWidth;
    const h = this.container.clientHeight || window.innerHeight;
    this.camera.aspect = w / h;
    this.camera.updateProjectionMatrix();
    this.renderer.setSize(w, h);
    this.labelRenderer.setSize(w, h);
  };

  private onPointerMove = (e: PointerEvent): void => {
    const rect = this.renderer.domElement.getBoundingClientRect();
    this.pointer.x = ((e.clientX - rect.left) / rect.width) * 2 - 1;
    this.pointer.y = -((e.clientY - rect.top) / rect.height) * 2 + 1;
  };

  private onPointerDown = (e: PointerEvent): void => {
    this.downX = e.clientX;
    this.downY = e.clientY;
    this.downT = performance.now();
  };

  private onClick = (e: MouseEvent): void => {
    // Abaikan bila ini hasil drag (gerak kamera), bukan klik murni
    const moved = Math.hypot(e.clientX - this.downX, e.clientY - this.downY);
    if (performance.now() - this.downT > 400 || moved > 6) return;
    this.raycaster.setFromCamera(this.pointer, this.camera);
    const hits = this.raycaster.intersectObjects(this.pickTargets, true);
    for (const h of hits) {
      const id = this.objToBody(h.object);
      if (id) {
        this.pendingPov = null;
        simStore.live.povPending = null;
        // Klik pada permukaan Bumi → tampilkan opsi "PoV here"
        const mesh = h.object as THREE.Mesh;
        if (id === 'earth' && mesh.geometry?.attributes?.uv && h.uv) {
          const latDeg = vToLatDeg(h.uv.y);
          const lonDeg = uToLonEastDeg(h.uv.x);
          this.pendingPov = { x: e.clientX, y: e.clientY, latDeg, lonDeg };
          simStore.live.povPending = { x: e.clientX, y: e.clientY, latDeg, lonDeg };
        }
        simStore.setSettings({ selected: id });
        this.focusBody(id);
        return;
      }
    }
  };

  // ---------- PoV (point of view) ----------
  enterPov(): void {
    if (this.pendingPov) this.enterPovAt(this.pendingPov.latDeg, this.pendingPov.lonDeg);
  }

  enterPovAt(latDeg: number, lonDeg: number): void {
    this.povLatDeg = latDeg;
    this.povLonDeg = lonDeg;
    this.povActive = true;
    this.lastPovPathMs = -1;
    this.pendingPov = null;
    simStore.live.povPending = null;
    simStore.live.povActive = true;
    this.controls.enabled = false;
    this.followBody = 'earth';
    simStore.setSettings({ selected: 'earth' });
    this.focusTimer = 0;
  }

  exitPov(): void {
    this.povActive = false;
    simStore.live.povActive = false;
    this.povVisuals.visible = false;
    this.renderer.setClearColor(0x00000a, 1);
    this.controls.enabled = true;
    this.camera.up.set(0, 1, 0);
    const earthRel = this.rel(this.ephem.earth);
    this.camera.position.set(earthRel.x, earthRel.y + EARTH_RADIUS * 2, earthRel.z + EARTH_RADIUS * 3);
    this.controls.target.set(0, 0, 0);
    this.focusTimer = 0.8;
  }

  /** Posisikan kamera di titik klik dan bangun langit lokal di sekelilingnya. */
  private updatePov(): void {
    const frame = this.povFrame(simStore.live.time);
    const { worldDir, north } = frame;
    const east = new THREE.Vector3().crossVectors(north, worldDir).normalize();
    const earthRel = this.rel(this.ephem.earth);
    const camPos = earthRel.clone().addScaledVector(worldDir, EARTH_RADIUS + 8);
    const moonDir = this.rel(this.ephem.moon).sub(earthRel).normalize();
    const sunDir = this.rel({ x: 0, y: 0, z: 0 }).sub(earthRel).normalize();
    const moonVisible = moonDir.dot(worldDir) > 0;
    const lookDir = moonVisible ? moonDir : (sunDir.dot(worldDir) > 0 ? sunDir : worldDir.clone().addScaledVector(north, 0.2).normalize());

    this.camera.up.copy(north);
    this.camera.position.copy(camPos);
    this.camera.lookAt(camPos.clone().addScaledVector(lookDir, 20000));

    // Warna langit ditentukan oleh tinggi Matahari di lokasi pengamat: biru
    // pekat saat siang, jingga di senja, dan kembali gelap pada malam hari.
    const sunAltitude = sunDir.dot(worldDir);
    const night = new THREE.Color(0x00000a);
    const twilight = new THREE.Color(0x315277);
    const day = new THREE.Color(0x58aee8);
    const sky = sunAltitude <= -0.12
      ? night
      : sunAltitude < 0.08
        ? night.clone().lerp(twilight, (sunAltitude + 0.12) / 0.2)
        : twilight.clone().lerp(day, Math.min(1, (sunAltitude - 0.08) / 0.45));
    this.renderer.setClearColor(sky, 1);

    this.updatePovVisuals(camPos, worldDir, north, east);
    const moonToSun = new THREE.Vector3(-this.ephem.moon.x, -this.ephem.moon.y, -this.ephem.moon.z).normalize();
    const moonToObserver = new THREE.Vector3(this.ephem.earth.x - this.ephem.moon.x, this.ephem.earth.y - this.ephem.moon.y, this.ephem.earth.z - this.ephem.moon.z).normalize();
    // Pengamat sangat dekat pusat Bumi dibanding jarak Bulan; gunakan posisi Bumi agar stabil.
    simStore.live.povMoonIllumination = Math.max(0, Math.min(1, (1 + moonToSun.dot(moonToObserver)) / 2));
    simStore.live.povMoonVisible = moonVisible;
  }

  private povFrame(time: Date): { worldDir: THREE.Vector3; north: THREE.Vector3 } {
    const spin = gmstRad(time) + this.earthPhaseK;
    const lam = (this.povLonDeg * Math.PI) / 180;
    const phi = (this.povLatDeg * Math.PI) / 180;

    // Gunakan konvensi yang sama persis dengan SphereGeometry/UV Bumi:
    // lon 0 = +X dan bujur timur mengarah ke -Z. Lalu terapkan rotasi
    // sidereal mesh dan kemiringan grup Bumi dalam urutan render sebenarnya.
    // Rumus lama membangun vektor dari lon/lat yang berbeda, sehingga PoV
    // dapat bergeser jauh dari piksel permukaan yang diklik.
    const local = new THREE.Vector3(
      Math.cos(phi) * Math.cos(lam),
      Math.sin(phi),
      -Math.cos(phi) * Math.sin(lam),
    );
    const northLocal = new THREE.Vector3(
      -Math.sin(phi) * Math.cos(lam),
      Math.cos(phi),
      Math.sin(phi) * Math.sin(lam),
    );
    const worldDir = local.applyAxisAngle(UP, spin).applyQuaternion(this.earth.quaternion).normalize();
    const north = northLocal.applyAxisAngle(UP, spin).applyQuaternion(this.earth.quaternion).normalize();

    return { worldDir, north };
  }

  private updatePovVisuals(camPos: THREE.Vector3, up: THREE.Vector3, north: THREE.Vector3, east: THREE.Vector3): void {
    const planeQ = new THREE.Quaternion().setFromUnitVectors(new THREE.Vector3(0, 0, 1), up);
    const groundCenter = camPos.clone().addScaledVector(up, -10);
    this.povVisuals.visible = true;
    this.povGround.position.copy(groundCenter); this.povGround.quaternion.copy(planeQ);
    this.povHorizon.position.copy(groundCenter); this.povHorizon.quaternion.copy(planeQ);
    const compass = [north, east, north.clone().negate(), east.clone().negate()];
    this.povCompass.children.forEach((label, i) => label.position.copy(groundCenter).addScaledVector(compass[i], 65000).addScaledVector(up, 120));
    // Lintasan berubah perlahan; hindari menghitung 50 ephemeris setiap frame render.
    if (Math.abs(simStore.live.time.getTime() - this.lastPovPathMs) >= 5 * 60_000) {
      this.setSkyPath(this.povSunPath, 'sun', camPos);
      this.setSkyPath(this.povMoonPath, 'moon', camPos);
      this.lastPovPathMs = simStore.live.time.getTime();
    }
  }

  private setSkyPath(line: THREE.Line, body: 'sun' | 'moon', camPos: THREE.Vector3): void {
    const points: THREE.Vector3[] = [];
    for (let h = -12; h <= 12; h += 1) {
      const t = new Date(simStore.live.time.getTime() + h * 3600000);
      const ep = computeEphemeris(t);
      const f = this.povFrame(t);
      const target = body === 'sun' ? new THREE.Vector3(-ep.earth.x, -ep.earth.y, -ep.earth.z) : new THREE.Vector3(ep.moon.x - ep.earth.x, ep.moon.y - ep.earth.y, ep.moon.z - ep.earth.z);
      const dir = target.normalize();
      if (dir.dot(f.worldDir) >= 0) points.push(camPos.clone().addScaledVector(dir, 65000));
    }
    line.geometry.dispose();
    line.geometry = new THREE.BufferGeometry().setFromPoints(points);
  }

  private objToBody(o: THREE.Object3D): BodyId | null {
    for (const [id, ref] of this.bodies) {
      let p: THREE.Object3D | null = o;
      while (p) {
        if (p === ref.obj) return id;
        p = p.parent;
      }
    }
    return null;
  }

  // ---------- fokus ----------
  focusBody(id: BodyId): void {
    this.followBody = id;
    this.focusTimer = 1.2;
    const b = this.getBodyAbs(id);
    if (b) this.anchorAbs = b;
    const dist = FOCUS_DIST[id];
    this.controls.minDistance = Math.max(200, dist * 0.6);
    this.focusOffset.copy(new THREE.Vector3(0, 0.55, 1).normalize().multiplyScalar(dist));
    // Kamera harus menatap titik asal render (anchor = objek) agar objek tepat di tengah,
    // walau sebelumnya target sempat bergeser oleh pan.
    this.controls.target.set(0, 0, 0);
  }

  clearFollow(): void {
    this.followBody = null;
  }

  /** NDC proyeksi layar posisi objek (0,0 = tengah layar). Utk debugging fokus. */
  focusNdc(id: BodyId): { x: number; y: number } {
    const b = this.getBodyAbs(id);
    if (!b) return { x: NaN, y: NaN };
    const p = new THREE.Vector3(b.x - this.anchorAbs.x, b.y - this.anchorAbs.y, b.z - this.anchorAbs.z).project(this.camera);
    return { x: p.x, y: p.y };
  }

  private getBodyAbs(id: BodyId): Vec3 | null {
    switch (id) {
      case 'sun':
        return { x: 0, y: 0, z: 0 };
      case 'earth':
        return this.ephem.earth;
      case 'moon':
        return this.ephem.moon;
      case 'iss':
        return {
          x: this.ephem.earth.x + this.ephem.issGeo.x,
          y: this.ephem.earth.y + this.ephem.issGeo.y,
          z: this.ephem.earth.z + this.ephem.issGeo.z,
        };
    }
  }

  private rel(v: Vec3): THREE.Vector3 {
    return new THREE.Vector3(v.x - this.anchorAbs.x, v.y - this.anchorAbs.y, v.z - this.anchorAbs.z);
  }

  // ---------- loop ----------
  private loop = (): void => {
    if (this.disposed) return;
    this.raf = requestAnimationFrame(this.loop);
    const dt = Math.min(this.clock.getDelta(), 0.1);

    const st = simStore.getSettings();

    // Waktu simulasi
    if (st.playing) {
      const now = simStore.live.time.getTime() + st.speedMs * dt;
      simStore.live.time = new Date(now);
    }
    const t = simStore.live.time;

    // Recompute ephemeris hanya bila waktu berubah
    const ms = t.getTime();
    if (ms !== this.lastEphemMs) {
      this.lastEphemMs = ms;
      this.ephem = computeEphemeris(t);
    }
    const e = this.ephem;

    // Seleksi dari UI
    if (st.selected !== this.selected) {
      this.selected = st.selected;
      if (st.selected) this.focusBody(st.selected);
      else this.clearFollow();
    }

    // Anchor mengikuti objek terpilih; kamera selalu menatap titik asal render (= objek)
    if (this.followBody) {
      const b = this.getBodyAbs(this.followBody);
      if (b) this.anchorAbs = b;
      this.controls.target.set(0, 0, 0);
    }

    // Kamera: animasi fokus (snap tepat saat selesai agar titik fokus presisi)
    if (!this.povActive && this.focusTimer > 0) {
      this.focusTimer -= dt;
      if (this.focusTimer <= 0) {
        this.camera.position.copy(this.focusOffset);
      } else {
        const k = 1 - Math.exp(-4.5 * dt);
        this.camera.position.lerp(this.focusOffset, k);
      }
    }
    this.controls.autoRotate = st.autoRotate && !this.povActive;

    // Update objek
    this.positionBodies(e);
    this.updateOrbits(t, st);
    this.updateShadow(e, st);
    this.updateFov(e, st);

    // Visibilitas
    this.starfield.visible = st.showStarfield;
    this.earthOrbitLine.visible = st.showOrbits;
    this.moonOrbitLine.visible = st.showOrbits;
    this.issRing.visible = st.showOrbits;
    this.issTrail.visible = st.showOrbits;
    this.axisEarth.visible = st.showOrbits;
    for (const b of this.bodies.values()) b.label.visible = st.showLabels;

    // PoV aktif → kontrol manual; selain itu OrbitControls (dengan animasi fokus)
    if (this.povActive) {
      this.updatePov();
    } else {
      this.controls.update();
    }
    this.renderer.render(this.scene, this.camera);
    this.labelRenderer.render(this.scene, this.camera);

    this.infoTimer += dt;
    if (this.infoTimer >= 0.25) {
      this.infoTimer = 0;
      this.publishInfo();
    }
  };

  private positionBodies(e: ReturnType<typeof computeEphemeris>): void {
    const sunAbs: Vec3 = { x: 0, y: 0, z: 0 };
    const moonAbs = e.moon;
    const issAbs = {
      x: e.earth.x + e.issGeo.x,
      y: e.earth.y + e.issGeo.y,
      z: e.earth.z + e.issGeo.z,
    };

    this.sun.position.copy(this.rel(sunAbs));
    this.earth.position.copy(this.rel(e.earth));
    this.moon.position.copy(this.rel(moonAbs));
    this.iss.position.copy(this.rel(issAbs));

    // Fase Matahari mengikuti jam simulasi: berhenti saat simulasi dijeda dan
    // ikut dipercepat saat pengguna mengubah laju waktu.
    const solarPhase = ((simStore.live.time.getTime() % SUN_ROTATION_PERIOD_MS) + SUN_ROTATION_PERIOD_MS) % SUN_ROTATION_PERIOD_MS;
    this.sun.rotation.y = (solarPhase / SUN_ROTATION_PERIOD_MS) * Math.PI * 2;
    this.sunGlow.position.copy(this.sun.position);
    this.sunLight.position.copy(this.sun.position);

    // Rotasi sidereal Bumi real-time mengikuti waktu simulasi (GMST).
    // earthMesh adalah anak grup dengan quaternion kemiringan; rotation.y = sudut putar
    // sekitar sumbu lokal Y (sumbu putar yang sudah miring).
    this.earthMesh.rotation.y = gmstRad(simStore.live.time) + this.earthPhaseK;

    // Ukuran ISS adaptif (baca setelan langsung)
    const issSt = simStore.getSettings();
    const scale = issSt.adaptiveIss ? this.issVisualScale(issAbs) : 0.1;
    this.iss.scale.set(scale, scale, scale);

    // Jejak disimpan pada koordinat geosentris, bukan koordinat absolut.
    // Dengan begitu percepatan waktu tidak membuat garis menghubungkan orbit
    // ISS dengan posisi Bumi pada hari-hari sebelumnya.
    if (issSt.playing) {
      this.issTrailPts.push({ ...e.issGeo });
      if (this.issTrailPts.length > 300) this.issTrailPts.shift();
    } else if (this.issTrailPts.length > 1) {
      // Saat dijeda, jejak mengerut kembali menuju posisi ISS saat ini.
      this.issTrailPts.splice(0, Math.min(4, this.issTrailPts.length - 1));
    }
    this.issTrail.geometry.dispose();
    this.issTrail.geometry = new THREE.BufferGeometry().setFromPoints(
      this.issTrailPts.map((p) => this.rel({ x: e.earth.x + p.x, y: e.earth.y + p.y, z: e.earth.z + p.z })),
    );
  }

  private issVisualScale(issAbs: Vec3): number {
    const d = this.camera.position.distanceTo(this.rel(issAbs));
    // Saat fokus ISS: perbesar agar model terlihat jelas (ukuran sudut ~konstan).
    if (this.followBody === 'iss') return Math.min(60, Math.max(1, d * 0.01));
    return Math.min(14, Math.max(0.5, d * 0.002));
  }

  // ---------- garis orbit ----------
  private updateOrbits(t: Date, st: ReturnType<typeof simStore.getSettings>): void {
    void st;
    const dayKey = Math.floor(t.getTime() / 86400000);

    if (dayKey !== this.orbitDayKey) {
      this.orbitDayKey = dayKey;
      // Orbit Bumi (heliosentris, absolut) — geometri absolut + posisi mesh = rel(origin)
      const pts: THREE.Vector3[] = [];
      for (let i = 0; i <= 360; i++) {
        const ep = computeEphemeris(new Date(t.getTime() + i * 86400000));
        pts.push(new THREE.Vector3(ep.earth.x, ep.earth.y, ep.earth.z));
      }
      this.earthOrbitLine.geometry.dispose();
      this.earthOrbitLine.geometry = new THREE.BufferGeometry().setFromPoints(pts);

      // Orbit Bulan (geosentris, absolut vs Bumi)
      const mpts: THREE.Vector3[] = [];
      for (let i = 0; i <= 60; i++) {
        const ep = computeEphemeris(new Date(t.getTime() + (i - 30) * 43200000));
        mpts.push(new THREE.Vector3(ep.moon.x - ep.earth.x, ep.moon.y - ep.earth.y, ep.moon.z - ep.earth.z));
      }
      this.moonOrbitLine.geometry.dispose();
      this.moonOrbitLine.geometry = new THREE.BufferGeometry().setFromPoints(mpts);
    }
    this.earthOrbitLine.position.copy(this.rel({ x: 0, y: 0, z: 0 }));
    this.moonOrbitLine.position.copy(this.rel(this.ephem.earth));

    // Ring orbit ISS (1 periode ~93 mnt) — dibangun ulang setiap ~15 dtk
    if (performance.now() - this.lastIssRingMs > 15000) {
      this.lastIssRingMs = performance.now();
      const pts: THREE.Vector3[] = [];
      const N = 96;
      for (let i = 0; i <= N; i++) {
        const d = new Date(t.getTime() + (i / N) * 93 * 60000);
        const iss = issState(d).eclVec;
        pts.push(this.rel({ x: this.ephem.earth.x + iss.x, y: this.ephem.earth.y + iss.y, z: this.ephem.earth.z + iss.z }));
      }
      this.issRing.geometry.dispose();
      this.issRing.geometry = new THREE.BufferGeometry().setFromPoints(pts);
    }
  }

  // ---------- bayangan ----------
  private updateShadow(e: ReturnType<typeof computeEphemeris>, st: ReturnType<typeof simStore.getSettings>): void {
    const sh = computeShadow({ x: 0, y: 0, z: 0 }, e.moon, e.earth);
    const show = st.showMoonShadow;
    this.shadowUmbra.visible = show;
    this.shadowPenumbra.visible = show;
    this.umbraRays.visible = show;
    this.penumbraRays.visible = show;
    this.footprintUmbra.visible = show;
    this.footprintPenumbra.visible = show;

    if (show) {
      // Sumbu bayangan: dari Matahari → Bulan → sisi jauh (menjauhi Matahari).
      // (sh.axis = normalize(moon-sun); kerucut dibangun sepanjang arah ini.)
      const axis = sh.axis;
      const apex = sh.umbraApexKm;

      // Umbra: mulai dari PERMUKAAN sisi jauh Bulan (jangan menembus bola),
      // radius dasar = ukuran Bulan, mengerucut mengikuti garis tarik dari Matahari ke puncak.
      const uStart = vecAdd(e.moon, vecScale(axis, MOON_RADIUS * 1.003));
      const uLen = Math.max(apex - MOON_RADIUS, 1e3);
      this.setFrustum(this.shadowUmbra, uStart, axis, MOON_RADIUS, 0, uLen);

      // Penumbra: dari permukaan sisi jauh Bulan, radius dasar = ukuran Bulan, lalu melebar
      const pStart = vecAdd(e.moon, vecScale(axis, MOON_RADIUS * 1.003));
      const pLen = Math.max(Math.min(2 * sh.tEarthKm + EARTH_RADIUS, 1.2e6) - MOON_RADIUS, 1e3);
      this.setFrustum(
        this.shadowPenumbra,
        pStart,
        axis,
        MOON_RADIUS,
        MOON_RADIUS + pLen * Math.tan(sh.beta),
        pLen,
      );

      this.buildLightRays(e, sh);
      this.placeFootprint(e, sh, axis);
    }

    // Bayangan Bumi (gerhana bulan) — dari permukaan sisi jauh Bumi, mengerucut menjauhi Matahari
    this.earthShadowCone.visible = st.showEarthShadow;
    if (st.showEarthShadow) {
      const dir = vecNorm(e.earth); // arah dari Matahari ke Bumi, diteruskan
      const len = vecLen(e.earth);
      const alphaE = Math.asin(SUN_RADIUS / len);
      const apexE = EARTH_RADIUS / Math.tan(alphaE);
      const eStart = vecAdd(e.earth, vecScale(dir, EARTH_RADIUS * 1.003));
      const eLen = Math.min(apexE, 1.6e6) - EARTH_RADIUS;
      this.setFrustum(this.earthShadowCone, eStart, dir, EARTH_RADIUS, 0, Math.max(eLen, 1e3));
    }

    simStore.live.shadowEclipseType = sh.eclipseType;
    simStore.live.shadowLabel = shadowLabel(sh);
    simStore.live.shadowUmbraKm = sh.umbraAtEarthKm;
    simStore.live.shadowPenumbraKm = sh.penumbraAtEarthKm;
  }

  /**
   * Kerucut dari titik `from` sepanjang `dir` (satuan), radius r0 di `from`, r1 di jarak L.
   * Catatan: CylinderGeometry terpusat di posisi mesh; alas (r0) berada di ujung -y.
   * Maka mesh diletakkan di `from + dir·(L/2)` agar alas PERSIS di `from` dan kerucut
   * hanya memanjang keluar (+dir) — tidak membentang kembali menembus benda.
   */
  private setFrustum(mesh: THREE.Mesh, from: Vec3, dir: Vec3, r0: number, r1: number, L: number): void {
    const len = Math.max(L, 1e3);
    mesh.geometry.dispose();
    mesh.geometry = new THREE.CylinderGeometry(Math.max(r1, 0.0001), Math.max(r0, 0.0001), len, 28, 1, true);
    mesh.position.copy(
      this.rel({
        x: from.x + dir.x * (len / 2),
        y: from.y + dir.y * (len / 2),
        z: from.z + dir.z * (len / 2),
      }),
    );
    const q = new THREE.Quaternion().setFromUnitVectors(
      new THREE.Vector3(0, 1, 0),
      new THREE.Vector3(dir.x, dir.y, dir.z),
    );
    mesh.quaternion.copy(q);
  }

  /**
   * Sinar cahaya sungguhan dari piringan Matahari yang menyinggung Bulan
   * (batas umbra & penumbra); konversi ke koordinat relatif lalu render LineSegments.
   */
  private buildLightRays(e: ReturnType<typeof computeEphemeris>, sh: ReturnType<typeof computeShadow>): void {
    const { umbra, penumbra } = shadowLightRays(sh, e.moon, 8);
    const umbraPts: number[] = [];
    const penPts: number[] = [];
    for (const r of umbra) this.pushSeg(umbraPts, r.start, r.end);
    for (const r of penumbra) this.pushSeg(penPts, r.start, r.end);

    this.umbraRays.geometry.dispose();
    this.umbraRays.geometry = new THREE.BufferGeometry().setAttribute(
      'position',
      new THREE.BufferAttribute(new Float32Array(umbraPts), 3),
    );
    this.penumbraRays.geometry.dispose();
    this.penumbraRays.geometry = new THREE.BufferGeometry().setAttribute(
      'position',
      new THREE.BufferAttribute(new Float32Array(penPts), 3),
    );
  }

  private pushSeg(arr: number[], a: Vec3, b: Vec3): void {
    const ra = this.rel(a);
    const rb = this.rel(b);
    arr.push(ra.x, ra.y, ra.z, rb.x, rb.y, rb.z);
  }

  /** Piringan jatuh umbra/penumbra pada permukaan Bumi (posisi sumbu menembus bola). */
  private placeFootprint(e: ReturnType<typeof computeEphemeris>, sh: ReturnType<typeof computeShadow>, axis: Vec3): void {
    // Cari t (jarak dari Bulan sepanjang axis) di mana |moon + axis*t - earth| = R_e
    const d = vecSub(e.earth, e.moon);
    const dd = vecDot(axis, d);
    const disc = vecDot(d, d) - EARTH_RADIUS * EARTH_RADIUS;
    const b = dd * dd - disc;
    const hit = b > 0;
    let tHit = hit ? dd - Math.sqrt(b) : 0;
    if (tHit < 0) tHit = 0;

    const centerAbs = {
      x: e.moon.x + axis.x * tHit,
      y: e.moon.y + axis.y * tHit,
      z: e.moon.z + axis.z * tHit,
    };
    const rU = Math.max(0, sh.umbraAtEarthKm); // di posisi tHit mendekati sama dgn di pusat Bumi
    const rP = Math.max(0, sh.penumbraAtEarthKm);

    this.footprintUmbra.visible = hit && rU > 1;
    this.footprintPenumbra.visible = hit;

    const qU = new THREE.Quaternion().setFromUnitVectors(
      new THREE.Vector3(0, 0, 1),
      new THREE.Vector3(axis.x, axis.y, axis.z),
    );
    this.footprintUmbra.quaternion.copy(qU);
    this.footprintPenumbra.quaternion.copy(qU);
    this.footprintUmbra.position.copy(this.rel(centerAbs));
    this.footprintPenumbra.position.copy(this.rel(centerAbs));
    this.footprintUmbra.scale.set(rU, rU, 1);
    this.footprintPenumbra.scale.set(rP, rP, 1);
  }

  // ---------- FoV ----------
  private updateFov(e: ReturnType<typeof computeEphemeris>, st: ReturnType<typeof simStore.getSettings>): void {
    const fov = computeIssFov(e.issGeo);
    const show = st.showFov;
    this.fovRing.visible = show;
    this.fovCap.visible = show;
    if (!show) return;

    const lambda = fov.centralAngleRad(st.fovElevMinDeg);
    const rRing = EARTH_RADIUS * Math.sin(lambda);
    const nadir = fov.nadir;
    const centerSurf = this.rel({
      x: e.earth.x + nadir.x * EARTH_RADIUS,
      y: e.earth.y + nadir.y * EARTH_RADIUS,
      z: e.earth.z + nadir.z * EARTH_RADIUS,
    });
    const q = new THREE.Quaternion().setFromUnitVectors(
      new THREE.Vector3(0, 0, 1),
      new THREE.Vector3(nadir.x, nadir.y, nadir.z),
    );
    this.fovRing.quaternion.copy(q);
    this.fovCap.quaternion.copy(q);
    this.fovRing.position.copy(centerSurf);
    this.fovCap.position.copy(centerSurf);

    this.fovRing.geometry.dispose();
    const circ = new THREE.EllipseCurve(0, 0, rRing, rRing, 0, Math.PI * 2);
    this.fovRing.geometry = new THREE.BufferGeometry().setFromPoints(
      circ.getPoints(72).map((p) => new THREE.Vector3(p.x, p.y, 0)),
    );
    this.fovCap.scale.set(rRing, rRing, 1);

    simStore.live.fovDiaKm = fov.footprintKm(st.fovElevMinDeg);
    simStore.live.fovAreaKm2 = fov.areaKm2(st.fovElevMinDeg);
    simStore.live.fovElevMinDeg = st.fovElevMinDeg;
  }

  // ---------- info ----------
  publishInfo(): void {
    const e = this.ephem;
    const live = simStore.live;
    live.time = simStore.live.time;
    live.earthSunKm = e.earthSunKm;
    live.moonEarthKm = e.moonEarthKm;
    live.issEarthKm = e.issEarthKm;
    live.issLatDeg = e.issLatDeg;
    live.issLonDeg = e.issLonDeg;
    live.issAltKm = e.issAltKm;
    live.issMode = e.issMode;

    switch (this.selected) {
      case 'sun':
        live.selDistToSun = 0;
        live.selDistToEarth = e.earthSunKm;
        live.selSpeedKmS = 0;
        live.selPos = { x: 0, y: 0, z: 0 };
        break;
      case 'earth':
        live.selDistToSun = e.earthSunKm;
        live.selDistToEarth = 0;
        live.selSpeedKmS = EARTH_SPEED;
        live.selPos = e.earth;
        break;
      case 'moon':
        live.selDistToSun = vecLen(e.moon);
        live.selDistToEarth = e.moonEarthKm;
        live.selSpeedKmS = MOON_SPEED;
        live.selPos = e.moon;
        break;
      case 'iss':
        live.selDistToSun = vecLen({
          x: e.earth.x + e.issGeo.x,
          y: e.earth.y + e.issGeo.y,
          z: e.earth.z + e.issGeo.z,
        });
        live.selDistToEarth = e.issEarthKm;
        live.selSpeedKmS = ISS_SPEED;
        live.selPos = e.issGeo;
        break;
      default:
        live.selDistToSun = 0;
        live.selDistToEarth = 0;
        live.selSpeedKmS = 0;
        live.selPos = { x: 0, y: 0, z: 0 };
    }
  }

  dispose(): void {
    this.disposed = true;
    cancelAnimationFrame(this.raf);
    window.removeEventListener('resize', this.onResize);
    this.renderer.domElement.removeEventListener('pointermove', this.onPointerMove);
    this.renderer.domElement.removeEventListener('pointerdown', this.onPointerDown);
    this.renderer.domElement.removeEventListener('click', this.onClick);
    this.renderer.dispose();
    this.renderer.domElement.remove();
    this.labelRenderer.domElement.remove();
    this.controls.dispose();
  }
}
