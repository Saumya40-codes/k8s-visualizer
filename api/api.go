package api

import (
	"context"
	"flag"
	"fmt"
	"log"
	"path/filepath"
	"time"

	metav1 "k8s.io/apimachinery/pkg/apis/meta/v1"
	"k8s.io/client-go/kubernetes"
	"k8s.io/client-go/rest"
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

type Secret struct {
	Name      string            `json:"name"`
	SecretMap map[string]string `json:"secret_map"`
	Type      string            `json:"type"`
	CreatedAt string            `json:"created_at"`
	UniqueID  string            `json:"unique_id"`
}

type ConfigMap struct {
	Name string `json:"name"`
}

type Namespace struct {
	Name        string       `json:"name"`
	CreatedAt   string       `json:"created_at"`
	UniqueID    string       `json:"unique_id"`
	Pods        []Pod        `json:"pods"`
	Deployments []Deployment `json:"deployments"`
	Services    []Service    `json:"services"`
	Secrets     []Secret     `json:"secrets"`
	ConfigMaps  []ConfigMap  `json:"config_maps"`
}

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
		log.Fatalf("Error building kubeconfig: %v", err)
		log.Println("Now using in-cluster configuration")

		config, err = rest.InClusterConfig()
		if err != nil {
			log.Fatalf("Error building in-cluster config: %v", err)
			log.Println("Failed to create clientset, exiting...")
			fmt.Println("⚠ Failed to create clientset, exiting...")
			return
		}
	}

	clientset, err = kubernetes.NewForConfig(config)
	if err != nil {
		log.Fatalf("Error creating clientset: %v", err)
	}

	go ensureConnection()
}

func ensureConnection() {
	for {
		if err := clientset.Discovery().RESTClient().Get().AbsPath("/healthz").Do(context.TODO()).Error(); err != nil {
			log.Printf("Lost connection to Kubernetes API server: %v", err)
			// Recreate the clientset
			config, err := clientcmd.BuildConfigFromFlags("", kubeconfig)
			if err != nil {
				log.Printf("Error building kubeconfig: %v", err)
				log.Println("Now using in-cluster configuration")

				config, err = rest.InClusterConfig()
				if err != nil {
					log.Printf("Error building in-cluster config aswell: %v", err)
					log.Println("Failed to reconnect to Kubernetes API server, retrying in 5 seconds...")

					time.Sleep(5 * time.Second)
					continue
				}
			}
			newClientset, err := kubernetes.NewForConfig(config)
			if err != nil {
				log.Printf("Error creating new clientset: %v", err)
				time.Sleep(5 * time.Second)
				continue
			}
			clientset = newClientset
			log.Println("Reconnected to Kubernetes API server")
		}
		time.Sleep(30 * time.Second)
	}
}

func StartMonitoring() {
	server = NewServer()
	go StartServer()

	for {
		func() {
			defer func() {
				if r := recover(); r != nil {
					log.Printf("Recovered from panic in StartMonitoring: %v", r)
					time.Sleep(5 * time.Second)
				}
			}()

			namespaceList, err := getNamespaces()
			if err != nil {
				log.Printf("Error getting namespaces: %v", err)
				time.Sleep(5 * time.Second)
				return
			}

			server.namespaceChan <- namespaceList
			time.Sleep(30 * time.Second)
		}()
	}
}

func getNamespaces() ([]Namespace, error) {
	ctx, cancel := context.WithTimeout(context.Background(), 10*time.Second)
	defer cancel()

	namespaces, err := clientset.CoreV1().Namespaces().List(ctx, metav1.ListOptions{})
	if err != nil {
		return nil, fmt.Errorf("error listing namespaces: %w", err)
	}

	var namespaceList []Namespace
	for _, ns := range namespaces.Items {
		pods, err := getPods(ns.Name)
		if err != nil {
			log.Printf("Error getting pods for namespace %s: %v", ns.Name, err)
			continue
		}

		deployments, err := getDeployments(ns.Name)
		if err != nil {
			log.Printf("Error getting deployments for namespace %s: %v", ns.Name, err)
			continue
		}

		services, err := getServices(ns.Name)
		if err != nil {
			log.Printf("Error getting services for namespace %s: %v", ns.Name, err)
			continue
		}

		secrets, err := getSecrets(ns.Name)
		if err != nil {
			log.Printf("Error getting secrets for namespace %s: %v", ns.Name, err)
			continue
		}

		configMaps, err := getConfigMap(ns.Name)
		if err != nil {
			log.Printf("Error getting config maps for namespace %s: %v", ns.Name, err)
			continue
		}

		namespace := Namespace{
			Name:        ns.Name,
			CreatedAt:   ns.CreationTimestamp.String(),
			UniqueID:    string(ns.UID),
			Pods:        pods,
			Deployments: deployments,
			Services:    services,
			Secrets:     secrets,
			ConfigMaps:  configMaps,
		}
		namespaceList = append(namespaceList, namespace)
	}

	return namespaceList, nil
}

func getPods(ns string) ([]Pod, error) {
	ctx, cancel := context.WithTimeout(context.Background(), 10*time.Second)
	defer cancel()

	pods, err := clientset.CoreV1().Pods(ns).List(ctx, metav1.ListOptions{})
	if err != nil {
		return nil, fmt.Errorf("error listing pods: %w", err)
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
	return podList, nil
}

func getDeployments(ns string) ([]Deployment, error) {
	ctx, cancel := context.WithTimeout(context.Background(), 10*time.Second)
	defer cancel()

	deployments, err := clientset.AppsV1().Deployments(ns).List(ctx, metav1.ListOptions{})
	if err != nil {
		return nil, fmt.Errorf("error listing deployments: %w", err)
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
	return deploymentList, nil
}

func getServices(ns string) ([]Service, error) {
	ctx, cancel := context.WithTimeout(context.Background(), 10*time.Second)
	defer cancel()

	services, err := clientset.CoreV1().Services(ns).List(ctx, metav1.ListOptions{})
	if err != nil {
		return nil, fmt.Errorf("error listing services: %w", err)
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
	return serviceList, nil
}

func getSecrets(ns string) ([]Secret, error) {
	ctx, cancel := context.WithTimeout(context.Background(), 10*time.Second)
	defer cancel()

	secrets, err := clientset.CoreV1().Secrets(ns).List(ctx, metav1.ListOptions{})
	if err != nil {
		return nil, fmt.Errorf("error listing secrets info: %w", err)
	}

	var secretList []Secret
	for _, secret := range secrets.Items {
		secretList = append(secretList, Secret{
			Name:      secret.Name,
			Type:      string(secret.Type),
			CreatedAt: secret.CreationTimestamp.String(),
			UniqueID:  string(secret.UID),
		})

		secretMap := make(map[string]string)
		for key, value := range secret.Data {
			secretMap[key] = string(value)
		}
		secretList[len(secretList)-1].SecretMap = secretMap
	}

	return secretList, nil
}

func getConfigMap(ns string) ([]ConfigMap, error) {
	ctx, cancel := context.WithTimeout(context.Background(), 10*time.Second)
	defer cancel()

	configMaps, err := clientset.CoreV1().ConfigMaps(ns).List(ctx, metav1.ListOptions{})
	if err != nil {
		return nil, fmt.Errorf("error listing config maps info: %w", err)
	}

	var configMapList []ConfigMap
	for _, configMap := range configMaps.Items {
		configMapList = append(configMapList, ConfigMap{
			Name: configMap.Name,
		})
	}

	return configMapList, nil
}
