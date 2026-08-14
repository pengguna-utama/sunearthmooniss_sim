import { useLive, useSettings, simStore } from '../engine/store';
import { TIMEZONES, TZ_KEYS, toInputValue, fromInputValue, formatFull, type TimezoneKey } from '../core/tz';

const SPEEDS = [
  { label: '1× real', ms: 1000 },
  { label: '1 mnt/dtk', ms: 60000 },
  { label: '10 mnt/dtk', ms: 600000 },
  { label: '1 jam/dtk', ms: 3.6e6 },
  { label: '1 hari/dtk', ms: 8.64e7 },
  { label: '30 hari/dtk', ms: 2.592e9 },
  { label: '1 tahun/dtk', ms: 3.1536e10 },
];

export function TimePanel() {
  const live = useLive();
  const { playing, speedMs, timezone } = useSettings();

  const jump = (ms: number) => {
    simStore.setLive({ time: new Date(live.time.getTime() + ms) });
  };

  return (
    <div className="panel time-panel">
      <div className="time-row">
        <button
          className="btn play"
          onClick={() => simStore.setSettings({ playing: !playing })}
          title={playing ? 'Jeda' : 'Putar'}
        >
          {playing ? '⏸' : '▶'}
        </button>
        <input
          type="datetime-local"
          value={toInputValue(live.time, timezone)}
          step={60}
          onChange={(e) => {
            const v = e.target.value;
            if (v) simStore.setLive({ time: fromInputValue(v, timezone) });
          }}
        />
        <button className="btn small" onClick={() => simStore.setLive({ time: new Date() })} title="Kembali ke waktu sekarang">
          Sekarang
        </button>
      </div>
      <div className="time-row">
        {TZ_KEYS.map((tz: TimezoneKey) => (
          <button
            key={tz}
            className={`btn small ${timezone === tz ? 'active' : ''}`}
            onClick={() => simStore.setSettings({ timezone: tz })}
            title={TIMEZONES[tz].iana}
          >
            {TIMEZONES[tz].label}
          </button>
        ))}
      </div>
      <div className="time-row speed-row">
        {SPEEDS.map((s) => (
          <button
            key={s.label}
            className={`btn small ${speedMs === s.ms ? 'active' : ''}`}
            onClick={() => simStore.setSettings({ speedMs: s.ms, playing: true })}
          >
            {s.label}
          </button>
        ))}
        <button className="btn small" onClick={() => jump(-86400000)} title="Mundur 1 hari">
          −1 hari
        </button>
        <button className="btn small" onClick={() => jump(86400000)} title="Maju 1 hari">
          +1 hari
        </button>
      </div>
      <div className="time-utc">
        {TIMEZONES[timezone].label}: {formatFull(live.time, timezone)} · UTC:{' '}
        {live.time.toISOString().replace('T', ' ').slice(0, 19)}
      </div>
    </div>
  );
}
