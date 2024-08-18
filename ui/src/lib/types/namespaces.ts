interface Pod {
    name: string;
    status: string;
    created_at: string;
    unique_id: string;
    node_name: string;
    ip: string;
}

interface Deployment {
    name: string;
    status: string;
    created_at: string;
    unique_id: string;
    labels: Record<string, string>;
}

interface Service {
    name: string;
    type: string;
    created_at: string;
    unique_id: string;
}

export interface Namespace {
    name: string;
    created_at: string;
    unique_id: string;
    pods: Pod[] | null;
    deployments: Deployment[] | null;
    services: Service[] | null;
}