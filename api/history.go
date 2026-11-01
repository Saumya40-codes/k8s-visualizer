package api

import (
	"bytes"
	"compress/gzip"
	"encoding/json"
	"fmt"
	"hash/fnv"
	"io"
	"log"
	"net/http"
	"os"
	"sort"
	"strconv"
	"strings"
	"sync"
	"time"
)

const (
	defaultHistoryWindow   = 5 * time.Minute
	defaultHistoryMaxBytes = 64 << 20

	historyGCInterval = 5 * time.Second
	// Rough per-version bookkeeping cost on top of the payload bytes.
	versionOverhead = 48
	maxMarkers      = 500
	snapshotCacheN  = 16
)

// HistoryConfig from env: HISTORY_WINDOW (e.g. 5m, 0 disables), HISTORY_MAX_MB.
type HistoryConfig struct {
	Window   time.Duration
	MaxBytes int64
}

func LoadHistoryConfig() HistoryConfig {
	c := HistoryConfig{Window: defaultHistoryWindow, MaxBytes: defaultHistoryMaxBytes}
	if v := strings.TrimSpace(os.Getenv("HISTORY_WINDOW")); v != "" {
		if d, err := time.ParseDuration(v); err == nil && d >= 0 {
			c.Window = d
		} else {
			log.Printf("invalid HISTORY_WINDOW %q, using %s", v, c.Window)
		}
	}
	if v := strings.TrimSpace(os.Getenv("HISTORY_MAX_MB")); v != "" {
		if n, err := strconv.Atoi(v); err == nil && n > 0 {
			c.MaxBytes = int64(n) << 20
		}
	}
	return c
}

// HistoryInfo is pushed with every live state so the UI can draw the timeline.
type HistoryInfo struct {
	WindowSeconds int      `json:"window_seconds"`
	OldestMs      int64    `json:"oldest_ms"`
	Markers       []Marker `json:"markers"`
}

// Marker is a notable change shown on the timeline.
type Marker struct {
	AtMs      int64  `json:"t"`
	Type      string `json:"type"` // created | deleted | error
	Namespace string `json:"ns,omitempty"`
	Kind      string `json:"kind"`
	Name      string `json:"name"`
	Status    string `json:"status,omitempty"`
}

type objKind uint8

const (
	kNamespace objKind = iota
	kPod
	kDeployment
	kReplicaSet
	kService
	kSecret
	kConfigMap
	kIngress
	kStatefulSet
	kDaemonSet
	kJob
	kNode
)

var kindNames = [...]string{"namespace", "pod", "deployment", "replicaset", "service", "secret",
	"configmap", "ingress", "statefulset", "daemonset", "job", "node"}

type objKey struct {
	kind objKind
	uid  string
}

// version is one encoded state of an object, valid for [from, to) in unix ms.
// to == 0 means it is the current version.
type version struct {
	from, to int64
	data     []byte
}

type objHistory struct {
	ns, name string
	versions []version
	fp       string // fingerprint (resourceVersion) of the current version
	hash     uint64 // hash of the current version's bytes
	status   string // pods only, for error markers
	seen     uint64 // generation of the last Record that included it
}

func (o *objHistory) open() bool {
	return len(o.versions) > 0 && o.versions[len(o.versions)-1].to == 0
}

// at returns the version valid at t, if any.
func (o *objHistory) at(t int64) []byte {
	i := sort.Search(len(o.versions), func(i int) bool { return o.versions[i].from > t }) - 1
	if i < 0 {
		return nil
	}
	if v := o.versions[i]; v.to == 0 || t < v.to {
		return v.data
	}
	return nil
}

type nsMeta struct {
	Name      string `json:"name"`
	CreatedAt string `json:"created_at"`
	UniqueID  string `json:"unique_id"`
}

// History records how the cluster changes so past states can be rebuilt.
//
// Storage is per object, as a list of versions with validity intervals, so
// memory grows with the rate of change rather than (objects x time). Objects
// whose resourceVersion is unchanged are skipped without encoding; volatile
// fields (usage) and events are not versioned at all.
type History struct {
	cfg HistoryConfig

	mu        sync.RWMutex
	objs      map[objKey]*objHistory
	bytes     int64
	gen       uint64
	startMs   int64
	oldestMs  int64
	lastGC    int64
	markers   []Marker
	events    map[string][]Event
	cache     map[int64][]byte // second bucket -> gzipped snapshot
	cacheKeys []int64
}

func NewHistory(cfg HistoryConfig) *History {
	now := time.Now().UnixMilli()
	return &History{
		cfg:      cfg,
		objs:     map[objKey]*objHistory{},
		startMs:  now,
		oldestMs: now,
		events:   map[string][]Event{},
		cache:    map[int64][]byte{},
	}
}

func (h *History) Enabled() bool { return h != nil && h.cfg.Window > 0 }

// Record diffs state against the current versions. Calls must be serialized
// in build order (see InformerManager.buildAndPushState).
func (h *History) Record(state *ClusterState) {
	if !h.Enabled() {
		return
	}
	now := time.Now().UnixMilli()
	h.mu.Lock()
	defer h.mu.Unlock()

	h.gen++
	first := h.gen == 1
	events := make(map[string][]Event, len(state.Namespaces))

	for i := range state.Namespaces {
		ns := &state.Namespaces[i]
		events[ns.Name] = ns.Events
		if !h.touch(kNamespace, ns.UniqueID, ns.rv) {
			h.observe(kNamespace, ns.UniqueID, ns.Name, ns.Name, ns.rv, "",
				nsMeta{Name: ns.Name, CreatedAt: ns.CreatedAt, UniqueID: ns.UniqueID}, now, first)
		}

		for _, p := range ns.Pods {
			if p.Retained != nil {
				continue // deletion is already recorded as the version closing
			}
			if !h.touch(kPod, p.UniqueID, p.rv) {
				p.Usage = nil
				h.observe(kPod, p.UniqueID, ns.Name, p.Name, p.rv, p.EffectiveStatus, p, now, first)
			}
		}
		for _, x := range ns.Deployments {
			if !h.touch(kDeployment, x.UniqueID, x.rv) {
				h.observe(kDeployment, x.UniqueID, ns.Name, x.Name, x.rv, "", x, now, first)
			}
		}
		for _, x := range ns.ReplicaSets {
			if !h.touch(kReplicaSet, x.UniqueID, x.rv) {
				h.observe(kReplicaSet, x.UniqueID, ns.Name, x.Name, x.rv, "", x, now, first)
			}
		}
		for _, x := range ns.Services {
			if !h.touch(kService, x.UniqueID, x.rv) {
				h.observe(kService, x.UniqueID, ns.Name, x.Name, x.rv, "", x, now, first)
			}
		}
		for _, x := range ns.Secrets {
			if !h.touch(kSecret, x.UniqueID, x.rv) {
				h.observe(kSecret, x.UniqueID, ns.Name, x.Name, x.rv, "", x, now, first)
			}
		}
		for _, x := range ns.ConfigMaps {
			if !h.touch(kConfigMap, x.UniqueID, x.rv) {
				h.observe(kConfigMap, x.UniqueID, ns.Name, x.Name, x.rv, "", x, now, first)
			}
		}
		for _, x := range ns.Ingresses {
			if !h.touch(kIngress, x.UniqueID, x.rv) {
				h.observe(kIngress, x.UniqueID, ns.Name, x.Name, x.rv, "", x, now, first)
			}
		}
		for _, x := range ns.StatefulSets {
			if !h.touch(kStatefulSet, x.UniqueID, x.rv) {
				h.observe(kStatefulSet, x.UniqueID, ns.Name, x.Name, x.rv, "", x, now, first)
			}
		}
		for _, x := range ns.DaemonSets {
			if !h.touch(kDaemonSet, x.UniqueID, x.rv) {
				h.observe(kDaemonSet, x.UniqueID, ns.Name, x.Name, x.rv, "", x, now, first)
			}
		}
		for _, x := range ns.Jobs {
			if !h.touch(kJob, x.UniqueID, x.rv) {
				h.observe(kJob, x.UniqueID, ns.Name, x.Name, x.rv, "", x, now, first)
			}
		}
	}
	for _, n := range state.Nodes {
		// PodCount is derived from pods, not the node object.
		fp := n.rv + "/" + strconv.Itoa(n.PodCount)
		if !h.touch(kNode, n.UniqueID, fp) {
			n.Usage = nil
			h.observe(kNode, n.UniqueID, "", n.Name, fp, "", n, now, first)
		}
	}
	h.events = events

	for key, o := range h.objs {
		if o.seen != h.gen && o.open() {
			o.versions[len(o.versions)-1].to = now
			if key.kind == kPod {
				h.mark(Marker{AtMs: now, Type: "deleted", Namespace: o.ns, Kind: "pod", Name: o.name})
			}
		}
	}

	if now-h.lastGC >= historyGCInterval.Milliseconds() || h.bytes > h.cfg.MaxBytes {
		h.gcLocked(now)
	}
}

// touch is the allocation-free fast path: true if the object's current
// version already has this fingerprint.
func (h *History) touch(kind objKind, uid, fp string) bool {
	o := h.objs[objKey{kind, uid}]
	if o != nil && o.open() && fp != "" && o.fp == fp {
		o.seen = h.gen
		return true
	}
	return false
}

func (h *History) observe(kind objKind, uid, ns, name, fp, status string, v any, now int64, first bool) {
	key := objKey{kind, uid}
	o := h.objs[key]

	data, err := json.Marshal(v)
	if err != nil {
		log.Printf("history: encode %s %s/%s: %v", kindNames[kind], ns, name, err)
		return
	}
	hf := fnv.New64a()
	_, _ = hf.Write(data)
	sum := hf.Sum64()

	if o != nil && o.open() && o.hash == sum {
		// resourceVersion moved but nothing we display changed.
		o.fp, o.seen = fp, h.gen
		return
	}

	if o == nil {
		o = &objHistory{ns: ns, name: name}
		h.objs[key] = o
		if kind == kPod && !first {
			h.mark(Marker{AtMs: now, Type: "created", Namespace: ns, Kind: "pod", Name: name})
		}
	} else if o.open() {
		o.versions[len(o.versions)-1].to = now
	}
	if kind == kPod && status != o.status && isFailureStatus(status) {
		h.mark(Marker{AtMs: now, Type: "error", Namespace: ns, Kind: "pod", Name: name, Status: status})
	}

	o.versions = append(o.versions, version{from: now, data: data})
	o.fp, o.hash, o.status, o.seen = fp, sum, status, h.gen
	h.bytes += int64(len(data)) + versionOverhead
}

func isFailureStatus(s string) bool {
	s = strings.ToLower(s)
	for _, k := range []string{"crashloop", "error", "failed", "backoff", "errimagepull",
		"oomkilled", "evicted", "unschedulable", "deadlineexceeded", "invalidimagename"} {
		if strings.Contains(s, k) {
			return true
		}
	}
	return false
}

func (h *History) mark(m Marker) {
	h.markers = append(h.markers, m)
	if len(h.markers) > 2*maxMarkers {
		h.markers = append([]Marker(nil), h.markers[len(h.markers)-maxMarkers:]...)
	}
}

// gcLocked drops versions that ended before the window, then keeps moving
// the horizon forward while over the memory budget.
func (h *History) gcLocked(now int64) {
	h.lastGC = now
	horizon := now - h.cfg.Window.Milliseconds()
	h.pruneLocked(horizon)
	step := h.cfg.Window.Milliseconds() / 10
	for h.bytes > h.cfg.MaxBytes && horizon < now && step > 0 {
		horizon += step
		h.pruneLocked(horizon)
	}
}

func (h *History) pruneLocked(horizon int64) {
	if horizon <= h.oldestMs {
		return
	}
	for key, o := range h.objs {
		drop := 0
		for drop < len(o.versions) && o.versions[drop].to != 0 && o.versions[drop].to <= horizon {
			h.bytes -= int64(len(o.versions[drop].data)) + versionOverhead
			drop++
		}
		if drop == len(o.versions) {
			delete(h.objs, key)
		} else if drop > 0 {
			o.versions = append([]version(nil), o.versions[drop:]...)
		}
	}
	m := sort.Search(len(h.markers), func(i int) bool { return h.markers[i].AtMs > horizon })
	if m > 0 {
		h.markers = append([]Marker(nil), h.markers[m:]...)
	}
	h.oldestMs = horizon
	h.cache = map[int64][]byte{}
	h.cacheKeys = nil
}

func (h *History) Info() *HistoryInfo {
	if !h.Enabled() {
		return nil
	}
	h.mu.RLock()
	defer h.mu.RUnlock()
	markers := h.markers
	if len(markers) > maxMarkers {
		markers = markers[len(markers)-maxMarkers:]
	}
	return &HistoryInfo{
		WindowSeconds: int(h.cfg.Window / time.Second),
		OldestMs:      h.oldestMs,
		Markers:       append([]Marker{}, markers...),
	}
}

// Snapshot shapes mirror ClusterState, but objects stay as their stored
// JSON bytes so building a snapshot never decodes them.
type nsSnapshot struct {
	nsMeta
	Pods         []json.RawMessage `json:"pods"`
	Deployments  []json.RawMessage `json:"deployments"`
	ReplicaSets  []json.RawMessage `json:"replica_sets"`
	Services     []json.RawMessage `json:"services"`
	Secrets      []json.RawMessage `json:"secrets"`
	ConfigMaps   []json.RawMessage `json:"config_maps"`
	Ingresses    []json.RawMessage `json:"ingresses"`
	StatefulSets []json.RawMessage `json:"stateful_sets"`
	DaemonSets   []json.RawMessage `json:"daemon_sets"`
	Jobs         []json.RawMessage `json:"jobs"`
	Events       []Event           `json:"events"`
}

type clusterSnapshot struct {
	AtMs       int64             `json:"at_ms"`
	Namespaces []*nsSnapshot     `json:"namespaces"`
	Nodes      []json.RawMessage `json:"nodes"`
}

// SnapshotGzip returns the gzipped JSON cluster state at atMs (clamped to the
// recorded range) and the time actually used.
func (h *History) SnapshotGzip(atMs int64) ([]byte, int64, error) {
	now := time.Now().UnixMilli()
	h.mu.RLock()
	if atMs < h.oldestMs {
		atMs = h.oldestMs
	}
	if atMs > now {
		atMs = now
	}
	bucket := atMs / 1000
	// The last couple of seconds may still change; only cache settled time.
	cacheable := atMs < now-2000
	if cacheable {
		if gz, ok := h.cache[bucket]; ok {
			h.mu.RUnlock()
			return gz, atMs, nil
		}
	}
	snap := h.buildSnapshotLocked(atMs)
	h.mu.RUnlock()

	var buf bytes.Buffer
	zw, _ := gzip.NewWriterLevel(&buf, gzip.BestSpeed)
	if err := json.NewEncoder(zw).Encode(snap); err != nil {
		return nil, atMs, err
	}
	if err := zw.Close(); err != nil {
		return nil, atMs, err
	}
	gz := buf.Bytes()

	if cacheable {
		h.mu.Lock()
		if _, ok := h.cache[bucket]; !ok {
			h.cache[bucket] = gz
			h.cacheKeys = append(h.cacheKeys, bucket)
			if len(h.cacheKeys) > snapshotCacheN {
				delete(h.cache, h.cacheKeys[0])
				h.cacheKeys = h.cacheKeys[1:]
			}
		}
		h.mu.Unlock()
	}
	return gz, atMs, nil
}

func (h *History) buildSnapshotLocked(t int64) clusterSnapshot {
	snap := clusterSnapshot{AtMs: t}
	byNs := map[string]*nsSnapshot{}

	for key, o := range h.objs {
		if key.kind != kNamespace {
			continue
		}
		data := o.at(t)
		if data == nil {
			continue
		}
		ns := &nsSnapshot{}
		if err := json.Unmarshal(data, &ns.nsMeta); err != nil {
			continue
		}
		for _, e := range h.events[ns.Name] {
			if ts, err := time.Parse(time.RFC3339, e.FirstSeen); err == nil && ts.UnixMilli() > t {
				continue
			}
			ns.Events = append(ns.Events, e)
		}
		byNs[ns.Name] = ns
		snap.Namespaces = append(snap.Namespaces, ns)
	}

	for key, o := range h.objs {
		if key.kind == kNamespace {
			continue
		}
		data := o.at(t)
		if data == nil {
			continue
		}
		raw := json.RawMessage(data)
		if key.kind == kNode {
			snap.Nodes = append(snap.Nodes, raw)
			continue
		}
		ns := byNs[o.ns]
		if ns == nil {
			continue
		}
		switch key.kind {
		case kPod:
			ns.Pods = append(ns.Pods, raw)
		case kDeployment:
			ns.Deployments = append(ns.Deployments, raw)
		case kReplicaSet:
			ns.ReplicaSets = append(ns.ReplicaSets, raw)
		case kService:
			ns.Services = append(ns.Services, raw)
		case kSecret:
			ns.Secrets = append(ns.Secrets, raw)
		case kConfigMap:
			ns.ConfigMaps = append(ns.ConfigMaps, raw)
		case kIngress:
			ns.Ingresses = append(ns.Ingresses, raw)
		case kStatefulSet:
			ns.StatefulSets = append(ns.StatefulSets, raw)
		case kDaemonSet:
			ns.DaemonSets = append(ns.DaemonSets, raw)
		case kJob:
			ns.Jobs = append(ns.Jobs, raw)
		}
	}
	return snap
}

// Stats for logging/tests.
func (h *History) Stats() (objects int, versions int, bytes int64) {
	h.mu.RLock()
	defer h.mu.RUnlock()
	for _, o := range h.objs {
		versions += len(o.versions)
	}
	return len(h.objs), versions, h.bytes
}

// handleSnapshot: GET /api/snapshot?at=<unix ms>
func (s *Server) handleSnapshot(w http.ResponseWriter, r *http.Request) {
	if s.informerMgr == nil || !s.informerMgr.history.Enabled() {
		writeJSONError(w, http.StatusNotFound, fmt.Errorf("history disabled (HISTORY_WINDOW=0)"))
		return
	}
	at, err := strconv.ParseInt(r.URL.Query().Get("at"), 10, 64)
	if err != nil {
		writeJSONError(w, http.StatusBadRequest, fmt.Errorf("at must be unix milliseconds"))
		return
	}
	gz, _, err := s.informerMgr.history.SnapshotGzip(at)
	if err != nil {
		writeJSONError(w, http.StatusInternalServerError, err)
		return
	}
	w.Header().Set("Content-Type", "application/json")
	if strings.Contains(r.Header.Get("Accept-Encoding"), "gzip") {
		w.Header().Set("Content-Encoding", "gzip")
		_, _ = w.Write(gz)
		return
	}
	zr, err := gzip.NewReader(bytes.NewReader(gz))
	if err != nil {
		writeJSONError(w, http.StatusInternalServerError, err)
		return
	}
	_, _ = io.Copy(w, zr)
}
