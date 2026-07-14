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

/** Status color for graph nodes and detail panel. */
export function statusColor(status?: string): string {
  const root = typeof document !== 'undefined' ? getComputedStyle(document.documentElement) : null;
  const ok = root?.getPropertyValue('--ok').trim() || '#0a7f45';
  const err = root?.getPropertyValue('--err').trim() || '#d94848';
  const warn = root?.getPropertyValue('--warn').trim() || '#c47d00';
  const muted = root?.getPropertyValue('--text-muted').trim() || '#8a8a8a';

  if (!status) return ok;
  const s = status.toLowerCase().trim();

  // "N/M ready" replica counts
  const ratio = s.match(/^(\d+)\s*\/\s*(\d+)\s*ready$/);
  if (ratio) {
    const ready = Number(ratio[1]);
    const desired = Number(ratio[2]);
    if (desired === 0) return muted;
    if (ready === 0 && desired > 0) return err;
    if (ready < desired) return warn;
    return ok;
  }

  if ([
    'crashloopbackoff', 'error', 'failed', 'imagepullbackoff', 'errimagepull',
    'oomkilled', 'createcontainererror', 'invalidimage name', 'evicted',
    'nodeaffinity', 'unschedulable', 'deadlineexceeded',
  ].some(k => s.includes(k))) return err;

  if (['terminating', 'terminated', 'notready', 'unhealthy'].some(k => s.includes(k))) return err;

  if ([
    'pending', 'waiting', 'containercreating', 'podinitializing',
    'init:', 'progressing', 'updating',
  ].some(k => s.includes(k))) return warn;

  if (['unknown', 'completed'].some(k => s.includes(k))) return muted;

  if (['running', 'ready', 'active', 'available', 'complete', 'succeeded', 'bound'].some(k => s.includes(k))) return ok;

  return ok;
}

/** Badge colors matching statusColor(). */
export function statusBadgeStyle(status?: string): { color: string; background: string; borderColor: string } {
  const color = statusColor(status);
  return {
    color,
    background: `${color}20`,
    borderColor: `${color}60`,
  };
}

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
          style={statusBadgeStyle(nodeData.status)}
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