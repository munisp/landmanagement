# IDLR Security Infrastructure - Complete Deployment Guide

This guide provides step-by-step instructions for deploying the complete IDLR security infrastructure, including OpenCTI, Wazuh, OPA, and Kubecost.

## Table of Contents

1. [Prerequisites](#prerequisites)
2. [Pre-Deployment Checklist](#pre-deployment-checklist)
3. [Deployment Steps](#deployment-steps)
4. [Post-Deployment Configuration](#post-deployment-configuration)
5. [Wazuh Agent Installation](#wazuh-agent-installation)
6. [Monitoring and Maintenance](#monitoring-and-maintenance)
7. [Troubleshooting](#troubleshooting)
8. [Security Best Practices](#security-best-practices)

---

## Prerequisites

### Infrastructure Requirements

- **Kubernetes Cluster**: v1.24 or higher
- **kubectl**: Configured and authenticated
- **Compute Resources**:
  - Minimum: 12 CPU cores, 30GB RAM
  - Recommended: 16 CPU cores, 48GB RAM
- **Storage**: 200GB+ persistent storage
- **Network**: Stable internet connection for image pulls

### Software Requirements

- **NGINX Ingress Controller**: For external access
- **Metrics Server**: For resource monitoring (optional but recommended)
- **Helm** (optional): For advanced deployments

### Access Requirements

- Cluster admin permissions
- Ability to create namespaces, deployments, services, and ingresses
- DNS configuration access (for custom domains)

---

## Pre-Deployment Checklist

Before deploying, run the pre-flight check script:

```bash
cd infrastructure/kubernetes/security
./preflight-check.sh
```

This script validates:
- ✅ kubectl installation and cluster connectivity
- ✅ NGINX Ingress Controller
- ✅ Available cluster resources
- ✅ Storage provisioner
- ✅ RBAC permissions
- ✅ Network policies support

**Important**: Resolve all errors before proceeding. Warnings can be addressed but are not blocking.

---

## Deployment Steps

### Step 1: Configure Secrets

Generate and configure all required secrets:

```bash
./configure-secrets.sh
```

This script will:
1. Create the `security` namespace
2. Generate secure passwords and tokens
3. Create Kubernetes secrets for OpenCTI and Wazuh
4. Generate `.env.security` file for the IDLR application
5. Create `security-config` secret in your application namespace

**Save the displayed credentials securely!**

### Step 2: Review Deployment Configurations

Before deploying, review the configuration files:

```bash
# OpenCTI configuration
cat opencti-deployment.yaml

# Wazuh configuration
cat wazuh-deployment.yaml

# OPA and Kubecost configuration
cat opa-kubecost-deployment.yaml
```

**Optional**: Modify resource limits, replica counts, or storage sizes based on your requirements.

### Step 3: Deploy Security Services

Run the deployment script:

```bash
./deploy-security-services.sh
```

This script will:
1. Create the `security` namespace (if not exists)
2. Deploy OpenCTI and its dependencies (Elasticsearch, Redis, RabbitMQ, MinIO)
3. Deploy Wazuh and its dependencies (Indexer, Dashboard)
4. Deploy OPA and Kubecost
5. Wait for all services to be ready
6. Display access URLs and credentials

**Expected deployment time**: 10-15 minutes

### Step 4: Verify Deployment

Check the health of all services:

```bash
./health-check.sh
```

This will display:
- Pod status for all services
- Resource usage
- Service and ingress configuration
- Overall health summary

---

## Post-Deployment Configuration

### 1. Configure DNS

Add DNS entries for the ingress hosts:

```bash
# Get the ingress controller external IP
kubectl get svc -n ingress-nginx ingress-nginx-controller

# Add these entries to your DNS or /etc/hosts:
<EXTERNAL_IP> opencti.idlr.local
<EXTERNAL_IP> wazuh.idlr.local
<EXTERNAL_IP> kubecost.idlr.local
```

### 2. Access Security Services

#### OpenCTI

1. Navigate to `http://opencti.idlr.local`
2. Login with credentials from deployment output
3. Complete initial setup wizard
4. Configure threat intelligence feeds

#### Wazuh Dashboard

1. Navigate to `http://wazuh.idlr.local`
2. Login with credentials from deployment output
3. Verify manager is connected
4. Configure alert rules

#### Kubecost

1. Navigate to `http://kubecost.idlr.local`
2. Review cost allocation dashboard
3. Configure cost alerts

### 3. Configure IDLR Application

Update your IDLR application deployment to use the security services:

```yaml
# Add to your deployment manifest
apiVersion: apps/v1
kind: Deployment
metadata:
  name: idlr-app
  namespace: idlr-production
spec:
  template:
    spec:
      containers:
      - name: idlr-app
        envFrom:
        - secretRef:
            name: security-config
```

Or for development:

```bash
# Copy environment variables
cat .env.security >> /path/to/idlr/.env

# Restart your application
```

### 4. Enable TLS/SSL (Production)

For production deployments, enable TLS:

```bash
# Create TLS secret
kubectl create secret tls security-tls \
  --cert=/path/to/tls.crt \
  --key=/path/to/tls.key \
  -n security

# Update ingresses to use TLS
kubectl patch ingress opencti-ingress -n security --type='json' \
  -p='[{"op": "add", "path": "/spec/tls", "value": [{"hosts": ["opencti.idlr.local"], "secretName": "security-tls"}]}]'

kubectl patch ingress wazuh-ingress -n security --type='json' \
  -p='[{"op": "add", "path": "/spec/tls", "value": [{"hosts": ["wazuh.idlr.local"], "secretName": "security-tls"}]}]'

kubectl patch ingress kubecost-ingress -n security --type='json' \
  -p='[{"op": "add", "path": "/spec/tls", "value": [{"hosts": ["kubecost.idlr.local"], "secretName": "security-tls"}]}]'
```

---

## Wazuh Agent Installation

Install Wazuh agents on all servers that need monitoring.

### Linux Servers

```bash
# Copy the installation script to the target server
scp wazuh-agent-install-linux.sh user@server:/tmp/

# SSH to the server and run as root
ssh user@server
sudo bash /tmp/wazuh-agent-install-linux.sh
```

The script will prompt for:
- Wazuh Manager address
- Agent name (defaults to hostname)
- Agent groups (defaults to "idlr,production")

### Windows Servers

```powershell
# Copy the installation script to the target server
# Then run in PowerShell as Administrator:

.\wazuh-agent-install-windows.ps1 `
  -WazuhManager "wazuh-manager.security.svc.cluster.local" `
  -AgentName "windows-server-01" `
  -AgentGroups "idlr,production"
```

### Verify Agent Registration

Check registered agents on the Wazuh manager:

```bash
kubectl exec -n security deployment/wazuh-manager -- /var/ossec/bin/agent_control -l
```

### Agent Groups and Policies

Configure agent groups in Wazuh Dashboard:
1. Navigate to **Management** → **Groups**
2. Create groups: `idlr`, `production`, `staging`, `web-servers`, `db-servers`
3. Assign policies to each group
4. Agents will automatically apply group policies

---

## Monitoring and Maintenance

### Continuous Health Monitoring

Run continuous health checks:

```bash
./health-check.sh --continuous --interval 300
```

This will check service health every 5 minutes.

### View Logs

```bash
# OpenCTI logs
kubectl logs -n security -l app=opencti --tail=100 -f

# Wazuh Manager logs
kubectl logs -n security -l app=wazuh-manager --tail=100 -f

# OPA logs
kubectl logs -n security -l app=opa --tail=100 -f

# Kubecost logs
kubectl logs -n security -l app=kubecost --tail=100 -f
```

### Resource Monitoring

```bash
# Check resource usage
kubectl top pods -n security

# Check node resource usage
kubectl top nodes
```

### Backup and Recovery

#### Backup OpenCTI Data

```bash
# Backup Elasticsearch data
kubectl exec -n security deployment/opencti-elasticsearch -- \
  curl -X PUT "localhost:9200/_snapshot/backup" \
  -H 'Content-Type: application/json' \
  -d '{"type": "fs", "settings": {"location": "/backup"}}'

# Create snapshot
kubectl exec -n security deployment/opencti-elasticsearch -- \
  curl -X PUT "localhost:9200/_snapshot/backup/snapshot_$(date +%Y%m%d)" \
  -H 'Content-Type: application/json' \
  -d '{"indices": "*"}'
```

#### Backup Wazuh Configuration

```bash
# Backup Wazuh manager configuration
kubectl exec -n security deployment/wazuh-manager -- \
  tar -czf /backup/wazuh-config-$(date +%Y%m%d).tar.gz /var/ossec/etc

# Copy backup to local machine
kubectl cp security/wazuh-manager-xxx:/backup/wazuh-config-$(date +%Y%m%d).tar.gz \
  ./wazuh-backup-$(date +%Y%m%d).tar.gz
```

### Scaling

#### Horizontal Scaling

```bash
# Scale OPA (already has HPA configured)
kubectl scale deployment opa -n security --replicas=5

# Scale Wazuh Dashboard
kubectl scale deployment wazuh-dashboard -n security --replicas=2
```

#### Vertical Scaling

```bash
# Update resource limits
kubectl edit deployment opencti -n security
# Modify resources.requests and resources.limits
```

---

## Troubleshooting

### Common Issues

#### 1. Pods Stuck in Pending

**Cause**: Insufficient resources

**Solution**:
```bash
kubectl describe pod <pod-name> -n security
# Check for resource constraints
# Scale your cluster or reduce resource requests
```

#### 2. OpenCTI Not Starting

**Cause**: Elasticsearch not ready

**Solution**:
```bash
# Check Elasticsearch status
kubectl logs -n security -l app=opencti-elasticsearch

# Wait for Elasticsearch to be ready
kubectl wait --for=condition=ready pod -l app=opencti-elasticsearch -n security --timeout=600s

# Restart OpenCTI
kubectl rollout restart deployment/opencti -n security
```

#### 3. Wazuh Agents Not Connecting

**Cause**: Network connectivity or firewall

**Solution**:
```bash
# Check Wazuh manager service
kubectl get svc wazuh-manager -n security

# Test connectivity from agent
telnet <wazuh-manager-ip> 1514

# Check firewall rules
# Ensure port 1514/TCP is open
```

#### 4. High Resource Usage

**Cause**: Insufficient resources or memory leaks

**Solution**:
```bash
# Check resource usage
kubectl top pods -n security

# Restart high-usage pods
kubectl rollout restart deployment/<deployment-name> -n security

# Consider scaling up resources
```

#### 5. Ingress Not Working

**Cause**: NGINX Ingress Controller not installed or misconfigured

**Solution**:
```bash
# Install NGINX Ingress Controller
kubectl apply -f https://raw.githubusercontent.com/kubernetes/ingress-nginx/controller-v1.8.2/deploy/static/provider/cloud/deploy.yaml

# Check ingress controller status
kubectl get pods -n ingress-nginx

# Verify ingress configuration
kubectl describe ingress -n security
```

### Getting Help

1. Check logs for specific errors
2. Review Kubernetes events: `kubectl get events -n security --sort-by='.lastTimestamp'`
3. Consult service-specific documentation:
   - [OpenCTI Docs](https://docs.opencti.io/)
   - [Wazuh Docs](https://documentation.wazuh.com/)
   - [OPA Docs](https://www.openpolicyagent.org/docs/)
   - [Kubecost Docs](https://docs.kubecost.com/)

---

## Security Best Practices

### 1. Change Default Passwords

Immediately change all default passwords after deployment:

```bash
# Update secrets
kubectl edit secret opencti-secrets -n security
kubectl edit secret wazuh-secrets -n security
```

### 2. Enable Network Policies

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
    - namespaceSelector:
        matchLabels:
          name: security
  egress:
  - to:
    - namespaceSelector: {}
EOF
```

### 3. Enable RBAC

Create role-based access control:

```bash
# Create security admin role
kubectl create role security-admin \
  --verb=get,list,watch,create,update,patch,delete \
  --resource=pods,services,deployments \
  -n security

# Bind to user
kubectl create rolebinding security-admin-binding \
  --role=security-admin \
  --user=admin@idlr.gov.ng \
  -n security
```

### 4. Enable Audit Logging

Enable Kubernetes audit logging to track all API calls:

```bash
# Add to kube-apiserver configuration
--audit-log-path=/var/log/kubernetes/audit.log
--audit-log-maxage=30
--audit-log-maxbackup=10
--audit-log-maxsize=100
```

### 5. Regular Updates

Keep all services updated:

```bash
# Update image versions in deployment manifests
kubectl set image deployment/opencti opencti=opencti/platform:5.13.0 -n security
kubectl set image deployment/wazuh-manager wazuh-manager=wazuh/wazuh-manager:4.8.0 -n security
```

### 6. Implement Pod Security Standards

Apply pod security standards:

```bash
kubectl label namespace security pod-security.kubernetes.io/enforce=restricted
kubectl label namespace security pod-security.kubernetes.io/audit=restricted
kubectl label namespace security pod-security.kubernetes.io/warn=restricted
```

---

## Next Steps

After successful deployment:

1. ✅ Configure threat intelligence feeds in OpenCTI
2. ✅ Set up alert rules in Wazuh
3. ✅ Configure cost alerts in Kubecost
4. ✅ Install Wazuh agents on all servers
5. ✅ Test SecurityDashboard in IDLR application
6. ✅ Set up backup schedules
7. ✅ Configure monitoring and alerting
8. ✅ Document incident response procedures

---

## Support

For issues or questions:
- Review this guide and the README.md
- Check service-specific documentation
- Contact the IDLR platform team

---

**Deployment Checklist**

- [ ] Pre-flight check passed
- [ ] Secrets configured
- [ ] Services deployed
- [ ] Health check passed
- [ ] DNS configured
- [ ] Services accessible via ingress
- [ ] IDLR application configured
- [ ] Wazuh agents installed
- [ ] TLS/SSL enabled (production)
- [ ] Network policies applied
- [ ] RBAC configured
- [ ] Backup schedule configured
- [ ] Monitoring configured
- [ ] Documentation updated
