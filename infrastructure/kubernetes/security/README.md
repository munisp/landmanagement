# IDLR Security Infrastructure Deployment

This directory contains Kubernetes deployment manifests and scripts for the IDLR platform's security infrastructure, which includes:

- **OpenCTI**: Threat Intelligence Platform
- **Wazuh**: Security Information and Event Management (SIEM)
- **Open Policy Agent (OPA)**: Policy Enforcement Engine
- **Kubecost**: Kubernetes Cost Monitoring and Optimization

## Architecture Overview

The security infrastructure is deployed in a dedicated `security` namespace and provides real-time security monitoring, threat intelligence, policy enforcement, and cost optimization for the IDLR platform.

### Components

#### 1. OpenCTI (Threat Intelligence)
- **Purpose**: Centralized threat intelligence platform for collecting, analyzing, and sharing cyber threat information
- **Components**:
  - OpenCTI Platform (main application)
  - Elasticsearch (data storage)
  - Redis (caching)
  - RabbitMQ (message queue)
  - MinIO (object storage)
- **Resources**: 12GB RAM, 4 CPU cores
- **Access**: `http://opencti.idlr.local`

#### 2. Wazuh (SIEM)
- **Purpose**: Security monitoring, log analysis, intrusion detection, and compliance management
- **Components**:
  - Wazuh Manager (main server)
  - Wazuh Indexer (OpenSearch-based data store)
  - Wazuh Dashboard (web UI)
- **Resources**: 10GB RAM, 5 CPU cores
- **Access**: `http://wazuh.idlr.local`

#### 3. Open Policy Agent (OPA)
- **Purpose**: Policy-based access control and authorization decisions
- **Features**:
  - Role-based access control (RBAC)
  - Policy violation tracking
  - Real-time policy enforcement
- **Resources**: 512MB RAM, 500m CPU
- **Replicas**: 2 (with HPA up to 10)
- **Access**: Internal service only

#### 4. Kubecost
- **Purpose**: Kubernetes cost monitoring and optimization
- **Features**:
  - Real-time cost allocation
  - Cost anomaly detection
  - Resource optimization recommendations
- **Resources**: 1.5GB RAM, 1.2 CPU cores
- **Access**: `http://kubecost.idlr.local`

## Prerequisites

Before deploying the security infrastructure, ensure you have:

1. **Kubernetes Cluster**: A running Kubernetes cluster (v1.24+)
2. **kubectl**: Configured to access your cluster
3. **Ingress Controller**: NGINX Ingress Controller installed
4. **Storage**: Persistent storage provisioner (for production deployments)
5. **Resources**: At least 30GB RAM and 12 CPU cores available

## Quick Start

### 1. Deploy All Services

```bash
cd infrastructure/kubernetes/security
./deploy-security-services.sh
```

This script will:
- Create the `security` namespace
- Deploy all four security services
- Wait for services to be ready
- Display access URLs and credentials
- Generate `.env.security` file with environment variables

### 2. Configure DNS

Add the following entries to your DNS or `/etc/hosts`:

```
<INGRESS_IP> opencti.idlr.local
<INGRESS_IP> wazuh.idlr.local
<INGRESS_IP> kubecost.idlr.local
```

Replace `<INGRESS_IP>` with your ingress controller's external IP:

```bash
kubectl get svc -n ingress-nginx ingress-nginx-controller -o jsonpath='{.status.loadBalancer.ingress[0].ip}'
```

### 3. Configure IDLR Application

Add the environment variables from `.env.security` to your IDLR application:

```bash
# For development
cat .env.security >> ../../../.env

# For production (Kubernetes)
kubectl create secret generic security-config \
  --from-env-file=.env.security \
  -n idlr-production
```

## Manual Deployment

If you prefer to deploy services individually:

### Deploy OpenCTI

```bash
kubectl apply -f opencti-deployment.yaml
kubectl wait --for=condition=ready pod -l app=opencti -n security --timeout=600s
```

### Deploy Wazuh

```bash
kubectl apply -f wazuh-deployment.yaml
kubectl wait --for=condition=ready pod -l app=wazuh-manager -n security --timeout=600s
```

### Deploy OPA and Kubecost

```bash
kubectl apply -f opa-kubecost-deployment.yaml
kubectl wait --for=condition=ready pod -l app=opa -n security --timeout=300s
kubectl wait --for=condition=ready pod -l app=kubecost -n security --timeout=300s
```

## Accessing Services

### OpenCTI

1. Navigate to `http://opencti.idlr.local`
2. Login with credentials from the deployment output
3. Default credentials (if not changed):
   - Email: `admin@idlr.gov.ng`
   - Password: `ChangeMe123!`

### Wazuh Dashboard

1. Navigate to `http://wazuh.idlr.local`
2. Login with credentials from the deployment output
3. Default credentials (if not changed):
   - Username: `wazuh`
   - Password: `ChangeMe123!`

### Kubecost

1. Navigate to `http://kubecost.idlr.local`
2. No authentication required by default

### OPA

OPA is an internal service and is not exposed via ingress. It's accessed by the IDLR application through the service endpoint:

```
http://opa.security.svc.cluster.local:8181
```

## Monitoring and Troubleshooting

### Check Deployment Status

```bash
# View all pods in security namespace
kubectl get pods -n security

# View all services
kubectl get svc -n security

# View ingresses
kubectl get ingress -n security
```

### View Logs

```bash
# OpenCTI logs
kubectl logs -n security -l app=opencti --tail=100

# Wazuh Manager logs
kubectl logs -n security -l app=wazuh-manager --tail=100

# OPA logs
kubectl logs -n security -l app=opa --tail=100

# Kubecost logs
kubectl logs -n security -l app=kubecost --tail=100
```

### Common Issues

#### 1. Pods stuck in Pending state

**Cause**: Insufficient resources

**Solution**:
```bash
kubectl describe pod <pod-name> -n security
# Check for resource constraints and scale your cluster
```

#### 2. OpenCTI not starting

**Cause**: Elasticsearch not ready

**Solution**:
```bash
# Check Elasticsearch status
kubectl logs -n security -l app=opencti-elasticsearch

# Restart OpenCTI after Elasticsearch is ready
kubectl rollout restart deployment/opencti -n security
```

#### 3. Ingress not working

**Cause**: NGINX Ingress Controller not installed

**Solution**:
```bash
# Install NGINX Ingress Controller
kubectl apply -f https://raw.githubusercontent.com/kubernetes/ingress-nginx/controller-v1.8.2/deploy/static/provider/cloud/deploy.yaml
```

## Security Best Practices

### 1. Change Default Passwords

After deployment, immediately change all default passwords:

```bash
# Update OpenCTI secrets
kubectl edit secret opencti-secrets -n security

# Update Wazuh secrets
kubectl edit secret wazuh-secrets -n security
```

### 2. Enable TLS/SSL

For production deployments, enable TLS:

```bash
# Create TLS secret
kubectl create secret tls security-tls \
  --cert=path/to/tls.crt \
  --key=path/to/tls.key \
  -n security

# Update ingress to use TLS
kubectl edit ingress opencti-ingress -n security
# Add tls section to spec
```

### 3. Configure Network Policies

Restrict network access between services:

```bash
kubectl apply -f - <<EOF
apiVersion: networking.k8s.io/v1
kind: NetworkPolicy
metadata:
  name: security-network-policy
  namespace: security
spec:
  podSelector: {}
  policyTypes:
  - Ingress
  - Egress
  ingress:
  - from:
    - namespaceSelector:
        matchLabels:
          name: idlr-production
  egress:
  - to:
    - namespaceSelector: {}
EOF
```

### 4. Enable RBAC

Restrict access to security namespace:

```bash
kubectl create role security-admin \
  --verb=get,list,watch,create,update,patch,delete \
  --resource=pods,services,deployments \
  -n security

kubectl create rolebinding security-admin-binding \
  --role=security-admin \
  --user=admin@idlr.gov.ng \
  -n security
```

## Integration with IDLR Application

The IDLR application integrates with these security services through the following components:

### Backend Integration

**File**: `server/securityIntegrationService.ts`

This service provides functions to interact with all security services:

- `getOpenCTIThreats()`: Fetch threat intelligence
- `getWazuhAlerts()`: Fetch security alerts
- `getOPAPolicyViolations()`: Fetch policy violations
- `getKubecostCostData()`: Fetch cost data

### API Endpoints

**File**: `server/api/routers/security-integration.ts`

tRPC procedures exposed to the frontend:

- `trpc.security.getThreats`
- `trpc.security.getAlerts`
- `trpc.security.getPolicyViolations`
- `trpc.security.getCostData`
- `trpc.security.getDashboardData`

### Frontend Dashboard

**File**: `client/src/pages/SecurityDashboard.tsx`

The Security Dashboard displays real-time data from all security services:

- Active threats from OpenCTI
- Security alerts from Wazuh
- Policy violations from OPA
- Cost anomalies from Kubecost

## Scaling

### Horizontal Pod Autoscaling

OPA is configured with HPA. To enable HPA for other services:

```bash
kubectl autoscale deployment opencti \
  --cpu-percent=70 \
  --min=1 \
  --max=3 \
  -n security
```

### Vertical Scaling

Increase resources for services:

```bash
kubectl edit deployment opencti -n security
# Update resources.requests and resources.limits
```

## Backup and Recovery

### Backup OpenCTI Data

```bash
# Backup Elasticsearch data
kubectl exec -n security -it <elasticsearch-pod> -- \
  elasticsearch-dump \
  --input=http://localhost:9200 \
  --output=/backup/opencti-backup.json
```

### Backup Wazuh Data

```bash
# Backup Wazuh configuration
kubectl exec -n security -it <wazuh-manager-pod> -- \
  tar -czf /backup/wazuh-config.tar.gz /var/ossec
```

## Upgrading

### Upgrade OpenCTI

```bash
# Update image version in deployment
kubectl set image deployment/opencti \
  opencti=opencti/platform:5.13.0 \
  -n security

# Monitor rollout
kubectl rollout status deployment/opencti -n security
```

### Upgrade Wazuh

```bash
# Update image version
kubectl set image deployment/wazuh-manager \
  wazuh-manager=wazuh/wazuh-manager:4.8.0 \
  -n security

kubectl rollout status deployment/wazuh-manager -n security
```

## Uninstalling

To remove all security services:

```bash
kubectl delete namespace security
```

To remove individual services:

```bash
kubectl delete -f opencti-deployment.yaml
kubectl delete -f wazuh-deployment.yaml
kubectl delete -f opa-kubecost-deployment.yaml
```

## Support

For issues or questions:

1. Check the [troubleshooting section](#monitoring-and-troubleshooting)
2. Review logs for specific services
3. Contact the IDLR platform team

## References

- [OpenCTI Documentation](https://docs.opencti.io/)
- [Wazuh Documentation](https://documentation.wazuh.com/)
- [OPA Documentation](https://www.openpolicyagent.org/docs/)
- [Kubecost Documentation](https://docs.kubecost.com/)
