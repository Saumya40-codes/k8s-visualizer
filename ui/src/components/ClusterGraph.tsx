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
import type { ResourceTypeFilter, Theme } from '../App';
import { nodeTypes, type ResourceNodeData } from './CustomNodes';
import ResourceDetail from './ResourceDetail';
import './ClusterGraph.css';

interface ClusterGraphProps {
  namespaces: Namespace[];
  nodes: K8sNode[];
  searchQuery: string;
  resourceFilters: ResourceTypeFilter;
  /** Active namespace; change refits the view. */
  focusKey?: string;
  theme?: Theme;
}

function readCssVar(name: string, fallback: string): string {
  if (typeof document === 'undefined') return fallback;
  const v = getComputedStyle(document.documentElement).getPropertyValue(name).trim();
  return v || fallback;
}

function edgeStyles() {
  const edge = readCssVar('--edge', '#5c5c5c');
  const route = readCssVar('--edge-route', '#c47d00');
  const owner = readCssVar('--edge-owner', '#8a8a8a');
  return {
    edgeStyle: { stroke: edge, strokeWidth: 1.5 },
    orphanEdgeStyle: { stroke: edge, strokeWidth: 1.5, strokeDasharray: '4 4' },
    routeEdgeStyle: { stroke: route, strokeWidth: 1.5 },
    ownerEdgeStyle: { stroke: owner, strokeWidth: 1 },
  };
}

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
  if (!f.deployment) f.replicaset = false;
  if (!f.deployment && !f.statefulset && !f.daemonset && !f.job && !f.replicaset) {
    f.pod = false;
  }
  return f;
}

/** Prefer wider grids when a single namespace has the full canvas. */
function idealCols(count: number, maxCols: number, minCols = 2): number {
  if (count <= 0) return minCols;
  const sqrt = Math.ceil(Math.sqrt(count));
  return Math.min(maxCols, Math.max(minCols, sqrt));
}

/** Union-find for grouping related resources into DAG components. */
function createUnionFind() {
  const parent = new Map<string, string>();
  const find = (x: string): string => {
    if (!parent.has(x)) parent.set(x, x);
    let r = x;
    while (parent.get(r) !== r) r = parent.get(r)!;
    let c = x;
    while (parent.get(c) !== r) {
      const n = parent.get(c)!;
      parent.set(c, r);
      c = n;
    }
    return r;
  };
  const union = (a: string, b: string) => {
    const ra = find(a);
    const rb = find(b);
    if (ra !== rb) parent.set(ra, rb);
  };
  return { find, union, ensure: (x: string) => { if (!parent.has(x)) parent.set(x, x); } };
}

/** DAG layer: top → bottom ownership / routing flow */
const LAYER: Record<string, number> = {
  ingress: 0,
  service: 1,
  deployment: 2,
  statefulset: 2,
  daemonset: 2,
  job: 2,
  replicaset: 3,
  pod: 4,
};

type GraphItem = {
  id: string;
  kind: string;
  layer: number;
  sortKey: string;
  node: Node;
  /** true if this item has a parent in the relation graph (not a group root) */
  hasParent: boolean;
};

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
  const { edgeStyle, orphanEdgeStyle, routeEdgeStyle, ownerEdgeStyle } = edgeStyles();

  const singleNs = namespaces.length <= 1;
  const colWidth = singleNs ? 210 : 190;
  const rowHeight = singleNs ? 105 : 90;
  const groupGap = singleNs ? 70 : 50;
  const nsGap = 100;

  const nodeIdSet = new Set<string>();
  let nsXOffset = 0;
  let contentWidth = 0;

  const sortedNamespaces = stableSort(namespaces, ns => ns.name);

  sortedNamespaces.forEach((ns) => {
    const nsX = nsXOffset;
    const nsId = `ns-${ns.unique_id}`;

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

    const items = new Map<string, GraphItem>();
    const pendingEdges: Edge[] = [];
    const uf = createUnionFind();

    const addItem = (id: string, kind: string, sortKey: string, data: ResourceNodeData) => {
      const item: GraphItem = {
        id,
        kind,
        layer: LAYER[kind] ?? 5,
        sortKey,
        hasParent: false,
        node: { id, type: 'resource', position: { x: 0, y: 0 }, data },
      };
      items.set(id, item);
      uf.ensure(id);
      return item;
    };

    const link = (parentId: string, childId: string, edge: Edge) => {
      if (!items.has(parentId) || !items.has(childId)) return;
      uf.union(parentId, childId);
      items.get(childId)!.hasParent = true;
      pendingEdges.push(edge);
    };

    ingresses.forEach(ing => {
      addItem(`ing-${ing.unique_id}`, 'ingress', ing.name, {
        label: ing.name, resourceType: 'ingress', rules: ing.rules, created_at: ing.created_at,
      });
    });
    services.forEach(svc => {
      addItem(`svc-${svc.unique_id}`, 'service', svc.name, {
        label: svc.name, resourceType: 'service', subtitle: svc.type,
        selector: svc.selector, ports: svc.ports, created_at: svc.created_at,
      });
    });
    deployments.forEach(dep => {
      addItem(`dep-${dep.unique_id}`, 'deployment', dep.name, {
        label: dep.name, resourceType: 'deployment',
        status: `${dep.ready_replicas}/${dep.replicas} ready`,
        selector: dep.selector, created_at: dep.created_at,
      });
    });
    statefulSets.forEach(sts => {
      addItem(`sts-${sts.unique_id}`, 'statefulset', sts.name, {
        label: sts.name, resourceType: 'statefulset',
        status: `${sts.ready_replicas}/${sts.replicas} ready`, created_at: sts.created_at,
      });
    });
    daemonSets.forEach(ds => {
      addItem(`ds-${ds.unique_id}`, 'daemonset', ds.name, {
        label: ds.name, resourceType: 'daemonset',
        status: `${ds.ready_number}/${ds.desired_number} ready`, created_at: ds.created_at,
      });
    });
    jobs.forEach(job => {
      addItem(`job-${job.unique_id}`, 'job', job.name, {
        label: job.name, resourceType: 'job', status: job.status,
        subtitle: `${job.succeeded} succeeded, ${job.failed} failed`, created_at: job.created_at,
      });
    });
    replicaSets.forEach(rs => {
      addItem(`rs-${rs.unique_id}`, 'replicaset', rs.name, {
        label: rs.name, resourceType: 'replicaset',
        status: `${rs.ready_replicas}/${rs.replicas} ready`, created_at: rs.created_at,
      });
    });
    pods.forEach(pod => {
      const usageBits: string[] = [];
      if (pod.usage?.cpu) usageBits.push(`${pod.usage.cpu} cores`);
      if (pod.usage?.memory) usageBits.push(pod.usage.memory);
      const usageLine = usageBits.length ? usageBits.join(' · ') : undefined;
      const nodeLine = pod.node_name ? `Node: ${pod.node_name}` : undefined;
      addItem(`pod-${pod.unique_id}`, 'pod', pod.name, {
        label: pod.name, resourceType: 'pod', status: pod.effective_status,
        subtitle: usageLine || nodeLine,
        ip: pod.ip, containers: pod.container_statuses, conditions: pod.conditions, created_at: pod.created_at,
        node_name: pod.node_name,
        requests: pod.requests, limits: pod.limits, usage: pod.usage,
      });
    });


    // Ingress -> Service
    ingresses.forEach(ing => {
      const id = `ing-${ing.unique_id}`;
      ing.rules?.forEach(rule => {
        rule.paths?.forEach(path => {
          const targetSvc = (ns.services || []).find(s => s.name === path.service_name);
          if (!targetSvc) return;
          const svcId = `svc-${targetSvc.unique_id}`;
          link(id, svcId, {
            id: `${id}->${svcId}`, source: id, target: svcId,
            style: routeEdgeStyle, animated: true,
          });
        });
      });
    });

    // Service -> Pod (selector)
    services.forEach(svc => {
      if (!svc.selector || !filters.pod) return;
      const id = `svc-${svc.unique_id}`;
      pods.forEach(pod => {
        if (pod.labels && Object.entries(svc.selector!).every(([k, v]) => pod.labels?.[k] === v)) {
          const podId = `pod-${pod.unique_id}`;
          link(id, podId, {
            id: `${id}->${podId}`, source: id, target: podId,
            style: { ...routeEdgeStyle, strokeDasharray: '5 3', strokeWidth: 1 }, animated: true,
          });
        }
      });
    });

    // Deployment -> ReplicaSet
    replicaSets.forEach(rs => {
      const rsId = `rs-${rs.unique_id}`;
      rs.owner_references?.forEach(ref => {
        if (ref.kind === 'Deployment') {
          const depId = `dep-${ref.uid}`;
          link(depId, rsId, {
            id: `${depId}->${rsId}`, source: depId, target: rsId, style: edgeStyle,
          });
        }
      });
    });

    // Owner -> Pod
    pods.forEach(pod => {
      const podId = `pod-${pod.unique_id}`;
      pod.owner_references?.forEach(ref => {
        const prefixMap: Record<string, string> = {
          ReplicaSet: 'rs', StatefulSet: 'sts', DaemonSet: 'ds', Job: 'job',
        };
        const prefix = prefixMap[ref.kind];
        if (!prefix) return;
        const parentId = `${prefix}-${ref.uid}`;
        link(parentId, podId, {
          id: `${parentId}->${podId}`, source: parentId, target: podId, style: ownerEdgeStyle,
        });
      });
    });

    const components = new Map<string, GraphItem[]>();
    items.forEach(item => {
      const root = uf.find(item.id);
      if (!components.has(root)) components.set(root, []);
      components.get(root)!.push(item);
    });

    const componentList = [...components.values()].map(group => {
      const sorted = stableSort(group, g => g.sortKey);
      return sorted;
    }).sort((a, b) => {
      if (b.length !== a.length) return b.length - a.length;
      return a[0].sortKey.localeCompare(b[0].sortKey);
    });

    const measureComponent = (group: GraphItem[]) => {
      const byLayer = new Map<number, GraphItem[]>();
      group.forEach(g => {
        if (!byLayer.has(g.layer)) byLayer.set(g.layer, []);
        byLayer.get(g.layer)!.push(g);
      });
      let maxW = colWidth;
      byLayer.forEach((layerItems, layer) => {
        const n = layerItems.length;
        const maxCols = layer === 4 ? (singleNs ? 4 : 3) : (singleNs ? 3 : 2);
        const cols = Math.min(n, Math.max(1, idealCols(n, maxCols, 1)));
        maxW = Math.max(maxW, cols * colWidth);
      });
      return maxW;
    };

    const groupWidths = componentList.map(measureComponent);
    const dagWidth = componentList.length === 0
      ? colWidth * 2
      : groupWidths.reduce((s, w) => s + w, 0) + Math.max(0, componentList.length - 1) * groupGap;

    const miscItems: GraphItem[] = [];
    secrets.forEach(secret => {
      const id = `secret-${secret.unique_id}`;
      miscItems.push({
        id, kind: 'secret', layer: 0, sortKey: secret.name, hasParent: false,
        node: {
          id, type: 'resource', position: { x: 0, y: 0 },
          data: {
            label: secret.name, resourceType: 'secret',
            subtitle: `${secret.key_count} keys`, type: secret.type, created_at: secret.created_at,
          } satisfies ResourceNodeData,
        },
      });
    });
    configMaps.forEach(cm => {
      const id = `cm-${cm.unique_id}`;
      miscItems.push({
        id, kind: 'configmap', layer: 0, sortKey: cm.name, hasParent: false,
        node: {
          id, type: 'resource', position: { x: 0, y: 0 },
          data: {
            label: cm.name, resourceType: 'configmap',
            subtitle: `${cm.key_count} keys`, created_at: cm.created_at,
          } satisfies ResourceNodeData,
        },
      });
    });
    const miscCols = singleNs ? idealCols(miscItems.length, 8, 3) : 4;
    const miscWidth = miscItems.length === 0
      ? 0
      : Math.min(miscItems.length, miscCols) * colWidth;
    const nsWidth = Math.max(dagWidth, miscWidth, singleNs ? colWidth * 3 : colWidth);

    let currentY = 0;

    flowNodes.push({
      id: nsId,
      type: 'resource',
      position: { x: nsX + nsWidth / 2 - 80, y: currentY },
      data: { label: ns.name, resourceType: 'namespace', status: 'Active', created_at: ns.created_at } satisfies ResourceNodeData,
    });
    nodeIdSet.add(nsId);
    currentY += rowHeight + (singleNs ? 16 : 8);

    const dagStartX = nsX + Math.max(0, (nsWidth - dagWidth) / 2);
    let groupX = dagStartX;
    let maxDagBottom = currentY;

    componentList.forEach((group, gi) => {
      const gWidth = groupWidths[gi];
      const byLayer = new Map<number, GraphItem[]>();
      group.forEach(g => {
        if (!byLayer.has(g.layer)) byLayer.set(g.layer, []);
        byLayer.get(g.layer)!.push(g);
      });

      byLayer.forEach((layerItems, layer) => {
        byLayer.set(layer, stableSort(layerItems, i => i.sortKey));
      });

      const layers = [...byLayer.keys()].sort((a, b) => a - b);
      let y = currentY;

      layers.forEach(layer => {
        const layerItems = byLayer.get(layer)!;
        const n = layerItems.length;
        const maxCols = layer === 4 ? (singleNs ? 4 : 3) : (singleNs ? 3 : 2);
        const cols = Math.min(n, Math.max(1, idealCols(n, maxCols, 1)));
        const rows = Math.ceil(n / cols);
        const rowW = cols * colWidth;
        const startX = groupX + (gWidth - rowW) / 2;

        layerItems.forEach((item, i) => {
          const col = i % cols;
          const row = Math.floor(i / cols);
          item.node.position = {
            x: startX + col * colWidth,
            y: y + row * rowHeight,
          };
          flowNodes.push(item.node);
          nodeIdSet.add(item.id);

          // Component roots connect to the namespace node
          if (!item.hasParent) {
            flowEdges.push({
              id: `${nsId}->${item.id}`,
              source: nsId,
              target: item.id,
              style: item.kind === 'pod' ? orphanEdgeStyle : edgeStyle,
            });
          }
        });

        y += rows * rowHeight + 8;
      });

      maxDagBottom = Math.max(maxDagBottom, y);
      groupX += gWidth + groupGap;
    });

    pendingEdges.forEach(e => flowEdges.push(e));

    currentY = maxDagBottom + (miscItems.length > 0 ? 24 : 0);

    // Secrets and configmaps below workload DAGs
    if (miscItems.length > 0) {
      const cols = Math.min(miscItems.length, miscCols);
      const totalW = cols * colWidth;
      const startX = nsX + (nsWidth - totalW) / 2;
      stableSort(miscItems, i => `${i.kind}-${i.sortKey}`).forEach((item, i) => {
        item.node.position = {
          x: startX + (i % cols) * colWidth,
          y: currentY + Math.floor(i / cols) * rowHeight,
        };
        flowNodes.push(item.node);
        nodeIdSet.add(item.id);
        flowEdges.push({
          id: `${nsId}->${item.id}`,
          source: nsId,
          target: item.id,
          style: orphanEdgeStyle,
        });
      });
      currentY += Math.ceil(miscItems.length / cols) * rowHeight;
    }

    contentWidth = nsXOffset + nsWidth;
    nsXOffset += nsWidth + nsGap;
  });

  if (filters.node) {
    const nodeY = -140;
    const filteredNodes = stableSort(k8sNodes.filter(n => matchesSearch(n.name)), n => n.name);
    const totalNodeWidth = Math.max(filteredNodes.length, 1) * 220;
    const baseWidth = contentWidth > 0 ? contentWidth : totalNodeWidth;
    const nodeStartX = Math.max(0, baseWidth / 2 - totalNodeWidth / 2);
    filteredNodes.forEach((node, i) => {
      const id = `node-${node.unique_id}`;
      flowNodes.push({
        id,
        type: 'resource',
        position: { x: nodeStartX + i * 220, y: nodeY },
        data: {
          label: node.name, resourceType: 'node', status: node.status,
          subtitle: (() => {
            const pods = `pods ${node.pod_count ?? 0}/${node.pod_capacity || node.capacity.pods}`;
            if (node.usage) {
              return `${node.usage.cpu || '-'} / ${node.allocatable?.cpu || node.capacity.cpu} cores · ${node.usage.memory || '-'} / ${node.allocatable?.memory || node.capacity.memory} · ${pods}`;
            }
            return `${node.capacity.cpu} cores · ${node.capacity.memory} · ${pods}`;
          })(),
          internal_ip: node.internal_ip, os_image: node.os_image, kubelet_version: node.kubelet_version,
          capacity: node.capacity, allocatable: node.allocatable, usage: node.usage,
          pod_count: node.pod_count, pod_capacity: node.pod_capacity || node.capacity.pods,
        } satisfies ResourceNodeData,
      });
      nodeIdSet.add(id);
    });
  }

  const validEdges = flowEdges.filter(e => nodeIdSet.has(e.source) && nodeIdSet.has(e.target));
  return { nodes: flowNodes, edges: validEdges };
}

export default function ClusterGraph({ namespaces, nodes: k8sNodes, searchQuery, resourceFilters, focusKey, theme = 'light' }: ClusterGraphProps) {
  // Selection by id so detail follows live metrics
  const [selectedNodeId, setSelectedNodeId] = useState<string | null>(null);
  const [interactiveNodes, setInteractiveNodes] = useState<Node[]>([]);
  const [interactiveEdges, setInteractiveEdges] = useState<Edge[]>([]);
  const reactFlowRef = useRef<ReactFlowInstance | null>(null);
  const prevFocusKey = useRef<string | undefined>(undefined);

  const graphData = useMemo(
    () => buildGraph(namespaces, k8sNodes, searchQuery, resourceFilters),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [namespaces, k8sNodes, searchQuery, resourceFilters, theme]
  );

  useEffect(() => {
    // Reset layout when switching namespaces
    const focusChanged = focusKey !== prevFocusKey.current;
    if (focusChanged) {
      prevFocusKey.current = focusKey;
      setSelectedNodeId(null);
    }

    setInteractiveNodes(prev => {
      if (focusChanged) {
        return graphData.nodes;
      }
      const posMap = new Map(prev.map(n => [n.id, n.position]));
      return graphData.nodes.map(n => ({
        ...n,
        position: posMap.get(n.id) ?? n.position,
      }));
    });
    setInteractiveEdges(graphData.edges);
  }, [graphData, focusKey]);

  const selectedNode = useMemo(() => {
    if (!selectedNodeId) return null;
    const n = interactiveNodes.find(node => node.id === selectedNodeId);
    return n ? (n.data as unknown as ResourceNodeData) : null;
  }, [selectedNodeId, interactiveNodes]);

  useEffect(() => {
    if (interactiveNodes.length === 0 || !reactFlowRef.current) return;
    const t = setTimeout(() => {
      reactFlowRef.current?.fitView({ padding: 0.18, duration: 250 });
    }, 80);
    return () => clearTimeout(t);
  }, [focusKey, interactiveNodes.length > 0]); // eslint-disable-line react-hooks/exhaustive-deps

  const onNodesChange: OnNodesChange = useCallback(
    (changes) => setInteractiveNodes((nds) => applyNodeChanges(changes, nds)),
    []
  );

  const onEdgesChange: OnEdgesChange = useCallback(
    (changes) => setInteractiveEdges((eds) => applyEdgeChanges(changes, eds)),
    []
  );

  const onNodeClick = useCallback((_: React.MouseEvent, node: Node) => {
    setSelectedNodeId(node.id);
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
        onInit={(instance) => {
          reactFlowRef.current = instance;
          requestAnimationFrame(() => instance.fitView({ padding: 0.18 }));
        }}
        minZoom={0.08}
        maxZoom={2}
        defaultEdgeOptions={{ type: 'smoothstep' }}
        proOptions={{ hideAttribution: true }}
        fitView
        fitViewOptions={{ padding: 0.18 }}
        colorMode={theme}
      >
        <Background color="var(--canvas-dot)" gap={20} />
        <Controls showInteractive={false} />
      </ReactFlow>
      {selectedNode && (
        <ResourceDetail data={selectedNode} onClose={() => setSelectedNodeId(null)} />
      )}
    </div>
  );
}
