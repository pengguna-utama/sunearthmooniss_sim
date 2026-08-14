import { useSyncExternalStore } from 'react';
import type { BodyId } from '../constants';
import type { TimezoneKey } from '../core/tz';

export interface LiveInfo {
  time: Date;
  earthSunKm: number;
  moonEarthKm: number;
  issEarthKm: number;
  issLatDeg: number;
  issLonDeg: number;
  issAltKm: number;
  issMode: string;
  selDistToSun: number;
  selDistToEarth: number;
  selSpeedKmS: number;
  selPos: { x: number; y: number; z: number };
  shadowEclipseType: string;
  shadowLabel: string;
  shadowUmbraKm: number;
  shadowPenumbraKm: number;
  fovDiaKm: number;
  fovAreaKm2: number;
  fovElevMinDeg: number;
  /** Titik yang dipilih di permukaan Bumi menunggu dikonfirmasi "PoV here" (koordinat layar & geodetik). */
  povPending: { x: number; y: number; latDeg: number; lonDeg: number } | null;
  povActive: boolean;
  /** Informasi Bulan untuk panel picture-in-picture pada pandangan permukaan. */
  povMoonIllumination: number;
  povMoonVisible: boolean;
}

export interface Settings {
  selected: BodyId | null;
  playing: boolean;
  /** ms simulasi per detik riil */
  speedMs: number;
  showLabels: boolean;
  showOrbits: boolean;
  showMoonShadow: boolean;
  showEarthShadow: boolean;
  showFov: boolean;
  showStarfield: boolean;
  adaptiveIss: boolean;
  autoRotate: boolean;
  fovElevMinDeg: number;
  tleStatus: string;
  timezone: TimezoneKey;
}

export const INITIAL_SETTINGS: Settings = {
  selected: 'earth',
  playing: false,
  speedMs: 60000,
  showLabels: true,
  showOrbits: true,
  showMoonShadow: true,
  showEarthShadow: false,
  showFov: false,
  showStarfield: true,
  adaptiveIss: true,
  autoRotate: false,
  fovElevMinDeg: 0,
  tleStatus: '',
  timezone: 'WIB',
};

export const INITIAL_LIVE: LiveInfo = {
  time: new Date(),
  earthSunKm: 0,
  moonEarthKm: 0,
  issEarthKm: 0,
  issLatDeg: 0,
  issLonDeg: 0,
  issAltKm: 0,
  issMode: '',
  selDistToSun: 0,
  selDistToEarth: 0,
  selSpeedKmS: 0,
  selPos: { x: 0, y: 0, z: 0 },
  shadowEclipseType: '',
  shadowLabel: '',
  shadowUmbraKm: 0,
  shadowPenumbraKm: 0,
  fovDiaKm: 0,
  fovAreaKm2: 0,
  fovElevMinDeg: 0,
  povPending: null,
  povActive: false,
  povMoonIllumination: 0,
  povMoonVisible: false,
};

class SimStore {
  private settings: Settings = { ...INITIAL_SETTINGS };
  /** Terbuka: engine menulis field langsung tiap frame tanpa notify (agar React tak re-render 60×/dtk). */
  live: LiveInfo = { ...INITIAL_LIVE };
  private listeners = new Set<() => void>();

  /** Arrow-field agar `this` tetap terikat saat dikirim sebagai callback (useSyncExternalStore). */
  getSettings = (): Settings => this.settings;

  getLive = (): LiveInfo => this.live;

  setSettings(patch: Partial<Settings>): void {
    this.settings = { ...this.settings, ...patch };
    this.emit();
  }

  /**
   * Ganti objek `live` dengan referensi baru (kloning + patch) agar
   * useSyncExternalStore mendeteksi perubahan & me-render ulang panel.
   * Engine tetap menulis field `simStore.live` langsung per-frame (tanpa notify).
   */
  setLive(patch: Partial<LiveInfo>): void {
    this.live = { ...this.live, ...patch };
    this.emit();
  }

  subscribe = (fn: () => void): (() => void) => {
    this.listeners.add(fn);
    return () => {
      this.listeners.delete(fn);
    };
  };

  /** Notifikasi polling (dipanggil interval App agar UI ikut nilai `live` terbaru). */
  tick(): void {
    this.emit();
  }

  private emit(): void {
    for (const l of this.listeners) l();
  }
}

export const simStore = new SimStore();

export function useSettings(): Settings {
  return useSyncExternalStore(simStore.subscribe, simStore.getSettings);
}

export function useLive(): LiveInfo {
  return useSyncExternalStore(simStore.subscribe, simStore.getLive);
}
