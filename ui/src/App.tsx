import { useEffect, useMemo, useState } from 'react';
import socket from './lib/socket';
import { ClusterState } from './lib/types/namespaces';
import {
  Search, Server, Database, Network, Lock, FileText,
  Globe, LayoutGrid, Repeat, Briefcase, Monitor, Copy, Loader,
  type LucideIcon,
} from 'lucide-react';
import ClusterGraph from './components/ClusterGraph';
import './App.css';

export type ResourceTypeFilter = {
  pod: boolean;
  deployment: boolean;
  replicaset: boolean;
  service: boolean;
  ingress: boolean;
  statefulset: boolean;
  daemonset: boolean;
  job: boolean;
  secret: boolean;
  configmap: boolean;
  node: boolean;
};

const defaultFilters: ResourceTypeFilter = {
  pod: true,
  deployment: true,
  replicaset: true,
  service: true,
  ingress: true,
  statefulset: true,
  daemonset: true,
  job: true,
  secret: true,
  configmap: true,
  node: true,
};

const filterMeta: { key: keyof ResourceTypeFilter; label: string; icon: LucideIcon }[] = [
  { key: 'node', label: 'Nodes', icon: Monitor },
  { key: 'ingress', label: 'Ingress', icon: Globe },
  { key: 'service', label: 'Services', icon: Network },
  { key: 'deployment', label: 'Deploys', icon: Database },
  { key: 'statefulset', label: 'StatefulSets', icon: LayoutGrid },
  { key: 'daemonset', label: 'DaemonSets', icon: Repeat },
  { key: 'job', label: 'Jobs', icon: Briefcase },
  { key: 'replicaset', label: 'ReplicaSets', icon: Copy },
  { key: 'pod', label: 'Pods', icon: Server },
  { key: 'secret', label: 'Secrets', icon: Lock },
  { key: 'configmap', label: 'ConfigMaps', icon: FileText },
];

function App() {
  const [clusterState, setClusterState] = useState<ClusterState | null>(null);
  const [loading, setLoading] = useState(true);
  const [connected, setConnected] = useState(false);
  const [searchQuery, setSearchQuery] = useState('');
  const [selectedNamespaces, setSelectedNamespaces] = useState<Set<string>>(new Set());
  const [resourceFilters, setResourceFilters] = useState<ResourceTypeFilter>({ ...defaultFilters });

  useEffect(() => {
    socket.connect();

    const handleMessage = (state: ClusterState) => {
      setClusterState(state);
      setLoading(false);
    };
    const handleConnect = () => setConnected(true);
    const handleDisconnect = () => setConnected(false);

    socket.on('message', handleMessage);
    socket.on('connect', handleConnect);
    socket.on('disconnect', handleDisconnect);

    return () => {
      socket.off('message', handleMessage);
      socket.off('connect', handleConnect);
      socket.off('disconnect', handleDisconnect);
      socket.disconnect();
    };
  }, []);

  const allNamespaces = useMemo(
    () => (clusterState?.namespaces || []).map(ns => ns.name),
    [clusterState]
  );

  const toggleNamespace = (name: string) => {
    setSelectedNamespaces(prev => {
      const next = new Set(prev);
      if (next.has(name)) next.delete(name);
      else next.add(name);
      return next;
    });
  };

  const toggleFilter = (key: keyof ResourceTypeFilter) => {
    setResourceFilters(prev => ({ ...prev, [key]: !prev[key] }));
  };

  const filteredNamespaces = useMemo(() => {
    if (!clusterState) return [];
    if (selectedNamespaces.size === 0) return clusterState.namespaces;
    return clusterState.namespaces.filter(ns => selectedNamespaces.has(ns.name));
  }, [clusterState, selectedNamespaces]);

  return (
    <div className="app-container">
      {loading ? (
        <div className="loader">
          <span className="loader-text">Connecting to cluster</span>
          <Loader size={24} className="loader-spin" color="#4ecca3" />
        </div>
      ) : (
        <>
          <div className="toolbar">
            <span className="toolbar__title">K8s Visualizer</span>
            <div className="toolbar__status">
              <span className={`status-dot ${connected ? 'status-dot--ok' : 'status-dot--err'}`} />
              <span className="toolbar__status-text">
                {connected ? 'Connected' : 'Reconnecting...'}
              </span>
            </div>
            <div className="toolbar__search">
              <Search size={14} className="toolbar__search-icon" />
              <input
                type="text"
                placeholder="Search resources..."
                value={searchQuery}
                onChange={e => setSearchQuery(e.target.value)}
                className="toolbar__search-input"
              />
            </div>
            <div className="toolbar__divider" />
            <div className="toolbar__namespaces">
              {allNamespaces.map(name => {
                const active = selectedNamespaces.size === 0 || selectedNamespaces.has(name);
                return (
                  <button
                    key={name}
                    className={`chip ${active ? 'chip--active' : 'chip--inactive'}`}
                    onClick={() => toggleNamespace(name)}
                  >
                    {name}
                  </button>
                );
              })}
            </div>
          </div>
          <div className="filter-bar">
            {filterMeta.map(({ key, label, icon: Icon }) => {
              const on = resourceFilters[key];
              return (
                <button
                  key={key}
                  className={`filter-chip ${on ? 'filter-chip--on' : 'filter-chip--off'}`}
                  onClick={() => toggleFilter(key)}
                >
                  <Icon size={12} />
                  <span>{label}</span>
                </button>
              );
            })}
          </div>
          <div className="graph-area">
            <ClusterGraph
              namespaces={filteredNamespaces}
              nodes={clusterState?.nodes || []}
              searchQuery={searchQuery}
              resourceFilters={resourceFilters}
            />
          </div>
        </>
      )}
    </div>
  );
}

export default App;
