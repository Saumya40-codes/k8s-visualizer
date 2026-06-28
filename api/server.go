package api

import (
	"context"
	"encoding/json"
	"log"
	"net/http"
	"sync"

	"github.com/Saumya40-codes/k8s-visualizer/ui"
	"github.com/rs/cors"
	"golang.org/x/net/websocket"
)

type Server struct {
	conns       map[*websocket.Conn]bool
	mu          sync.Mutex
	stateChan   chan ClusterState
	informerMgr *InformerManager
}

var server *Server

func NewServer() *Server {
	return &Server{
		conns:     make(map[*websocket.Conn]bool),
		stateChan: make(chan ClusterState, 10),
	}
}

func (s *Server) handleConn(ws *websocket.Conn) {
	log.Println("New WebSocket connection")

	s.mu.Lock()
	s.conns[ws] = true
	s.mu.Unlock()

	// Send current cached state immediately so the client doesn't wait
	if s.informerMgr != nil {
		if state := s.informerMgr.GetCachedState(); state != nil {
			jsonData, err := json.Marshal(state)
			if err == nil {
				_ = websocket.Message.Send(ws, string(jsonData))
			}
		}
	}

	// Keep connection open, read loop to detect disconnect
	for {
		var msg string
		if err := websocket.Message.Receive(ws, &msg); err != nil {
			break
		}
	}

	s.mu.Lock()
	delete(s.conns, ws)
	s.mu.Unlock()
	ws.Close()
}

func (s *Server) broadcastLoop(ctx context.Context) {
	for {
		select {
		case <-ctx.Done():
			return
		case state := <-s.stateChan:
			jsonData, err := json.Marshal(state)
			if err != nil {
				log.Printf("Error marshalling state: %v", err)
				continue
			}

			s.mu.Lock()
			for conn := range s.conns {
				if err := websocket.Message.Send(conn, string(jsonData)); err != nil {
					log.Printf("Error sending to client: %v", err)
					delete(s.conns, conn)
					conn.Close()
				}
			}
			s.mu.Unlock()
		}
	}
}

func StartServer(ctx context.Context) {
	go server.broadcastLoop(ctx)

	handler := cors.New(cors.Options{
		AllowedOrigins: []string{"http://localhost:5173", "http://localhost:8081"},
		AllowedMethods: []string{"GET", "POST", "OPTIONS"},
	}).Handler(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		if r.URL.Path == "/ws" {
			wsHandler := websocket.Server{
				Handler: func(ws *websocket.Conn) {
					server.handleConn(ws)
				},
			}
			wsHandler.ServeHTTP(w, r)
		}
	}))

	srv := &http.Server{
		Addr:    ":8080",
		Handler: handler,
	}

	go func() {
		<-ctx.Done()
		log.Println("Shutting down WebSocket server")
		_ = srv.Shutdown(context.Background())
	}()

	log.Println("Starting WebSocket server on :8080")
	if err := srv.ListenAndServe(); err != nil && err != http.ErrServerClosed {
		log.Printf("WebSocket server error: %v", err)
	}
}

func StartUIServer(ctx context.Context, webListenAddr string) {
	mux := http.NewServeMux()
	mux.Handle("/", ui.Handler())

	srv := &http.Server{
		Addr:    webListenAddr,
		Handler: mux,
	}

	go func() {
		<-ctx.Done()
		if err := srv.Shutdown(context.Background()); err != nil {
			log.Printf("UI server shutdown failed: %v", err)
		}
	}()

	log.Printf("Starting UI server on %s", webListenAddr)
	if err := srv.ListenAndServe(); err != nil && err != http.ErrServerClosed {
		log.Fatalf("UI server error: %v", err)
	}
}
