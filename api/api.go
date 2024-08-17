package api

import (
	"context"
	"flag"
	"fmt"
	"path/filepath"
	"time"

	metav1 "k8s.io/apimachinery/pkg/apis/meta/v1"
	"k8s.io/client-go/kubernetes"
	"k8s.io/client-go/tools/clientcmd"
	"k8s.io/client-go/util/homedir"
)

type Pod struct {
	Name      string
	Status    string
	CreatedAt string
	UniqueID  string
	NodeName  string
	IP        string
}

type Deployment struct {
	Name      string
	Status    string
	CreatedAt string
	UniqueID  string
	Labels    map[string]string
}

type Service struct {
	Name      string
	SecretMap map[string]string
	Type      string
	CreatedAt string
	UniqueID  string
}

type Namespace struct {
	Name      string
	CreatedAt string
	UniqueID  string
}

var clientset *kubernetes.Clientset

func init() {
	var kubeconfig *string
	if home := homedir.HomeDir(); home != "" {
		kubeconfig = flag.String("kubeconfig", filepath.Join(home, ".kube", "config"), "(optional) absolute path to the kubeconfig file")
	} else {
		kubeconfig = flag.String("kubeconfig", "", "absolute path to the kubeconfig file")
	}
	flag.Parse()

	config, err := clientcmd.BuildConfigFromFlags("", *kubeconfig)
	if err != nil {
		panic(err.Error())
	}

	fmt.Println(config)

	clientset, err = kubernetes.NewForConfig(config)
	if err != nil {
		panic(err.Error())
	}
}

func StartMonitoring() {
	for {
		namespaces, err := clientset.CoreV1().Namespaces().List(context.TODO(), metav1.ListOptions{})
		if err != nil {
			panic(err.Error())
		}
		fmt.Printf("Found %d namespaces\n", len(namespaces.Items))
		for _, ns := range namespaces.Items {
			fmt.Printf("Namespace: %s\n", ns.Name)
		}
		time.Sleep(10 * time.Second)
	}
}
