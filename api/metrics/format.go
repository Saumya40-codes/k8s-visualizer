package metrics

import (
	"fmt"
	"strings"
	"time"

	"k8s.io/apimachinery/pkg/api/resource"
)

const timeRFC3339 = time.RFC3339

func quantityToUsage(cpu, mem *resource.Quantity, ts time.Time) ResourceUsage {
	var cpuMilli int64
	var memBytes int64
	if cpu != nil {
		cpuMilli = cpu.MilliValue()
	}
	if mem != nil {
		memBytes = mem.Value()
	}

	u := ResourceUsage{
		CPU:           FormatCPUCores(cpuMilli),
		Memory:        FormatGB(memBytes),
		CPUMillicores: &cpuMilli,
		MemoryBytes:   &memBytes,
	}
	if ts.IsZero() {
		u.Timestamp = time.Now().UTC().Format(time.RFC3339)
	} else {
		u.Timestamp = ts.UTC().Format(time.RFC3339)
	}
	return u
}

// FormatCPUCores formats millicores as cores. Uses more decimals for tiny values
// so low-usage pods do not show as "0.00".
func FormatCPUCores(milli int64) string {
	if milli < 0 {
		milli = 0
	}
	cores := float64(milli) / 1000.0
	switch {
	case cores == 0:
		return "0"
	case cores < 0.01:
		return trimZeros(fmt.Sprintf("%.4f", cores))
	case cores < 1:
		return trimZeros(fmt.Sprintf("%.3f", cores))
	default:
		return trimZeros(fmt.Sprintf("%.2f", cores))
	}
}

// FormatGB formats bytes as decimal GB. Small sizes get more precision so they
// do not collapse to "0.00 GB".
func FormatGB(b int64) string {
	if b < 0 {
		b = 0
	}
	const gb = 1000.0 * 1000.0 * 1000.0
	g := float64(b) / gb
	switch {
	case g == 0:
		return "0 GB"
	case g < 0.01:
		return trimZeros(fmt.Sprintf("%.4f", g)) + " GB"
	case g < 1:
		return trimZeros(fmt.Sprintf("%.3f", g)) + " GB"
	default:
		return trimZeros(fmt.Sprintf("%.2f", g)) + " GB"
	}
}

func trimZeros(s string) string {
	if !strings.Contains(s, ".") {
		return s
	}
	s = strings.TrimRight(s, "0")
	s = strings.TrimRight(s, ".")
	return s
}

func FormatCPUQuantity(q *resource.Quantity) string {
	if q == nil {
		return ""
	}
	return FormatCPUCores(q.MilliValue())
}

func FormatMemoryQuantity(q *resource.Quantity) string {
	if q == nil {
		return ""
	}
	return FormatGB(q.Value())
}
