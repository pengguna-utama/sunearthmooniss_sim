import { useEffect, useRef } from 'react';
import { useLive } from '../engine/store';
import type { SceneEngine } from '../engine/SceneEngine';

function fmtLatLon(lat: number, lon: number): string {
  return `${Math.abs(lat).toFixed(1)}°${lat >= 0 ? 'N' : 'S'}, ${Math.abs(lon).toFixed(1)}°${lon >= 0 ? 'E' : 'B'}`;
}

export function PovButton({ engine }: { engine: () => SceneEngine | null }) {
  const live = useLive();
  if (live.povActive) return <><button className="btn pov-exit" onClick={() => engine()?.exitPov()} title="Kembali ke pandangan orbit Bumi">× Keluar PoV Bumi</button><MoonPip illumination={live.povMoonIllumination} visible={live.povMoonVisible} /></>;
  if (live.povPending) {
    const p = live.povPending;
    return <button className="btn pov-btn" style={{ left: Math.min(p.x + 12, window.innerWidth - 210), top: p.y - 40 }} onClick={() => engine()?.enterPov()} title="Tampilkan dari titik ini di permukaan Bumi">👁 PoV di sini — {fmtLatLon(p.latDeg, p.lonDeg)}</button>;
  }
  return null;
}

function MoonPip({ illumination, visible }: { illumination: number; visible: boolean }) {
  const ref = useRef<HTMLCanvasElement>(null);
  useEffect(() => {
    const canvas = ref.current; const ctx = canvas?.getContext('2d'); if (!canvas || !ctx) return;
    const r = 47; const cx = 56; const cy = 56;
    ctx.clearRect(0, 0, 112, 112);
    ctx.beginPath(); ctx.arc(cx, cy, r, 0, Math.PI * 2); ctx.fillStyle = '#e8edf3'; ctx.fill();
    ctx.save(); ctx.beginPath(); ctx.arc(cx, cy, r, 0, Math.PI * 2); ctx.clip();
    ctx.beginPath(); ctx.arc(cx + 2 * r * illumination, cy, r, 0, Math.PI * 2); ctx.fillStyle = '#111827'; ctx.fill(); ctx.restore();
    ctx.strokeStyle = '#b9d2ff'; ctx.lineWidth = 1; ctx.beginPath(); ctx.arc(cx, cy, r, 0, Math.PI * 2); ctx.stroke();
  }, [illumination]);
  return <aside className="moon-pip" aria-label="Fase Bulan dari posisi pengamat"><canvas ref={ref} width="112" height="112" /><div><strong>Fase Bulan</strong><br />{Math.round(illumination * 100)}% terang · {visible ? 'terlihat di langit' : 'di bawah horizon'}</div></aside>;
}
