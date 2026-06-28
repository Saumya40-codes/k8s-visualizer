import { useEffect, useMemo, useState } from 'react';
import socket from './lib/socket';
import { ClusterState } from './lib/types/namespaces';
import {
  CircularProgress,
  createTheme,
  ThemeProvider,
  CssBaseline,
  Box,
  TextField,
  Chip,
  Typography,
  InputAdornment,
  Divider,
} from '@mui/material';
import SearchIcon from '@mui/icons-material/Search';
import FiberManualRecordIcon from '@mui/icons-material/FiberManualRecord';
import DnsIcon from '@mui/icons-material/Dns';
import StorageIcon from '@mui/icons-material/Storage';
import SettingsEthernetIcon from '@mui/icons-material/SettingsEthernet';
import LockIcon from '@mui/icons-material/Lock';
import DescriptionIcon from '@mui/icons-material/Description';
import LanguageIcon from '@mui/icons-material/Language';
import ViewModuleIcon from '@mui/icons-material/ViewModule';
import RepeatIcon from '@mui/icons-material/Repeat';
import WorkIcon from '@mui/icons-material/Work';
import ComputerIcon from '@mui/icons-material/Computer';
import ContentCopyIcon from '@mui/icons-material/ContentCopy';
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

const filterMeta: { key: keyof ResourceTypeFilter; label: string; icon: React.ReactElement }[] = [
  { key: 'node', label: 'Nodes', icon: <ComputerIcon sx={{ fontSize: 14 }} /> },
  { key: 'ingress', label: 'Ingress', icon: <LanguageIcon sx={{ fontSize: 14 }} /> },
  { key: 'service', label: 'Services', icon: <SettingsEthernetIcon sx={{ fontSize: 14 }} /> },
  { key: 'deployment', label: 'Deploys', icon: <StorageIcon sx={{ fontSize: 14 }} /> },
  { key: 'statefulset', label: 'StatefulSets', icon: <ViewModuleIcon sx={{ fontSize: 14 }} /> },
  { key: 'daemonset', label: 'DaemonSets', icon: <RepeatIcon sx={{ fontSize: 14 }} /> },
  { key: 'job', label: 'Jobs', icon: <WorkIcon sx={{ fontSize: 14 }} /> },
  { key: 'replicaset', label: 'ReplicaSets', icon: <ContentCopyIcon sx={{ fontSize: 14 }} /> },
  { key: 'pod', label: 'Pods', icon: <DnsIcon sx={{ fontSize: 14 }} /> },
  { key: 'secret', label: 'Secrets', icon: <LockIcon sx={{ fontSize: 14 }} /> },
  { key: 'configmap', label: 'ConfigMaps', icon: <DescriptionIcon sx={{ fontSize: 14 }} /> },
];

const darkTheme = createTheme({
  palette: {
    mode: 'dark',
    background: {
      default: '#1a1a2e',
      paper: '#16213e',
    },
    primary: { main: '#4ecca3' },
    secondary: { main: '#e94560' },
  },
});

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
    <ThemeProvider theme={darkTheme}>
      <CssBaseline />
      <div className="app-container">
        {loading ? (
          <div className="loader">
            <span className="loader-text">Connecting to cluster</span>
            <CircularProgress />
          </div>
        ) : (
          <>
            <Box className="toolbar">
              <Typography variant="h6" sx={{ color: '#4ecca3', fontWeight: 700, mr: 2, whiteSpace: 'nowrap' }}>
                K8s Visualizer
              </Typography>
              <Box sx={{ display: 'flex', alignItems: 'center', gap: 0.5, mr: 2 }}>
                <FiberManualRecordIcon sx={{ fontSize: 10, color: connected ? '#4ecca3' : '#e94560' }} />
                <Typography variant="caption" sx={{ color: '#8e8e93' }}>
                  {connected ? 'Connected' : 'Reconnecting...'}
                </Typography>
              </Box>
              <TextField
                size="small"
                placeholder="Search resources..."
                value={searchQuery}
                onChange={e => setSearchQuery(e.target.value)}
                sx={{
                  width: 200,
                  mr: 2,
                  '& .MuiOutlinedInput-root': {
                    background: '#1e2a4a',
                    borderRadius: 2,
                    fontSize: '0.8rem',
                  },
                }}
                InputProps={{
                  startAdornment: (
                    <InputAdornment position="start">
                      <SearchIcon sx={{ color: '#8e8e93', fontSize: 18 }} />
                    </InputAdornment>
                  ),
                }}
              />
              <Divider orientation="vertical" flexItem sx={{ borderColor: '#2a3a5a', mx: 1 }} />
              <Box sx={{ display: 'flex', gap: 0.5, flexWrap: 'wrap', flex: 1 }}>
                {allNamespaces.map(name => (
                  <Chip
                    key={name}
                    label={name}
                    size="small"
                    onClick={() => toggleNamespace(name)}
                    sx={{
                      fontSize: '0.7rem',
                      height: 24,
                      background:
                        selectedNamespaces.size === 0 || selectedNamespaces.has(name)
                          ? 'rgba(78, 204, 163, 0.2)'
                          : 'rgba(142, 142, 147, 0.1)',
                      color:
                        selectedNamespaces.size === 0 || selectedNamespaces.has(name)
                          ? '#4ecca3'
                          : '#6e6e73',
                      border: `1px solid ${
                        selectedNamespaces.size === 0 || selectedNamespaces.has(name)
                          ? 'rgba(78, 204, 163, 0.4)'
                          : 'rgba(142, 142, 147, 0.2)'
                      }`,
                      cursor: 'pointer',
                      '&:hover': { background: 'rgba(78, 204, 163, 0.3)' },
                    }}
                  />
                ))}
              </Box>
            </Box>
            <Box className="filter-bar">
              {filterMeta.map(({ key, label, icon }) => (
                <Chip
                  key={key}
                  icon={icon}
                  label={label}
                  size="small"
                  onClick={() => toggleFilter(key)}
                  sx={{
                    fontSize: '0.65rem',
                    height: 22,
                    background: resourceFilters[key]
                      ? 'rgba(78, 204, 163, 0.15)'
                      : 'rgba(233, 69, 96, 0.1)',
                    color: resourceFilters[key] ? '#4ecca3' : '#6e6e73',
                    border: `1px solid ${
                      resourceFilters[key]
                        ? 'rgba(78, 204, 163, 0.3)'
                        : 'rgba(233, 69, 96, 0.2)'
                    }`,
                    textDecoration: resourceFilters[key] ? 'none' : 'line-through',
                    cursor: 'pointer',
                    '& .MuiChip-icon': {
                      color: resourceFilters[key] ? '#4ecca3' : '#6e6e73',
                    },
                    '&:hover': {
                      background: resourceFilters[key]
                        ? 'rgba(78, 204, 163, 0.25)'
                        : 'rgba(233, 69, 96, 0.2)',
                    },
                  }}
                />
              ))}
            </Box>
            <Box className="graph-area">
              <ClusterGraph
                namespaces={filteredNamespaces}
                nodes={clusterState?.nodes || []}
                searchQuery={searchQuery}
                resourceFilters={resourceFilters}
              />
            </Box>
          </>
        )}
      </div>
    </ThemeProvider>
  );
}

export default App;
