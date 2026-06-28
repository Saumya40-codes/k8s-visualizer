import { useCallback, useRef, useState } from 'react';
import { X } from 'lucide-react';
import type { ResourceNodeData } from './CustomNodes';
import './ResourceDetail.css';

interface ResourceDetailProps {
  data: ResourceNodeData;
  onClose: () => void;
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

  const entries = Object.entries(data).filter(
    ([key]) => !['label', 'resourceType', 'status', 'subtitle', 'count'].includes(key)
  );

  return (
    <div className="detail-panel" style={{ width }}>
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
          <span className="detail-panel__status">{data.status}</span>
        )}
        <hr className="detail-panel__divider" />
        <table className="detail-panel__table">
          <tbody>
            {entries.map(([key, value]) => {
              if (value === null || value === undefined) return null;
              const isObj = typeof value === 'object';
              const displayValue = isObj ? JSON.stringify(value, null, 2) : String(value);
              return (
                <tr key={key}>
                  <td className="detail-panel__key">{key.replace(/_/g, ' ')}</td>
                  <td className={`detail-panel__value${isObj ? ' detail-panel__value--mono' : ''}`}>
                    {displayValue}
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