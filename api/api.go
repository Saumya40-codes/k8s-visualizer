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

	"github.com/Saumya40-codes/k8s-visualizer/api/metrics"
	"k8s.io/client-go/kubernetes"
	"k8s.io/client-go/rest"
	"k8s.io/client-go/tools/clientcmd"
	"k8s.io/client-go/util/homedir"
)

var (
	clientset  *kubernetes.Clientset
	restConfig *rest.Config
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

	restConfig = config
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

	metricsCfg := metrics.LoadConfig()
	metricsMgr, err := metrics.NewManager(metricsCfg, restConfig)
	if err != nil {
		log.Printf("metrics manager init failed (continuing without usage): %v", err)
	} else {
		informerMgr.SetUsageSource(metricsMgr)
		metricsMgr.OnUpdate = func() { informerMgr.PushState() }
		st := metricsMgr.Status()
		log.Printf("metrics provider=%s available=%v msg=%s", st.Provider, st.Available, st.Message)
	}

	wg := sync.WaitGroup{}
	wg.Add(4)

	go func() {
		defer wg.Done()
		informerMgr.Start(ctx)
		<-ctx.Done()
	}()

	go func() {
		defer wg.Done()
		if metricsMgr != nil {
			metricsMgr.Start(ctx)
		}
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
