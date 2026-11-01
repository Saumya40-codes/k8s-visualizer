package api

import (
	"bufio"
	"encoding/json"
	"fmt"
	"io"
	"net/http"
	"strconv"

	corev1 "k8s.io/api/core/v1"
	apierrors "k8s.io/apimachinery/pkg/api/errors"
	"k8s.io/apimachinery/pkg/types"
)

const (
	maxLogBytes = 4 << 20
	maxLogLines = 10000
)

type logsResponse struct {
	Lines     []LogLine `json:"lines"`
	Container string    `json:"container"`
	// "live" from the kubelet, or "retained" from a deleted pod's capture.
	Source    string `json:"source"`
	Truncated bool   `json:"truncated,omitempty"`
}

type logQuery struct {
	namespace, pod, container string
	uid                       types.UID
	sinceSeconds, tailLines   int64
	previous                  bool
}

func parseLogQuery(r *http.Request) (logQuery, error) {
	q := r.URL.Query()
	lq := logQuery{
		namespace: q.Get("namespace"),
		pod:       q.Get("pod"),
		container: q.Get("container"),
		uid:       types.UID(q.Get("uid")),
		previous:  q.Get("previous") == "1" || q.Get("previous") == "true",
	}
	if lq.namespace == "" || lq.pod == "" {
		return lq, fmt.Errorf("namespace and pod are required")
	}
	for key, dst := range map[string]*int64{"since": &lq.sinceSeconds, "tail": &lq.tailLines} {
		if v := q.Get(key); v != "" {
			n, err := strconv.ParseInt(v, 10, 64)
			if err != nil || n < 0 {
				return lq, fmt.Errorf("invalid %s", key)
			}
			*dst = n
		}
	}
	return lq, nil
}

// resolveLivePod checks the pod exists (and, if a uid was given, is the same
// instance) and fills in the default container.
func (s *Server) resolveLivePod(lq *logQuery) (int, error) {
	p, err := s.informerMgr.podLister.Pods(lq.namespace).Get(lq.pod)
	if err != nil || (lq.uid != "" && p.UID != lq.uid) {
		return http.StatusNotFound, fmt.Errorf("pod %s/%s not found (it may have been deleted)", lq.namespace, lq.pod)
	}
	if lq.container == "" && len(p.Spec.Containers) > 0 {
		lq.container = p.Spec.Containers[0].Name
	}
	return 0, nil
}

func (lq logQuery) options(follow bool) *corev1.PodLogOptions {
	opts := &corev1.PodLogOptions{
		Container:  lq.container,
		Timestamps: true,
		Previous:   lq.previous,
		Follow:     follow,
	}
	if lq.sinceSeconds > 0 {
		opts.SinceSeconds = &lq.sinceSeconds
	}
	if lq.tailLines > 0 {
		opts.TailLines = &lq.tailLines
	}
	if !follow {
		limit := int64(maxLogBytes)
		opts.LimitBytes = &limit
	}
	return opts
}

func writeJSONError(w http.ResponseWriter, status int, err error) {
	w.Header().Set("Content-Type", "application/json")
	w.WriteHeader(status)
	_ = json.NewEncoder(w).Encode(map[string]string{"error": err.Error()})
}

func kubeErrStatus(err error) int {
	if se, ok := err.(apierrors.APIStatus); ok && se.Status().Code != 0 {
		return int(se.Status().Code)
	}
	return http.StatusBadGateway
}

// handleLogs: GET /api/logs?namespace=&pod=&uid=&container=&since=<sec>&tail=<n>&previous=1
func (s *Server) handleLogs(w http.ResponseWriter, r *http.Request) {
	lq, err := parseLogQuery(r)
	if err != nil {
		writeJSONError(w, http.StatusBadRequest, err)
		return
	}
	if s.informerMgr == nil {
		writeJSONError(w, http.StatusServiceUnavailable, fmt.Errorf("not ready"))
		return
	}

	if rs := s.informerMgr.retention; rs != nil && lq.uid != "" {
		if lines, ok := rs.Logs(lq.uid, lq.container); ok {
			w.Header().Set("Content-Type", "application/json")
			_ = json.NewEncoder(w).Encode(logsResponse{
				Lines: nonNil(lines), Container: lq.container, Source: "retained",
			})
			return
		}
	}

	if status, err := s.resolveLivePod(&lq); err != nil {
		writeJSONError(w, status, err)
		return
	}

	stream, err := s.informerMgr.client.CoreV1().Pods(lq.namespace).GetLogs(lq.pod, lq.options(false)).Stream(r.Context())
	if err != nil {
		writeJSONError(w, kubeErrStatus(err), err)
		return
	}
	defer stream.Close()

	resp := logsResponse{Container: lq.container, Source: "live"}
	scanner := bufio.NewScanner(stream)
	scanner.Buffer(make([]byte, 64*1024), 1024*1024)
	for scanner.Scan() {
		resp.Lines = append(resp.Lines, parseLogLine(scanner.Text()))
		if len(resp.Lines) >= 2*maxLogLines {
			resp.Lines = append([]LogLine(nil), resp.Lines[len(resp.Lines)-maxLogLines:]...)
			resp.Truncated = true
		}
	}
	if len(resp.Lines) > maxLogLines {
		resp.Lines = resp.Lines[len(resp.Lines)-maxLogLines:]
		resp.Truncated = true
	}
	resp.Lines = nonNil(resp.Lines)
	w.Header().Set("Content-Type", "application/json")
	_ = json.NewEncoder(w).Encode(resp)
}

// handleLogStream follows logs as Server-Sent Events. Same query as handleLogs.
// Events: "line" (LogLine JSON), "error" (message), "end".
func (s *Server) handleLogStream(w http.ResponseWriter, r *http.Request) {
	flusher, ok := w.(http.Flusher)
	if !ok {
		writeJSONError(w, http.StatusInternalServerError, fmt.Errorf("streaming unsupported"))
		return
	}
	lq, err := parseLogQuery(r)
	if err != nil {
		writeJSONError(w, http.StatusBadRequest, err)
		return
	}

	w.Header().Set("Content-Type", "text/event-stream")
	w.Header().Set("Cache-Control", "no-cache")
	w.Header().Set("X-Accel-Buffering", "no")

	sendErr := func(err error) {
		fmt.Fprintf(w, "event: error\ndata: %s\n\n", jsonString(err.Error()))
		fmt.Fprint(w, "event: end\ndata: {}\n\n")
		flusher.Flush()
	}

	if s.informerMgr == nil {
		sendErr(fmt.Errorf("not ready"))
		return
	}
	if _, err := s.resolveLivePod(&lq); err != nil {
		sendErr(err)
		return
	}

	stream, err := s.informerMgr.client.CoreV1().Pods(lq.namespace).GetLogs(lq.pod, lq.options(true)).Stream(r.Context())
	if err != nil {
		sendErr(err)
		return
	}
	defer stream.Close()
	flusher.Flush()

	scanner := bufio.NewScanner(stream)
	scanner.Buffer(make([]byte, 64*1024), 1024*1024)
	for scanner.Scan() {
		data, _ := json.Marshal(parseLogLine(scanner.Text()))
		if _, err := fmt.Fprintf(w, "event: line\ndata: %s\n\n", data); err != nil {
			return
		}
		flusher.Flush()
	}
	if err := scanner.Err(); err != nil && err != io.EOF && r.Context().Err() == nil {
		sendErr(err)
		return
	}
	fmt.Fprint(w, "event: end\ndata: {}\n\n")
	flusher.Flush()
}

func jsonString(s string) string {
	b, _ := json.Marshal(s)
	return string(b)
}

func nonNil(lines []LogLine) []LogLine {
	if lines == nil {
		return []LogLine{}
	}
	return lines
}
