// Package metrics provides pluggable resource-usage providers.
package metrics

import (
	"context"
	"time"
)

type ResourceUsage struct {
	CPU           string `json:"cpu,omitempty"`
	Memory        string `json:"memory,omitempty"`
	CPUMillicores *int64 `json:"cpu_millicores,omitempty"`
	MemoryBytes   *int64 `json:"memory_bytes,omitempty"`
	Timestamp     string `json:"timestamp,omitempty"`
}

type Snapshot struct {
	Pods      map[string]ResourceUsage // namespace/pod
	Nodes     map[string]ResourceUsage // node name
	ScrapedAt time.Time
}

type Status struct {
	Provider  string `json:"provider"`
	Available bool   `json:"available"`
	Message   string `json:"message,omitempty"`
	ScrapedAt string `json:"scraped_at,omitempty"`
}

type Provider interface {
	Name() string
	Fetch(ctx context.Context) (*Snapshot, error)
}
