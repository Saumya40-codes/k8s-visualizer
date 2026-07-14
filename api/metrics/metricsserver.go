package metrics

import (
	"context"
	"fmt"
	"log"

	metav1 "k8s.io/apimachinery/pkg/apis/meta/v1"
	"k8s.io/client-go/rest"
	metricsclient "k8s.io/metrics/pkg/client/clientset/versioned"
)

type MetricsServerProvider struct {
	client metricsclient.Interface
}

func NewMetricsServerProvider(cfg *rest.Config) (*MetricsServerProvider, error) {
	if cfg == nil {
		return nil, fmt.Errorf("rest config is nil")
	}
	mc, err := metricsclient.NewForConfig(cfg)
	if err != nil {
		return nil, fmt.Errorf("metrics client: %w", err)
	}
	return &MetricsServerProvider{client: mc}, nil
}

func (p *MetricsServerProvider) Name() string { return "metrics-server" }

func (p *MetricsServerProvider) Fetch(ctx context.Context) (*Snapshot, error) {
	snap := &Snapshot{
		Pods:  make(map[string]ResourceUsage),
		Nodes: make(map[string]ResourceUsage),
	}

	nodeList, err := p.client.MetricsV1beta1().NodeMetricses().List(ctx, metav1.ListOptions{})
	if err != nil {
		return nil, fmt.Errorf("list node metrics: %w", err)
	}
	for _, nm := range nodeList.Items {
		u := quantityToUsage(nm.Usage.Cpu(), nm.Usage.Memory(), nm.Timestamp.Time)
		snap.Nodes[nm.Name] = u
	}

	podList, err := p.client.MetricsV1beta1().PodMetricses("").List(ctx, metav1.ListOptions{})
	if err != nil {
		return nil, fmt.Errorf("list pod metrics: %w", err)
	}
	for _, pm := range podList.Items {
		var cpuTotal, memTotal int64
		for _, c := range pm.Containers {
			cpuTotal += c.Usage.Cpu().MilliValue()
			memTotal += c.Usage.Memory().Value()
		}
		cpuMilli := cpuTotal
		memBytes := memTotal
		u := ResourceUsage{
			CPU:           FormatCPUCores(cpuTotal),
			Memory:        FormatGB(memTotal),
			CPUMillicores: &cpuMilli,
			MemoryBytes:   &memBytes,
			Timestamp:     pm.Timestamp.UTC().Format(timeRFC3339),
		}
		key := pm.Namespace + "/" + pm.Name
		snap.Pods[key] = u
	}

	log.Printf("metrics-server: scraped %d nodes, %d pods", len(snap.Nodes), len(snap.Pods))
	return snap, nil
}
