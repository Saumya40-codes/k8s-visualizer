import { useEffect, useState } from 'react';
import socket from './lib/socket';
import { Namespace } from './lib/types/namespaces';
import CircularProgress from '@mui/material/CircularProgress';
import { createTheme, ThemeProvider, CssBaseline } from '@mui/material';
import ClusterGraph from './components/ClusterGraph';
import './App.css';


const darkTheme = createTheme({
  palette: {
    mode: 'dark',
    background: {
      default: '#1a1a2e',
      paper: '#16213e',
    },
    primary: {
      main: '#4ecca3',
    },
    secondary: {
      main: '#e94560',
    },
  },
});

function App() {
  const [namespaces, setNamespaces] = useState<Namespace[]>([]);
  const [loading, setLoading] = useState<boolean>(true);
  
  useEffect(() => {
    socket.connect();

    socket.on('message', (receivedNamespaces: Namespace[]) => {
      setNamespaces(receivedNamespaces);
      setLoading(false);
    });

    return () => {
      socket.disconnect();
    };
  }, []);

  return (
    <div className="app-container">
      <ThemeProvider theme={darkTheme}>
      <CssBaseline />
      { loading? (
        <div className="loader">
          <span className="loader-text"> Getting your cluster info </span>
          <CircularProgress />
        </div>
      ):(
        <ClusterGraph namespaces={namespaces} />
      )}
      </ThemeProvider>
    </div>
  );
}

export default App;
