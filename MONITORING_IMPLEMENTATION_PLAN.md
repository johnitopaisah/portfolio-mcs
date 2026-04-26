# Production-Grade Monitoring & Observability Implementation Plan
## Portfolio MCS Application

**Last Updated**: April 5, 2026  
**Status**: Planning Phase - Ready for Implementation

---

## 1. Executive Summary

This document outlines the implementation of a production-grade monitoring stack using **Prometheus** and **Grafana** for the Portfolio MCS application. The setup is designed for a single-node deployment with room for future scaling.

---

## 2. Clarified Requirements

| Requirement | Decision | Rationale |
|-------------|----------|-----------|
| **Alert Response Time (p95)** | 500ms-1s | Reasonable for a portfolio/API app; strict enough to catch issues |
| **Log Aggregation** | Metrics Only | Focus on core observability; can add Loki later if needed |
| **HA Setup** | Single Instance | Simplifies initial setup; can migrate to HA prometheus with external storage later |
| **Storage Capacity** | Plan for 50GB initial PVC | Supports 30-day retention at typical traffic levels (~10-50 QPS) |
| **Team Access** | Single user (isahjohna) | Grafana & Prometheus secured with strong authentication |
| **Existing Integrations** | None | Greenfield setup; can add integrations as needed |

---

## 3. Architecture Overview

```
┌─────────────────────────────────────────────────────────────┐
│                   Kubernetes Cluster                         │
├─────────────────────────────────────────────────────────────┤
│                                                               │
│  ┌──────────────┐  ┌──────────────┐  ┌──────────────┐      │
│  │   Admin UI   │  │  User UI     │  │  API Server  │      │
│  │  (Metrics)   │  │   (optional) │  │ (Prometheus) │      │
│  └──────────────┘  └──────────────┘  └──────────────┘      │
│         ▲                  ▲                  ▲              │
│         └──────────────────┴──────────────────┘              │
│                     (scrapes)                                │
│  ┌──────────────────────────────────────────────────────┐  │
│  │              Prometheus StatefulSet                   │  │
│  │         (/metrics endpoint, 15s scrape)              │  │
│  │      Storage: 50GB PVC (persistent volume)           │  │
│  └──────────────────────────────────────────────────────┘  │
│                           ▼                                  │
│  ┌──────────────────────────────────────────────────────┐  │
│  │           Alertmanager (optional for now)            │  │
│  │     Routes to Slack/Email (to be configured)         │  │
│  └──────────────────────────────────────────────────────┘  │
│                           ▼                                  │
│  ┌──────────────────────────────────────────────────────┐  │
│  │              Grafana Deployment                       │  │
│  │    Auth: Strong credentials (admin user only)        │  │
│  │  Dashboards: System, API, DB, Business Metrics       │  │
│  │    Storage: 10GB PVC (for configs & dashboards)      │  │
│  └──────────────────────────────────────────────────────┘  │
│                                                               │
│  ┌──────────────┐  ┌────────────────┐  ┌────────────────┐  │
│  │ Node-Exporter│  │kube-state-     │  │ postgres-      │  │
│  │ (DaemonSet)  │  │metrics (Dep)   │  │exporter (Dep)  │  │
│  └──────────────┘  └────────────────┘  └────────────────┘  │
│                                                               │
└─────────────────────────────────────────────────────────────┘

Legend:
- Prometheus scrapes metrics from /metrics endpoints
- Alertmanager processes alert rules
- Grafana visualizes Prometheus data
- Exporters provide infrastructure & database metrics
```

---

## 4. Components to Deploy

### 4.1 Core Components

#### **Prometheus**
- **Type**: StatefulSet (for persistent storage)
- **Replicas**: 1 (single instance, no HA)
- **Storage**: 50GB PVC (sufficient for ~30 days at typical traffic)
- **Scrape Config**: 
  - API: `http://api.default.svc.cluster.local:3000/metrics` (15s interval)
  - Node-Exporter: `http://node-exporter.default.svc.cluster.local:9100` (30s interval)
  - kube-state-metrics: `http://kube-state-metrics.default.svc.cluster.local:8080` (30s interval)
  - PostgreSQL Exporter: `http://postgres-exporter.default.svc.cluster.local:9187` (30s interval)
- **Resource Limits**: 2GB RAM, 1 CPU
- **Retention**: 30 days (14GB storage)

#### **Grafana**
- **Type**: Deployment (2 replicas for availability)
- **Storage**: 10GB PVC (dashboards, configs, user data)
- **Auth**: 
  - Default admin user: `admin` (strong password required)
  - Single user access initially (isahjohna)
  - RBAC: Admin role with all permissions
- **Data Source**: Prometheus (http://prometheus.default.svc.cluster.local:9090)
- **Resource Limits**: 512MB RAM, 0.5 CPU

#### **Alertmanager** (Optional, can be added later)
- **Type**: Deployment
- **Storage**: 2GB ConfigMap/Volume for rules and config

### 4.2 Exporters & Metrics Collectors

#### **Node-Exporter**
- **Type**: DaemonSet (one per node)
- **Metrics**: CPU, Memory, Disk, Network, Process stats
- **Port**: 9100

#### **kube-state-metrics**
- **Type**: Deployment
- **Metrics**: Pod status, Node status, Deployment replicas, StatefulSet status
- **Port**: 8080

#### **PostgreSQL Exporter**
- **Type**: Deployment (or sidecar in postgres pod)
- **Metrics**: Connections, TPS, Cache hit ratio, Replication lag, DB size
- **Port**: 9187
- **Config**: Connection string to PostgreSQL service

---

## 5. Application Instrumentation (Node.js API)

### 5.1 Metrics to Collect

**HTTP Request Metrics:**
- `http_requests_total` (counter): Total requests by endpoint, method, status
- `http_request_duration_seconds` (histogram): Request latency with buckets
- `http_requests_in_flight` (gauge): Current requests being processed

**Endpoint-Specific Metrics:**
- `auth_login_attempts_total` (counter): Login attempts by status
- `profile_views_total` (counter): Profile retrievals
- `certifications_created_total` (counter): New certifications
- `experiences_created_total` (counter): New experiences
- `projects_created_total` (counter): New projects
- `skills_updated_total` (counter): Skill updates

**Database Metrics:**
- `db_query_duration_seconds` (histogram): Query execution time by operation
- `db_pool_connections` (gauge): Active vs idle connections
- `db_errors_total` (counter): Database errors by type

**System Metrics:**
- `process_uptime_seconds` (gauge): API uptime
- `process_memory_bytes` (gauge): Memory usage
- `process_cpu_seconds_total` (counter): CPU time

### 5.2 Implementation Details

- **Library**: `prom-client` (npm package)
- **Middleware**: Express middleware for auto-instrumentation
- **Endpoint**: GET `/metrics` (Prometheus format)
- **No authentication on /metrics** within cluster (service-to-service, behind firewall)

---

## 6. Grafana Dashboards to Create

### 6.1 Dashboard 1: System Overview (Landing Page)
- **Panels**:
  - API Status (UP/DOWN)
  - Average Response Time (p50, p95, p99)
  - Error Rate (%)
  - Requests/minute
  - Database Connection Status
  - Disk Usage (%)
  - Memory Usage (%)
  - CPU Usage (%)

### 6.2 Dashboard 2: API Performance Deep Dive
- **Panels**:
  - HTTP Requests by Endpoint (table)
  - Response Time by Endpoint (sorted by p95)
  - Error Rate by Endpoint (sorted by highest)
  - Status Code Distribution (pie chart)
  - Requests Per Second Over Time
  - Top 10 Slowest Endpoints
  - 4xx & 5xx Errors Timeline
  - Endpoint-Specific Metrics (auth, profile, certs, etc.)

### 6.3 Dashboard 3: Database Health
- **Panels**:
  - Active Connections / Max Connections (gauge)
  - Query Duration Distribution (p50, p95, p99)
  - Queries Per Second by Type (SELECT, INSERT, UPDATE, DELETE)
  - Database Size Over Time
  - Cache Hit Ratio (%)
  - Slow Queries (>1s)
  - Transaction Duration
  - Replication Lag (if applicable)

### 6.4 Dashboard 4: Infrastructure & Nodes
- **Panels**:
  - Node CPU Usage (%)
  - Node Memory Usage (%)
  - Pod Count by Status
  - Container Restarts (timeline)
  - Disk I/O
  - Network I/O
  - Pod Eviction Events
  - Deployment Replica Status

### 6.5 Dashboard 5: Business Metrics (Portfolio-Specific)
- **Panels**:
  - Auth Endpoint Requests (daily trend)
  - Profile Completions
  - Certifications Created (daily)
  - Experiences Logged (daily)
  - Projects Added (daily)
  - Skills Updated (daily)
  - User Engagement Funnel

### 6.6 Dashboard 6: Alerts & Incidents
- **Panels**:
  - Active Alerts (current)
  - Alert History (last 24h)
  - Alert Frequency by Type
  - MTTR (Mean Time To Resolution)

---

## 7. Alert Rules

### 7.1 Critical Alerts (Page on-call)

| Alert | Condition | Duration | Action |
|-------|-----------|----------|--------|
| **API Down** | UP == 0 | 2 min | Page oncall |
| **High Error Rate** | error_rate > 10% | 5 min | Page oncall |
| **Database Unavailable** | postgres_up == 0 | 1 min | Page oncall |
| **Disk Critical** | disk_free < 5% | 5 min | Page oncall |

### 7.2 Warning Alerts (Slack notification)

| Alert | Condition | Duration | Action |
|-------|-----------|----------|--------|
| **High Latency** | p95_latency > 1s | 5 min | Slack #alerts |
| **High Error Rate** | error_rate > 5% | 5 min | Slack #alerts |
| **Memory Pressure** | memory_usage > 80% | 10 min | Slack #alerts |
| **High DB Connections** | connections > 80 of 100 | 10 min | Slack #alerts |
| **Slow Queries** | query_duration > 5s | 2 min | Slack #alerts |
| **Pod Restarts** | restart_count > 3 in 1h | 5 min | Slack #alerts |

---

## 8. Authentication & Security

### 8.1 Prometheus
- **Access**: Kubernetes internal ClusterIP (no external exposure initially)
- **Protection**: Network Policy (allow only Grafana pods)
- **Authorization**: None needed (API /metrics endpoint unauth'd behind firewall)

### 8.2 Grafana
- **Exposure**: Via Ingress (optional) or port-forward for now
- **Authentication**: 
  - Strong admin password (auto-generate or user-provided)
  - Single admin user: `isahjohna`
  - Optional: LDAP/OAuth later
- **Authorization**: Admin role (full access)
- **HTTPS**: Required when exposed externally (via Ingress TLS)

### 8.3 Network Policies
- Prometheus can scrape metrics from API, exporters, PostgreSQL
- Grafana can query Prometheus
- External access to Grafana: Via Ingress with authentication
- No public access to Prometheus

---

## 9. Storage Planning

### 9.1 Prometheus Storage Calculation
- **Assumptions**:
  - ~50 QPS average
  - ~500 time series across all metrics
  - 30-day retention
  
- **Calculation**:
  - Data points per day: 50 QPS × 86400s × 15s scrape interval = ~288M samples/day
  - Storage per day: ~2GB (depending on cardinality)
  - 30 days: ~60GB
  
- **Allocation**: **50GB PVC** (allows compression, WAL optimization)

### 9.2 Grafana Storage
- Dashboard configs: ~10-50MB
- User data: ~100MB
- Total: **10GB PVC** (plenty of headroom)

---

## 10. Implementation Phases

### Phase 1: Infrastructure (Week 1)
- [ ] Create Kubernetes namespace: `monitoring`
- [ ] Create PVCs (Prometheus 50GB, Grafana 10GB)
- [ ] Deploy Prometheus StatefulSet
- [ ] Deploy Grafana Deployment
- [ ] Deploy Node-Exporter DaemonSet
- [ ] Deploy kube-state-metrics
- [ ] Deploy PostgreSQL Exporter
- [ ] Configure Prometheus scrape targets
- [ ] Verify metrics collection

### Phase 2: Application Instrumentation (Week 1-2)
- [ ] Add `prom-client` to Node.js API
- [ ] Create Express middleware for HTTP metrics
- [ ] Add database query metrics
- [ ] Add custom business metrics
- [ ] Deploy updated API
- [ ] Verify metrics in Prometheus

### Phase 3: Grafana Dashboards (Week 2)
- [ ] Create System Overview dashboard
- [ ] Create API Performance dashboard
- [ ] Create Database Health dashboard
- [ ] Create Infrastructure dashboard
- [ ] Create Business Metrics dashboard
- [ ] Create Alerts dashboard

### Phase 4: Alerting (Week 2-3)
- [ ] Define alert rules (Prometheus)
- [ ] Configure Alertmanager
- [ ] Setup Slack/Email notifications
- [ ] Test alerts end-to-end
- [ ] Document runbooks

### Phase 5: Documentation & Handoff (Week 3)
- [ ] Write operational runbooks
- [ ] Document alert thresholds and rationale
- [ ] Create user guide for Grafana
- [ ] Setup backup strategy for Grafana dashboards
- [ ] Performance tuning pass

---

## 11. File Structure to Create

```
/monitoring/
├── README.md (monitoring setup guide)
├── prometheus/
│   ├── prometheus-configmap.yaml (scrape configs)
│   ├── prometheus-statefulset.yaml
│   ├── prometheus-service.yaml
│   ├── prometheus-pvc.yaml
│   ├── alert-rules.yaml
│   └── Dockerfile (if custom image needed)
├── grafana/
│   ├── grafana-configmap.yaml (datasources, plugins)
│   ├── grafana-deployment.yaml
│   ├── grafana-service.yaml
│   ├── grafana-pvc.yaml
│   ├── grafana-ingress.yaml (optional)
│   └── dashboards/ (exported JSON dashboards)
│       ├── 01-system-overview.json
│       ├── 02-api-performance.json
│       ├── 03-database-health.json
│       ├── 04-infrastructure.json
│       ├── 05-business-metrics.json
│       └── 06-alerts.json
├── exporters/
│   ├── node-exporter-daemonset.yaml
│   ├── kube-state-metrics-deployment.yaml
│   └── postgres-exporter-deployment.yaml
├── api/
│   └── src/
│       ├── monitoring/ (new directory)
│       │   ├── metrics.js (prom-client setup)
│       │   └── middleware.js (HTTP middleware)
│       └── index.js (updated with middleware)
└── scripts/
    ├── setup-monitoring.sh (automation)
    ├── backup-dashboards.sh (backup Grafana state)
    └── verify-metrics.sh (testing script)
```

---

## 12. Security Checklist

- [ ] Prometheus accessible only within cluster
- [ ] Grafana has strong admin password
- [ ] Grafana behind Ingress with TLS
- [ ] Network Policies restrict traffic to monitoring NS
- [ ] API /metrics endpoint behind firewall (k8s cluster only)
- [ ] RBAC: Monitoring service account least privilege
- [ ] Storage encrypted (if using managed K8s storage classes)
- [ ] No sensitive data logged/scraped
- [ ] Backup strategy for Grafana config & dashboards

---

## 13. Next Steps

**Ready to proceed with implementation:**
1. Create Kubernetes manifests for Prometheus, Grafana, and exporters
2. Implement prom-client instrumentation in Node.js API
3. Build Grafana dashboards
4. Configure alert rules
5. Deploy and test end-to-end

**Estimated Timeline**: 2-3 weeks (1 hour/day average)

---

## 14. Cost Estimation (if self-hosted)

| Component | Resource | Cost |
|-----------|----------|------|
| Prometheus PVC (50GB) | Storage | Low (~$5-10/month) |
| Grafana PVC (10GB) | Storage | Low (~$1-2/month) |
| Compute (K8s nodes) | CPU/RAM | Included in existing |
| **Total** | | ~$10-15/month |

---

## 15. Future Enhancements (Phase 2+)

- [ ] High Availability Prometheus (multiple replicas + external storage)
- [ ] Log aggregation with Loki
- [ ] Distributed tracing with Jaeger
- [ ] Custom alerts to PagerDuty
- [ ] SLA/SLO tracking dashboards
- [ ] Cost monitoring (if cloud-hosted)
- [ ] Automated scaling based on metrics
- [ ] Multi-team RBAC in Grafana

---

**Document Status**: ✅ Ready for Implementation  
**Reviewer**: Admin (isahjohna)  
**Approval**: Pending
