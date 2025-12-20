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
	conns         map[*websocket.Conn]bool
	mu            sync.Mutex
	namespaceChan chan []Namespace
}

var server *Server

func NewServer() *Server {
	return &Server{
		conns:         make(map[*websocket.Conn]bool),
		mu:            sync.Mutex{},
		namespaceChan: make(chan []Namespace, 25),
	}
}

func (s *Server) handleConn(ws *websocket.Conn) {
	log.Println("New connection")

	s.mu.Lock()
	s.conns[ws] = true
	s.mu.Unlock()

	defer func() {
		s.mu.Lock()
		delete(s.conns, ws)
		s.mu.Unlock()
		ws.Close()
	}()

	server.broadcastNamespaces()
}

func (s *Server) broadcastNamespaces() {

	log.Println("Broadcasting namespaces to clients started")
	for {
		for namespace := range s.namespaceChan {
			s.mu.Lock()
			for conn := range s.conns {
				jsonData, err := json.Marshal(namespace)
				if err != nil {
					log.Printf("Error marshalling namespace data: %v", err)
					continue
				}

				err = websocket.Message.Send(conn, string(jsonData))
				if err != nil {
					log.Printf("Error sending data to client: %v", err)
					delete(s.conns, conn)
					conn.Close()
				}
			}

			s.mu.Unlock()
		}
	}
}

func StartServer(ctx context.Context) {
	handler := cors.New(cors.Options{
		AllowedOrigins: []string{"http://localhost:5173", "http://localhost:8081"},
		AllowedMethods: []string{"GET", "POST", "OPTIONS"},
		Debug:          true,
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
		log.Println("Shutting down WebSocket HTTP server")
		_ = srv.Shutdown(context.Background())
	}()

	log.Println("Starting WebSocket server on :8080")

	if err := srv.ListenAndServe(); err != nil && err != http.ErrServerClosed {
		log.Printf("WebSocket server error: %v", err)
	}

	log.Println("WebSocket HTTP server exited")
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
			log.Printf("UI Server Shutdown Failed:%+v", err)
		}
		log.Println("UI Server Exited Properly")
	}()

	log.Printf("Starting UI server on %s", webListenAddr)
	if err := srv.ListenAndServe(); err != nil && err != http.ErrServerClosed {
		log.Fatalf("UI Server ListenAndServe:%+v", err)
	}
}
