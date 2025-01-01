package main

import (
	"log"
	"os"

	"github.com/Saumya40-codes/k8s-visualizer/api"
)

func init() {
	logFile, _ := os.OpenFile("k8s-visualize.log", os.O_CREATE|os.O_WRONLY|os.O_TRUNC, 0666)
	log.SetOutput(logFile)
}

func main() {
	log.Println("Starting monitoring your k8s cluster 🚀")
	api.StartMonitoring()
}
