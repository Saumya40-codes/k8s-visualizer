package main

import (
	"log"

	"github.com/Saumya40-codes/k8s-visualizer/api"
)

func init() {
	log.SetFlags(log.LstdFlags | log.Lshortfile)
}

func main() {
	log.Println("Starting monitoring your k8s cluster 🚀")
	api.StartMonitoring()
}
