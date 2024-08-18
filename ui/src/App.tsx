import { useEffect, useState } from 'react';
import socket from './lib/socket';
import { Namespace } from './lib/types/namespaces';

function App() {
  const [namespaces, setNamespaces] = useState<Namespace[]>([]);
  useEffect(() => {
    socket.connect();

    socket.on('message', (receivedNamespaces: Namespace[]) => {
      console.log('Received namespaces:', receivedNamespaces);
      setNamespaces(receivedNamespaces);
    });

    socket.on('connect', () => {
      console.log('Connected to WebSocket');
    });

    socket.on('disconnect', () => {
      console.log('Disconnected from WebSocket');
    });

    return () => {
      socket.disconnect();
    };
  }, []);

  return (
    <div>
      <h1>Kubernetes Namespaces</h1>
      <ul>
      <h1>Namespace</h1>
        {namespaces.map((namespace) => (
          <li key={namespace.unique_id}>
            <h2>{namespace.name}</h2>
            <p>Created at: {namespace.created_at}</p>
            <h3>Pods</h3>
            <ul>
              {namespace.pods?.map((pod) => (
                <li key={pod.unique_id}>
                  <h4>{pod.name}</h4>
                  <p>Status: {pod.status}</p>
                  <p>Created at: {pod.created_at}</p>
                  <p>Node: {pod.node_name}</p>
                  <p>IP: {pod.ip}</p>
                </li>
              ))}
            </ul>
            <h3>Deployments</h3>
            <ul>
              {namespace.deployments?.map((deployment) => (
                <li key={deployment.unique_id}>
                  <h4>{deployment.name}</h4>
                  <p>Status: {deployment.status}</p>
                  <p>Created at: {deployment.created_at}</p>
                  <p>Labels: {JSON.stringify(deployment.labels)}</p>
                </li>
              ))}
            </ul>
            <h3>Services</h3>
            <ul>
              {namespace.services?.map((service) => (
                <li key={service.unique_id}>
                  <h4>{service.name}</h4>
                  <p>Type: {service.type}</p>
                  <p>Created at: {service.created_at}</p>
                </li>
              ))}
            </ul>
          </li>
        ))}
      </ul>
    </div>
  );
}

export default App;