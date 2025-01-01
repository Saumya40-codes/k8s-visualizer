# Kubernetes Cluster Visualizer

This project provides a tool for visualizing Kubernetes clusters using Golang for the backend and React for the frontend. It allows users to easily view and understand their Kubernetes cluster configuration.

## Features

- Visualize Kubernetes cluster configuration
- Out-of-cluster configuration support
- In-cluster configuration
- Backend powered by Golang
- Frontend built with React

## Overview
![image](https://github.com/user-attachments/assets/5ad9956b-bc15-4933-bcd2-558aed333dea)

![image](https://github.com/user-attachments/assets/a0524ed6-9084-4d87-8964-83d775b39a9c)


## Prerequisites

- Go (version 1.22.3 or higher)
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
https://raw.githubusercontent.com/Saumya40-codes/k8s-visualizer/refs/heads/master/yamls/all-in-one.yaml
```

   - Wait for respective deployments to get ready, you can check using
   
      ```
      kubectl get pods
      ```
      

2. Port forwarding (Or you can expose the service running (see: `kubectl get svc`)    you can see `kubectl get pods` to see pod full tag/name of your pod

   ```
   kubectl port-forward k8s-visualizer-frontend-yourrespectivetag 5173:5173
   ```
   and
   ```
   kubectl port-forward k8s-visualizer-backend-yourrespectivetag 8080:8080
   ```
3. Open your browser and navigate to `http://localhost:5173` (or the appropriate port)

4. Use the interface to visualize your Kubernetes cluster
