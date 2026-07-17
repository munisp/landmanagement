# IDLR Security Infrastructure - Deployment Timeline & Rollback Procedures

This document provides detailed deployment timelines, rollback procedures, and disaster recovery plans for the IDLR security infrastructure.

---

## Table of Contents

1. [Deployment Timeline](#deployment-timeline)
2. [Rollback Procedures](#rollback-procedures)
3. [Disaster Recovery Plans](#disaster-recovery-plans)
4. [Emergency Contacts](#emergency-contacts)

---

## Deployment Timeline

### Overview

Total estimated deployment time: **60-90 minutes**

This timeline assumes:
- Pre-flight check completed successfully
- Secrets configured
- DNS records prepared
- Team members available for verification

###Phase 1: Pre-Deployment (15-20 minutes)

| Time | Task | Owner | Status |
|------|------|-------|--------|
| T-20 | Run pre-flight check | Infrastructure Team | ⬜ |
| T-15 | Review pre-flight results | Infrastructure + Security Teams | ⬜ |
| T-10 | Configure secrets | Security Team | ⬜ |
| T-5 | Create DNS records (or prepare) | Network Team | ⬜ |
| T-0 | Go/No-Go decision | Project Lead | ⬜ |

**Deliverables:**
- ✅ Pre-flight check report (all critical checks passed)
- ✅ Secrets configured in Kubernetes
- ✅ DNS records created or ready to create
- ✅ Team members on standby

**Go/No-Go Criteria:**
- ✅ All critical pre-flight checks passed
- ✅ Sufficient cluster resources available
- ✅ Backup/rollback procedures documented
- ✅ Team members available for 2 hours
- ✅ No other critical deployments in progress

---

### Phase 2: Core Infrastructure Deployment (20-30 minutes)

| Time | Task | Command | Expected Duration | Status |
|------|------|---------|-------------------|--------|
| T+0 | Create security namespace | `kubectl create namespace security` | 5 seconds | ⬜ |
| T+0 | Deploy OpenCTI dependencies | `kubectl apply -f opencti-deployment.yaml` (dependencies only) | 10-15 minutes | ⬜ |
| T+15 | Verify Elasticsearch ready | `kubectl wait --for=condition=ready pod -l app=opencti-elasticsearch -n security --timeout=600s` | Wait | ⬜ |
| T+15 | Verify Redis ready | `kubectl wait --for=condition=ready pod -l app=opencti-redis -n security --timeout=300s` | Wait | ⬜ |
| T+15 | Verify RabbitMQ ready | `kubectl wait --for=condition=ready pod -l app=opencti-rabbitmq -n security --timeout=300s` | Wait | ⬜ |
| T+15 | Verify MinIO ready | `kubectl wait --for=condition=ready pod -l app=opencti-minio -n security --timeout=300s` | Wait | ⬜ |
| T+20 | Deploy OpenCTI platform | `kubectl apply -f opencti-deployment.yaml` (platform only) | 5-10 minutes | ⬜ |
| T+30 | Verify OpenCTI ready | `kubectl wait --for=condition=ready pod -l app=opencti -n security --timeout=600s` | Wait | ⬜ |

**Health Check:**
```bash
kubectl get pods -n security -l app=opencti
kubectl logs -n security -l app=opencti --tail=50
```

**Rollback Point 1:** If OpenCTI fails to start, proceed to [Rollback Procedure A](#rollback-procedure-a)

---

### Phase 3: Wazuh Deployment (15-20 minutes)

| Time | Task | Command | Expected Duration | Status |
|------|------|---------|-------------------|--------|
| T+30 | Deploy Wazuh Indexer | `kubectl apply -f wazuh-deployment.yaml` (indexer only) | 5-10 minutes | ⬜ |
| T+40 | Verify Wazuh Indexer ready | `kubectl wait --for=condition=ready pod -l app=wazuh-indexer -n security --timeout=600s` | Wait | ⬜ |
| T+40 | Deploy Wazuh Manager | `kubectl apply -f wazuh-deployment.yaml` (manager only) | 5-10 minutes | ⬜ |
| T+50 | Verify Wazuh Manager ready | `kubectl wait --for=condition=ready pod -l app=wazuh-manager -n security --timeout=600s` | Wait | ⬜ |
| T+50 | Deploy Wazuh Dashboard | `kubectl apply -f wazuh-deployment.yaml` (dashboard only) | 3-5 minutes | ⬜ |
| T+55 | Verify Wazuh Dashboard ready | `kubectl wait --for=condition=ready pod -l app=wazuh-dashboard -n security --timeout=300s` | Wait | ⬜ |

**Health Check:**
```bash
kubectl get pods -n security -l app=wazuh-manager
kubectl exec -n security deployment/wazuh-manager -- /var/ossec/bin/wazuh-control status
```

**Rollback Point 2:** If Wazuh fails to start, proceed to [Rollback Procedure B](#rollback-procedure-b)

---

### Phase 4: OPA and Kubecost Deployment (5-10 minutes)

| Time | Task | Command | Expected Duration | Status |
|------|------|---------|-------------------|--------|
| T+55 | Deploy OPA | `kubectl apply -f opa-kubecost-deployment.yaml` (OPA only) | 2-3 minutes | ⬜ |
| T+57 | Verify OPA ready | `kubectl wait --for=condition=ready pod -l app=opa -n security --timeout=300s` | Wait | ⬜ |
| T+57 | Deploy Kubecost | `kubectl apply -f opa-kubecost-deployment.yaml` (Kubecost only) | 3-5 minutes | ⬜ |
| T+60 | Verify Kubecost ready | `kubectl wait --for=condition=ready pod -l app=kubecost -n security --timeout=300s` | Wait | ⬜ |

**Health Check:**
```bash
kubectl get pods -n security -l app=opa
kubectl get pods -n security -l app=kubecost
```

**Rollback Point 3:** If OPA/Kubecost fails, proceed to [Rollback Procedure C](#rollback-procedure-c)

---

### Phase 5: Ingress and DNS Configuration (5-10 minutes)

| Time | Task | Command | Expected Duration | Status |
|------|------|---------|-------------------|--------|
| T+60 | Deploy ingresses | `kubectl apply -f opencti-deployment.yaml,wazuh-deployment.yaml,opa-kubecost-deployment.yaml` (ingresses only) | 1 minute | ⬜ |
| T+61 | Verify ingress created | `kubectl get ingress -n security` | 10 seconds | ⬜ |
| T+61 | Update DNS records | Manual or External DNS | 2-5 minutes | ⬜ |
| T+66 | Test DNS resolution | `nslookup opencti.idlr.gov.ng` | 1 minute | ⬜ |
| T+67 | Test ingress connectivity | `curl -I http://opencti.idlr.gov.ng` | 1 minute | ⬜ |

**Health Check:**
```bash
kubectl get ingress -n security
kubectl describe ingress opencti-ingress -n security
```

---

### Phase 6: Verification and Testing (10-15 minutes)

| Time | Task | Command | Expected Duration | Status |
|------|------|---------|-------------------|--------|
| T+67 | Run health check script | `./health-check.sh` | 2-3 minutes | ⬜ |
| T+70 | Access OpenCTI UI | Browser: `http://opencti.idlr.gov.ng` | 2 minutes | ⬜ |
| T+72 | Access Wazuh Dashboard | Browser: `http://wazuh.idlr.gov.ng` | 2 minutes | ⬜ |
| T+74 | Access Kubecost UI | Browser: `http://kubecost.idlr.gov.ng` | 2 minutes | ⬜ |
| T+76 | Test IDLR app integration | Check SecurityDashboard | 3-5 minutes | ⬜ |
| T+80 | Document deployment | Update deployment log | 2 minutes | ⬜ |

**Verification Checklist:**
- ✅ All pods running (0 restarts)
- ✅ All services accessible via ingress
- ✅ OpenCTI login working
- ✅ Wazuh Dashboard login working
- ✅ Kubecost displaying data
- ✅ IDLR SecurityDashboard showing real data
- ✅ No errors in logs

---

### Phase 7: Post-Deployment (5 minutes)

| Time | Task | Owner | Status |
|------|------|-------|--------|
| T+80 | Notify stakeholders | Project Lead | ⬜ |
| T+82 | Schedule Wazuh agent installation | Security Team | ⬜ |
| T+84 | Enable monitoring alerts | Operations Team | ⬜ |
| T+85 | Update documentation | Documentation Team | ⬜ |
| T+90 | Deployment complete | All | ⬜ |

---

## Rollback Procedures

### General Rollback Principles

1. **Decision Time:** Make rollback decision within 5 minutes of issue detection
2. **Communication:** Notify all stakeholders immediately
3. **Data Preservation:** Capture logs and state before rollback
4. **Root Cause:** Document issue for post-mortem

### Rollback Procedure A: OpenCTI Failure

**Symptoms:**
- OpenCTI pods in CrashLoopBackOff
- OpenCTI unable to connect to dependencies
- OpenCTI API not responding

**Rollback Steps:**

```bash
# 1. Capture logs
kubectl logs -n security -l app=opencti --tail=500 > opencti-failure-$(date +%Y%m%d-%H%M%S).log
kubectl logs -n security -l app=opencti-elasticsearch --tail=500 >> opencti-failure-$(date +%Y%m%d-%H%M%S).log

# 2. Delete OpenCTI deployment
kubectl delete deployment opencti -n security

# 3. Delete OpenCTI dependencies
kubectl delete deployment opencti-elasticsearch opencti-redis opencti-rabbitmq opencti-minio -n security

# 4. Delete services
kubectl delete service opencti opencti-elasticsearch opencti-redis opencti-rabbitmq opencti-minio -n security

# 5. Delete PVCs (optional - only if data is corrupted)
kubectl delete pvc -n security -l app=opencti

# 6. Verify cleanup
kubectl get all -n security

# 7. Review logs and fix configuration
# 8. Retry deployment with fixes
```

**Estimated Rollback Time:** 5-10 minutes

---

### Rollback Procedure B: Wazuh Failure

**Symptoms:**
- Wazuh Manager pods in CrashLoopBackOff
- Wazuh Indexer not starting
- Wazuh agents unable to connect

**Rollback Steps:**

```bash
# 1. Capture logs
kubectl logs -n security -l app=wazuh-manager --tail=500 > wazuh-failure-$(date +%Y%m%d-%H%M%S).log
kubectl logs -n security -l app=wazuh-indexer --tail=500 >> wazuh-failure-$(date +%Y%m%d-%H%M%S).log

# 2. Delete Wazuh deployments
kubectl delete deployment wazuh-manager wazuh-dashboard wazuh-indexer -n security

# 3. Delete services
kubectl delete service wazuh-manager wazuh-dashboard wazuh-indexer -n security

# 4. Delete PVCs (optional - only if data is corrupted)
kubectl delete pvc -n security -l app=wazuh-manager
kubectl delete pvc -n security -l app=wazuh-indexer

# 5. Verify cleanup
kubectl get all -n security -l app=wazuh-manager

# 6. Review logs and fix configuration
# 7. Retry deployment with fixes
```

**Estimated Rollback Time:** 5-10 minutes

**Note:** OpenCTI remains running during Wazuh rollback

---

### Rollback Procedure C: OPA/Kubecost Failure

**Symptoms:**
- OPA pods in CrashLoopBackOff
- Kubecost not displaying data

**Rollback Steps:**

```bash
# 1. Capture logs
kubectl logs -n security -l app=opa --tail=500 > opa-failure-$(date +%Y%m%d-%H%M%S).log
kubectl logs -n security -l app=kubecost --tail=500 >> kubecost-failure-$(date +%Y%m%d-%H%M%S).log

# 2. Delete deployments
kubectl delete deployment opa kubecost -n security

# 3. Delete services
kubectl delete service opa kubecost -n security

# 4. Verify cleanup
kubectl get all -n security -l app=opa
kubectl get all -n security -l app=kubecost

# 5. Review logs and fix configuration
# 6. Retry deployment with fixes
```

**Estimated Rollback Time:** 3-5 minutes

**Note:** OpenCTI and Wazuh remain running during OPA/Kubecost rollback

---

### Complete Rollback: Remove All Security Infrastructure

**When to use:** Critical failure, need to start fresh

**Rollback Steps:**

```bash
# 1. Capture all logs
kubectl logs -n security --all-containers=true --tail=1000 > security-complete-failure-$(date +%Y%m%d-%H%M%S).log

# 2. Export current state
kubectl get all -n security -o yaml > security-state-backup-$(date +%Y%m%d-%H%M%S).yaml

# 3. Delete all resources in security namespace
kubectl delete all --all -n security

# 4. Delete PVCs
kubectl delete pvc --all -n security

# 5. Delete secrets (if needed)
kubectl delete secret opencti-secrets wazuh-secrets -n security

# 6. Delete namespace (optional)
kubectl delete namespace security

# 7. Verify complete cleanup
kubectl get all -n security
kubectl get pvc -n security
kubectl get secrets -n security

# 8. Review logs and plan redeployment
```

**Estimated Rollback Time:** 10-15 minutes

---

## Disaster Recovery Plans

### Scenario 1: Complete Cluster Failure

**Impact:** All security services unavailable

**Recovery Steps:**

1. **Immediate (0-15 minutes):**
   - Notify all stakeholders
   - Activate incident response team
   - Switch to backup monitoring (if available)

2. **Short-term (15-60 minutes):**
   - Restore cluster from backup or provision new cluster
   - Verify cluster health with pre-flight check
   - Restore PVC data from snapshots (if available)

3. **Deployment (60-90 minutes):**
   - Run complete deployment procedure
   - Restore configuration from backups
   - Verify all services operational

4. **Validation (90-120 minutes):**
   - Run health checks
   - Verify data integrity
   - Reconnect Wazuh agents
   - Test IDLR app integration

**Total Recovery Time:** 2-3 hours

---

### Scenario 2: Data Corruption

**Impact:** Security data (threats, alerts, logs) corrupted or lost

**Recovery Steps:**

1. **Assessment (0-15 minutes):**
   - Identify scope of corruption
   - Determine if backup is available
   - Decide on recovery strategy

2. **Isolation (15-30 minutes):**
   - Stop affected services
   - Prevent further data corruption
   - Capture current state for analysis

3. **Recovery (30-90 minutes):**
   - Restore from most recent backup
   - Or rebuild indices from raw data
   - Verify data integrity

4. **Validation (90-120 minutes):**
   - Compare restored data with expected state
   - Verify all services operational
   - Resume normal operations

**Total Recovery Time:** 2-3 hours

---

### Scenario 3: Security Breach

**Impact:** Security infrastructure compromised

**Recovery Steps:**

1. **Containment (0-15 minutes):**
   - Isolate affected components
   - Block suspicious traffic
   - Preserve evidence

2. **Investigation (15-60 minutes):**
   - Analyze logs and audit trails
   - Identify breach vector
   - Assess damage

3. **Remediation (60-180 minutes):**
   - Patch vulnerabilities
   - Rotate all secrets and credentials
   - Rebuild compromised components
   - Implement additional security controls

4. **Recovery (180-240 minutes):**
   - Restore services with enhanced security
   - Verify no backdoors remain
   - Resume normal operations with increased monitoring

**Total Recovery Time:** 4-6 hours

---

### Scenario 4: Resource Exhaustion

**Impact:** Services degraded or unavailable due to resource limits

**Recovery Steps:**

1. **Immediate (0-5 minutes):**
   - Identify resource bottleneck (CPU, memory, storage)
   - Check for resource leaks or attacks

2. **Mitigation (5-30 minutes):**
   - Scale up affected deployments
   - Add cluster nodes if needed
   - Implement resource limits/quotas

3. **Optimization (30-60 minutes):**
   - Tune service configurations
   - Optimize queries and workloads
   - Implement caching where applicable

4. **Prevention (60-90 minutes):**
   - Set up resource monitoring alerts
   - Implement auto-scaling policies
   - Document capacity planning

**Total Recovery Time:** 1-2 hours

---

## Backup Procedures

### Automated Backups (Recommended)

**Using Velero:**

```bash
# Install Velero
velero install --provider aws --bucket idlr-security-backups --secret-file ./credentials-velero

# Create backup schedule
velero schedule create security-daily \
  --schedule="0 2 * * *" \
  --include-namespaces security \
  --ttl 720h0m0s

# Create immediate backup
velero backup create security-manual-$(date +%Y%m%d-%H%M%S) \
  --include-namespaces security \
  --wait
```

### Manual Backups

**OpenCTI Data:**

```bash
# Backup Elasticsearch indices
kubectl exec -n security deployment/opencti-elasticsearch -- \
  curl -X PUT "localhost:9200/_snapshot/backup/snapshot_$(date +%Y%m%d)" \
  -H 'Content-Type: application/json' \
  -d '{"indices": "*"}'

# Export snapshot
kubectl cp security/opencti-elasticsearch-xxx:/backup ./opencti-backup-$(date +%Y%m%d).tar.gz
```

**Wazuh Configuration:**

```bash
# Backup Wazuh manager configuration
kubectl exec -n security deployment/wazuh-manager -- \
  tar -czf /tmp/wazuh-config.tar.gz /var/ossec/etc

# Copy backup
kubectl cp security/wazuh-manager-xxx:/tmp/wazuh-config.tar.gz \
  ./wazuh-config-backup-$(date +%Y%m%d).tar.gz
```

**Kubernetes Resources:**

```bash
# Backup all Kubernetes resources
kubectl get all -n security -o yaml > security-resources-backup-$(date +%Y%m%d).yaml

# Backup secrets
kubectl get secrets -n security -o yaml > security-secrets-backup-$(date +%Y%m%d).yaml
```

---

## Emergency Contacts

### Primary Contacts

| Role | Name | Email | Phone | Availability |
|------|------|-------|-------|--------------|
| Project Lead | TBD | lead@idlr.gov.ng | +234-XXX-XXX-XXXX | 24/7 |
| Infrastructure Lead | TBD | infra@idlr.gov.ng | +234-XXX-XXX-XXXX | 24/7 |
| Security Lead | TBD | security@idlr.gov.ng | +234-XXX-XXX-XXXX | 24/7 |
| Operations Lead | TBD | ops@idlr.gov.ng | +234-XXX-XXX-XXXX | Business hours |

### Escalation Path

1. **Level 1:** Operations Team (first responders)
2. **Level 2:** Infrastructure + Security Leads
3. **Level 3:** Project Lead + CTO
4. **Level 4:** Executive Management

### External Support

| Vendor | Support Type | Contact | SLA |
|--------|--------------|---------|-----|
| Cloud Provider | Infrastructure | support@cloud-provider.com | 1 hour response |
| OpenCTI | Threat Intelligence | support@opencti.io | Best effort |
| Wazuh | SIEM | support@wazuh.com | Best effort |

---

## Post-Deployment Checklist

After successful deployment, complete the following:

- [ ] All services verified operational
- [ ] DNS records updated and tested
- [ ] SSL/TLS certificates configured (production)
- [ ] Monitoring dashboards configured
- [ ] Alert rules configured
- [ ] Backup schedules configured
- [ ] Wazuh agents installation scheduled
- [ ] Documentation updated
- [ ] Team training scheduled
- [ ] Incident response procedures reviewed
- [ ] Compliance audit scheduled

---

## Revision History

| Date | Version | Author | Changes |
|------|---------|--------|---------|
| 2026-02-24 | 1.0 | IDLR Platform Team | Initial version |

---

**Document Owner:** IDLR Infrastructure Team  
**Last Updated:** 2026-02-24  
**Next Review:** 2026-03-24
