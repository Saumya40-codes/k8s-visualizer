package api

import (
	"encoding/json"
	"fmt"
	"net/http"
	"sync"

	"github.com/rs/cors"
	"golang.org/x/net/websocket"
)

type Server struct {
	conns         map[*websocket.Conn]bool
	mu            sync.Mutex
	namespaceChan chan Namespace
}

var server *Server

func NewServer() *Server {
	return &Server{
		conns:         make(map[*websocket.Conn]bool),
		mu:            sync.Mutex{},
		namespaceChan: make(chan Namespace, 20),
	}
}

func (s *Server) handleConn(ws *websocket.Conn) {
	fmt.Println("New incoming connection...")

	s.mu.Lock()
	s.conns[ws] = true
	s.mu.Unlock()

	defer func() {
		s.mu.Lock()
		delete(s.conns, ws)
		s.mu.Unlock()
		ws.Close()
	}()

	s.readLoop(ws)
}

func (s *Server) readLoop(ws *websocket.Conn) {
	for {
		var message string
		err := websocket.Message.Receive(ws, &message)
		if err != nil {
			fmt.Println("Error receiving message:", err)
			break
		}
	}
}

func (s *Server) broadcastNamespaces() {

	fmt.Println("Broadcasting namespaces...")
	for {
		for namespace := range s.namespaceChan {
			fmt.Println("Received namespace:", namespace.Name)
			s.mu.Lock()
			for conn := range s.conns {
				jsonData, err := json.Marshal(namespace)
				if err != nil {
					fmt.Println("Error marshalling JSON:", err)
					continue
				}

				fmt.Println("Broadcasting namespace:", string(jsonData))
				err = websocket.Message.Send(conn, string(jsonData))
				if err != nil {
					fmt.Println("Error sending message:", err)
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

	handler := cors.Default().Handler(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		if r.URL.Path == "/ws" {
			websocket.Handler(server.handleConn).ServeHTTP(w, r)
		}
	}))

	go server.broadcastNamespaces()
	http.ListenAndServe(":5000", handler)
}
