package api

import (
	"context"
	"flag"
	"path/filepath"
	"time"

	metav1 "k8s.io/apimachinery/pkg/apis/meta/v1"
	"k8s.io/client-go/kubernetes"
	"k8s.io/client-go/tools/clientcmd"
	"k8s.io/client-go/util/homedir"
)

type Pod struct {
	Name      string `json:"name"`
	Status    string `json:"status"`
	CreatedAt string `json:"created_at"`
	UniqueID  string `json:"unique_id"`
	NodeName  string `json:"node_name"`
	IP        string `json:"ip"`
}

type Deployment struct {
	Name      string            `json:"name"`
	Status    string            `json:"status"`
	CreatedAt string            `json:"created_at"`
	UniqueID  string            `json:"unique_id"`
	Labels    map[string]string `json:"labels"`
}

type Service struct {
	Name      string `json:"name"`
	Type      string `json:"type"`
	CreatedAt string `json:"created_at"`
	UniqueID  string `json:"unique_id"`
}

type Namespace struct {
	Name        string       `json:"name"`
	CreatedAt   string       `json:"created_at"`
	UniqueID    string       `json:"unique_id"`
	Pods        []Pod        `json:"pods"`
	Deployments []Deployment `json:"deployments"`
	Services    []Service    `json:"services"`
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

	clientset, err = kubernetes.NewForConfig(config)
	if err != nil {
		panic(err.Error())
	}
}

func StartMonitoring() {
	server = NewServer()
	go StartServer()

	for {
		namespaces, err := clientset.CoreV1().Namespaces().List(context.TODO(), metav1.ListOptions{})
		if err != nil {
			panic(err.Error())
		}

		var namespaceList []Namespace
		for _, ns := range namespaces.Items {
			pods := getPods(ns.Name)
			deployments := getDeployments(ns.Name)
			services := getServices(ns.Name)

			namespace := Namespace{
				Name:        ns.Name,
				CreatedAt:   ns.CreationTimestamp.String(),
				UniqueID:    string(ns.UID),
				Pods:        pods,
				Deployments: deployments,
				Services:    services,
			}

			namespaceList = append(namespaceList, namespace)
		}
		server.namespaceChan <- namespaceList
		time.Sleep(15 * time.Second)
	}
}

func getPods(ns string) []Pod {
	pods, err := clientset.CoreV1().Pods(ns).List(context.TODO(), metav1.ListOptions{})
	if err != nil {
		panic(err.Error())
	}
	var podList []Pod
	for _, pod := range pods.Items {
		podList = append(podList, Pod{
			Name:      pod.Name,
			Status:    string(pod.Status.Phase),
			CreatedAt: pod.CreationTimestamp.String(),
			UniqueID:  string(pod.UID),
			NodeName:  pod.Spec.NodeName,
			IP:        pod.Status.PodIP,
		})
	}
	return podList
}

func getDeployments(ns string) []Deployment {
	deployments, err := clientset.AppsV1().Deployments(ns).List(context.TODO(), metav1.ListOptions{})
	if err != nil {
		panic(err.Error())
	}
	var deploymentList []Deployment
	for _, deployment := range deployments.Items {
		deploymentList = append(deploymentList, Deployment{
			Name:      deployment.Name,
			Status:    string(deployment.Status.Conditions[0].Status),
			CreatedAt: deployment.CreationTimestamp.String(),
			UniqueID:  string(deployment.UID),
			Labels:    deployment.Labels,
		})
	}
	return deploymentList
}

func getServices(ns string) []Service {
	services, err := clientset.CoreV1().Services(ns).List(context.TODO(), metav1.ListOptions{})
	if err != nil {
		panic(err.Error())
	}
	var serviceList []Service
	for _, service := range services.Items {
		serviceList = append(serviceList, Service{
			Name:      service.Name,
			Type:      string(service.Spec.Type),
			CreatedAt: service.CreationTimestamp.String(),
			UniqueID:  string(service.UID),
		})
	}
	return serviceList
}
