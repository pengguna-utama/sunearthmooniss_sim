import { useState } from 'react';
import { useSettings, simStore, useLive } from '../engine/store';
import { fetchIssTle, setTle, DEFAULT_TLE_LINE1, DEFAULT_TLE_LINE2 } from '../core/iss';
import { BODY_MAP, KM_PER_AU } from '../constants';

function Toggle({ label, on, set }: { label: string; on: boolean; set: (v: boolean) => void }) {
  return (
    <label className="toggle">
      <input type="checkbox" checked={on} onChange={(e) => set(e.target.checked)} />
      <span>{label}</span>
    </label>
  );
}

export function ControlPanel() {
  const s = useSettings();
  const [tleText, setTleText] = useState('');
  const [busy, setBusy] = useState(false);

  const patch = (p: Partial<typeof s>) => simStore.setSettings(p);

  const updateTle = async () => {
    setBusy(true);
    try {
      await fetchIssTle();
      patch({ tleStatus: 'TLE diperbarui ✓ (Celestrak)' });
    } catch (err) {
      patch({ tleStatus: `Gagal ambil TLE: ${(err as Error).message}` });
    } finally {
      setBusy(false);
    }
  };

  const applyCustomTle = () => {
    const lines = tleText
      .trim()
      .split(/\r?\n/)
      .map((l) => l.trim())
      .filter((l) => l.length > 0);
    if (lines.length >= 2) {
      const l1 = lines[lines.length - 2];
      const l2 = lines[lines.length - 1];
      if (/^1 \d{5}/.test(l1) && /^2 \d{5}/.test(l2)) {
        setTle(l1, l2);
        patch({ tleStatus: 'TLE kustom diterapkan ✓' });
      } else {
        patch({ tleStatus: 'Format TLE invalid' });
      }
    } else {
      patch({ tleStatus: 'Tempel 2 baris TLE dulu' });
    }
  };

  return (
    <div className="panel controls">
      <h3>Pengaturan</h3>
      <Toggle label="Label objek" on={s.showLabels} set={(v) => patch({ showLabels: v })} />
      <Toggle label="Garis orbit" on={s.showOrbits} set={(v) => patch({ showOrbits: v })} />
      <Toggle
        label="Bayangan Bulan (umbra & penumbra)"
        on={s.showMoonShadow}
        set={(v) => patch({ showMoonShadow: v })}
      />
      <Toggle
        label="Bayangan Bumi (gerhana bulan)"
        on={s.showEarthShadow}
        set={(v) => patch({ showEarthShadow: v })}
      />
      <Toggle label="FoV ISS (wilayah terlihat)" on={s.showFov} set={(v) => patch({ showFov: v })} />
      <Toggle label="Bintang latar" on={s.showStarfield} set={(v) => patch({ showStarfield: v })} />
      <Toggle label="Ukuran ISS adaptif (agar terlihat)" on={s.adaptiveIss} set={(v) => patch({ adaptiveIss: v })} />
      <Toggle label="Auto-rotasi kamera" on={s.autoRotate} set={(v) => patch({ autoRotate: v })} />

      {s.showFov && (
        <div className="fov-slider">
          <label>Elevasi minimum FoV: {s.fovElevMinDeg}°</label>
          <input
            type="range"
            min={0}
            max={20}
            step={1}
            value={s.fovElevMinDeg}
            onChange={(e) => patch({ fovElevMinDeg: Number(e.target.value) })}
          />
        </div>
      )}

      <div className="tle-box">
        <button className="btn small" onClick={updateTle} disabled={busy}>
          {busy ? 'Mengambil…' : 'Perbarui TLE ISS (Celestrak)'}
        </button>
        <textarea
          rows={3}
          placeholder={`Tempel 2 baris TLE ISS…\ncontoh:\n${DEFAULT_TLE_LINE1}\n${DEFAULT_TLE_LINE2}`}
          value={tleText}
          onChange={(e) => setTleText(e.target.value)}
        />
        <button className="btn small" onClick={applyCustomTle}>
          Terapkan TLE kustom
        </button>
        {s.tleStatus && <div className="tle-status">{s.tleStatus}</div>}
      </div>
    </div>
  );
}

export function InfoPanel({ selected }: { selected: keyof typeof BODY_MAP }) {
  const live = useLive();
  const b = BODY_MAP[selected];

  const fmtKm = (v: number) => (v > 1 ? `${v.toLocaleString('id-ID', { maximumFractionDigits: 0 })} km` : '—');
  const fmtAu = (v: number) => (v > 1 ? `${(v / KM_PER_AU).toFixed(6)} AU` : '—');

  return (
    <div className="panel info">
      <h3>
        {b.emoji} {b.nama}
      </h3>
      <dl>
        <dt>Jarak ke Bumi</dt>
        <dd>
          {fmtKm(live.selDistToEarth)} · {fmtAu(live.selDistToEarth)}
        </dd>
        <dt>Jarak ke Matahari</dt>
        <dd>
          {fmtKm(live.selDistToSun)} · {fmtAu(live.selDistToSun)}
        </dd>
        <dt>Kecepatan</dt>
        <dd>{live.selSpeedKmS > 0.001 ? `${live.selSpeedKmS.toFixed(2)} km/s` : '—'}</dd>
        <dt>Posisi ECL (km)</dt>
        <dd>
          {fmtCoord(live.selPos.x)}, {fmtCoord(live.selPos.y)}, {fmtCoord(live.selPos.z)}
        </dd>
        {selected === 'iss' && (
          <>
            <dt>ISS di atas (lat, lon, alt)</dt>
            <dd>
              {live.issLatDeg.toFixed(2)}°, {live.issLonDeg.toFixed(2)}°, {live.issAltKm.toFixed(0)} km
            </dd>
            <dt>FoV ISS (elevasi {live.fovElevMinDeg}°)</dt>
            <dd>
              Ø {fmtKm(live.fovDiaKm)} · luas {fmtKm(live.fovAreaKm2)}
            </dd>
            <dt>Propagasi ISS</dt>
            <dd>{live.issMode === 'sgp4' ? 'SGP4 · akurat' : 'Model analitik (jauh dari epoch TLE)'}</dd>
          </>
        )}
        <dt>Status gerhana</dt>
        <dd>{live.shadowLabel || '—'}</dd>
        <dt>Umbra di Bumi</dt>
        <dd>{fmtKm(live.shadowUmbraKm)}</dd>
        <dt>Penumbra di Bumi</dt>
        <dd>{fmtKm(live.shadowPenumbraKm)}</dd>
      </dl>
      <div className="info-global">
        <div>
          Bumi–Matahari <b>{fmtKm(live.earthSunKm)}</b>
        </div>
        <div>
          Bumi–Bulan <b>{fmtKm(live.moonEarthKm)}</b>
        </div>
        <div>
          Pusat Bumi–ISS <b>{fmtKm(live.issEarthKm)}</b>
        </div>
        <div>
          Ketinggian ISS <b>{fmtKm(live.issAltKm)}</b>
        </div>
      </div>
    </div>
  );
}

function fmtCoord(v: number): string {
  return v.toLocaleString('id-ID', { maximumFractionDigits: 0 });
}
