import { memo } from 'react';
import { Handle, Position, type NodeProps } from '@xyflow/react';
import { Box, Typography, Chip } from '@mui/material';
import DnsIcon from '@mui/icons-material/Dns';
import StorageIcon from '@mui/icons-material/Storage';
import SettingsEthernetIcon from '@mui/icons-material/SettingsEthernet';
import LockIcon from '@mui/icons-material/Lock';
import DescriptionIcon from '@mui/icons-material/Description';
import AccountTreeIcon from '@mui/icons-material/AccountTree';
import LanguageIcon from '@mui/icons-material/Language';
import ViewModuleIcon from '@mui/icons-material/ViewModule';
import RepeatIcon from '@mui/icons-material/Repeat';
import WorkIcon from '@mui/icons-material/Work';
import ComputerIcon from '@mui/icons-material/Computer';
import FolderIcon from '@mui/icons-material/Folder';
import ContentCopyIcon from '@mui/icons-material/ContentCopy';

export type ResourceNodeData = {
  label: string;
  resourceType: string;
  status?: string;
  subtitle?: string;
  count?: number;
  [key: string]: unknown;
};

const statusColor = (status?: string): string => {
  if (!status) return '#4ecca3';
  const s = status.toLowerCase();
  if (['running', 'ready', 'active', 'available', 'complete', 'succeeded'].some(k => s.includes(k))) return '#4ecca3';
  if (['crashloopbackoff', 'error', 'failed', 'imagepullbackoff', 'errimagepull', 'oomkilled'].some(k => s.includes(k))) return '#e94560';
  if (['pending', 'waiting', 'containercreating', 'podinitializing', 'notready'].some(k => s.includes(k))) return '#f5a623';
  if (['terminating', 'terminated'].some(k => s.includes(k))) return '#ff6b6b';
  if (['unknown', 'completed'].some(k => s.includes(k))) return '#8e8e93';
  return '#4ecca3';
};

const iconMap: Record<string, React.ReactElement> = {
  namespace: <FolderIcon fontSize="small" />,
  pod: <DnsIcon fontSize="small" />,
  deployment: <StorageIcon fontSize="small" />,
  replicaset: <ContentCopyIcon fontSize="small" />,
  service: <SettingsEthernetIcon fontSize="small" />,
  ingress: <LanguageIcon fontSize="small" />,
  secret: <LockIcon fontSize="small" />,
  configmap: <DescriptionIcon fontSize="small" />,
  statefulset: <ViewModuleIcon fontSize="small" />,
  daemonset: <RepeatIcon fontSize="small" />,
  job: <WorkIcon fontSize="small" />,
  node: <ComputerIcon fontSize="small" />,
  default: <AccountTreeIcon fontSize="small" />,
};

function ResourceNode({ data }: NodeProps) {
  const nodeData = data as unknown as ResourceNodeData;
  const color = statusColor(nodeData.status);
  const icon = iconMap[nodeData.resourceType] || iconMap.default;

  return (
    <Box
      sx={{
        background: 'linear-gradient(145deg, #1e2a4a 0%, #16213e 100%)',
        border: `2px solid ${color}`,
        borderRadius: '8px',
        padding: '8px 12px',
        minWidth: 140,
        maxWidth: 200,
        cursor: 'pointer',
        transition: 'box-shadow 0.2s',
        '&:hover': {
          boxShadow: `0 0 12px ${color}50`,
        },
      }}
    >
      <Handle type="target" position={Position.Top} style={{ background: color, width: 6, height: 6 }} />
      <Box sx={{ display: 'flex', alignItems: 'center', gap: 0.5, mb: 0.5 }}>
        <Box sx={{ color, display: 'flex' }}>{icon}</Box>
        <Typography
          variant="caption"
          sx={{ color: '#8e8e93', textTransform: 'uppercase', fontSize: '0.6rem', letterSpacing: 0.5 }}
        >
          {nodeData.resourceType}
        </Typography>
      </Box>
      <Typography
        variant="body2"
        sx={{
          color: '#e0e0e0',
          fontWeight: 600,
          fontSize: '0.75rem',
          overflow: 'hidden',
          textOverflow: 'ellipsis',
          whiteSpace: 'nowrap',
        }}
        title={nodeData.label}
      >
        {nodeData.label}
      </Typography>
      {nodeData.status && (
        <Chip
          label={nodeData.status}
          size="small"
          sx={{
            mt: 0.5,
            height: 18,
            fontSize: '0.6rem',
            background: `${color}20`,
            color,
            border: `1px solid ${color}60`,
          }}
        />
      )}
      {nodeData.subtitle && (
        <Typography variant="caption" sx={{ color: '#6e6e73', display: 'block', mt: 0.25, fontSize: '0.6rem' }}>
          {nodeData.subtitle}
        </Typography>
      )}
      <Handle type="source" position={Position.Bottom} style={{ background: color, width: 6, height: 6 }} />
    </Box>
  );
}

export const nodeTypes = {
  resource: memo(ResourceNode),
};