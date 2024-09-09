# Kubernetes Cluster Visualizer

This project provides a tool for visualizing Kubernetes clusters using Golang for the backend and React for the frontend. It allows users to easily view and understand their Kubernetes cluster configuration.

## Features

- Visualize Kubernetes cluster configuration
- Out-of-cluster configuration support
- Backend powered by Golang
- Frontend built with React

## Coming Soon

- In-cluster configuration support

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

## Usage

1. Start the backend server:
   ```
   go run main.go
   ```

2. In a new terminal, start the frontend development server:
   ```
   cd ui
   npm run dev
   ```

3. Open your browser and navigate to `http://localhost:3000` (or the appropriate port)

4. Use the interface to visualize your Kubernetes cluster
