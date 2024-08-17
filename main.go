package main

import (
	"fmt"

	"github.com/Saumya40-codes/k8s-namespace-visualizer/api"
)

func main() {
	fmt.Println("Starting monitoring")
	api.StartMonitoring()
}
