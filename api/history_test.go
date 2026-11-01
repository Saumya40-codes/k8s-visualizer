package api

import (
	"bytes"
	"compress/gzip"
	"encoding/json"
	"fmt"
	"testing"
	"time"
)

func decodeSnapshot(t testing.TB, gz []byte) ClusterState {
	t.Helper()
	zr, err := gzip.NewReader(bytes.NewReader(gz))
	if err != nil {
		t.Fatal(err)
	}
	var st ClusterState
	if err := json.NewDecoder(zr).Decode(&st); err != nil {
		t.Fatal(err)
	}
	return st
}

func stateWithPods(pods ...Pod) *ClusterState {
	return &ClusterState{Namespaces: []Namespace{{
		rv: "1", Name: "default", UniqueID: "ns-uid", Pods: pods,
	}}}
}

func TestHistorySnapshotAtTime(t *testing.T) {
	h := NewHistory(HistoryConfig{Window: time.Minute, MaxBytes: 1 << 20})

	h.Record(stateWithPods(Pod{rv: "1", Name: "web", UniqueID: "a", EffectiveStatus: "Running"}))
	t1 := time.Now().UnixMilli()
	time.Sleep(5 * time.Millisecond)

	h.Record(stateWithPods(Pod{rv: "2", Name: "web", UniqueID: "a", EffectiveStatus: "OOMKilled"}))
	t2 := time.Now().UnixMilli()
	time.Sleep(5 * time.Millisecond)

	h.Record(stateWithPods()) // pod deleted
	t3 := time.Now().UnixMilli()

	for _, tc := range []struct {
		at     int64
		status string
	}{{t1, "Running"}, {t2, "OOMKilled"}, {t3, ""}} {
		gz, _, err := h.SnapshotGzip(tc.at)
		if err != nil {
			t.Fatal(err)
		}
		st := decodeSnapshot(t, gz)
		if len(st.Namespaces) != 1 {
			t.Fatalf("at %d: expected namespace, got %+v", tc.at, st)
		}
		pods := st.Namespaces[0].Pods
		if tc.status == "" {
			if len(pods) != 0 {
				t.Fatalf("at %d: expected no pods, got %+v", tc.at, pods)
			}
			continue
		}
		if len(pods) != 1 || pods[0].EffectiveStatus != tc.status {
			t.Fatalf("at %d: expected %s, got %+v", tc.at, tc.status, pods)
		}
	}

	info := h.Info()
	var types []string
	for _, m := range info.Markers {
		types = append(types, m.Type)
	}
	if fmt.Sprint(types) != "[error deleted]" {
		t.Fatalf("markers = %v", types)
	}
}

func TestHistorySkipsUnchangedAndUsageOnly(t *testing.T) {
	h := NewHistory(HistoryConfig{Window: time.Minute, MaxBytes: 1 << 20})
	p := Pod{rv: "1", Name: "web", UniqueID: "a", EffectiveStatus: "Running"}
	h.Record(stateWithPods(p))

	// Same resourceVersion, different usage: no new version.
	p.Usage = &ResourceUsage{CPU: "0.50"}
	h.Record(stateWithPods(p))
	// New resourceVersion but nothing displayed changed: no new version.
	p.rv = "2"
	h.Record(stateWithPods(p))

	if _, versions, _ := h.Stats(); versions != 2 { // namespace + pod
		t.Fatalf("expected 2 versions, got %d", versions)
	}
}

func TestHistoryMemoryBudgetAdvancesHorizon(t *testing.T) {
	h := NewHistory(HistoryConfig{Window: time.Hour, MaxBytes: 4 << 10})
	for i := 0; i < 200; i++ {
		h.Record(stateWithPods(Pod{rv: fmt.Sprint(i), Name: "web", UniqueID: "a", EffectiveStatus: fmt.Sprint("s", i)}))
		time.Sleep(time.Millisecond)
	}
	if _, _, b := h.Stats(); b > 4<<10 {
		t.Fatalf("history over budget: %d bytes", b)
	}
	if h.Info().OldestMs <= h.startMs {
		t.Fatal("expected horizon to move forward under memory pressure")
	}
}

// 5k pods where 1% change per build: the steady-state cost of Record.
func BenchmarkHistoryRecord5kPods(b *testing.B) {
	pods := make([]Pod, 5000)
	for i := range pods {
		pods[i] = Pod{
			rv: "1", Name: fmt.Sprintf("pod-%d", i), UniqueID: fmt.Sprintf("uid-%d", i),
			EffectiveStatus: "Running", Labels: map[string]string{"app": "x", "tier": "web"},
			ContainerStatuses: []ContainerStatus{{Name: "app", Ready: true, State: "running", Image: "nginx:1.27"}},
		}
	}
	h := NewHistory(HistoryConfig{Window: time.Minute, MaxBytes: 256 << 20})
	h.Record(stateWithPods(pods...))
	b.ResetTimer()
	for i := 0; i < b.N; i++ {
		for j := 0; j < 50; j++ {
			k := (i*50 + j) % len(pods)
			pods[k].rv = fmt.Sprint(i, "-", j)
			pods[k].EffectiveStatus = fmt.Sprint("s", i)
		}
		h.Record(stateWithPods(pods...))
	}
	b.StopTimer()
	objs, versions, bytes := h.Stats()
	b.ReportMetric(float64(bytes)/float64(versions), "B/version")
	_ = objs
}

func BenchmarkHistorySnapshot5kPods(b *testing.B) {
	pods := make([]Pod, 5000)
	for i := range pods {
		pods[i] = Pod{rv: "1", Name: fmt.Sprintf("pod-%d", i), UniqueID: fmt.Sprintf("uid-%d", i), EffectiveStatus: "Running"}
	}
	h := NewHistory(HistoryConfig{Window: time.Minute, MaxBytes: 256 << 20})
	h.Record(stateWithPods(pods...))
	at := time.Now().UnixMilli()
	b.ResetTimer()
	for i := 0; i < b.N; i++ {
		h.mu.Lock()
		h.cache = map[int64][]byte{} // measure the uncached path
		h.cacheKeys = nil
		h.mu.Unlock()
		if _, _, err := h.SnapshotGzip(at); err != nil {
			b.Fatal(err)
		}
	}
}
