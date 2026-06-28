export interface ContainerStatus {
    name: string;
    ready: boolean;
    restart_count: number;
    state: string;
    reason?: string;
    exit_code?: number;
    image: string;
}

export interface PodCondition {
    type: string;
    status: string;
    reason?: string;
}

export interface OwnerRef {
    kind: string;
    name: string;
    uid: string;
}

export interface Pod {
    name: string;
    status: string;
    effective_status: string;
    created_at: string;
    unique_id: string;
    node_name: string;
    ip: string;
    labels?: Record<string, string>;
    container_statuses?: ContainerStatus[];
    conditions?: PodCondition[];
    owner_references?: OwnerRef[];
}

export interface Deployment {
    name: string;
    status: string;
    replicas: number;
    ready_replicas: number;
    created_at: string;
    unique_id: string;
    labels?: Record<string, string>;
    selector?: Record<string, string>;
}

export interface ReplicaSet {
    name: string;
    replicas: number;
    ready_replicas: number;
    created_at: string;
    unique_id: string;
    labels?: Record<string, string>;
    owner_references?: OwnerRef[];
}

export interface ServicePort {
    name?: string;
    port: number;
    target_port: string;
    protocol: string;
}

export interface Service {
    name: string;
    type: string;
    created_at: string;
    unique_id: string;
    selector?: Record<string, string>;
    ports?: ServicePort[];
}

export interface Secret {
    name: string;
    type: string;
    created_at: string;
    unique_id: string;
    key_count: number;
}

export interface ConfigMap {
    name: string;
    created_at: string;
    unique_id: string;
    key_count: number;
}

export interface IngressRulePath {
    path: string;
    service_name: string;
    service_port: string;
}

export interface IngressRule {
    host?: string;
    paths?: IngressRulePath[];
}

export interface Ingress {
    name: string;
    created_at: string;
    unique_id: string;
    rules?: IngressRule[];
}

export interface StatefulSet {
    name: string;
    replicas: number;
    ready_replicas: number;
    created_at: string;
    unique_id: string;
    labels?: Record<string, string>;
    selector?: Record<string, string>;
}

export interface DaemonSet {
    name: string;
    desired_number: number;
    current_number: number;
    ready_number: number;
    created_at: string;
    unique_id: string;
    labels?: Record<string, string>;
    selector?: Record<string, string>;
}

export interface Job {
    name: string;
    status: string;
    created_at: string;
    unique_id: string;
    completions?: number;
    succeeded: number;
    failed: number;
}

export interface K8sEvent {
    type: string;
    reason: string;
    message: string;
    object: string;
    first_seen: string;
    last_seen: string;
    count: number;
}

export interface ResourceList {
    cpu: string;
    memory: string;
    pods: string;
}

export interface K8sNode {
    name: string;
    status: string;
    unique_id: string;
    labels?: Record<string, string>;
    capacity: ResourceList;
    internal_ip: string;
    os_image: string;
    kubelet_version: string;
}

export interface Namespace {
    name: string;
    created_at: string;
    unique_id: string;
    pods: Pod[];
    deployments: Deployment[];
    replica_sets: ReplicaSet[];
    services: Service[];
    secrets: Secret[];
    config_maps: ConfigMap[];
    ingresses: Ingress[];
    stateful_sets: StatefulSet[];
    daemon_sets: DaemonSet[];
    jobs: Job[];
    events: K8sEvent[];
}

export interface ClusterState {
    namespaces: Namespace[];
    nodes: K8sNode[];
}