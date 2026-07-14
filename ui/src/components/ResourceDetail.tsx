import { useCallback, useMemo, useRef, useState } from 'react';
import { X } from 'lucide-react';
import type { ResourceNodeData } from './CustomNodes';
import { statusBadgeStyle, statusColor } from './CustomNodes';
import './ResourceDetail.css';

interface ResourceDetailProps {
  data: ResourceNodeData;
  onClose: () => void;
}

const HIDDEN_KEYS = new Set([
  'label', 'resourceType', 'status', 'subtitle', 'count',
  'usage', 'capacity', 'allocatable', 'requests', 'limits',
  'pod_count', 'pod_capacity',
  'cpu_millicores', 'memory_bytes',
]);

function isStatusField(key: string): boolean {
  const k = key.toLowerCase();
  return k === 'status' || k === 'state' || k === 'reason' || k === 'phase' || k.endsWith('_status') || k.endsWith('_state');
}

function colorizeStatusText(text: string): string {
  return statusColor(text);
}

type ResBag = { cpu?: string; memory?: string; pods?: string };
type UsageBag = { cpu?: string; memory?: string; updated_at?: string; timestamp?: string };

function asRes(v: unknown): ResBag | null {
  if (!v || typeof v !== 'object') return null;
  return v as ResBag;
}
function asUsage(v: unknown): UsageBag | null {
  if (!v || typeof v !== 'object') return null;
  return v as UsageBag;
}

function ResourcesSummary({ data }: { data: ResourceNodeData }) {
  const usage = asUsage(data.usage);
  const capacity = asRes(data.capacity);
  const allocatable = asRes(data.allocatable);
  const requests = asRes(data.requests);
  const limits = asRes(data.limits);
  const isNode = data.resourceType === 'node';
  const isPod = data.resourceType === 'pod';

  if (!usage && !capacity && !requests && !limits && data.pod_count === undefined) {
    return null;
  }

  const cpuCap = allocatable?.cpu || capacity?.cpu;
  const memCap = allocatable?.memory || capacity?.memory;
  const podMax = (data.pod_capacity as string | undefined)
    || allocatable?.pods
    || capacity?.pods;
  const podNow = typeof data.pod_count === 'number' ? data.pod_count : undefined;

  const rows: { label: string; value: string }[] = [];

  if (isNode) {
    if (usage?.cpu || cpuCap) {
      rows.push({
        label: 'CPU',
        value: usage?.cpu && cpuCap
          ? `${usage.cpu} / ${cpuCap} cores`
          : usage?.cpu
            ? `${usage.cpu} cores`
            : `${cpuCap} cores (capacity)`,
      });
    }
    if (usage?.memory || memCap) {
      rows.push({
        label: 'Memory',
        value: usage?.memory && memCap
          ? `${usage.memory} / ${memCap}`
          : usage?.memory || `${memCap} (capacity)`,
      });
    }
    if (podNow !== undefined || podMax) {
      rows.push({
        label: 'Pods',
        value: podNow !== undefined && podMax
          ? `${podNow} / ${podMax} (scheduled / capacity)`
          : podNow !== undefined
            ? `${podNow} scheduled`
            : `capacity ${podMax}`,
      });
    }
    const updated = usage?.updated_at || usage?.timestamp;
    if (updated) {
      rows.push({ label: 'Usage as of', value: new Date(updated).toLocaleString() });
    }
  } else if (isPod) {
    if (usage?.cpu) {
      const extra = [
        requests?.cpu ? `req ${requests.cpu}` : null,
        limits?.cpu ? `lim ${limits.cpu}` : null,
      ].filter(Boolean).join(', ');
      rows.push({
        label: 'CPU',
        value: extra ? `${usage.cpu} cores (${extra} cores)` : `${usage.cpu} cores`,
      });
    } else if (requests?.cpu || limits?.cpu) {
      rows.push({
        label: 'CPU',
        value: [
          requests?.cpu && `req ${requests.cpu} cores`,
          limits?.cpu && `lim ${limits.cpu} cores`,
        ].filter(Boolean).join(' · '),
      });
    }
    if (usage?.memory) {
      const extra = [
        requests?.memory ? `req ${requests.memory}` : null,
        limits?.memory ? `lim ${limits.memory}` : null,
      ].filter(Boolean).join(', ');
      rows.push({
        label: 'Memory',
        value: extra ? `${usage.memory} (${extra})` : usage.memory,
      });
    } else if (requests?.memory || limits?.memory) {
      rows.push({
        label: 'Memory',
        value: [requests?.memory && `req ${requests.memory}`, limits?.memory && `lim ${limits.memory}`].filter(Boolean).join(' · '),
      });
    }
    const updated = usage?.updated_at || usage?.timestamp;
    if (updated) {
      rows.push({ label: 'Usage as of', value: new Date(updated).toLocaleString() });
    }
  }

  if (rows.length === 0) return null;

  return (
    <div className="detail-panel__resources">
      <div className="detail-panel__resources-title">Resources</div>
      <table className="detail-panel__table">
        <tbody>
          {rows.map(r => (
            <tr key={r.label}>
              <td className="detail-panel__key">{r.label}</td>
              <td className="detail-panel__value detail-panel__value--resource">{r.value}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

export default function ResourceDetail({ data, onClose }: ResourceDetailProps) {
  const [width, setWidth] = useState(400);
  const dragging = useRef(false);
  const startX = useRef(0);
  const startWidth = useRef(0);

  const onDragStart = useCallback((e: React.MouseEvent) => {
    e.preventDefault();
    dragging.current = true;
    startX.current = e.clientX;
    startWidth.current = width;

    const onMouseMove = (ev: MouseEvent) => {
      if (!dragging.current) return;
      const delta = startX.current - ev.clientX;
      setWidth(Math.max(280, Math.min(800, startWidth.current + delta)));
    };
    const onMouseUp = () => {
      dragging.current = false;
      document.removeEventListener('mousemove', onMouseMove);
      document.removeEventListener('mouseup', onMouseUp);
    };
    document.addEventListener('mousemove', onMouseMove);
    document.addEventListener('mouseup', onMouseUp);
  }, [width]);

  const badge = useMemo(() => statusBadgeStyle(data.status), [data.status]);
  const accent = useMemo(() => statusColor(data.status), [data.status]);

  const entries = Object.entries(data).filter(
    ([key]) => !HIDDEN_KEYS.has(key)
  );

  return (
    <div
      className="detail-panel"
      style={{
        width,
        borderLeftColor: data.status ? accent : undefined,
        borderLeftWidth: data.status ? 3 : undefined,
      }}
    >
      <div className="detail-panel__drag" onMouseDown={onDragStart} />
      <div className="detail-panel__content">
        <div className="detail-panel__header">
          <span className="detail-panel__resource-type">{data.resourceType}</span>
          <button className="detail-panel__close" onClick={onClose}>
            <X size={16} />
          </button>
        </div>
        <h3 className="detail-panel__title">{data.label}</h3>
        {data.status && (
          <span className="detail-panel__status" style={badge}>
            {data.status}
          </span>
        )}
        {data.subtitle && (
          <div className="detail-panel__subtitle">{data.subtitle}</div>
        )}
        <hr className="detail-panel__divider" />
        <ResourcesSummary data={data} />
        <table className="detail-panel__table">
          <tbody>
            {entries.map(([key, value]) => {
              if (value === null || value === undefined) return null;
              const isObj = typeof value === 'object';
              const displayValue = isObj ? JSON.stringify(value, null, 2) : String(value);
              const statusLike = !isObj && isStatusField(key);
              return (
                <tr key={key}>
                  <td className="detail-panel__key">{key.replace(/_/g, ' ')}</td>
                  <td className={`detail-panel__value${isObj ? ' detail-panel__value--mono' : ''}`}>
                    {statusLike ? (
                      <span
                        className="detail-panel__inline-status"
                        style={statusBadgeStyle(displayValue)}
                      >
                        {displayValue}
                      </span>
                    ) : isObj && Array.isArray(value) ? (
                      <StructuredList value={value} />
                    ) : (
                      displayValue
                    )}
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    </div>
  );
}

function StructuredList({ value }: { value: unknown[] }) {
  return (
    <div className="detail-panel__structured">
      {value.map((item, idx) => {
        if (!item || typeof item !== 'object') {
          return (
            <div key={idx} className="detail-panel__structured-row">
              {String(item)}
            </div>
          );
        }
        const obj = item as Record<string, unknown>;
        const signal =
          (typeof obj.reason === 'string' && obj.reason) ||
          (typeof obj.state === 'string' && obj.state) ||
          (typeof obj.status === 'string' && obj.status) ||
          undefined;
        const color = signal ? colorizeStatusText(signal) : undefined;
        return (
          <div
            key={idx}
            className="detail-panel__structured-card"
            style={color ? { borderLeftColor: color, borderLeftWidth: 3 } : undefined}
          >
            {Object.entries(obj).map(([k, v]) => {
              if (v === null || v === undefined) return null;
              if (k === 'cpu_millicores' || k === 'memory_bytes') return null;
              const text = typeof v === 'object' ? JSON.stringify(v) : String(v);
              const chip = isStatusField(k) || k === 'ready';
              if (k === 'ready' && typeof v === 'boolean') {
                return (
                  <div key={k} className="detail-panel__structured-field">
                    <span className="detail-panel__structured-key">{k}</span>
                    <span className="detail-panel__inline-status" style={statusBadgeStyle(v ? 'ready' : 'notready')}>
                      {String(v)}
                    </span>
                  </div>
                );
              }
              return (
                <div key={k} className="detail-panel__structured-field">
                  <span className="detail-panel__structured-key">{k.replace(/_/g, ' ')}</span>
                  {chip && typeof v === 'string' ? (
                    <span className="detail-panel__inline-status" style={statusBadgeStyle(text)}>
                      {text}
                    </span>
                  ) : (
                    <span className="detail-panel__structured-val">{text}</span>
                  )}
                </div>
              );
            })}
          </div>
        );
      })}
    </div>
  );
}
