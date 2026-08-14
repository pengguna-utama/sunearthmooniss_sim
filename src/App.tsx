import { useEffect, useRef, useState } from 'react';
import { SceneEngine } from './engine/SceneEngine';
import { simStore, useSettings } from './engine/store';
import { ObjectPanel } from './components/ObjectPanel';
import { TimePanel } from './components/TimePanel';
import { ControlPanel, InfoPanel } from './components/ControlPanel';
import { PovButton } from './components/PovButton';

export default function App() {
  const containerRef = useRef<HTMLDivElement>(null);
  const engineRef = useRef<SceneEngine | null>(null);
  const { selected } = useSettings();
  const [objectCollapsed, setObjectCollapsed] = useState(false);
  const [controlsCollapsed, setControlsCollapsed] = useState(false);
  const [infoCollapsed, setInfoCollapsed] = useState(false);

  useEffect(() => {
    if (!containerRef.current) return;
    const engine = new SceneEngine(containerRef.current);
    engine.init();
    engineRef.current = engine;
    // Debug/smoke: ekspos engine (dihapus setelah verifikasi)
    (window as unknown as { __engine: unknown }).__engine = engine;
    (window as unknown as { __store: unknown }).__store = simStore;

    // Waktu awal = sekarang
    simStore.setLive({ time: new Date() });

    // Refresh UI ~4 Hz (engine menulis field store.live langsung setiap frame)
    const iv = window.setInterval(() => {
      simStore.setLive({});
    }, 250);

    return () => {
      window.clearInterval(iv);
      engine.dispose();
      engineRef.current = null;
    };
  }, []);

  return (
    <div className="app">
      <div ref={containerRef} className="canvas-container" />
      <PovButton engine={() => engineRef.current} />
      <header className="topbar">
        <h1>🌌 Tata Surya — Matahari · Bumi · Bulan · ISS</h1>
        <span className="hint">Seret: rotasi · Scroll: zoom · Klik objek: fokus & ikuti · Pilih dari panel Objek</span>
      </header>
      <aside className="side-left">
        <section className={`collapsible object-panel-dock ${objectCollapsed ? 'is-collapsed' : ''}`}>
          <button className="panel-toggle" onClick={() => setObjectCollapsed((v) => !v)} title={objectCollapsed ? 'Tampilkan panel objek' : 'Sembunyikan panel objek'} aria-label={objectCollapsed ? 'Tampilkan panel objek' : 'Sembunyikan panel objek'}>
            {objectCollapsed ? '☰' : '‹'}
          </button>
          {!objectCollapsed && <ObjectPanel />}
        </section>
        <section className={`collapsible settings-panel-dock ${controlsCollapsed ? 'is-collapsed' : ''}`}>
          <button className="panel-toggle" onClick={() => setControlsCollapsed((v) => !v)} title={controlsCollapsed ? 'Tampilkan panel pengaturan' : 'Sembunyikan panel pengaturan'} aria-label={controlsCollapsed ? 'Tampilkan panel pengaturan' : 'Sembunyikan panel pengaturan'}>
            {controlsCollapsed ? '⚙' : '‹'}
          </button>
          {!controlsCollapsed && <ControlPanel />}
        </section>
      </aside>
      <aside className={`side-right collapsible ${infoCollapsed ? 'is-collapsed' : ''}`}>
        <button className="panel-toggle" onClick={() => setInfoCollapsed((v) => !v)} title={infoCollapsed ? 'Tampilkan panel data' : 'Sembunyikan panel data'} aria-label={infoCollapsed ? 'Tampilkan panel data' : 'Sembunyikan panel data'}>
          {infoCollapsed ? '☷' : '›'}
        </button>
        {!infoCollapsed && <InfoPanel selected={selected ?? 'earth'} />}
      </aside>
      <footer className="timebar">
        <TimePanel />
      </footer>
    </div>
  );
}
