import { useEffect, useMemo, useState } from 'react';
import socket from './lib/socket';
import { ClusterState, Namespace } from './lib/types/namespaces';
import {
  Search, Server, Database, Network, Lock, FileText,
  Globe, LayoutGrid, Repeat, Briefcase, Monitor, Copy, Loader,
  ChevronLeft, ChevronRight, Sun, Moon,
  type LucideIcon,
} from 'lucide-react';
import ClusterGraph from './components/ClusterGraph';
import './App.css';

export type Theme = 'light' | 'dark';

const THEME_KEY = 'k8s-visualizer-theme';

function readStoredTheme(): Theme {
  try {
    const v = localStorage.getItem(THEME_KEY);
    if (v === 'dark' || v === 'light') return v;
  } catch { /* ignore */ }
  return 'light';
}

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

function countResources(ns: Namespace): number {
  return (
    (ns.pods?.length || 0) +
    (ns.deployments?.length || 0) +
    (ns.replica_sets?.length || 0) +
    (ns.services?.length || 0) +
    (ns.secrets?.length || 0) +
    (ns.config_maps?.length || 0) +
    (ns.ingresses?.length || 0) +
    (ns.stateful_sets?.length || 0) +
    (ns.daemon_sets?.length || 0) +
    (ns.jobs?.length || 0)
  );
}

function App() {
  const [clusterState, setClusterState] = useState<ClusterState | null>(null);
  const [loading, setLoading] = useState(true);
  const [connected, setConnected] = useState(false);
  const [searchQuery, setSearchQuery] = useState('');
  const [activeNamespace, setActiveNamespace] = useState<string | null>(null);
  const [resourceFilters, setResourceFilters] = useState<ResourceTypeFilter>({ ...defaultFilters });
  const [theme, setTheme] = useState<Theme>(() => readStoredTheme());

  useEffect(() => {
    document.documentElement.setAttribute('data-theme', theme);
    try { localStorage.setItem(THEME_KEY, theme); } catch { /* ignore */ }
  }, [theme]);

  const toggleTheme = () => setTheme(t => (t === 'light' ? 'dark' : 'light'));

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

  const allNamespaces = useMemo(() => {
    const list = clusterState?.namespaces || [];
    return [...list].sort((a, b) => a.name.localeCompare(b.name));
  }, [clusterState]);

  useEffect(() => {
    if (allNamespaces.length === 0) {
      setActiveNamespace(null);
      return;
    }
    setActiveNamespace(prev => {
      if (prev && allNamespaces.some(ns => ns.name === prev)) return prev;
      const preferred = allNamespaces.find(ns => ns.name === 'default')
        || allNamespaces.find(ns => ns.name === 'kube-system')
        || allNamespaces[0];
      return preferred.name;
    });
  }, [allNamespaces]);

  const activeIndex = useMemo(
    () => allNamespaces.findIndex(ns => ns.name === activeNamespace),
    [allNamespaces, activeNamespace]
  );

  const selectNamespace = (name: string) => {
    setActiveNamespace(name);
  };

  const goPrev = () => {
    if (allNamespaces.length === 0 || activeIndex < 0) return;
    const next = (activeIndex - 1 + allNamespaces.length) % allNamespaces.length;
    setActiveNamespace(allNamespaces[next].name);
  };

  const goNext = () => {
    if (allNamespaces.length === 0 || activeIndex < 0) return;
    const next = (activeIndex + 1) % allNamespaces.length;
    setActiveNamespace(allNamespaces[next].name);
  };

  const toggleFilter = (key: keyof ResourceTypeFilter) => {
    setResourceFilters(prev => ({ ...prev, [key]: !prev[key] }));
  };

  const focusedNamespaces = useMemo(() => {
    if (!clusterState || !activeNamespace) return [];
    return clusterState.namespaces.filter(ns => ns.name === activeNamespace);
  }, [clusterState, activeNamespace]);

  return (
    <div className="app-container">
      {loading ? (
        <div className="loader">
          <span className="loader-text">Connecting to cluster</span>
          <Loader size={24} className="loader-spin" />
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
            {clusterState?.metrics && (
              <div
                className="toolbar__metrics"
                title={clusterState.metrics.message || clusterState.metrics.provider}
              >
                <span
                  className={`status-dot ${clusterState.metrics.available ? 'status-dot--ok' : 'status-dot--err'}`}
                />
                <span className="toolbar__status-text">
                  {clusterState.metrics.available
                    ? `Metrics · ${clusterState.metrics.provider}`
                    : `Metrics off · ${clusterState.metrics.provider}`}
                </span>
              </div>
            )}
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
            <div className="toolbar__ns-switcher">
              <button
                className="ns-nav-btn"
                onClick={goPrev}
                disabled={allNamespaces.length <= 1}
                title="Previous namespace"
                aria-label="Previous namespace"
              >
                <ChevronLeft size={16} />
              </button>
              <div className="toolbar__namespaces">
                {allNamespaces.map(ns => {
                  const active = ns.name === activeNamespace;
                  const count = countResources(ns);
                  return (
                    <button
                      key={ns.name}
                      className={`chip ${active ? 'chip--active' : 'chip--inactive'}`}
                      onClick={() => selectNamespace(ns.name)}
                      title={`${ns.name} (${count} resources)`}
                    >
                      <span className="chip__name">{ns.name}</span>
                      <span className="chip__count">{count}</span>
                    </button>
                  );
                })}
              </div>
              <button
                className="ns-nav-btn"
                onClick={goNext}
                disabled={allNamespaces.length <= 1}
                title="Next namespace"
                aria-label="Next namespace"
              >
                <ChevronRight size={16} />
              </button>
            </div>
            {activeNamespace && (
              <div className="toolbar__active-ns" title="Currently viewing">
                <span className="toolbar__active-ns-label">Viewing</span>
                <span className="toolbar__active-ns-name">{activeNamespace}</span>
                {allNamespaces.length > 0 && activeIndex >= 0 && (
                  <span className="toolbar__active-ns-idx">
                    {activeIndex + 1}/{allNamespaces.length}
                  </span>
                )}
              </div>
            )}
            <button
              className="toolbar__theme-btn"
              onClick={toggleTheme}
              title={theme === 'light' ? 'Switch to dark' : 'Switch to light'}
              aria-label={theme === 'light' ? 'Switch to dark' : 'Switch to light'}
            >
              {theme === 'light' ? <Moon size={16} /> : <Sun size={16} />}
            </button>
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
            {focusedNamespaces.length === 0 ? (
              <div className="empty-ns">
                <span>No namespace selected</span>
              </div>
            ) : (
              <ClusterGraph
                namespaces={focusedNamespaces}
                nodes={clusterState?.nodes || []}
                searchQuery={searchQuery}
                resourceFilters={resourceFilters}
                focusKey={activeNamespace || ''}
                theme={theme}
              />
            )}
          </div>
        </>
      )}
    </div>
  );
}

export default App;
