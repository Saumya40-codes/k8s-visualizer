import { useEffect, useMemo } from 'react';
import { History, Loader } from 'lucide-react';
import type { HistoryInfo, TimelineMarker } from '../lib/types/namespaces';
import { formatDuration, useNow } from '../lib/time';
import './TimeBar.css';

interface TimeBarProps {
  history: HistoryInfo;
  /** Namespace whose markers to show. */
  namespace: string | null;
  /** null = live. */
  viewAt: number | null;
  onChange: (at: number | null) => void;
  loading: boolean;
}

const JUMPS = [15, 30, 60, 300];

function markerLabel(m: TimelineMarker): string {
  const what = m.type === 'error' ? `${m.status}` : m.type;
  return `${new Date(m.t).toLocaleTimeString([], { hour12: false })} · ${m.kind}/${m.name} ${what}`;
}

/** Where to land when a marker is clicked: just before a deletion, just after anything else. */
function markerTarget(m: TimelineMarker): number {
  return m.type === 'deleted' ? m.t - 1000 : m.t + 1000;
}

export default function TimeBar({ history, namespace, viewAt, onChange, loading }: TimeBarProps) {
  const now = useNow();
  const live = viewAt === null;
  const min = history.oldest_ms;
  const max = Math.max(now, min + 1000);
  const span = max - min;

  const markers = useMemo(
    () => history.markers.filter(m => !m.ns || m.ns === namespace),
    [history.markers, namespace]
  );

  useEffect(() => {
    if (live) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onChange(null);
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [live, onChange]);

  const setAt = (at: number) => {
    // Snapping to the right edge means "live".
    onChange(at >= max - 1000 ? null : Math.max(min, at));
  };

  const pct = (t: number) => `${((t - min) / span) * 100}%`;
  const ago = live ? 0 : now - viewAt!;

  return (
    <div className={`time-bar${live ? '' : ' time-bar--past'}`}>
      <button
        className={`time-bar__live${live ? ' time-bar__live--on' : ''}`}
        onClick={() => onChange(null)}
        title="Back to live (Esc)"
      >
        <span className="time-bar__dot" />
        Live
      </button>

      <div className="time-bar__jumps">
        {JUMPS.filter(s => now - s * 1000 >= min - 1000).map(s => (
          <button key={s} className="time-bar__jump" onClick={() => setAt(now - s * 1000)}>
            −{formatDuration(s * 1000)}
          </button>
        ))}
      </div>

      <div className="time-bar__track">
        {markers.map((m, i) => (
          <button
            key={`${m.t}-${i}`}
            className={`time-bar__marker time-bar__marker--${m.type}`}
            style={{ left: pct(m.t) }}
            title={markerLabel(m)}
            aria-label={markerLabel(m)}
            onClick={() => setAt(markerTarget(m))}
          />
        ))}
        <input
          type="range"
          className="time-bar__range"
          min={min}
          max={max}
          step={1000}
          value={live ? max : viewAt!}
          onChange={e => setAt(Number(e.target.value))}
          aria-label="Point in time"
        />
      </div>

      <div className="time-bar__label">
        {loading && <Loader size={12} className="time-bar__spin" />}
        {live ? (
          <span title={`History covers the last ${formatDuration(span)}`}>
            <History size={12} /> {formatDuration(span)}
          </span>
        ) : (
          <span title={new Date(viewAt!).toLocaleString()}>
            {new Date(viewAt!).toLocaleTimeString([], { hour12: false })} · −{formatDuration(ago)}
          </span>
        )}
      </div>
    </div>
  );
}
