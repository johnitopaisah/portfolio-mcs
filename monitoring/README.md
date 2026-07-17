# Monitoring & Observability

Production-grade observability stack for Portfolio MCS. Runs in the `monitoring` namespace on the same cluster as the application.

- **Grafana:** https://grafana.johnisah.com
- **Prometheus:** internal (port-forward to access: `kubectl port-forward -n monitoring svc/prometheus 9090:9090`)
- **Alertmanager:** internal (port-forward: `kubectl port-forward -n monitoring svc/alertmanager 9093:9093`)

---

## Components

| Component | Image | Purpose |
|---|---|---|
| Prometheus | `prom/prometheus:v2.51.0` | Time-series metrics store, 30-day retention, 5Gi PVC |
| Grafana | `grafana/grafana:10.4.0` | 13 dashboards at grafana.johnisah.com, 2Gi PVC |
| Alertmanager | `prom/alertmanager:v0.27.0` | Routes alerts → email (Zoho SMTP) + Telegram for critical severity |
| node-exporter | `prom/node-exporter:v1.7.0` | DaemonSet — OS/hardware metrics from all nodes |
| kube-state-metrics | `registry.k8s.io/kube-state-metrics/kube-state-metrics:v2.12.0` | Kubernetes object state — also backs CronJob/backup health, no app code needed |
| postgres-exporter | `quay.io/prometheuscommunity/postgres-exporter:v0.15.0` | PostgreSQL internals |
| Pushgateway | `prom/pushgateway:v1.9.0` | Bridges short-lived CronJobs (scraper, jobWorker, backups, secret checker) into the pull-based scrape model |
| blackbox-exporter | `prom/blackbox-exporter:v0.25.0` | Outside-in HTTP/TLS probes of the four public hostnames |
| infisical-secret-checker | `bitnami/kubectl:latest` (CronJob) | Polls InfisicalSecret Ready status every 15m, pushes to Pushgateway |

---

## Directory structure

```
monitoring/
├── README.md
├── api/
│   ├── metrics.js                  Reference copy of API Prometheus metric definitions
│   └── middleware.js               Reference copy of API metrics middleware
│
├── argocd/                         ArgoCD Application CRDs for the monitoring stack
│   ├── project.yaml
│   ├── app-prometheus.yaml
│   ├── app-grafana.yaml
│   ├── app-alertmanager.yaml
│   ├── app-exporters.yaml
│   ├── app-infisical.yaml
│   └── app-policies.yaml
│
├── infisical/                      Infisical CRDs — syncs monitoring secrets
│   ├── 01-grafana-secret.yaml      → grafana-admin-secret
│   ├── 02-alertmanager-secret.yaml → alertmanager-smtp-secret (SMTP password + Telegram bot token)
│   ├── 03-postgres-exporter-secret.yaml → postgres-exporter-secret
│   ├── 04-checker-serviceaccount.yaml   InfisicalSecret health-check CronJob
│   ├── 05-checker-rbac.yaml             ClusterRole: get/list infisicalsecrets (all namespaces)
│   └── 06-checker-cronjob.yaml          Every 15m — pushes Ready status to Pushgateway
│
├── prometheus/
│   ├── 00-namespace.yaml
│   ├── 01-rbac.yaml                ClusterRole to scrape all namespaces
│   ├── 02-configmap.yaml           prometheus.yml scrape config + alert rules
│   ├── 03-pvc.yaml                 5Gi persistent volume
│   ├── 04-statefulset.yaml
│   ├── 05-service.yaml
│   ├── 06-ingress.yaml
│   └── backup-manager.sh
│
├── pushgateway/                    Bridges short-lived CronJobs into Prometheus's pull model
│   ├── 00-serviceaccount.yaml
│   ├── 01-pvc.yaml                 1Gi — persists pushed samples across pod restarts
│   ├── 02-deployment.yaml
│   └── 03-service.yaml
│
├── grafana/
│   ├── 00-serviceaccount.yaml
│   ├── 01-pvc.yaml                 2Gi persistent volume
│   ├── 03-configmap-datasources.yaml   Prometheus datasource (auto-provisioned)
│   ├── 04-configmap-dashboard-provider.yaml
│   ├── 05-deployment.yaml
│   ├── 06-service.yaml
│   ├── 07-ingress.yaml             grafana.johnisah.com, TLS via cert-manager
│   ├── DASHBOARD_GUIDE.md
│   └── dashboards/
│       ├── 01-system-overview.yaml
│       ├── 02-api-performance.yaml
│       ├── 03-database-health.yaml
│       ├── 04-infrastructure.yaml
│       ├── 05-business-metrics.yaml
│       ├── 06-alerts-slo.yaml
│       ├── 07-visitor-analytics.yaml
│       ├── 08-web-api.yaml
│       ├── 09-job-pipeline.yaml         Scraper ingestion + AI filtering + alert delivery
│       ├── 10-batch-jobs.yaml           CronJob health, backup/DR, Infisical sync status
│       ├── 11-llm-observability.yaml    Per-provider LLM latency/errors/tokens/cost
│       ├── 12-frontend-rum.yaml         Core Web Vitals + JS errors (admin-ui, user-ui)
│       └── 13-external-uptime.yaml      Outside-in probes + TLS cert expiry
│
├── alertmanager/
│   ├── 01-serviceaccount.yaml
│   ├── 01-configmap.yaml           Routing rules + Zoho SMTP + Telegram receivers
│   ├── 03-deployment.yaml
│   └── 04-service.yaml
│
└── exporters/
    ├── node-exporter/
    │   ├── 01-serviceaccount.yaml
    │   ├── 02-daemonset.yaml       One pod per node
    │   └── 03-service.yaml
    ├── kube-state-metrics/
    │   └── 01-all.yaml             RBAC + Deployment + Service
    ├── postgres-exporter/
    │   ├── 01-serviceaccount.yaml
    │   └── 02-deployment.yaml
    └── blackbox-exporter/
        ├── 01-serviceaccount.yaml
        ├── 02-configmap.yaml       http_2xx probe module
        ├── 03-deployment.yaml
        └── 04-service.yaml
```

---

## Grafana dashboards

| # | Dashboard | Key panels |
|---|---|---|
| 1 | **System Overview** | Pod health, API error rate, DB connections, node CPU — at-a-glance summary |
| 2 | **API Performance** | Request rate, P50/P95/P99 latency, error rate by route, top slow routes |
| 3 | **Database Health** | Active connections, cache hit ratio, query duration, dead tuple rate, table sizes |
| 4 | **Infrastructure** | Node CPU/memory/disk per node, pod resource consumption, PVC usage |
| 5 | **Business Metrics** | Contact form submissions, auth events, project views, content update activity |
| 6 | **Alerts & SLO** | Active alerts by severity, 30-day availability SLO, multi-window error-budget burn rate |
| 7 | **Visitor Analytics** | Unique visitors, top countries, top pages, referrer breakdown, session trends |
| 8 | **Web API** | Node.js runtime health (heap, event-loop, GC), per-route breakdown, DB pool |
| 9 | **Job Pipeline** | Scraper ingestion/dedup by platform, AI filtering decisions, relevance scores, alert delivery |
| 10 | **Batch Jobs & Backups** | Every CronJob's last-run/failure status, backup age & size, Infisical secret sync |
| 11 | **LLM Observability** | Per-provider (Claude/Groq/Gemini) latency, errors, token usage, estimated spend |
| 12 | **Frontend RUM** | Core Web Vitals (LCP/CLS/INP/FCP/TTFB), JS error rate, slowest routes |
| 13 | **External Uptime & TLS** | Outside-in probe status, TLS cert days-remaining, probe latency breakdown |

---

## Secrets strategy

All secrets in the `monitoring` namespace are managed by the Infisical operator — no passwords in git.

### Required Infisical secrets (path: `/monitoring`, env: `prod`)

| Key | Creates K8s secret | Notes |
|---|---|---|
| `GRAFANA_ADMIN_USER` | `grafana-admin-secret` → `admin-user` | Use `admin` |
| `GRAFANA_ADMIN_PASSWORD` | `grafana-admin-secret` → `admin-password` | 16+ chars |
| `ALERTMANAGER_SMTP_PASSWORD` | `alertmanager-smtp-secret` → `smtp-password` | Zoho app password |
| `TELEGRAM_BOT_TOKEN` | `alertmanager-smtp-secret` → `telegram-bot-token` | Same bot already used by the job-digest system (`notificationService.js`) |
| `MONITORING_DB_DSN` | `postgres-exporter-secret` → `DATA_SOURCE_NAME` | Full `postgresql://` DSN |

**Not Infisical-managed:** the Telegram `chat_id` in `alertmanager/01-configmap.yaml` (`telegram_configs[0].chat_id`) is a literal placeholder (`REPLACE_WITH_YOUR_TELEGRAM_CHAT_ID`) — it's a numeric identifier, not a credential, so it's set directly in the ConfigMap like `smtp_from`/`smtp_auth_username` already are.

---

## Deployment walkthrough

### Prerequisites

1. `monitoring` namespace exists (created by `monitoring/prometheus/00-namespace.yaml`)
2. Infisical machine identity secret exists in the `monitoring` namespace:

```bash
# Copy from the portfolio namespace (same identity)
CLIENT_ID=$(kubectl get secret infisical-machine-identity -n portfolio \
  -o jsonpath='{.data.clientId}' | base64 -d)
CLIENT_SECRET=$(kubectl get secret infisical-machine-identity -n portfolio \
  -o jsonpath='{.data.clientSecret}' | base64 -d)

kubectl create secret generic infisical-machine-identity \
  --namespace monitoring \
  --from-literal=clientId="$CLIENT_ID" \
  --from-literal=clientSecret="$CLIENT_SECRET"
```

### Via ArgoCD (recommended)

```bash
# Apply the monitoring root app — ArgoCD syncs everything
kubectl apply -f k8s/argocd/app-monitoring-root.yaml
```

### Manual apply order

```bash
kubectl apply -f monitoring/prometheus/00-namespace.yaml
kubectl apply -f monitoring/infisical/
kubectl apply -f monitoring/prometheus/01-rbac.yaml
kubectl apply -f monitoring/prometheus/02-configmap.yaml
kubectl apply -f monitoring/prometheus/03-pvc.yaml
kubectl apply -f monitoring/prometheus/04-statefulset.yaml
kubectl apply -f monitoring/prometheus/05-service.yaml
kubectl apply -f monitoring/pushgateway/
kubectl apply -f monitoring/exporters/node-exporter/
kubectl apply -f monitoring/exporters/kube-state-metrics/
kubectl apply -f monitoring/exporters/postgres-exporter/
kubectl apply -f monitoring/exporters/blackbox-exporter/
kubectl apply -f monitoring/alertmanager/
kubectl apply -f monitoring/grafana/
```

Also apply the CronJob egress additions and the new `allow-scraper` policy in `k8s/policies/04-network-policy.yaml` (scraper CronJobs had no explicit NetworkPolicy before this pass) if the CNI enforces NetworkPolicy in your cluster.

---

## Prometheus scrape targets

After deployment, all these targets should show **UP** at `http://localhost:9090/targets`:

| Job | Expected instances |
|---|---|
| `prometheus` | 1 |
| `portfolio-api` | 2 (matching replica count) |
| `node-exporter` | 1 per node |
| `kube-state-metrics` | 1 |
| `postgres-exporter` | 1 |
| `pushgateway` | 1 |
| `blackbox` | 4 (one per probed target) |

`pushgateway` and `blackbox` are always **UP** once their pods are running — they're the thing being scraped, not proxies for another target's liveness. To confirm CronJob-sourced metrics are actually flowing, check the Pushgateway UI (`kubectl port-forward -n monitoring svc/pushgateway 9091:9091`, then open `http://localhost:9091`) after the relevant CronJob's next scheduled run.

---

## Alert rules

Alerts are defined in `monitoring/prometheus/02-configmap.yaml` and routed to Alertmanager → email (Zoho SMTP, `connect@johnisah.com`) — critical severity also fires to Telegram.

| Alert | Condition | Severity |
|---|---|---|
| `APIDown` | `up{job="portfolio-api"} == 0` for 2 min | critical |
| `DatabaseDown` | `pg_up == 0` for 1 min | critical |
| `HighErrorRate` | HTTP 5xx rate > 10% for 5 min | critical |
| `DiskCritical` | Node disk free < 10% for 5 min | critical |
| `PodCrashLooping` | Pod restart rate > 0.05/hr for 5 min | critical |
| `HighLatency` | p95 latency > 500ms for 5 min | warning |
| `ElevatedErrorRate` | HTTP 5xx rate > 2% for 10 min | warning |
| `MemoryPressure` | Node memory > 80% for 10 min | warning |
| `DBConnectionsSaturated` | Connections > 75% of max for 10 min | warning |
| `DBCacheHitRatioLow` | Cache hit ratio < 90% for 15 min | warning |
| `PrometheusStorageLow` | TSDB storage > 70% of 5Gi PVC for 10 min | warning |
| `AuthFailureSpike` | Admin login failures > 0.1/s for 5 min | warning |
| `CronJobFailed` | Any of the 7 CronJobs reports a failed run for 5 min | critical |
| `CronJobDidNotRun` | A CronJob missed 2x its own schedule (per-job threshold) | critical/warning |
| `ErrorBudgetBurnFast` | 30d error budget burning >14.4x over both 1h & 5m windows | critical |
| `ErrorBudgetBurnSlow` | 30d error budget burning >6x over both 6h & 30m windows | warning |
| `ProbeFailed` | Public endpoint unreachable from outside the cluster for 2 min | critical |
| `TLSCertExpiringSoon` | TLS cert expires in < 14 days | warning |
| `TLSCertExpiringCritical` | TLS cert expires in < 3 days | critical |
| `InfisicalSecretSyncFailed` | An InfisicalSecret's Ready condition is false for 15 min | critical |

---

## Quick health check

```bash
# All monitoring pods
kubectl get pods -n monitoring

# Infisical sync status
kubectl get infisicalsecrets -n monitoring

# Prometheus targets (requires port-forward)
kubectl port-forward -n monitoring svc/prometheus 9090:9090
# Open http://localhost:9090/targets

# Alertmanager
kubectl port-forward -n monitoring svc/alertmanager 9093:9093
# Open http://localhost:9093
```

---

## Troubleshooting

| Symptom | Likely cause | Fix |
|---|---|---|
| Infisical secret not created after 60s | Operator can't authenticate | `kubectl describe infisicalsecret <name> -n monitoring` |
| `portfolio-api` target DOWN | Network policy blocking port 4000 | Apply `k8s/policies/04-network-policy.yaml` |
| `postgres-exporter` CrashLoopBackOff | Wrong DSN or monitoring user missing | Verify `monitoring_user` exists in DB; check DSN in Infisical |
| Grafana shows "No Data" | Wrong Prometheus datasource URL | Datasource URL must be `http://prometheus:9090` |
| Grafana stuck in ContainerCreating | PVC not bound | `kubectl get pvc -n monitoring` — check storageClass |
| node-exporter pod count < node count | DaemonSet tolerations missing | `kubectl describe ds node-exporter -n monitoring` |
| Alertmanager not sending email | SMTP auth failed | `kubectl logs -n monitoring deploy/alertmanager` |
| Alertmanager not sending Telegram | Wrong `chat_id` placeholder still in `01-configmap.yaml`, or bot token missing | Confirm `TELEGRAM_CHAT_ID` was set as a literal (not Infisical-synced) and `TELEGRAM_BOT_TOKEN` synced into `alertmanager-smtp-secret` |
| Job Pipeline / LLM / Batch Jobs dashboards show "No Data" | Pushgateway hasn't received a push yet | Wait for the relevant CronJob's next scheduled run, or trigger one manually: `kubectl create job --from=cronjob/job-ingestion-worker manual-test -n portfolio` |
| `blackbox` target DOWN | blackbox-exporter pod not ready, or egress to the public internet blocked | `kubectl logs -n monitoring deploy/blackbox-exporter`; confirm `monitoring-egress-policy` allows TCP 443 |
| `CronJobDidNotRun` firing incorrectly | CronJob's schedule changed but the alert's hardcoded threshold wasn't updated | Each threshold is 2x that job's own schedule — update the matching rule in `02-configmap.yaml` if a schedule changes |
