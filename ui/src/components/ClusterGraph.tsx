import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  ReactFlow,
  Background,
  Controls,
  type Node,
  type Edge,
  type OnNodesChange,
  type OnEdgesChange,
  type ReactFlowInstance,
  applyNodeChanges,
  applyEdgeChanges,
} from '@xyflow/react';
import '@xyflow/react/dist/style.css';
import type { Namespace, K8sNode } from '../lib/types/namespaces';
import type { ResourceTypeFilter } from '../App';
import { nodeTypes, type ResourceNodeData } from './CustomNodes';
import ResourceDetail from './ResourceDetail';
import './ClusterGraph.css';

interface ClusterGraphProps {
  namespaces: Namespace[];
  nodes: K8sNode[];
  searchQuery: string;
  resourceFilters: ResourceTypeFilter;
}

const edgeStyle = { stroke: '#4ecca3', strokeWidth: 1.5 };
const orphanEdgeStyle = { stroke: '#4ecca3', strokeWidth: 1.5, strokeDasharray: '4 4' };
const routeEdgeStyle = { stroke: '#f5a623', strokeWidth: 1.5 };
const ownerEdgeStyle = { stroke: '#4ecca3', strokeWidth: 1 };

function stableHash(s: string): number {
  let h = 0;
  for (let i = 0; i < s.length; i++) {
    h = ((h << 5) - h + s.charCodeAt(i)) | 0;
  }
  return h;
}

function stableSort<T>(items: T[], key: (item: T) => string): T[] {
  return [...items].sort((a, b) => {
    const ha = stableHash(key(a));
    const hb = stableHash(key(b));
    if (ha !== hb) return ha - hb;
    // collision: fall back to lexicographic
    return key(a).localeCompare(key(b));
  });
}

// Cascading visibility: if a parent type is hidden, children are hidden too.
// Deployment -> ReplicaSet -> Pod
// StatefulSet -> Pod
// DaemonSet -> Pod
// Job -> Pod
function resolveVisibility(filters: ResourceTypeFilter): ResourceTypeFilter {
  const f = { ...filters };
  // If deployments hidden, hide replicasets (their direct children)
  if (!f.deployment) f.replicaset = false;
  // If all workload controllers are hidden, hide pods
  if (!f.deployment && !f.statefulset && !f.daemonset && !f.job && !f.replicaset) {
    f.pod = false;
  }
  return f;
}

function buildGraph(
  namespaces: Namespace[],
  k8sNodes: K8sNode[],
  searchQuery: string,
  rawFilters: ResourceTypeFilter,
): { nodes: Node[]; edges: Edge[] } {
  const flowNodes: Node[] = [];
  const flowEdges: Edge[] = [];
  const query = searchQuery.toLowerCase();
  const matchesSearch = (name: string) => !query || name.toLowerCase().includes(query);
  const filters = resolveVisibility(rawFilters);

  const colWidth = 200;
  const rowHeight = 90;
  const nsGap = 80;
  const podCols = 4;
  const miscCols = 3;

  // Track which node IDs actually exist in the graph so we only create edges to real targets
  const nodeIdSet = new Set<string>();

  let nsXOffset = 0;

  const sortedNamespaces = stableSort(namespaces, ns => ns.name);

  sortedNamespaces.forEach((ns) => {
    const nsX = nsXOffset;
    const nsId = `ns-${ns.unique_id}`;

    // Collect filtered resources, sorted deterministically by name
    const ingresses = filters.ingress ? stableSort((ns.ingresses || []).filter(i => matchesSearch(i.name)), i => i.name) : [];
    const services = filters.service ? stableSort((ns.services || []).filter(s => matchesSearch(s.name)), s => s.name) : [];
    const deployments = filters.deployment ? stableSort((ns.deployments || []).filter(d => matchesSearch(d.name)), d => d.name) : [];
    const statefulSets = filters.statefulset ? stableSort((ns.stateful_sets || []).filter(s => matchesSearch(s.name)), s => s.name) : [];
    const daemonSets = filters.daemonset ? stableSort((ns.daemon_sets || []).filter(d => matchesSearch(d.name)), d => d.name) : [];
    const jobs = filters.job ? stableSort((ns.jobs || []).filter(j => matchesSearch(j.name)), j => j.name) : [];
    const replicaSets = filters.replicaset ? stableSort((ns.replica_sets || []).filter(rs => matchesSearch(rs.name)), rs => rs.name) : [];
    const pods = filters.pod ? stableSort((ns.pods || []).filter(p => matchesSearch(p.name)), p => p.name) : [];
    const secrets = filters.secret ? stableSort((ns.secrets || []).filter(s => matchesSearch(s.name)), s => s.name) : [];
    const configMaps = filters.configmap ? stableSort((ns.config_maps || []).filter(cm => matchesSearch(cm.name)), cm => cm.name) : [];

    const maxItems = Math.max(
      1,
      ingresses.length,
      services.length,
      deployments.length + statefulSets.length + daemonSets.length,
      replicaSets.length,
      Math.min(pods.length, podCols),
      Math.min(secrets.length, miscCols),
      Math.min(configMaps.length, miscCols),
    );
    const nsWidth = maxItems * colWidth;
    let currentY = 0;

    // Namespace node (always shown)
    flowNodes.push({
      id: nsId,
      type: 'resource',
      position: { x: nsX + nsWidth / 2 - 80, y: currentY },
      data: { label: ns.name, resourceType: 'namespace', status: 'Active', created_at: ns.created_at } satisfies ResourceNodeData,
    });
    nodeIdSet.add(nsId);
    currentY += rowHeight;

    // Helper: lay out a row of items, centered within namespace width
    const addRow = (items: { id: string; node: Node }[], connectToNs: boolean) => {
      if (items.length === 0) return;
      const totalWidth = items.length * colWidth;
      const startX = nsX + (nsWidth - totalWidth) / 2;
      items.forEach((item, i) => {
        item.node.position = { x: startX + i * colWidth, y: currentY };
        flowNodes.push(item.node);
        nodeIdSet.add(item.id);
        if (connectToNs) {
          flowEdges.push({ id: `${nsId}->${item.id}`, source: nsId, target: item.id, style: edgeStyle });
        }
      });
      currentY += rowHeight;
    };

    // Helper: add a grid of items
    const addGrid = (
      items: { id: string; node: Node }[],
      cols: number,
    ) => {
      if (items.length === 0) return;
      const visibleCols = Math.min(items.length, cols);
      const totalWidth = visibleCols * colWidth;
      const startX = nsX + (nsWidth - totalWidth) / 2;
      items.forEach((item, i) => {
        item.node.position = { x: startX + (i % cols) * colWidth, y: currentY + Math.floor(i / cols) * rowHeight };
        flowNodes.push(item.node);
        nodeIdSet.add(item.id);
      });
      currentY += Math.ceil(items.length / cols) * rowHeight;
    };

    // --- Ingresses ---
    addRow(
      ingresses.map(ing => {
        const id = `ing-${ing.unique_id}`;
        ing.rules?.forEach(rule => {
          rule.paths?.forEach(path => {
            const targetSvc = (ns.services || []).find(s => s.name === path.service_name);
            if (targetSvc) {
              flowEdges.push({ id: `${id}->svc-${targetSvc.unique_id}`, source: id, target: `svc-${targetSvc.unique_id}`, style: routeEdgeStyle, animated: true });
            }
          });
        });
        return { id, node: { id, type: 'resource', position: { x: 0, y: 0 }, data: { label: ing.name, resourceType: 'ingress', rules: ing.rules, created_at: ing.created_at } satisfies ResourceNodeData } };
      }),
      true,
    );

    // --- Services ---
    addRow(
      services.map(svc => {
        const id = `svc-${svc.unique_id}`;
        if (svc.selector && filters.pod) {
          (ns.pods || []).forEach(pod => {
            if (pod.labels && Object.entries(svc.selector!).every(([k, v]) => pod.labels?.[k] === v)) {
              flowEdges.push({ id: `${id}->pod-${pod.unique_id}`, source: id, target: `pod-${pod.unique_id}`, style: { ...routeEdgeStyle, strokeDasharray: '5 3', strokeWidth: 1 }, animated: true });
            }
          });
        }
        return { id, node: { id, type: 'resource', position: { x: 0, y: 0 }, data: { label: svc.name, resourceType: 'service', subtitle: svc.type, selector: svc.selector, ports: svc.ports, created_at: svc.created_at } satisfies ResourceNodeData } };
      }),
      true,
    );

    // --- Workloads (Deployments + StatefulSets + DaemonSets) ---
    const workloads: { id: string; node: Node }[] = [];
    deployments.forEach(dep => {
      const id = `dep-${dep.unique_id}`;
      workloads.push({ id, node: { id, type: 'resource', position: { x: 0, y: 0 }, data: { label: dep.name, resourceType: 'deployment', status: `${dep.ready_replicas}/${dep.replicas} ready`, selector: dep.selector, created_at: dep.created_at } satisfies ResourceNodeData } });
    });
    statefulSets.forEach(sts => {
      const id = `sts-${sts.unique_id}`;
      workloads.push({ id, node: { id, type: 'resource', position: { x: 0, y: 0 }, data: { label: sts.name, resourceType: 'statefulset', status: `${sts.ready_replicas}/${sts.replicas} ready`, created_at: sts.created_at } satisfies ResourceNodeData } });
    });
    daemonSets.forEach(ds => {
      const id = `ds-${ds.unique_id}`;
      workloads.push({ id, node: { id, type: 'resource', position: { x: 0, y: 0 }, data: { label: ds.name, resourceType: 'daemonset', status: `${ds.ready_number}/${ds.desired_number} ready`, created_at: ds.created_at } satisfies ResourceNodeData } });
    });
    addRow(workloads, true);

    // --- Jobs ---
    addRow(
      jobs.map(job => {
        const id = `job-${job.unique_id}`;
        return { id, node: { id, type: 'resource', position: { x: 0, y: 0 }, data: { label: job.name, resourceType: 'job', status: job.status, subtitle: `${job.succeeded} succeeded, ${job.failed} failed`, created_at: job.created_at } satisfies ResourceNodeData } };
      }),
      true,
    );

    // --- ReplicaSets ---
    addRow(
      replicaSets.map(rs => {
        const id = `rs-${rs.unique_id}`;
        rs.owner_references?.forEach(ref => {
          if (ref.kind === 'Deployment') {
            flowEdges.push({ id: `dep-${ref.uid}->${id}`, source: `dep-${ref.uid}`, target: id, style: edgeStyle });
          }
        });
        return { id, node: { id, type: 'resource', position: { x: 0, y: 0 }, data: { label: rs.name, resourceType: 'replicaset', status: `${rs.ready_replicas}/${rs.replicas} ready`, created_at: rs.created_at } satisfies ResourceNodeData } };
      }),
      false,
    );

    // --- Pods ---
    if (pods.length > 0) {
      const podItems = pods.map(pod => {
        const id = `pod-${pod.unique_id}`;
        // Owner edges
        let hasOwner = false;
        pod.owner_references?.forEach(ref => {
          const prefixMap: Record<string, string> = { ReplicaSet: 'rs', StatefulSet: 'sts', DaemonSet: 'ds', Job: 'job' };
          const prefix = prefixMap[ref.kind];
          if (prefix) {
            flowEdges.push({ id: `${prefix}-${ref.uid}->${id}`, source: `${prefix}-${ref.uid}`, target: id, style: ownerEdgeStyle });
            hasOwner = true;
          }
        });
        if (!hasOwner) {
          flowEdges.push({ id: `${nsId}->${id}`, source: nsId, target: id, style: orphanEdgeStyle });
        }
        return { id, node: { id, type: 'resource', position: { x: 0, y: 0 }, data: { label: pod.name, resourceType: 'pod', status: pod.effective_status, subtitle: pod.node_name ? `Node: ${pod.node_name}` : undefined, ip: pod.ip, containers: pod.container_statuses, conditions: pod.conditions, created_at: pod.created_at } satisfies ResourceNodeData } };
      });
      addGrid(podItems, podCols);
    }

    // --- Secrets ---
    {
      const secretItems = secrets.map(secret => {
        const id = `secret-${secret.unique_id}`;
        flowEdges.push({ id: `${nsId}->${id}`, source: nsId, target: id, style: orphanEdgeStyle });
        return { id, node: { id, type: 'resource', position: { x: 0, y: 0 }, data: { label: secret.name, resourceType: 'secret', subtitle: `${secret.key_count} keys`, type: secret.type, created_at: secret.created_at } satisfies ResourceNodeData } };
      });
      addGrid(secretItems, miscCols);
    }

    // --- ConfigMaps ---
    {
      const cmItems = configMaps.map(cm => {
        const id = `cm-${cm.unique_id}`;
        flowEdges.push({ id: `${nsId}->${id}`, source: nsId, target: id, style: orphanEdgeStyle });
        return { id, node: { id, type: 'resource', position: { x: 0, y: 0 }, data: { label: cm.name, resourceType: 'configmap', subtitle: `${cm.key_count} keys`, created_at: cm.created_at } satisfies ResourceNodeData } };
      });
      addGrid(cmItems, miscCols);
    }

    nsXOffset += nsWidth + nsGap;
  });

  // Cluster nodes (k8s Nodes) above everything
  if (filters.node) {
    const nodeY = -120;
    const totalNodeWidth = k8sNodes.length * 220;
    const nodeStartX = Math.max(0, (nsXOffset - nsGap) / 2 - totalNodeWidth / 2);
    stableSort(k8sNodes.filter(n => matchesSearch(n.name)), n => n.name).forEach((node, i) => {
      const id = `node-${node.unique_id}`;
      flowNodes.push({
        id,
        type: 'resource',
        position: { x: nodeStartX + i * 220, y: nodeY },
        data: { label: node.name, resourceType: 'node', status: node.status, subtitle: `${node.capacity.cpu} CPU, ${node.capacity.memory} mem`, internal_ip: node.internal_ip, os_image: node.os_image, kubelet_version: node.kubelet_version } satisfies ResourceNodeData,
      });
      nodeIdSet.add(id);
    });
  }

  // Only keep edges whose source AND target both exist in the graph
  const validEdges = flowEdges.filter(e => nodeIdSet.has(e.source) && nodeIdSet.has(e.target));

  return { nodes: flowNodes, edges: validEdges };
}

export default function ClusterGraph({ namespaces, nodes: k8sNodes, searchQuery, resourceFilters }: ClusterGraphProps) {
  const [selectedNode, setSelectedNode] = useState<ResourceNodeData | null>(null);
  const [interactiveNodes, setInteractiveNodes] = useState<Node[]>([]);
  const [interactiveEdges, setInteractiveEdges] = useState<Edge[]>([]);
  const reactFlowRef = useRef<ReactFlowInstance | null>(null);
  const hasFitView = useRef(false);

  const graphData = useMemo(
    () => buildGraph(namespaces, k8sNodes, searchQuery, resourceFilters),
    [namespaces, k8sNodes, searchQuery, resourceFilters]
  );

  useEffect(() => {
    setInteractiveNodes(prev => {
      const posMap = new Map(prev.map(n => [n.id, n.position]));
      return graphData.nodes.map(n => ({
        ...n,
        position: posMap.get(n.id) ?? n.position,
      }));
    });
    setInteractiveEdges(graphData.edges);
  }, [graphData]);

  useEffect(() => {
    if (!hasFitView.current && interactiveNodes.length > 0 && reactFlowRef.current) {
      setTimeout(() => reactFlowRef.current?.fitView({ padding: 0.15 }), 100);
      hasFitView.current = true;
    }
  }, [interactiveNodes]);

  const onNodesChange: OnNodesChange = useCallback(
    (changes) => setInteractiveNodes((nds) => applyNodeChanges(changes, nds)),
    []
  );

  const onEdgesChange: OnEdgesChange = useCallback(
    (changes) => setInteractiveEdges((eds) => applyEdgeChanges(changes, eds)),
    []
  );

  const onNodeClick = useCallback((_: React.MouseEvent, node: Node) => {
    setSelectedNode(node.data as unknown as ResourceNodeData);
  }, []);

  return (
    <div className="cluster-graph-container">
      <ReactFlow
        nodes={interactiveNodes}
        edges={interactiveEdges}
        onNodesChange={onNodesChange}
        onEdgesChange={onEdgesChange}
        nodeTypes={nodeTypes}
        onNodeClick={onNodeClick}
        onInit={(instance) => { reactFlowRef.current = instance; }}
        minZoom={0.1}
        maxZoom={2}
        defaultEdgeOptions={{ type: 'smoothstep' }}
        proOptions={{ hideAttribution: true }}
      >
        <Background color="#2a3a5a" gap={20} />
        <Controls
          style={{
            background: '#1e2a4a',
            border: '1px solid #2a3a5a',
            borderRadius: 8,
          }}
        />
      </ReactFlow>
      {selectedNode && (
        <ResourceDetail data={selectedNode} onClose={() => setSelectedNode(null)} />
      )}
    </div>
  );
}
