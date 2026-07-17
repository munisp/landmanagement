# Go-Live Checklist
## IDLR Property Title System - Production Deployment

**Version:** 1.0  
**Last Updated:** February 16, 2026  
**Owner:** DevOps & Engineering Team

---

## Pre-Deployment Checklist

### Infrastructure Readiness

- [ ] **Kubernetes Cluster**
  - [ ] Production cluster provisioned and configured
  - [ ] Node pools sized appropriately (3 master, 5+ worker nodes)
  - [ ] Auto-scaling configured (min: 5, max: 20 nodes)
  - [ ] Network policies applied
  - [ ] Resource quotas set per namespace

- [ ] **Database**
  - [ ] Production database provisioned (PostgreSQL/TiDB)
  - [ ] Streaming replication configured (1 primary + 2 replicas)
  - [ ] Patroni automatic failover tested
  - [ ] Backup automation configured (daily full + 6-hour incremental)
  - [ ] Point-in-time recovery tested
  - [ ] Connection pooling configured (PgBouncer)
  - [ ] Database indexes optimized
  - [ ] Query performance validated

- [ ] **Storage**
  - [ ] S3 buckets created and configured
  - [ ] Cross-region replication enabled
  - [ ] Versioning enabled (30-day retention)
  - [ ] Lifecycle policies configured
  - [ ] Access policies and IAM roles configured
  - [ ] CDN (Cloudflare) configured

- [ ] **Networking**
  - [ ] Load balancer configured (NGINX)
  - [ ] SSL/TLS certificates installed and validated
  - [ ] DNS records configured
  - [ ] DDoS protection enabled (Cloudflare)
  - [ ] WAF rules configured
  - [ ] Rate limiting configured
  - [ ] Health check endpoints configured

- [ ] **Monitoring & Observability**
  - [ ] Prometheus deployed and scraping metrics
  - [ ] Grafana dashboards created
  - [ ] Alert rules configured
  - [ ] PagerDuty integration tested
  - [ ] ELK stack deployed for log aggregation
  - [ ] Jaeger deployed for distributed tracing
  - [ ] Uptime monitoring configured (UptimeRobot/Pingdom)

### Application Readiness

- [ ] **Code Quality**
  - [ ] All unit tests passing (80%+ coverage)
  - [ ] All integration tests passing
  - [ ] E2E tests passing (Playwright)
  - [ ] Load tests passing (k6 - 1000 concurrent users)
  - [ ] Security scan completed (no critical vulnerabilities)
  - [ ] Code review completed
  - [ ] No TODO/FIXME comments in production code

- [ ] **Configuration**
  - [ ] Environment variables configured
  - [ ] Secrets stored in Kubernetes secrets
  - [ ] Feature flags configured
  - [ ] Rate limits configured
  - [ ] CORS policies configured
  - [ ] Session timeout configured
  - [ ] File upload limits configured

- [ ] **Security**
  - [ ] OWASP security headers configured
  - [ ] Content Security Policy (CSP) configured
  - [ ] SQL injection prevention validated
  - [ ] XSS protection validated
  - [ ] CSRF tokens implemented
  - [ ] Authentication tested (OAuth)
  - [ ] Authorization tested (RBAC)
  - [ ] Security audit completed
  - [ ] Penetration testing completed

- [ ] **Compliance**
  - [ ] GDPR compliance validated
  - [ ] NDPR (Nigeria) compliance validated
  - [ ] Data retention policies implemented
  - [ ] Audit trails configured
  - [ ] Privacy policy published
  - [ ] Terms of service published
  - [ ] Cookie consent implemented

- [ ] **Performance**
  - [ ] Page load time < 3 seconds
  - [ ] API response time < 500ms (p95)
  - [ ] Database query optimization completed
  - [ ] CDN caching configured
  - [ ] Browser caching configured
  - [ ] Image optimization completed
  - [ ] Code splitting implemented
  - [ ] Lazy loading implemented

### Documentation

- [ ] **Technical Documentation**
  - [ ] API documentation (Swagger/OpenAPI)
  - [ ] Architecture diagrams
  - [ ] Database schema documentation
  - [ ] Deployment guide
  - [ ] Disaster recovery plan
  - [ ] Runbook documentation
  - [ ] Troubleshooting guide

- [ ] **User Documentation**
  - [ ] User manual
  - [ ] Admin guide
  - [ ] FAQ
  - [ ] Video tutorials
  - [ ] Release notes

- [ ] **Operational Documentation**
  - [ ] On-call rotation schedule
  - [ ] Escalation procedures
  - [ ] Incident response plan
  - [ ] Change management process
  - [ ] Rollback procedures

### Team Readiness

- [ ] **Training**
  - [ ] Support team trained
  - [ ] Operations team trained
  - [ ] Admin users trained
  - [ ] Documentation reviewed

- [ ] **Communication**
  - [ ] Stakeholders notified
  - [ ] Users notified
  - [ ] Support team briefed
  - [ ] Status page prepared
  - [ ] Social media posts prepared

---

## Deployment Day Checklist

### T-24 Hours

- [ ] Final code freeze
- [ ] Final backup of production database
- [ ] Verify all team members available
- [ ] Confirm maintenance window with stakeholders
- [ ] Prepare rollback plan
- [ ] Test rollback procedure in staging

### T-4 Hours

- [ ] Update status page (maintenance scheduled)
- [ ] Send notification to users
- [ ] Verify backup completion
- [ ] Verify monitoring systems operational
- [ ] Verify on-call team ready

### T-1 Hour

- [ ] Final smoke tests in staging
- [ ] Verify deployment artifacts ready
- [ ] Verify database migrations tested
- [ ] Start war room (video call with team)

### T-0 (Deployment Start)

- [ ] Enable maintenance mode
- [ ] Take final database backup
- [ ] Run database migrations
- [ ] Deploy application (blue-green deployment)
- [ ] Verify health checks passing
- [ ] Run smoke tests
- [ ] Gradually route traffic (10% → 50% → 100%)
- [ ] Monitor error rates
- [ ] Monitor response times
- [ ] Monitor database performance

### T+30 Minutes

- [ ] Verify all services healthy
- [ ] Verify user authentication working
- [ ] Verify critical user flows working
- - [ ] Parcel registration
  - [ ] Transaction initiation
  - [ ] Document upload
  - [ ] Blockchain verification
- [ ] Verify integrations working
  - [ ] OAuth
  - [ ] Payment gateway
  - [ ] Blockchain network
  - [ ] FIRS API
- [ ] Monitor logs for errors
- [ ] Monitor metrics dashboards

### T+1 Hour

- [ ] Disable maintenance mode
- [ ] Update status page (operational)
- [ ] Send "go-live" notification to users
- [ ] Post on social media
- [ ] Continue monitoring for 4 hours

### T+4 Hours

- [ ] Verify no critical issues
- [ ] Verify performance metrics within SLA
- [ ] Verify error rates < 0.1%
- [ ] Document any issues encountered
- [ ] Hand off to on-call team
- [ ] Close war room

---

## Post-Deployment Checklist

### Day 1

- [ ] Monitor error rates
- [ ] Monitor performance metrics
- [ ] Monitor user feedback
- [ ] Review logs for anomalies
- [ ] Address any critical issues immediately

### Week 1

- [ ] Daily health checks
- [ ] Review monitoring dashboards
- [ ] Collect user feedback
- [ ] Address reported issues
- [ ] Update documentation based on learnings

### Week 2-4

- [ ] Weekly performance reviews
- [ ] Capacity planning review
- [ ] Security review
- [ ] Cost optimization review
- [ ] User satisfaction survey

---

## Rollback Procedure

### When to Rollback

Rollback immediately if:
- Critical functionality broken
- Error rate > 5%
- Performance degradation > 50%
- Security vulnerability discovered
- Data corruption detected

### Rollback Steps

1. **Announce Rollback**
   ```bash
   # Update status page
   curl -X POST https://status.idlr.gov.ng/api/incidents \
     -d '{"status": "major_outage", "message": "Rolling back deployment"}'
   ```

2. **Switch Traffic to Previous Version**
   ```bash
   # Update Kubernetes deployment
   kubectl rollout undo deployment/idlr-web -n production
   
   # Verify rollout status
   kubectl rollout status deployment/idlr-web -n production
   ```

3. **Rollback Database Migrations (if needed)**
   ```bash
   # Run down migrations
   cd /home/ubuntu/idlr-pts-platform
   pnpm db:rollback
   ```

4. **Verify Rollback**
   - Check health endpoints
   - Run smoke tests
   - Verify critical user flows
   - Monitor error rates

5. **Restore Database Backup (if needed)**
   ```bash
   # Stop application
   kubectl scale deployment/idlr-web --replicas=0 -n production
   
   # Restore database
   pg_restore -h primary -U postgres -d idlr_pts /backups/pre-deployment.dump
   
   # Restart application
   kubectl scale deployment/idlr-web --replicas=10 -n production
   ```

6. **Post-Rollback**
   - Update status page
   - Notify stakeholders
   - Conduct post-mortem
   - Fix issues before next deployment

---

## Success Criteria

Deployment is considered successful when:

- ✅ All health checks passing
- ✅ Error rate < 0.1%
- ✅ API response time < 500ms (p95)
- ✅ Page load time < 3 seconds
- ✅ All critical user flows working
- ✅ No data loss or corruption
- ✅ No security vulnerabilities
- ✅ Monitoring and alerting operational
- ✅ No critical issues reported
- ✅ User feedback positive

---

## Emergency Contacts

| Role | Name | Phone | Email |
|------|------|-------|-------|
| Incident Commander | [Name] | +234-XXX-XXXX | ic@idlr.gov.ng |
| DevOps Lead | [Name] | +234-XXX-XXXX | devops@idlr.gov.ng |
| Engineering Manager | [Name] | +234-XXX-XXXX | eng@idlr.gov.ng |
| DBA | [Name] | +234-XXX-XXXX | dba@idlr.gov.ng |
| Security Lead | [Name] | +234-XXX-XXXX | security@idlr.gov.ng |
| Product Manager | [Name] | +234-XXX-XXXX | pm@idlr.gov.ng |

**War Room:** https://meet.google.com/idlr-go-live

---

## Sign-Off

| Role | Name | Signature | Date |
|------|------|-----------|------|
| Engineering Manager | | | |
| DevOps Lead | | | |
| Security Lead | | | |
| Product Manager | | | |
| CTO | | | |

---

**Note:** This checklist must be completed and signed off before production deployment.
