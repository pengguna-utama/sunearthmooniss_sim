import type { CSSProperties } from 'react';
import { BODIES, type BodyId } from '../constants';
import { simStore, useSettings } from '../engine/store';

export function ObjectPanel() {
  const { selected } = useSettings();

  return (
    <div className="panel">
      <h3>Objek</h3>
      <div className="obj-list">
        {BODIES.map((b) => (
          <button
            key={b.id}
            className={selected === b.id ? 'obj active' : 'obj'}
            style={{ '--warna': `#${b.warna.toString(16).padStart(6, '0')}` } as CSSProperties}
            onClick={() => simStore.setSettings({ selected: b.id })}
            title={b.nama}
          >
            <span className="obj-emoji">{b.emoji}</span>
            {b.nama}
          </button>
        ))}
      </div>
      <button className="btn small" onClick={() => simStore.setSettings({ selected: null })}>
        ✕ Lepas (kamera bebas)
      </button>
    </div>
  );
}

export type { BodyId };