import { useEffect, useState } from 'react';
import socket from './lib/socket';
import { Namespace } from './lib/types/namespaces';
import ClusterGraph from './components/ClusterGraph';
import './App.css';

// here is the interface 

/*
interface Pod {
    name: string;
    status: string;
    created_at: string;
    unique_id: string;
    node_name: string;
    ip: string;
}

interface Deployment {
    name: string;
    status: string;
    created_at: string;
    unique_id: string;
    labels: Record<string, string>;
}

interface Service {
    name: string;
    type: string;
    created_at: string;
    unique_id: string;
}

export interface Namespace {
    name: string;
    created_at: string;
    unique_id: string;
    pods: Pod[] | null;
    deployments: Deployment[] | null;
    services: Service[] | null;
}
*/

const exampleData = [
  {
    name: 'default',
    created_at: '2021-07-01T00:00:00Z',
    unique_id: 'default-1',
    pods: [
      {
        name: 'pod-1',
        status: 'Running',
        created_at: '2021-07-01T00:00:00Z',
        unique_id: 'pod-1-1',
        node_name: 'node-1',
        ip: '2323.242',
      },
    ],
    deployments: [
      {
        name: 'deployment-1',
        status: 'Running',
        created_at: '2021-07-01T00:00:00Z',
        unique_id: 'deployment-1-1',
        labels: {
          app: 'app-1',
        },
      },
    ],
    services: [
      {
        name: 'service-1',
        type: 'ClusterIP',
        created_at: '2021-07-01T00:00:00Z',
        unique_id: 'service-1-1',
      },
    ],
  },
];
function App() {
  const [namespaces, setNamespaces] = useState<Namespace[]>([]);
  
  useEffect(() => {
    socket.connect();
    setNamespaces(exampleData);

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
