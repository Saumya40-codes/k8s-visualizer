package api

import (
	"encoding/json"
	"log"
	"net/http"
	"sync"

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

func StartServer() {
	server = NewServer()

	corsOptions := cors.Options{
		AllowedOrigins: []string{"http://localhost:5173", "ws://localhost:8080"},
		AllowedMethods: []string{"GET", "POST", "OPTIONS"},
		AllowedHeaders: []string{"*"},
		Debug:          true,
	}
	handler := cors.New(corsOptions).Handler(
		http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
			if r.URL.Path == "/ws" {
				wsHandler := websocket.Server{
					Handler: func(ws *websocket.Conn) {
						server.handleConn(ws)
					},
					Handshake: func(config *websocket.Config, r *http.Request) error {
						config.Origin, _ = websocket.Origin(config, r)
						return nil
					},
				}
				wsHandler.ServeHTTP(w, r)
			}
		}),
	)

	log.Println("Starting WebSocket server on :8080")
	if err := http.ListenAndServe(":8080", handler); err != nil {
		log.Fatal("ListenAndServe:", err)
	}
}
