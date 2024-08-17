import React, { useEffect, useState } from 'react';
import socket from './lib/socket';

function App() {
  const [namespaces, setNamespaces] = useState<any[]>([]);

  useEffect(() => {
    socket.connect();

    socket.on('message', (namespace: any) => {
      console.log('Received namespace:', namespace);
      setNamespaces(namespaces => [...namespaces, namespace]);
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
        {namespaces.map((ns, index) => (
          <li key={index}>{ns.Name}</li>
        ))}
      </ul>
    </div>
  );
}

export default App;