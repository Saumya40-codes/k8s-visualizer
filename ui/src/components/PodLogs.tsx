import { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react';
import { Download, Pause, Play, RefreshCw } from 'lucide-react';
import { API_BASE } from '../lib/api';
import type { ContainerStatus, RetainedInfo } from '../lib/types/namespaces';
import './PodLogs.css';

interface LogLine {
  ts?: string;
  text: string;
}

interface PodLogsProps {
  namespace: string;
  pod: string;
  uid: string;
  containers: ContainerStatus[];
  retained?: RetainedInfo;
  /** Resource no longer exists at all: keep what's loaded, stop fetching. */
  gone: boolean;
}

const WINDOWS: { label: string; seconds: number }[] = [
  { label: '30s', seconds: 30 },
  { label: '1m', seconds: 60 },
  { label: '5m', seconds: 300 },
  { label: '15m', seconds: 900 },
  { label: '1h', seconds: 3600 },
  { label: 'All', seconds: 0 },
];
// "All" is capped server-side by bytes; this keeps the first paint sane.
const ALL_TAIL_LINES = 2000;
const MAX_CLIENT_LINES = 5000;

function formatTime(ts?: string): string {
  if (!ts) return '';
  const d = new Date(ts);
  if (Number.isNaN(d.getTime())) return '';
  return d.toLocaleTimeString([], { hour12: false }) + '.' + String(d.getMilliseconds()).padStart(3, '0');
}

function capLines(lines: LogLine[]): LogLine[] {
  return lines.length > MAX_CLIENT_LINES ? lines.slice(lines.length - MAX_CLIENT_LINES) : lines;
}

export default function PodLogs({ namespace, pod, uid, containers, retained, gone }: PodLogsProps) {
  const [container, setContainer] = useState(containers[0]?.name ?? '');
  const [windowSec, setWindowSec] = useState(30);
  const [previous, setPrevious] = useState(false);
  const [live, setLive] = useState(false);
  const [filter, setFilter] = useState('');
  const [lines, setLines] = useState<LogLine[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [truncated, setTruncated] = useState(false);
  const [reloadTick, setReloadTick] = useState(0);

  const scrollRef = useRef<HTMLDivElement>(null);
  const stickToBottom = useRef(true);

  const isRetained = !!retained;
  const frozen = gone || isRetained;
  const selected = containers.find(c => c.name === container);
  const canPrevious = !frozen && (selected?.restart_count ?? 0) > 0;

  useEffect(() => {
    if (!canPrevious) setPrevious(false);
  }, [canPrevious]);
  useEffect(() => {
    if (frozen) setLive(false);
  }, [frozen]);

  const query = useCallback((extra: Record<string, string> = {}) => {
    const p = new URLSearchParams({ namespace, pod, uid, ...extra });
    if (container) p.set('container', container);
    if (!isRetained) {
      if (windowSec > 0) p.set('since', String(windowSec));
      else p.set('tail', String(ALL_TAIL_LINES));
      if (previous) p.set('previous', '1');
    }
    return p.toString();
  }, [namespace, pod, uid, container, windowSec, previous, isRetained]);

  // One-shot fetch (also used for retained pods).
  useEffect(() => {
    if (live || gone) return;
    const ctrl = new AbortController();
    setLoading(true);
    setError(null);
    fetch(`${API_BASE}/api/logs?${query()}`, { signal: ctrl.signal })
      .then(async res => {
        const body = await res.json().catch(() => ({}));
        if (!res.ok) throw new Error(body.error || `HTTP ${res.status}`);
        stickToBottom.current = true;
        setLines(body.lines || []);
        setTruncated(!!body.truncated);
      })
      .catch(err => {
        if (err.name !== 'AbortError') setError(String(err.message || err));
      })
      .finally(() => {
        if (!ctrl.signal.aborted) setLoading(false);
      });
    return () => ctrl.abort();
  }, [query, live, gone, reloadTick]);

  // Live follow over SSE: starts with the selected window, then appends.
  useEffect(() => {
    if (!live) return;
    setLines([]);
    setError(null);
    setTruncated(false);
    stickToBottom.current = true;

    let pending: LogLine[] = [];
    let raf = 0;
    const flush = () => {
      raf = 0;
      const batch = pending;
      pending = [];
      setLines(prev => capLines(prev.concat(batch)));
    };

    const es = new EventSource(`${API_BASE}/api/logs/stream?${query()}`);
    es.addEventListener('line', (ev) => {
      pending.push(JSON.parse((ev as MessageEvent).data));
      if (!raf) raf = requestAnimationFrame(flush);
    });
    es.addEventListener('error', (ev) => {
      const data = (ev as MessageEvent).data;
      if (data) {
        setError(JSON.parse(data));
        return;
      }
      // Transport failure: don't let EventSource silently reconnect and replay.
      es.close();
      setError('Live stream disconnected');
      setLive(false);
    });
    es.addEventListener('end', () => {
      es.close();
      setLive(false);
    });
    return () => {
      es.close();
      if (raf) cancelAnimationFrame(raf);
    };
  }, [live, query]);

  const filtered = useMemo(() => {
    const q = filter.trim().toLowerCase();
    return q ? lines.filter(l => l.text.toLowerCase().includes(q)) : lines;
  }, [lines, filter]);

  useLayoutEffect(() => {
    const el = scrollRef.current;
    if (el && stickToBottom.current) el.scrollTop = el.scrollHeight;
  }, [filtered]);

  const onScroll = () => {
    const el = scrollRef.current;
    if (!el) return;
    stickToBottom.current = el.scrollHeight - el.scrollTop - el.clientHeight < 24;
  };

  const windowIdx = WINDOWS.findIndex(w => w.seconds === windowSec);
  const loadEarlier = windowSec > 0 && windowIdx >= 0 && windowIdx < WINDOWS.length - 1
    ? () => setWindowSec(WINDOWS[windowIdx + 1].seconds)
    : null;

  const download = () => {
    const text = lines.map(l => (l.ts ? `${l.ts} ${l.text}` : l.text)).join('\n');
    const url = URL.createObjectURL(new Blob([text], { type: 'text/plain' }));
    const a = document.createElement('a');
    a.href = url;
    a.download = `${pod}${container ? `_${container}` : ''}.log`;
    a.click();
    URL.revokeObjectURL(url);
  };

  return (
    <div className="pod-logs">
      {isRetained && (
        <div className="pod-logs__note">
          {retained.logs_captured
            ? 'Pod is deleted. Showing logs captured while it was terminating.'
            : 'Pod is deleted. Its logs were not captured (it was removed without a terminating phase, e.g. force-deleted).'}
        </div>
      )}
      {gone && !isRetained && (
        <div className="pod-logs__note">Pod no longer exists. Showing the last loaded logs.</div>
      )}

      <div className="pod-logs__controls">
        {containers.length > 1 && (
          <select
            className="pod-logs__select"
            value={container}
            onChange={e => setContainer(e.target.value)}
            aria-label="Container"
          >
            {containers.map(c => <option key={c.name} value={c.name}>{c.name}</option>)}
          </select>
        )}
        {!frozen && (
          <div className="pod-logs__windows" role="group" aria-label="Time window">
            {WINDOWS.map(w => (
              <button
                key={w.label}
                className={`pod-logs__window${w.seconds === windowSec ? ' pod-logs__window--on' : ''}`}
                onClick={() => setWindowSec(w.seconds)}
                title={w.seconds ? `Logs from the last ${w.label}` : `Last ${ALL_TAIL_LINES} lines`}
              >
                {w.label}
              </button>
            ))}
          </div>
        )}
        {canPrevious && (
          <label className="pod-logs__check" title="Logs of the previous (crashed/restarted) container">
            <input type="checkbox" checked={previous} onChange={e => setPrevious(e.target.checked)} />
            previous
          </label>
        )}
        <div className="pod-logs__spacer" />
        {!frozen && !previous && (
          <button
            className={`pod-logs__icon-btn${live ? ' pod-logs__icon-btn--on' : ''}`}
            onClick={() => setLive(v => !v)}
            title={live ? 'Pause live tail' : 'Follow live'}
            aria-label={live ? 'Pause live tail' : 'Follow live'}
          >
            {live ? <Pause size={14} /> : <Play size={14} />}
          </button>
        )}
        {!gone && !live && (
          <button
            className="pod-logs__icon-btn"
            onClick={() => setReloadTick(t => t + 1)}
            title="Refresh"
            aria-label="Refresh"
          >
            <RefreshCw size={14} className={loading ? 'pod-logs__spin' : undefined} />
          </button>
        )}
        <button
          className="pod-logs__icon-btn"
          onClick={download}
          disabled={lines.length === 0}
          title="Download"
          aria-label="Download"
        >
          <Download size={14} />
        </button>
      </div>

      <input
        className="pod-logs__filter"
        type="text"
        placeholder="Filter lines..."
        value={filter}
        onChange={e => setFilter(e.target.value)}
      />

      <div className="pod-logs__meta">
        {live && <span className="pod-logs__live-dot" />}
        {filter ? `${filtered.length} / ${lines.length} lines` : `${lines.length} lines`}
        {truncated && ' (truncated)'}
        {live && ' · following'}
      </div>

      {error && <div className="pod-logs__error">{error}</div>}

      <div className="pod-logs__body" ref={scrollRef} onScroll={onScroll}>
        {!frozen && loadEarlier && !live && !loading && (
          <button className="pod-logs__earlier" onClick={loadEarlier}>
            Load earlier ({WINDOWS[windowIdx + 1].label})
          </button>
        )}
        {filtered.length === 0 && !loading && !error ? (
          <div className="pod-logs__empty">
            {live ? 'Waiting for output...' : windowSec > 0 && !frozen
              ? `No logs in the last ${WINDOWS[windowIdx]?.label ?? `${windowSec}s`}.`
              : 'No logs.'}
          </div>
        ) : (
          filtered.map((l, i) => (
            <div key={i} className="pod-logs__line">
              <span className="pod-logs__ts" title={l.ts}>{formatTime(l.ts)}</span>
              <span className="pod-logs__text">{l.text}</span>
            </div>
          ))
        )}
      </div>
    </div>
  );
}
