package api

import (
	"context"
	"fmt"
	"log"
	"strconv"
	"sync"
	"time"

	"github.com/Saumya40-codes/k8s-visualizer/api/metrics"
	corev1 "k8s.io/api/core/v1"
	"k8s.io/apimachinery/pkg/api/resource"
	"k8s.io/apimachinery/pkg/labels"
	"k8s.io/client-go/informers"
	"k8s.io/client-go/kubernetes"
	appslisters "k8s.io/client-go/listers/apps/v1"
	batchlisters "k8s.io/client-go/listers/batch/v1"
	corelisters "k8s.io/client-go/listers/core/v1"
	networkinglisters "k8s.io/client-go/listers/networking/v1"
	"k8s.io/client-go/tools/cache"
)

type UsageSource interface {
	PodUsage(namespace, name string) (metrics.ResourceUsage, bool)
	NodeUsage(name string) (metrics.ResourceUsage, bool)
	Status() metrics.Status
}

type InformerManager struct {
	factory informers.SharedInformerFactory
	client  kubernetes.Interface

	namespaceLister   corelisters.NamespaceLister
	podLister         corelisters.PodLister
	serviceLister     corelisters.ServiceLister
	secretLister      corelisters.SecretLister
	configMapLister   corelisters.ConfigMapLister
	nodeLister        corelisters.NodeLister
	eventLister       corelisters.EventLister
	deploymentLister  appslisters.DeploymentLister
	replicaSetLister  appslisters.ReplicaSetLister
	statefulSetLister appslisters.StatefulSetLister
	daemonSetLister   appslisters.DaemonSetLister
	jobLister         batchlisters.JobLister
	ingressLister     networkinglisters.IngressLister

	stateChan chan ClusterState
	cacheMu   sync.RWMutex
	lastState *ClusterState

	debounceTimer *time.Timer
	debounceMu    sync.Mutex

	usage UsageSource
}

func (im *InformerManager) SetUsageSource(u UsageSource) {
	im.usage = u
}

func (im *InformerManager) PushState() {
	im.buildAndPushState()
}

func NewInformerManager(client kubernetes.Interface, stateChan chan ClusterState) *InformerManager {
	factory := informers.NewSharedInformerFactory(client, 0)

	im := &InformerManager{
		factory:   factory,
		client:    client,
		stateChan: stateChan,

		namespaceLister:   factory.Core().V1().Namespaces().Lister(),
		podLister:         factory.Core().V1().Pods().Lister(),
		serviceLister:     factory.Core().V1().Services().Lister(),
		secretLister:      factory.Core().V1().Secrets().Lister(),
		configMapLister:   factory.Core().V1().ConfigMaps().Lister(),
		nodeLister:        factory.Core().V1().Nodes().Lister(),
		eventLister:       factory.Core().V1().Events().Lister(),
		deploymentLister:  factory.Apps().V1().Deployments().Lister(),
		replicaSetLister:  factory.Apps().V1().ReplicaSets().Lister(),
		statefulSetLister: factory.Apps().V1().StatefulSets().Lister(),
		daemonSetLister:   factory.Apps().V1().DaemonSets().Lister(),
		jobLister:         factory.Batch().V1().Jobs().Lister(),
		ingressLister:     factory.Networking().V1().Ingresses().Lister(),
	}

	handler := cache.ResourceEventHandlerFuncs{
		AddFunc:    func(_ interface{}) { im.debounceBuildState() },
		UpdateFunc: func(_, _ interface{}) { im.debounceBuildState() },
		DeleteFunc: func(_ interface{}) { im.debounceBuildState() },
	}

	factory.Core().V1().Namespaces().Informer().AddEventHandler(handler)
	factory.Core().V1().Pods().Informer().AddEventHandler(handler)
	factory.Core().V1().Services().Informer().AddEventHandler(handler)
	factory.Core().V1().Secrets().Informer().AddEventHandler(handler)
	factory.Core().V1().ConfigMaps().Informer().AddEventHandler(handler)
	factory.Core().V1().Nodes().Informer().AddEventHandler(handler)
	factory.Core().V1().Events().Informer().AddEventHandler(handler)
	factory.Apps().V1().Deployments().Informer().AddEventHandler(handler)
	factory.Apps().V1().ReplicaSets().Informer().AddEventHandler(handler)
	factory.Apps().V1().StatefulSets().Informer().AddEventHandler(handler)
	factory.Apps().V1().DaemonSets().Informer().AddEventHandler(handler)
	factory.Batch().V1().Jobs().Informer().AddEventHandler(handler)
	factory.Networking().V1().Ingresses().Informer().AddEventHandler(handler)

	return im
}

func (im *InformerManager) Start(ctx context.Context) {
	im.factory.Start(ctx.Done())
	im.factory.WaitForCacheSync(ctx.Done())
	log.Println("All informer caches synced")
	im.buildAndPushState()
}

func (im *InformerManager) GetCachedState() *ClusterState {
	im.cacheMu.RLock()
	defer im.cacheMu.RUnlock()
	return im.lastState
}

func (im *InformerManager) debounceBuildState() {
	im.debounceMu.Lock()
	defer im.debounceMu.Unlock()

	if im.debounceTimer != nil {
		im.debounceTimer.Stop()
	}
	im.debounceTimer = time.AfterFunc(500*time.Millisecond, func() {
		im.buildAndPushState()
	})
}

func (im *InformerManager) buildAndPushState() {
	state := im.buildClusterState()

	im.cacheMu.Lock()
	im.lastState = &state
	im.cacheMu.Unlock()

	select {
	case im.stateChan <- state:
	default:
	}
}

func (im *InformerManager) buildClusterState() ClusterState {
	namespaces, err := im.namespaceLister.List(labels.Everything())
	if err != nil {
		log.Printf("Error listing namespaces from cache: %v", err)
		return ClusterState{}
	}

	var nsList []Namespace
	for _, ns := range namespaces {
		nsList = append(nsList, Namespace{
			Name:         ns.Name,
			CreatedAt:    ns.CreationTimestamp.Format(time.RFC3339),
			UniqueID:     string(ns.UID),
			Pods:         im.buildPods(ns.Name),
			Deployments:  im.buildDeployments(ns.Name),
			ReplicaSets:  im.buildReplicaSets(ns.Name),
			Services:     im.buildServices(ns.Name),
			Secrets:      im.buildSecrets(ns.Name),
			ConfigMaps:   im.buildConfigMaps(ns.Name),
			Ingresses:    im.buildIngresses(ns.Name),
			StatefulSets: im.buildStatefulSets(ns.Name),
			DaemonSets:   im.buildDaemonSets(ns.Name),
			Jobs:         im.buildJobs(ns.Name),
			Events:       im.buildEvents(ns.Name),
		})
	}

	state := ClusterState{
		Namespaces: nsList,
		Nodes:      im.buildNodes(),
	}
	if im.usage != nil {
		st := im.usage.Status()
		state.Metrics = &MetricsStatus{
			Provider:  st.Provider,
			Available: st.Available,
			Message:   st.Message,
			ScrapedAt: st.ScrapedAt,
		}
	}
	return state
}

func (im *InformerManager) buildPods(ns string) []Pod {
	pods, err := im.podLister.Pods(ns).List(labels.Everything())
	if err != nil {
		log.Printf("Error listing pods for %s: %v", ns, err)
		return nil
	}

	var result []Pod
	for _, p := range pods {
		pod := Pod{
			Name:      p.Name,
			Status:    string(p.Status.Phase),
			CreatedAt: p.CreationTimestamp.Format(time.RFC3339),
			UniqueID:  string(p.UID),
			NodeName:  p.Spec.NodeName,
			IP:        p.Status.PodIP,
			Labels:    p.Labels,
		}

		for _, cs := range p.Status.ContainerStatuses {
			container := ContainerStatus{
				Name:         cs.Name,
				Ready:        cs.Ready,
				RestartCount: cs.RestartCount,
				Image:        cs.Image,
			}
			if cs.State.Running != nil {
				container.State = "running"
			} else if cs.State.Waiting != nil {
				container.State = "waiting"
				container.Reason = cs.State.Waiting.Reason
			} else if cs.State.Terminated != nil {
				container.State = "terminated"
				container.Reason = cs.State.Terminated.Reason
				container.ExitCode = &cs.State.Terminated.ExitCode
			}
			pod.ContainerStatuses = append(pod.ContainerStatuses, container)
		}

		for _, c := range p.Status.Conditions {
			pod.Conditions = append(pod.Conditions, PodCondition{
				Type:   string(c.Type),
				Status: string(c.Status),
				Reason: c.Reason,
			})
		}

		for _, ref := range p.OwnerReferences {
			pod.OwnerReferences = append(pod.OwnerReferences, OwnerRef{
				Kind: ref.Kind,
				Name: ref.Name,
				UID:  string(ref.UID),
			})
		}

		pod.EffectiveStatus = deriveEffectiveStatus(p)
		pod.Requests, pod.Limits = podResourceTotals(p)

		if im.usage != nil {
			if u, ok := im.usage.PodUsage(ns, p.Name); ok {
				usage := ResourceUsage(u)
				pod.Usage = &usage
			}
		}

		result = append(result, pod)
	}
	return result
}

func podResourceTotals(p *corev1.Pod) (requests *ResourceList, limits *ResourceList) {
	var reqCPU, reqMem, limCPU, limMem resource.Quantity
	var hasReqCPU, hasReqMem, hasLimCPU, hasLimMem bool
	for _, c := range p.Spec.Containers {
		if q, ok := c.Resources.Requests[corev1.ResourceCPU]; ok {
			reqCPU.Add(q)
			hasReqCPU = true
		}
		if q, ok := c.Resources.Requests[corev1.ResourceMemory]; ok {
			reqMem.Add(q)
			hasReqMem = true
		}
		if q, ok := c.Resources.Limits[corev1.ResourceCPU]; ok {
			limCPU.Add(q)
			hasLimCPU = true
		}
		if q, ok := c.Resources.Limits[corev1.ResourceMemory]; ok {
			limMem.Add(q)
			hasLimMem = true
		}
	}
	if hasReqCPU || hasReqMem {
		requests = &ResourceList{}
		if hasReqCPU {
			requests.CPU = metrics.FormatCPUQuantity(&reqCPU)
		}
		if hasReqMem {
			requests.Memory = metrics.FormatMemoryQuantity(&reqMem)
		}
	}
	if hasLimCPU || hasLimMem {
		limits = &ResourceList{}
		if hasLimCPU {
			limits.CPU = metrics.FormatCPUQuantity(&limCPU)
		}
		if hasLimMem {
			limits.Memory = metrics.FormatMemoryQuantity(&limMem)
		}
	}
	return requests, limits
}

func deriveEffectiveStatus(p *corev1.Pod) string {
	if p.DeletionTimestamp != nil {
		return "Terminating"
	}

	for _, cs := range p.Status.InitContainerStatuses {
		if cs.State.Waiting != nil && cs.State.Waiting.Reason != "" {
			return cs.State.Waiting.Reason
		}
		if cs.State.Terminated != nil && cs.State.Terminated.ExitCode != 0 {
			return "Init:" + cs.State.Terminated.Reason
		}
	}

	for _, cs := range p.Status.ContainerStatuses {
		if cs.State.Waiting != nil && cs.State.Waiting.Reason != "" {
			return cs.State.Waiting.Reason
		}
		if cs.State.Terminated != nil && cs.State.Terminated.Reason != "" {
			return cs.State.Terminated.Reason
		}
	}

	return string(p.Status.Phase)
}

func (im *InformerManager) buildDeployments(ns string) []Deployment {
	deployments, err := im.deploymentLister.Deployments(ns).List(labels.Everything())
	if err != nil {
		log.Printf("Error listing deployments for %s: %v", ns, err)
		return nil
	}

	var result []Deployment
	for _, d := range deployments {
		status := "Unknown"
		if len(d.Status.Conditions) > 0 {
			status = string(d.Status.Conditions[0].Type)
		}

		var selector map[string]string
		if d.Spec.Selector != nil {
			selector = d.Spec.Selector.MatchLabels
		}

		result = append(result, Deployment{
			Name:          d.Name,
			Status:        status,
			Replicas:      d.Status.Replicas,
			ReadyReplicas: d.Status.ReadyReplicas,
			CreatedAt:     d.CreationTimestamp.Format(time.RFC3339),
			UniqueID:      string(d.UID),
			Labels:        d.Labels,
			Selector:      selector,
		})
	}
	return result
}

func (im *InformerManager) buildReplicaSets(ns string) []ReplicaSet {
	rsList, err := im.replicaSetLister.ReplicaSets(ns).List(labels.Everything())
	if err != nil {
		log.Printf("Error listing replicasets for %s: %v", ns, err)
		return nil
	}

	var result []ReplicaSet
	for _, rs := range rsList {
		var owners []OwnerRef
		for _, ref := range rs.OwnerReferences {
			owners = append(owners, OwnerRef{
				Kind: ref.Kind,
				Name: ref.Name,
				UID:  string(ref.UID),
			})
		}

		result = append(result, ReplicaSet{
			Name:            rs.Name,
			Replicas:        rs.Status.Replicas,
			ReadyReplicas:   rs.Status.ReadyReplicas,
			CreatedAt:       rs.CreationTimestamp.Format(time.RFC3339),
			UniqueID:        string(rs.UID),
			Labels:          rs.Labels,
			OwnerReferences: owners,
		})
	}
	return result
}

func (im *InformerManager) buildServices(ns string) []Service {
	services, err := im.serviceLister.Services(ns).List(labels.Everything())
	if err != nil {
		log.Printf("Error listing services for %s: %v", ns, err)
		return nil
	}

	var result []Service
	for _, s := range services {
		svc := Service{
			Name:      s.Name,
			Type:      string(s.Spec.Type),
			CreatedAt: s.CreationTimestamp.Format(time.RFC3339),
			UniqueID:  string(s.UID),
			Selector:  s.Spec.Selector,
		}
		for _, p := range s.Spec.Ports {
			svc.Ports = append(svc.Ports, ServicePort{
				Name:       p.Name,
				Port:       p.Port,
				TargetPort: p.TargetPort.String(),
				Protocol:   string(p.Protocol),
			})
		}
		result = append(result, svc)
	}
	return result
}

func (im *InformerManager) buildSecrets(ns string) []Secret {
	secrets, err := im.secretLister.Secrets(ns).List(labels.Everything())
	if err != nil {
		log.Printf("Error listing secrets for %s: %v", ns, err)
		return nil
	}

	var result []Secret
	for _, s := range secrets {
		result = append(result, Secret{
			Name:      s.Name,
			Type:      string(s.Type),
			CreatedAt: s.CreationTimestamp.Format(time.RFC3339),
			UniqueID:  string(s.UID),
			KeyCount:  len(s.Data),
		})
	}
	return result
}

func (im *InformerManager) buildConfigMaps(ns string) []ConfigMap {
	cms, err := im.configMapLister.ConfigMaps(ns).List(labels.Everything())
	if err != nil {
		log.Printf("Error listing configmaps for %s: %v", ns, err)
		return nil
	}

	var result []ConfigMap
	for _, cm := range cms {
		result = append(result, ConfigMap{
			Name:      cm.Name,
			CreatedAt: cm.CreationTimestamp.Format(time.RFC3339),
			UniqueID:  string(cm.UID),
			KeyCount:  len(cm.Data),
		})
	}
	return result
}

func (im *InformerManager) buildIngresses(ns string) []Ingress {
	ingresses, err := im.ingressLister.Ingresses(ns).List(labels.Everything())
	if err != nil {
		log.Printf("Error listing ingresses for %s: %v", ns, err)
		return nil
	}

	var result []Ingress
	for _, ing := range ingresses {
		ingress := Ingress{
			Name:      ing.Name,
			CreatedAt: ing.CreationTimestamp.Format(time.RFC3339),
			UniqueID:  string(ing.UID),
		}
		for _, rule := range ing.Spec.Rules {
			r := IngressRule{Host: rule.Host}
			if rule.HTTP != nil {
				for _, path := range rule.HTTP.Paths {
					irp := IngressRulePath{
						Path:        path.Path,
						ServiceName: path.Backend.Service.Name,
					}
					if path.Backend.Service.Port.Name != "" {
						irp.ServicePort = path.Backend.Service.Port.Name
					} else {
						irp.ServicePort = strconv.Itoa(int(path.Backend.Service.Port.Number))
					}
					r.Paths = append(r.Paths, irp)
				}
			}
			ingress.Rules = append(ingress.Rules, r)
		}
		result = append(result, ingress)
	}
	return result
}

func (im *InformerManager) buildStatefulSets(ns string) []StatefulSet {
	stsList, err := im.statefulSetLister.StatefulSets(ns).List(labels.Everything())
	if err != nil {
		log.Printf("Error listing statefulsets for %s: %v", ns, err)
		return nil
	}

	var result []StatefulSet
	for _, sts := range stsList {
		var selector map[string]string
		if sts.Spec.Selector != nil {
			selector = sts.Spec.Selector.MatchLabels
		}
		result = append(result, StatefulSet{
			Name:          sts.Name,
			Replicas:      sts.Status.Replicas,
			ReadyReplicas: sts.Status.ReadyReplicas,
			CreatedAt:     sts.CreationTimestamp.Format(time.RFC3339),
			UniqueID:      string(sts.UID),
			Labels:        sts.Labels,
			Selector:      selector,
		})
	}
	return result
}

func (im *InformerManager) buildDaemonSets(ns string) []DaemonSet {
	dsList, err := im.daemonSetLister.DaemonSets(ns).List(labels.Everything())
	if err != nil {
		log.Printf("Error listing daemonsets for %s: %v", ns, err)
		return nil
	}

	var result []DaemonSet
	for _, ds := range dsList {
		var selector map[string]string
		if ds.Spec.Selector != nil {
			selector = ds.Spec.Selector.MatchLabels
		}
		result = append(result, DaemonSet{
			Name:          ds.Name,
			DesiredNumber: ds.Status.DesiredNumberScheduled,
			CurrentNumber: ds.Status.CurrentNumberScheduled,
			ReadyNumber:   ds.Status.NumberReady,
			CreatedAt:     ds.CreationTimestamp.Format(time.RFC3339),
			UniqueID:      string(ds.UID),
			Labels:        ds.Labels,
			Selector:      selector,
		})
	}
	return result
}

func (im *InformerManager) buildJobs(ns string) []Job {
	jobs, err := im.jobLister.Jobs(ns).List(labels.Everything())
	if err != nil {
		log.Printf("Error listing jobs for %s: %v", ns, err)
		return nil
	}

	var result []Job
	for _, j := range jobs {
		status := "Running"
		for _, c := range j.Status.Conditions {
			if c.Type == "Complete" && c.Status == "True" {
				status = "Complete"
			} else if c.Type == "Failed" && c.Status == "True" {
				status = "Failed"
			}
		}

		result = append(result, Job{
			Name:        j.Name,
			Status:      status,
			CreatedAt:   j.CreationTimestamp.Format(time.RFC3339),
			UniqueID:    string(j.UID),
			Completions: j.Spec.Completions,
			Succeeded:   j.Status.Succeeded,
			Failed:      j.Status.Failed,
		})
	}
	return result
}

func (im *InformerManager) buildEvents(ns string) []Event {
	events, err := im.eventLister.Events(ns).List(labels.Everything())
	if err != nil {
		log.Printf("Error listing events for %s: %v", ns, err)
		return nil
	}

	var result []Event
	for _, e := range events {
		objectRef := ""
		if e.InvolvedObject.Kind != "" {
			objectRef = fmt.Sprintf("%s/%s", e.InvolvedObject.Kind, e.InvolvedObject.Name)
		}
		result = append(result, Event{
			Type:      e.Type,
			Reason:    e.Reason,
			Message:   e.Message,
			Object:    objectRef,
			FirstSeen: e.FirstTimestamp.Format(time.RFC3339),
			LastSeen:  e.LastTimestamp.Format(time.RFC3339),
			Count:     e.Count,
		})
	}
	return result
}

func (im *InformerManager) buildNodes() []Node {
	nodes, err := im.nodeLister.List(labels.Everything())
	if err != nil {
		log.Printf("Error listing nodes: %v", err)
		return nil
	}

	podCountByNode := map[string]int{}
	allPods, err := im.podLister.List(labels.Everything())
	if err != nil {
		log.Printf("Error listing pods for node counts: %v", err)
	} else {
		for _, p := range allPods {
			if p.Spec.NodeName != "" {
				podCountByNode[p.Spec.NodeName]++
			}
		}
	}

	var result []Node
	for _, n := range nodes {
		status := "NotReady"
		for _, c := range n.Status.Conditions {
			if c.Type == corev1.NodeReady && c.Status == corev1.ConditionTrue {
				status = "Ready"
				break
			}
		}

		var internalIP string
		for _, addr := range n.Status.Addresses {
			if addr.Type == corev1.NodeInternalIP {
				internalIP = addr.Address
				break
			}
		}

		podCap := n.Status.Allocatable.Pods().String()
		if podCap == "" || podCap == "0" {
			podCap = n.Status.Capacity.Pods().String()
		}

		node := Node{
			Name:     n.Name,
			Status:   status,
			UniqueID: string(n.UID),
			Labels:   n.Labels,
			Capacity: ResourceList{
				CPU:    metrics.FormatCPUQuantity(n.Status.Capacity.Cpu()),
				Memory: metrics.FormatMemoryQuantity(n.Status.Capacity.Memory()),
				Pods:   n.Status.Capacity.Pods().String(),
			},
			Allocatable: &ResourceList{
				CPU:    metrics.FormatCPUQuantity(n.Status.Allocatable.Cpu()),
				Memory: metrics.FormatMemoryQuantity(n.Status.Allocatable.Memory()),
				Pods:   podCap,
			},
			InternalIP:  internalIP,
			OSImage:     n.Status.NodeInfo.OSImage,
			Kubelet:     n.Status.NodeInfo.KubeletVersion,
			PodCount:    podCountByNode[n.Name],
			PodCapacity: podCap,
		}
		if im.usage != nil {
			if u, ok := im.usage.NodeUsage(n.Name); ok {
				usage := ResourceUsage(u)
				node.Usage = &usage
			}
		}
		result = append(result, node)
	}
	return result
}
