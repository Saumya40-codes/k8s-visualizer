package api

type ContainerStatus struct {
	Name         string `json:"name"`
	Ready        bool   `json:"ready"`
	RestartCount int32  `json:"restart_count"`
	State        string `json:"state"`
	Reason       string `json:"reason,omitempty"`
	ExitCode     *int32 `json:"exit_code,omitempty"`
	Image        string `json:"image"`
}

type PodCondition struct {
	Type   string `json:"type"`
	Status string `json:"status"`
	Reason string `json:"reason,omitempty"`
}

type OwnerRef struct {
	Kind string `json:"kind"`
	Name string `json:"name"`
	UID  string `json:"uid"`
}

// ResourceUsage is live CPU/memory from a metrics provider.
// CPU is cores (2dp); Memory is GB (2dp). Millicores/bytes are internal only.
type ResourceUsage struct {
	CPU           string `json:"cpu,omitempty"`
	Memory        string `json:"memory,omitempty"`
	CPUMillicores *int64 `json:"-"`
	MemoryBytes   *int64 `json:"-"`
	Timestamp     string `json:"updated_at,omitempty"`
}

type MetricsStatus struct {
	Provider  string `json:"provider"`
	Available bool   `json:"available"`
	Message   string `json:"message,omitempty"`
	ScrapedAt string `json:"scraped_at,omitempty"`
}

type Pod struct {
	Name              string            `json:"name"`
	Status            string            `json:"status"`
	EffectiveStatus   string            `json:"effective_status"`
	CreatedAt         string            `json:"created_at"`
	UniqueID          string            `json:"unique_id"`
	NodeName          string            `json:"node_name"`
	IP                string            `json:"ip"`
	Labels            map[string]string `json:"labels,omitempty"`
	ContainerStatuses []ContainerStatus `json:"container_statuses,omitempty"`
	Conditions        []PodCondition    `json:"conditions,omitempty"`
	OwnerReferences   []OwnerRef        `json:"owner_references,omitempty"`
	Requests          *ResourceList     `json:"requests,omitempty"`
	Limits            *ResourceList     `json:"limits,omitempty"`
	Usage             *ResourceUsage    `json:"usage,omitempty"`
}

type Deployment struct {
	Name          string            `json:"name"`
	Status        string            `json:"status"`
	Replicas      int32             `json:"replicas"`
	ReadyReplicas int32             `json:"ready_replicas"`
	CreatedAt     string            `json:"created_at"`
	UniqueID      string            `json:"unique_id"`
	Labels        map[string]string `json:"labels,omitempty"`
	Selector      map[string]string `json:"selector,omitempty"`
}

type ReplicaSet struct {
	Name            string            `json:"name"`
	Replicas        int32             `json:"replicas"`
	ReadyReplicas   int32             `json:"ready_replicas"`
	CreatedAt       string            `json:"created_at"`
	UniqueID        string            `json:"unique_id"`
	Labels          map[string]string `json:"labels,omitempty"`
	OwnerReferences []OwnerRef        `json:"owner_references,omitempty"`
}

type Service struct {
	Name      string            `json:"name"`
	Type      string            `json:"type"`
	CreatedAt string            `json:"created_at"`
	UniqueID  string            `json:"unique_id"`
	Selector  map[string]string `json:"selector,omitempty"`
	Ports     []ServicePort     `json:"ports,omitempty"`
}

type ServicePort struct {
	Name       string `json:"name,omitempty"`
	Port       int32  `json:"port"`
	TargetPort string `json:"target_port"`
	Protocol   string `json:"protocol"`
}

type Secret struct {
	Name      string `json:"name"`
	Type      string `json:"type"`
	CreatedAt string `json:"created_at"`
	UniqueID  string `json:"unique_id"`
	KeyCount  int    `json:"key_count"`
}

type ConfigMap struct {
	Name      string `json:"name"`
	CreatedAt string `json:"created_at"`
	UniqueID  string `json:"unique_id"`
	KeyCount  int    `json:"key_count"`
}

type Ingress struct {
	Name      string        `json:"name"`
	CreatedAt string        `json:"created_at"`
	UniqueID  string        `json:"unique_id"`
	Rules     []IngressRule `json:"rules,omitempty"`
}

type IngressRule struct {
	Host  string            `json:"host,omitempty"`
	Paths []IngressRulePath `json:"paths,omitempty"`
}

type IngressRulePath struct {
	Path        string `json:"path"`
	ServiceName string `json:"service_name"`
	ServicePort string `json:"service_port"`
}

type StatefulSet struct {
	Name          string            `json:"name"`
	Replicas      int32             `json:"replicas"`
	ReadyReplicas int32             `json:"ready_replicas"`
	CreatedAt     string            `json:"created_at"`
	UniqueID      string            `json:"unique_id"`
	Labels        map[string]string `json:"labels,omitempty"`
	Selector      map[string]string `json:"selector,omitempty"`
}

type DaemonSet struct {
	Name          string            `json:"name"`
	DesiredNumber int32             `json:"desired_number"`
	CurrentNumber int32             `json:"current_number"`
	ReadyNumber   int32             `json:"ready_number"`
	CreatedAt     string            `json:"created_at"`
	UniqueID      string            `json:"unique_id"`
	Labels        map[string]string `json:"labels,omitempty"`
	Selector      map[string]string `json:"selector,omitempty"`
}

type Job struct {
	Name        string `json:"name"`
	Status      string `json:"status"`
	CreatedAt   string `json:"created_at"`
	UniqueID    string `json:"unique_id"`
	Completions *int32 `json:"completions,omitempty"`
	Succeeded   int32  `json:"succeeded"`
	Failed      int32  `json:"failed"`
}

type Event struct {
	Type      string `json:"type"`
	Reason    string `json:"reason"`
	Message   string `json:"message"`
	Object    string `json:"object"`
	FirstSeen string `json:"first_seen"`
	LastSeen  string `json:"last_seen"`
	Count     int32  `json:"count"`
}

type Node struct {
	Name        string            `json:"name"`
	Status      string            `json:"status"`
	UniqueID    string            `json:"unique_id"`
	Labels      map[string]string `json:"labels,omitempty"`
	Capacity    ResourceList      `json:"capacity"`
	Allocatable *ResourceList     `json:"allocatable,omitempty"`
	InternalIP  string            `json:"internal_ip"`
	OSImage     string            `json:"os_image"`
	Kubelet     string            `json:"kubelet_version"`
	Usage       *ResourceUsage    `json:"usage,omitempty"`
	PodCount    int               `json:"pod_count"`
	PodCapacity string            `json:"pod_capacity,omitempty"`
}

type ResourceList struct {
	CPU    string `json:"cpu"`
	Memory string `json:"memory"`
	Pods   string `json:"pods"`
}

type Namespace struct {
	Name         string        `json:"name"`
	CreatedAt    string        `json:"created_at"`
	UniqueID     string        `json:"unique_id"`
	Pods         []Pod         `json:"pods"`
	Deployments  []Deployment  `json:"deployments"`
	ReplicaSets  []ReplicaSet  `json:"replica_sets"`
	Services     []Service     `json:"services"`
	Secrets      []Secret      `json:"secrets"`
	ConfigMaps   []ConfigMap   `json:"config_maps"`
	Ingresses    []Ingress     `json:"ingresses"`
	StatefulSets []StatefulSet `json:"stateful_sets"`
	DaemonSets   []DaemonSet   `json:"daemon_sets"`
	Jobs         []Job         `json:"jobs"`
	Events       []Event       `json:"events"`
}

type ClusterState struct {
	Namespaces []Namespace    `json:"namespaces"`
	Nodes      []Node         `json:"nodes"`
	Metrics    *MetricsStatus `json:"metrics,omitempty"`
}
