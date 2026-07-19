# Production Runbook

## Purpose

This runbook defines the operational sequence for releasing, validating, monitoring, and recovering the landmanagement platform in a production environment. It is designed to complement the existing deployment guides, validation records, UAT summary, monitoring assets, and disaster-recovery surfaces already present in the repository.

## Release Preparation

Operators should begin by confirming that the current branch has passed TypeScript validation, production build verification, and automated tests. They should review the latest change manifest, remaining-scope audit, and validation status note to confirm that the release candidate corresponds to the intended closure tranche. They should also verify that required environment variables, secrets, connector credentials, DNS records, certificates, storage buckets, and database access policies are present in the target environment.

## Deployment Sequence

The recommended deployment order is application services first, followed by integration services, followed by security and monitoring services. Infrastructure manifests, Helm values, Kubernetes namespaces, ingress rules, persistent volumes, and database connectivity should be validated before workload rollout. After deployment, operators should verify readiness probes, background workflow startup, WebSocket availability, report scheduling services, and core authenticated routes.

## Smoke Tests

After rollout, operators should execute smoke checks for authentication, parcel search, transaction initiation, document processing, dashboard loading, mortgage workflows, tax workflows, support center, marketing center, security monitoring, IoT operations, civic compliance workflows, and the newest sector modules such as heritage, agriculture, mining, coastal, forest, and infrastructure centers. They should also confirm that notification delivery, report scheduling, and audit logging remain functional.

## Monitoring and Alerting

Production monitoring should include application health, API latency, error rate, queue depth, database saturation, storage growth, and security alerts. Operators should review the existing Prometheus and Grafana assets together with integration-health and security dashboards. Any spike in failed requests, authentication anomalies, or background job backlog should trigger incident review.

## Backup and Recovery

Before high-risk maintenance, operators should confirm that database snapshots, object-storage backups, and configuration exports have completed successfully. Restoration should be rehearsed against a non-production environment before any live recovery event. Recovery validation should include user login, parcel retrieval, transaction access, document rendering, and workflow mutation tests.

## Incident Handling

For application incidents, operators should identify scope, freeze unsafe mutations if needed, capture logs, preserve request identifiers, and assess whether a rollback is safer than hot-fixing in place. For security incidents, operators should follow the existing security playbooks, blocked-IP procedures, and incident-response workflows. For data incidents, they should preserve forensic artifacts and coordinate restoration only after impact scope is understood.

## Rollback

If deployment health checks fail, operators should revert to the last known good release, re-run smoke tests, and record the failure mode in the release log. Any rollback must include a review of schema migrations, asynchronous jobs, and background workflow compatibility to ensure state consistency.

## Operational Cadence

A weekly review should cover open alerts, backup success, certificate expiry, storage growth, dependency updates, and security posture. A monthly review should cover capacity planning, disaster-recovery rehearsal evidence, runbook updates, and alignment between the repository tracker and the production operating model.
