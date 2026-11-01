package api

import (
	"bufio"
	"context"
	"log"
	"os"
	"sort"
	"strconv"
	"strings"
	"sync"
	"time"

	corev1 "k8s.io/api/core/v1"
	"k8s.io/apimachinery/pkg/types"
	"k8s.io/client-go/kubernetes"
)

const (
	defaultRetentionTTL = time.Minute
	defaultRetentionMax = 100

	// Per container: how far back to start when a pod begins terminating,
	// and how many lines to keep in memory.
	captureTailLines = 500
	captureMaxLines  = 2000

	maxConcurrentCaptures = 32
	// After the delete event, keep streams open briefly to drain final lines.
	captureDrain = 5 * time.Second
)

// RetentionConfig from env: POD_RETENTION (e.g. 1m, 0 disables), POD_RETENTION_MAX.
type RetentionConfig struct {
	TTL     time.Duration
	MaxPods int
}

func LoadRetentionConfig() RetentionConfig {
	c := RetentionConfig{TTL: defaultRetentionTTL, MaxPods: defaultRetentionMax}
	if v := strings.TrimSpace(os.Getenv("POD_RETENTION")); v != "" {
		if d, err := time.ParseDuration(v); err == nil && d >= 0 {
			c.TTL = d
		} else {
			log.Printf("invalid POD_RETENTION %q, using %s", v, c.TTL)
		}
	}
	if v := strings.TrimSpace(os.Getenv("POD_RETENTION_MAX")); v != "" {
		if n, err := strconv.Atoi(v); err == nil && n > 0 {
			c.MaxPods = n
		}
	}
	return c
}

type LogLine struct {
	Timestamp string `json:"ts,omitempty"`
	Text      string `json:"text"`
}

// parseLogLine splits the RFC3339Nano prefix added by PodLogOptions.Timestamps.
func parseLogLine(raw string) LogLine {
	if i := strings.IndexByte(raw, ' '); i > 0 {
		if _, err := time.Parse(time.RFC3339Nano, raw[:i]); err == nil {
			return LogLine{Timestamp: raw[:i], Text: raw[i+1:]}
		}
	}
	return LogLine{Text: raw}
}

// lineRing keeps roughly the most recent max lines.
type lineRing struct {
	lines []LogLine
	max   int
}

func (r *lineRing) add(l LogLine) {
	r.lines = append(r.lines, l)
	if len(r.lines) >= 2*r.max {
		r.lines = append([]LogLine(nil), r.lines[len(r.lines)-r.max:]...)
	}
}

func (r *lineRing) snapshot() []LogLine {
	start := 0
	if len(r.lines) > r.max {
		start = len(r.lines) - r.max
	}
	return append([]LogLine(nil), r.lines[start:]...)
}

// logCapture follows every container of a terminating pod so its final
// output survives the pod being deleted.
type logCapture struct {
	mu         sync.Mutex
	containers map[string]*lineRing
	cancel     context.CancelFunc
}

type retainedPod struct {
	namespace string
	pod       Pod
	logs      *logCapture
	deletedAt time.Time
	timer     *time.Timer
}

// RetentionStore keeps snapshots of deleted pods (status, termination
// reasons, captured logs) for a configurable TTL.
type RetentionStore struct {
	cfg      RetentionConfig
	client   kubernetes.Interface
	onChange func()
	sem      chan struct{}

	mu        sync.Mutex
	capturing map[types.UID]*logCapture
	retained  map[types.UID]*retainedPod
}

func NewRetentionStore(cfg RetentionConfig, client kubernetes.Interface) *RetentionStore {
	return &RetentionStore{
		cfg:       cfg,
		client:    client,
		sem:       make(chan struct{}, maxConcurrentCaptures),
		capturing: map[types.UID]*logCapture{},
		retained:  map[types.UID]*retainedPod{},
	}
}

func (r *RetentionStore) OnPodUpdate(old, cur *corev1.Pod) {
	if r.cfg.TTL <= 0 || cur.DeletionTimestamp == nil || old.DeletionTimestamp != nil {
		return
	}
	r.startCapture(cur)
}

func (r *RetentionStore) startCapture(p *corev1.Pod) {
	r.mu.Lock()
	if _, ok := r.capturing[p.UID]; ok {
		r.mu.Unlock()
		return
	}
	grace := int64(30)
	if p.DeletionGracePeriodSeconds != nil {
		grace = *p.DeletionGracePeriodSeconds
	}
	// Bound the capture in case the pod is stuck terminating (finalizers etc).
	ctx, cancel := context.WithTimeout(context.Background(), time.Duration(grace)*time.Second+30*time.Second)
	c := &logCapture{containers: map[string]*lineRing{}, cancel: cancel}
	for _, ctr := range p.Spec.Containers {
		c.containers[ctr.Name] = &lineRing{max: captureMaxLines}
	}
	r.capturing[p.UID] = c
	r.mu.Unlock()

	for name, ring := range c.containers {
		go r.follow(ctx, p.Namespace, p.Name, name, c, ring)
	}
}

func (r *RetentionStore) follow(ctx context.Context, ns, pod, container string, c *logCapture, ring *lineRing) {
	select {
	case r.sem <- struct{}{}:
		defer func() { <-r.sem }()
	default:
		log.Printf("log capture limit reached, skipping %s/%s[%s]", ns, pod, container)
		return
	}

	tail := int64(captureTailLines)
	stream, err := r.client.CoreV1().Pods(ns).GetLogs(pod, &corev1.PodLogOptions{
		Container:  container,
		Follow:     true,
		Timestamps: true,
		TailLines:  &tail,
	}).Stream(ctx)
	if err != nil {
		log.Printf("log capture %s/%s[%s]: %v", ns, pod, container, err)
		return
	}
	defer stream.Close()

	scanner := bufio.NewScanner(stream)
	scanner.Buffer(make([]byte, 64*1024), 1024*1024)
	for scanner.Scan() {
		line := parseLogLine(scanner.Text())
		c.mu.Lock()
		ring.add(line)
		c.mu.Unlock()
	}
}

// OnPodDelete stores a snapshot of p. snapshot is the pod as last built for
// the UI; its status is rewritten to reflect deletion.
func (r *RetentionStore) OnPodDelete(p *corev1.Pod, snapshot Pod) {
	r.mu.Lock()
	capture := r.capturing[p.UID]
	delete(r.capturing, p.UID)

	if r.cfg.TTL <= 0 {
		r.mu.Unlock()
		if capture != nil {
			capture.cancel()
		}
		return
	}

	now := time.Now()
	snapshot.Retained = &RetainedInfo{
		DeletedAt:    now.Format(time.RFC3339),
		ExpiresAt:    now.Add(r.cfg.TTL).Format(time.RFC3339),
		LastStatus:   deriveContainerStatus(p),
		LogsCaptured: capture != nil,
	}
	snapshot.EffectiveStatus = "Deleted"
	snapshot.Usage = nil

	uid := p.UID
	rp := &retainedPod{namespace: p.Namespace, pod: snapshot, logs: capture, deletedAt: now}
	rp.timer = time.AfterFunc(r.cfg.TTL, func() { r.expire(uid) })
	if prev, ok := r.retained[uid]; ok {
		prev.timer.Stop()
	}
	r.retained[uid] = rp
	r.evictOverflowLocked()
	r.mu.Unlock()

	if capture != nil {
		time.AfterFunc(captureDrain, capture.cancel)
	}
}

func (r *RetentionStore) evictOverflowLocked() {
	for len(r.retained) > r.cfg.MaxPods {
		var oldestUID types.UID
		var oldest *retainedPod
		for uid, rp := range r.retained {
			if oldest == nil || rp.deletedAt.Before(oldest.deletedAt) {
				oldestUID, oldest = uid, rp
			}
		}
		oldest.timer.Stop()
		delete(r.retained, oldestUID)
	}
}

func (r *RetentionStore) expire(uid types.UID) {
	r.mu.Lock()
	_, ok := r.retained[uid]
	delete(r.retained, uid)
	r.mu.Unlock()
	if ok && r.onChange != nil {
		r.onChange()
	}
}

func (r *RetentionStore) PodsFor(ns string) []Pod {
	r.mu.Lock()
	defer r.mu.Unlock()
	var out []Pod
	for _, rp := range r.retained {
		if rp.namespace == ns {
			out = append(out, rp.pod)
		}
	}
	sort.Slice(out, func(i, j int) bool { return out[i].Name < out[j].Name })
	return out
}

// Logs returns captured lines for a retained pod. found is false if the pod
// is not (or no longer) retained.
func (r *RetentionStore) Logs(uid types.UID, container string) (lines []LogLine, found bool) {
	r.mu.Lock()
	rp, ok := r.retained[uid]
	r.mu.Unlock()
	if !ok {
		return nil, false
	}
	if rp.logs == nil {
		return nil, true
	}
	rp.logs.mu.Lock()
	defer rp.logs.mu.Unlock()
	if container == "" && len(rp.pod.ContainerStatuses) > 0 {
		container = rp.pod.ContainerStatuses[0].Name
	}
	if ring, ok := rp.logs.containers[container]; ok {
		return ring.snapshot(), true
	}
	return nil, true
}
