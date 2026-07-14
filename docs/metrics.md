# Metrics (pluggable usage)

Topology always comes from the **Kubernetes API**.  
Live **CPU / memory usage** is optional and comes from a pluggable provider.

## Current provider: Metrics Server

Default: `METRICS_PROVIDER=metrics-server`

Uses the standard `metrics.k8s.io` API (same source as `kubectl top`).

### Prerequisites

1. Metrics Server installed and healthy in the cluster  
   - minikube: `minikube addons enable metrics-server`  
   - kubeadm / others: [metrics-server install](https://github.com/kubernetes-sigs/metrics-server)
2. The visualizer’s kubeconfig / ServiceAccount can **get/list**  
   - `nodes.metrics.k8s.io`  
   - `pods.metrics.k8s.io`  
   (cluster-admin / default admin kubeconfig already can)

### Configuration

| Env | Default | Description |
|-----|---------|-------------|
| `METRICS_PROVIDER` | `metrics-server` | `metrics-server` or `none` |
| `METRICS_INTERVAL` | `15s` | How often to scrape |
| `METRICS_TIMEOUT` | `10s` | Per-scrape timeout |

Disable usage entirely:

```bash
export METRICS_PROVIDER=none
go run main.go
```

### Behaviour if Metrics Server is missing

The app **keeps working**. Topology still streams.  
UI shows **Metrics off** and pods/nodes omit the `usage` field.  
No crash, no hard dependency.

### What you get on each resource

**Pods**
- `usage.cpu` / `usage.memory` (live)
- `requests` / `limits` (from pod spec via core API)

**Nodes**
- `usage.cpu` / `usage.memory` (live)
- `capacity` / `allocatable` (core API)

### Future providers

The backend uses a small `Provider` interface so we can add later:

- Prometheus / Thanos (BYO URL + auth)
- Optional agent (cgroup / eBPF)

Without changing the UI contract (`usage` on pod/node + `metrics` status block).
