import { memo } from 'react';
import { Handle, Position, type NodeProps } from '@xyflow/react';
import {
  Server, Database, Network, Lock, FileText, GitBranch,
  Globe, LayoutGrid, Repeat, Briefcase, Monitor, Folder, Copy,
  type LucideIcon,
} from 'lucide-react';

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

const iconMap: Record<string, LucideIcon> = {
  namespace: Folder,
  pod: Server,
  deployment: Database,
  replicaset: Copy,
  service: Network,
  ingress: Globe,
  secret: Lock,
  configmap: FileText,
  statefulset: LayoutGrid,
  daemonset: Repeat,
  job: Briefcase,
  node: Monitor,
  default: GitBranch,
};

function ResourceNode({ data }: NodeProps) {
  const nodeData = data as unknown as ResourceNodeData;
  const color = statusColor(nodeData.status);
  const Icon = iconMap[nodeData.resourceType] || iconMap.default;

  return (
    <div className="resource-node" style={{ borderColor: color }}>
      <Handle type="target" position={Position.Top} style={{ background: color, width: 6, height: 6 }} />
      <div className="resource-node__header">
        <Icon size={14} color={color} />
        <span className="resource-node__type">{nodeData.resourceType}</span>
      </div>
      <div className="resource-node__label" title={nodeData.label}>
        {nodeData.label}
      </div>
      {nodeData.status && (
        <span
          className="resource-node__badge"
          style={{ background: `${color}20`, color, borderColor: `${color}60` }}
        >
          {nodeData.status}
        </span>
      )}
      {nodeData.subtitle && (
        <span className="resource-node__subtitle">{nodeData.subtitle}</span>
      )}
      <Handle type="source" position={Position.Bottom} style={{ background: color, width: 6, height: 6 }} />
    </div>
  );
}

export const nodeTypes = {
  resource: memo(ResourceNode),
};