package main

import (
	"fmt"
	"log"
	"os"
	"os/exec"

	"github.com/Saumya40-codes/k8s-visualizer/api"
)

func init() {
	logFile, _ := os.OpenFile("k8s-visualize.log", os.O_CREATE|os.O_WRONLY|os.O_TRUNC, 0666)
	log.SetOutput(logFile)
}

func main() {
	fmt.Println("🚀 Starting monitoring your k8s")
	log.Println("Monitoring started")
	go api.StartMonitoring()

	cmd := exec.Command("npm", "run", "dev")
	cmd.Dir = "./ui"

	err := cmd.Start()
	if err != nil {
		fmt.Printf("Error starting Visualizer app: %v\n", err)
		log.Printf("Error starting Visualizer app: %v\n", err)
		return
	}

	log.Println("Visualizer started")
	fmt.Println("😁 Visualizer started successfully!\nHeadover to http://localhost:5173")
	select {}
}
