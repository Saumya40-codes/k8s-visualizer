package api

import (
	"testing"
	"time"

	corev1 "k8s.io/api/core/v1"
	metav1 "k8s.io/apimachinery/pkg/apis/meta/v1"
	"k8s.io/apimachinery/pkg/types"
)

func TestParseLogLine(t *testing.T) {
	l := parseLogLine("2026-10-12T10:00:00.123456789Z hello world")
	if l.Timestamp != "2026-10-12T10:00:00.123456789Z" || l.Text != "hello world" {
		t.Fatalf("got %+v", l)
	}
	if l := parseLogLine("no timestamp here"); l.Timestamp != "" || l.Text != "no timestamp here" {
		t.Fatalf("got %+v", l)
	}
}

func TestLineRingKeepsMostRecent(t *testing.T) {
	r := &lineRing{max: 3}
	for _, s := range []string{"a", "b", "c", "d", "e", "f", "g"} {
		r.add(LogLine{Text: s})
	}
	got := r.snapshot()
	if len(got) != 3 || got[0].Text != "e" || got[2].Text != "g" {
		t.Fatalf("got %+v", got)
	}
}

func TestRetentionExpiresAndEvicts(t *testing.T) {
	rs := NewRetentionStore(RetentionConfig{TTL: 50 * time.Millisecond, MaxPods: 1}, nil)
	changed := make(chan struct{}, 4)
	rs.onChange = func() { changed <- struct{}{} }

	mk := func(name, uid string) *corev1.Pod {
		return &corev1.Pod{
			ObjectMeta: metav1.ObjectMeta{Name: name, Namespace: "ns", UID: types.UID(uid)},
			Status: corev1.PodStatus{ContainerStatuses: []corev1.ContainerStatus{{
				Name:  "app",
				State: corev1.ContainerState{Terminated: &corev1.ContainerStateTerminated{Reason: "OOMKilled", ExitCode: 137}},
			}}},
		}
	}

	rs.OnPodDelete(mk("a", "1"), Pod{Name: "a", EffectiveStatus: "Terminating"})
	rs.OnPodDelete(mk("b", "2"), Pod{Name: "b", EffectiveStatus: "Terminating"})

	pods := rs.PodsFor("ns")
	if len(pods) != 1 || pods[0].Name != "b" {
		t.Fatalf("expected only newest pod retained, got %+v", pods)
	}
	if pods[0].EffectiveStatus != "Deleted" || pods[0].Retained.LastStatus != "OOMKilled" || pods[0].Retained.LogsCaptured {
		t.Fatalf("unexpected snapshot %+v / %+v", pods[0], pods[0].Retained)
	}

	select {
	case <-changed:
	case <-time.After(time.Second):
		t.Fatal("retained pod did not expire")
	}
	if len(rs.PodsFor("ns")) != 0 {
		t.Fatal("expected no retained pods after expiry")
	}
}

func TestRetentionDisabled(t *testing.T) {
	rs := NewRetentionStore(RetentionConfig{TTL: 0, MaxPods: 10}, nil)
	rs.OnPodDelete(&corev1.Pod{ObjectMeta: metav1.ObjectMeta{Name: "a", Namespace: "ns", UID: "1"}}, Pod{Name: "a"})
	if len(rs.PodsFor("ns")) != 0 {
		t.Fatal("retention disabled but pod retained")
	}
}
