package metrics

import (
	"context"
	"log"
	"sync"
	"time"

	"k8s.io/client-go/rest"
)

type Manager struct {
	provider Provider
	interval time.Duration
	timeout  time.Duration
	// OnUpdate runs after each scrape (success or failure).
	OnUpdate func()

	mu     sync.RWMutex
	snap   *Snapshot
	status Status
}

func NewManager(cfg Config, restCfg *rest.Config) (*Manager, error) {
	m := &Manager{
		interval: cfg.Interval,
		timeout:  cfg.Timeout,
		status: Status{
			Provider:  cfg.Provider,
			Available: false,
			Message:   "not started",
		},
	}

	switch cfg.Provider {
	case "", "none", "off", "disabled":
		m.status = Status{
			Provider:  "none",
			Available: false,
			Message:   "metrics disabled (METRICS_PROVIDER=none)",
		}
		return m, nil
	case "metrics-server", "metricsserver", "metrics_server":
		p, err := NewMetricsServerProvider(restCfg)
		if err != nil {
			return nil, err
		}
		m.provider = p
		m.status.Provider = p.Name()
		m.status.Message = "waiting for first scrape"
	default:
		log.Printf("unknown METRICS_PROVIDER=%q, metrics disabled", cfg.Provider)
		m.status = Status{
			Provider:  "none",
			Available: false,
			Message:   "unknown provider; set METRICS_PROVIDER=metrics-server or none",
		}
	}
	return m, nil
}

func (m *Manager) Start(ctx context.Context) {
	if m.provider == nil {
		return
	}
	m.scrape(ctx)

	t := time.NewTicker(m.interval)
	defer t.Stop()
	for {
		select {
		case <-ctx.Done():
			return
		case <-t.C:
			m.scrape(ctx)
		}
	}
}

func (m *Manager) scrape(parent context.Context) {
	ctx, cancel := context.WithTimeout(parent, m.timeout)
	defer cancel()

	snap, err := m.provider.Fetch(ctx)
	m.mu.Lock()
	if err != nil {
		m.status.Available = false
		m.status.Message = err.Error()
		log.Printf("metrics scrape failed (%s): %v", m.provider.Name(), err)
		m.mu.Unlock()
		if m.OnUpdate != nil {
			m.OnUpdate()
		}
		return
	}
	snap.ScrapedAt = time.Now().UTC()
	m.snap = snap
	m.status.Available = true
	m.status.Message = "ok"
	m.status.ScrapedAt = snap.ScrapedAt.Format(time.RFC3339)
	m.mu.Unlock()
	if m.OnUpdate != nil {
		m.OnUpdate()
	}
}

func (m *Manager) Snapshot() *Snapshot {
	m.mu.RLock()
	defer m.mu.RUnlock()
	return m.snap
}

func (m *Manager) Status() Status {
	m.mu.RLock()
	defer m.mu.RUnlock()
	return m.status
}

func (m *Manager) PodUsage(namespace, name string) (ResourceUsage, bool) {
	m.mu.RLock()
	defer m.mu.RUnlock()
	if m.snap == nil {
		return ResourceUsage{}, false
	}
	u, ok := m.snap.Pods[namespace+"/"+name]
	return u, ok
}

func (m *Manager) NodeUsage(name string) (ResourceUsage, bool) {
	m.mu.RLock()
	defer m.mu.RUnlock()
	if m.snap == nil {
		return ResourceUsage{}, false
	}
	u, ok := m.snap.Nodes[name]
	return u, ok
}
