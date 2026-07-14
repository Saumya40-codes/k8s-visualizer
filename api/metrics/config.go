package metrics

import (
	"os"
	"strings"
	"time"
)

// Config from env: METRICS_PROVIDER, METRICS_INTERVAL, METRICS_TIMEOUT.
type Config struct {
	Provider string
	Interval time.Duration
	Timeout  time.Duration
}

func LoadConfig() Config {
	c := Config{
		Provider: "metrics-server",
		Interval: 15 * time.Second,
		Timeout:  10 * time.Second,
	}
	if v := strings.TrimSpace(os.Getenv("METRICS_PROVIDER")); v != "" {
		c.Provider = strings.ToLower(v)
	}
	if v := strings.TrimSpace(os.Getenv("METRICS_INTERVAL")); v != "" {
		if d, err := time.ParseDuration(v); err == nil && d > 0 {
			c.Interval = d
		}
	}
	if v := strings.TrimSpace(os.Getenv("METRICS_TIMEOUT")); v != "" {
		if d, err := time.ParseDuration(v); err == nil && d > 0 {
			c.Timeout = d
		}
	}
	return c
}
