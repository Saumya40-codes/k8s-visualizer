import { useCallback, useRef, useState } from 'react';
import {
  Box,
  Typography,
  IconButton,
  Chip,
  Divider,
  Table,
  TableBody,
  TableRow,
  TableCell,
} from '@mui/material';
import CloseIcon from '@mui/icons-material/Close';
import type { ResourceNodeData } from './CustomNodes';

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
    <Box
      sx={{
        position: 'absolute',
        right: 0,
        top: 0,
        bottom: 0,
        width,
        background: 'linear-gradient(180deg, #1e2a4a 0%, #16213e 100%)',
        borderLeft: '1px solid #2a3a5a',
        overflowY: 'auto',
        zIndex: 10,
        display: 'flex',
      }}
    >
      {/* Drag handle */}
      <Box
        onMouseDown={onDragStart}
        sx={{
          width: 6,
          cursor: 'col-resize',
          flexShrink: 0,
          background: 'transparent',
          '&:hover': { background: 'rgba(78, 204, 163, 0.3)' },
          transition: 'background 0.15s',
        }}
      />

      <Box sx={{ flex: 1, p: 2, overflow: 'auto' }}>
        <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', mb: 2 }}>
          <Typography variant="caption" sx={{ color: '#8e8e93', textTransform: 'uppercase', letterSpacing: 1 }}>
            {data.resourceType}
          </Typography>
          <IconButton onClick={onClose} size="small" sx={{ color: '#8e8e93' }}>
            <CloseIcon fontSize="small" />
          </IconButton>
        </Box>

        <Typography variant="h6" sx={{ color: '#e0e0e0', fontWeight: 700, mb: 1, wordBreak: 'break-all' }}>
          {data.label}
        </Typography>

        {data.status && (
          <Chip
            label={data.status}
            size="small"
            sx={{
              mb: 2,
              background: 'rgba(78, 204, 163, 0.15)',
              color: '#4ecca3',
              border: '1px solid rgba(78, 204, 163, 0.3)',
            }}
          />
        )}

        <Divider sx={{ borderColor: '#2a3a5a', mb: 2 }} />

        <Table size="small">
          <TableBody>
            {entries.map(([key, value]) => {
              if (value === null || value === undefined) return null;
              const displayValue =
                typeof value === 'object' ? JSON.stringify(value, null, 2) : String(value);
              return (
                <TableRow key={key} sx={{ '&:last-child td': { borderBottom: 0 } }}>
                  <TableCell
                    sx={{
                      color: '#8e8e93',
                      borderBottom: '1px solid #2a3a5a',
                      fontSize: '0.75rem',
                      pl: 0,
                      verticalAlign: 'top',
                      whiteSpace: 'nowrap',
                    }}
                  >
                    {key.replace(/_/g, ' ')}
                  </TableCell>
                  <TableCell
                    sx={{
                      color: '#e0e0e0',
                      borderBottom: '1px solid #2a3a5a',
                      fontSize: '0.75rem',
                      wordBreak: 'break-all',
                      whiteSpace: typeof value === 'object' ? 'pre-wrap' : 'normal',
                      fontFamily: typeof value === 'object' ? 'monospace' : 'inherit',
                    }}
                  >
                    {displayValue}
                  </TableCell>
                </TableRow>
              );
            })}
          </TableBody>
        </Table>
      </Box>
    </Box>
  );
}