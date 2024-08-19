import { useEffect, useState } from 'react';
import socket from './lib/socket';
import { Namespace } from './lib/types/namespaces';
import ClusterGraph from './components/ClusterGraph';
import './App.css';

function App() {
  const [namespaces, setNamespaces] = useState<Namespace[]>([]);
  
  useEffect(() => {
    socket.connect();

    socket.on('message', (receivedNamespaces: Namespace[]) => {
      console.log('Received namespaces:', receivedNamespaces);
      setNamespaces(receivedNamespaces);
    });

    return () => {
      socket.disconnect();
    };
  }, []);

  return (
    <div className="app-container">
      <ClusterGraph namespaces={namespaces} />
    </div>
  );
}

export default App;
