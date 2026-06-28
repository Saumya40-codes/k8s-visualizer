# Kubernetes Cluster Visualizer

A real-time topology graph for Kubernetes clusters. Shows resources, their relationships (ownership, routing, scheduling), and health status as an interactive node-edge graph. Built with Go (backend) and React + React Flow (frontend).

## Overview
![main-dashboard](./docs/images/main-dashboard.png)

![err-image-pull](./docs/images/failing-pod.png)


## Features

- **Interactive topology graph** with nodes for Pods, Deployments, ReplicaSets, Services, Ingresses, StatefulSets, DaemonSets, Jobs, Secrets, ConfigMaps, and Nodes
- **Real-time updates** via Kubernetes informers (watch-based, not polling) over WebSocket
- **Relationship edges**: Deployment -> ReplicaSet -> Pod ownership, Service -> Pod label selector matching, Ingress -> Service routing
- **Namespace filtering** and **resource type toggles** with cascading visibility (hiding Deployments also hides their ReplicaSets and Pods)
- **Search** across all resource names
- **Resource detail panel** (resizable) showing labels, conditions, container statuses, events, and more
- **Cluster events** per namespace for debugging
- **Auto-reconnecting WebSocket** with exponential backoff
- Out-of-cluster and in-cluster configuration support

## Prerequisites

- Go (version 1.26 or higher)
- Node.js (version >= v20.10.0 or higher)
- npm (version >= 10.8 or higher)
- Access to a Kubernetes cluster

## Installation

1. Clone the repository:
   ```
   git clone https://github.com/Saumya40-codes/k8s-visualizer
   cd k8s-cluster-visualizer
   ```

2. Install backend dependencies:
   ```
   go mod tidy
   ```

3. Install frontend dependencies:
   ```
   cd ui
   npm install
   ```

## Usage (Out-of-cluster configuration)

0. Set the `KUBECONFIG` env variable
   ```
   EXPORT KUBECONFIG='path/to/your/.kube/config`
   ```
   
1. Start the backend server:
   ```
   go run main.go
   ```

2. In a new terminal, start the frontend development server.
   ```
   cd ui
   npm run dev
   ```

3. Open your browser and navigate to `http://localhost:5173` (or the appropriate port)

4. Use the interface to visualize your Kubernetes cluster


## Usage (In-cluster configuration)

1. Run the following command

```
kubectl create -f https://raw.githubusercontent.com/Saumya40-codes/k8s-visualizer/refs/heads/master/yamls/all-in-one.yaml
```

   - Wait for respective deployments to get ready, you can check using
   
      ```
      kubectl get pods
      ```
      

2. Port forwarding (Or you can expose the service running (see: `kubectl get svc`)    you can see `kubectl get pods` to see pod full tag/name of your pod
 
   ```bash
   kubectl port-forward svc/k8s-visualizer-backend-yourrespectivetag 8081:8081
   ```
   and 
   ```bash
   kubectl port-forward svc/k8s-visualizer-backend-yourrespectivetag 8080:8080
   ```

4. Open your browser and navigate to `http://localhost:8081` (or the appropriate port)

5. Use the interface to visualize your Kubernetes cluster

## Architecture

```
┌─────────────┐     WebSocket      ┌──────────────────────────────┐
│  React UI   │ <----------------> │  Go Backend (:8080 WS)       │
│  (:8081)    │                    │                              │
│  React Flow │                    │  SharedInformerFactory        │
│  topology   │                    │  ├── Watch Pods, Deployments │
│  graph      │                    │  ├── Watch Services, Ingress │
│             │                    │  ├── Watch Nodes, Events ... │
│             │                    │  └── Cache (in-memory)       │
└─────────────┘                    └──────────────────────────────┘
                                              │
                                              │ List + Watch
                                              v
                                   ┌──────────────────────┐
                                   │  Kubernetes API      │
                                   │  Server               │
                                   └──────────────────────┘
```

The backend uses Kubernetes informers instead of polling. On startup it does a full List to populate an in-memory cache, then switches to Watch for incremental updates. Any change triggers a debounced state rebuild that gets pushed to all connected WebSocket clients.
