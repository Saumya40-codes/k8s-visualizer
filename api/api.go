package api

import (
	"context"
	"flag"
	"fmt"
	"log"
	"os"
	"os/signal"
	"path/filepath"
	"sync"
	"syscall"

	"k8s.io/client-go/kubernetes"
	"k8s.io/client-go/rest"
	"k8s.io/client-go/tools/clientcmd"
	"k8s.io/client-go/util/homedir"
)

var (
	clientset  *kubernetes.Clientset
	kubeconfig string
)

func init() {
	if home := homedir.HomeDir(); home != "" {
		flag.StringVar(&kubeconfig, "kubeconfig", filepath.Join(home, ".kube", "config"), "(optional) absolute path to the kubeconfig file")
	} else {
		flag.StringVar(&kubeconfig, "kubeconfig", "", "absolute path to the kubeconfig file")
	}
	flag.Parse()

	config, err := clientcmd.BuildConfigFromFlags("", kubeconfig)
	if err != nil {
		log.Printf("Error building kubeconfig: %v", err)
		log.Println("Now using in-cluster configuration")

		config, err = rest.InClusterConfig()
		if err != nil {
			fmt.Println("Failed to create clientset, exiting...")
			log.Fatalf("Error building in-cluster config: %v", err)
			return
		}
	}

	clientset, err = kubernetes.NewForConfig(config)
	if err != nil {
		log.Fatalf("Error creating clientset: %v", err)
	}
}

func StartMonitoring() {
	server = NewServer()

	ctx, cancel := context.WithCancel(context.Background())
	defer cancel()

	sigCh := make(chan os.Signal, 1)
	signal.Notify(sigCh, syscall.SIGINT, syscall.SIGTERM)
	defer signal.Stop(sigCh)

	go func() {
		<-sigCh
		log.Println("signal received, shutting down monitoring")
		cancel()
	}()

	informerMgr := NewInformerManager(clientset, server.stateChan)
	server.informerMgr = informerMgr

	wg := sync.WaitGroup{}
	wg.Add(3)

	go func() {
		defer wg.Done()
		informerMgr.Start(ctx)
		<-ctx.Done()
	}()

	go func() {
		defer wg.Done()
		StartServer(ctx)
	}()

	go func() {
		defer wg.Done()
		StartUIServer(ctx, ":8081")
	}()

	<-ctx.Done()
	log.Println("StartMonitoring: context canceled")
	wg.Wait()
}
