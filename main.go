package main

import (
	"fmt"
  "os/exec"

	"github.com/Saumya40-codes/k8s-namespace-visualizer/api"
)

func main() {
	fmt.Println("🚀 Starting monitoring your k8s")
	go api.StartMonitoring()

  cmd := exec.Command("npm", "run", "dev")
	cmd.Dir = "./ui"

	err := cmd.Start()
	if err != nil {
		fmt.Printf("Error starting Visualizer app: %v\n", err)
		return
	}

  fmt.Println("😁 Visualizer started successfully!\nHeadover to http://localhost:5173")
	select {}
}
