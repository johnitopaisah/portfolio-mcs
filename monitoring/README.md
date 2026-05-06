# Portfolio MCS — Monitoring & Observability

Production-grade Prometheus + Grafana monitoring stack for the Portfolio MCS
application running on a 3-node Minikube cluster.

---

## Components

| Component | Namespace | Purpose |
|---|---|---|
| Prometheus | monitoring | Time-series store (5Gi PVC, 30-day retention) |
| Grafana | monitoring | Dashboards at grafana.johnisah.com |
| Alertmanager | monitoring | Email alerts via Zoho Mail → connect@johnisah.com |
| node-exporter | monitoring | DaemonSet — OS metrics from all 3 nodes |
| kube-state-metrics | monitoring | Kubernetes object state metrics |
| postgres-exporter | monitoring | PostgreSQL internals |

## 6 Dashboards

1. **System Overview** — at-a-glance health for all services
2. **API Performance** — request rates, latency percentiles, errors by route
3. **Database Health** — connections, cache hit ratio, query duration, dead tuples
4. **Kubernetes Infrastructure** — node resources, pod health, PVC usage
5. **Business Metrics** — contact submissions, auth events, content activity
6. **Alerts & SLO** — active alerts, availability SLO, error budget

---

## Secrets strategy

All secrets in the `monitoring` namespace are managed by the Infisical operator,
identical to how the `portfolio` namespace works. No passwords are stored in git.

### Infisical secrets required (path: /monitoring, env: prod)

| Infisical key | Value | Creates K8s secret |
|---|---|---|
| `GRAFANA_ADMIN_USER` | `admin` | `grafana-admin-secret` → key `admin-user` |
| `GRAFANA_ADMIN_PASSWORD` | strong password ≥16 chars | `grafana-admin-secret` → key `admin-password` |
| `ALERTMANAGER_SMTP_PASSWORD` | Zoho app password | `alertmanager-smtp-secret` → key `smtp-password` |
| `MONITORING_DB_DSN` | full postgresql:// DSN | `postgres-exporter-secret` → key `DATA_SOURCE_NAME` |

---

## Full deployment walkthrough

### Prerequisites (do these once before anything else)

**A. Add DNS record in Cloudflare**
```
Name:  grafana
Type:  A
Value: <same IP as johnisah.com — get with:>
       kubectl get svc -n kube-system | grep traefik
TTL:   Auto
Proxy: DNS only (grey cloud) until TLS is confirmed working
```

**B. Build and deploy the new API image**

The API now includes `prom-client` and exposes `/metrics`. Trigger the pipeline first:
```bash
# In the repo root — update package-lock.json
npm install --prefix api

git add \
  api/package.json \
  api/package-lock.json \
  api/src/index.js \
  api/src/metrics.js \
  api/src/metricsMiddleware.js \
  k8s/api/deployment.yaml \
  k8s/api/ingress-production.yaml \
  k8s/policies/04-network-policy.yaml \
  monitoring/

git commit -m "feat: prometheus/grafana monitoring — prom-client, 6 dashboards, alertmanager"
git push origin develop
```

Then trigger the **api pipeline** with a new tag (e.g. `v1.2.0`).

After the pipeline succeeds, update the deployment on the cluster:
```bash
kubectl set image deployment/portfolio-api \
  api=ghcr.io/johnitopaisah/portfolio-mcs/api:v1.2.0 \
  -n portfolio

kubectl rollout status deployment/portfolio-api -n portfolio
```

Verify `/metrics` is live:
```bash
kubectl port-forward -n portfolio svc/portfolio-api 4000:4000 &
curl http://localhost:4000/metrics | head -20
# Should print: # HELP portfolio_http_requests_total ...
kill %1
```

---

### Step 1 — Create monitoring namespace

```bash
kubectl apply -f monitoring/prometheus/00-namespace.yaml

# Verify
kubectl get namespace monitoring
```

---

### Step 2 — Create PostgreSQL monitoring user (one-time)

```bash
kubectl exec -it -n portfolio statefulset/portfolio-db -- \
  psql -U portfolio_user -d portfolio_db -c "
    CREATE USER monitoring_user WITH PASSWORD 'CHOOSE_STRONG_PASSWORD';
    GRANT pg_monitor TO monitoring_user;
  "
```

Save `CHOOSE_STRONG_PASSWORD` — you will add it to Infisical in Step 3.

Verify the user was created:
```bash
kubectl exec -it -n portfolio statefulset/portfolio-db -- \
  psql -U portfolio_user -d portfolio_db -c "\du"
```

---

### Step 3 — Add secrets to Infisical

In the Infisical dashboard:
1. Go to your `portfolio-mcs` project
2. Switch to the **prod** environment
3. Create a new folder/path called `/monitoring`
4. Add these 4 secrets:

```
GRAFANA_ADMIN_USER        = admin
GRAFANA_ADMIN_PASSWORD    = <generate strong password, store it safely>
ALERTMANAGER_SMTP_PASSWORD = <your Zoho app password — same as NOTIFY_EMAIL_PASS>
MONITORING_DB_DSN         = postgresql://monitoring_user:CHOOSE_STRONG_PASSWORD@portfolio-db.portfolio.svc.cluster.local:5432/portfolio_db?sslmode=disable
```

Replace `CHOOSE_STRONG_PASSWORD` in `MONITORING_DB_DSN` with the password from Step 2.

---

### Step 4 — Bootstrap the Infisical machine identity in monitoring namespace

Get the credentials from the existing portfolio namespace machine identity:
```bash
CLIENT_ID=$(kubectl get secret infisical-machine-identity \
  -n portfolio \
  -o jsonpath='{.data.clientId}' | base64 -d)

CLIENT_SECRET=$(kubectl get secret infisical-machine-identity \
  -n portfolio \
  -o jsonpath='{.data.clientSecret}' | base64 -d)

# Create the same identity in monitoring namespace
kubectl create secret generic infisical-machine-identity \
  --namespace monitoring \
  --from-literal=clientId="$CLIENT_ID" \
  --from-literal=clientSecret="$CLIENT_SECRET"
```

Verify:
```bash
kubectl get secret infisical-machine-identity -n monitoring
```

---

### Step 5 — Apply Infisical CRDs (syncs all 3 monitoring secrets)

```bash
kubectl apply -f monitoring/infisical/01-grafana-secret.yaml
kubectl apply -f monitoring/infisical/02-alertmanager-secret.yaml
kubectl apply -f monitoring/infisical/03-postgres-exporter-secret.yaml
```

Wait ~60 seconds for the operator to sync, then verify all 3 secrets exist:
```bash
kubectl get secrets -n monitoring
# Expected:
# grafana-admin-secret          Opaque   2  ...
# alertmanager-smtp-secret      Opaque   1  ...
# postgres-exporter-secret      Opaque   1  ...
```

If any secret is missing after 60s, check the operator:
```bash
kubectl describe infisicalsecret grafana-infisical-secret -n monitoring
```

---

### Step 6 — Deploy Prometheus RBAC and config

```bash
kubectl apply -f monitoring/prometheus/01-rbac.yaml
kubectl apply -f monitoring/prometheus/02-configmap.yaml
```

---

### Step 7 — Deploy Prometheus StatefulSet

```bash
kubectl apply -f monitoring/prometheus/03-pvc.yaml
kubectl apply -f monitoring/prometheus/04-statefulset.yaml
kubectl apply -f monitoring/prometheus/05-service.yaml

# Wait for Prometheus to be Ready
kubectl rollout status statefulset/prometheus -n monitoring
```

Verify Prometheus is running:
```bash
kubectl port-forward -n monitoring svc/prometheus 9090:9090 &
# Open http://localhost:9090
# Go to Status → Targets — you should see prometheus (self) as UP
kill %1
```

---

### Step 8 — Deploy exporters

```bash
# Node exporter — will create 3 pods (one per node)
kubectl apply -f monitoring/exporters/node-exporter/01-daemonset.yaml

# Verify 3 pods running
kubectl get pods -n monitoring -l app=node-exporter
# NAME                    READY   STATUS    NODE
# node-exporter-xxxxx     1/1     Running   devops-minikube
# node-exporter-xxxxx     1/1     Running   devops-minikube-m02
# node-exporter-xxxxx     1/1     Running   devops-minikube-m03

# kube-state-metrics
kubectl apply -f monitoring/exporters/kube-state-metrics/01-all.yaml

# postgres-exporter (secret must exist from Step 5)
kubectl apply -f monitoring/exporters/postgres-exporter/01-deployment.yaml
```

Wait for all exporters to be ready:
```bash
kubectl rollout status deployment/kube-state-metrics -n monitoring
kubectl rollout status deployment/postgres-exporter -n monitoring
```

---

### Step 9 — Verify ALL Prometheus scrape targets are UP

```bash
kubectl port-forward -n monitoring svc/prometheus 9090:9090 &
```

Open http://localhost:9090/targets

All 5 target groups should show **UP** (green):

| Job | Expected |
|---|---|
| `prometheus` | 1 instance UP |
| `portfolio-api` | 2 instances UP (2 replicas) |
| `node-exporter` | 3 instances UP (one per node) |
| `kube-state-metrics` | 1 instance UP |
| `postgres-exporter` | 1 instance UP |

If `portfolio-api` shows DOWN → network policy blocking scrape. Apply Step 11 network policies first.

```bash
kill %1
```

---

### Step 10 — Deploy Alertmanager

```bash
kubectl apply -f monitoring/alertmanager/01-configmap.yaml
kubectl apply -f monitoring/alertmanager/03-deployment.yaml

kubectl rollout status deployment/alertmanager -n monitoring
```

Verify Alertmanager is connected to Prometheus:
```bash
kubectl port-forward -n monitoring svc/alertmanager 9093:9093 &
# Open http://localhost:9093 — should show "Alertmanager" UI
# Open http://localhost:9090/alerts — should show alert rules loaded
kill %1
```

---

### Step 11 — Apply network policies

```bash
kubectl apply -f monitoring/network-policies/01-allow-prometheus-scrape.yaml
kubectl apply -f monitoring/network-policies/02-monitoring-egress.yaml
kubectl apply -f k8s/policies/04-network-policy.yaml
```

Re-verify Prometheus targets after applying network policies:
```bash
kubectl port-forward -n monitoring svc/prometheus 9090:9090 &
# http://localhost:9090/targets — all should now be UP
kill %1
```

---

### Step 12 — Deploy Grafana

```bash
# PVC + provisioning configs
kubectl apply -f monitoring/grafana/01-pvc.yaml
kubectl apply -f monitoring/grafana/03-configmap-datasources.yaml
kubectl apply -f monitoring/grafana/04-configmap-dashboard-provider.yaml
```

Create dashboard ConfigMaps from JSON files:
```bash
for i in 01 02 03 04 05 06 07; do
  kubectl create configmap grafana-dashboard-$(printf '%s' "$i" | sed 's/01/01-overview/;s/02/02-api/;s/03/03-database/;s/04/04-infrastructure/;s/05/05-business/;s/06/06-alerts/') \
    --from-file=monitoring/grafana/dashboards/ \
    -n monitoring \
    --dry-run=client -o yaml | kubectl apply -f -
done
```

Or apply individually (more reliable):
```bash
kubectl create configmap grafana-dashboard-01-overview \
  --from-file=01-system-overview.json=monitoring/grafana/dashboards/01-system-overview.json \
  -n monitoring --dry-run=client -o yaml | kubectl apply -f -

kubectl create configmap grafana-dashboard-02-api \
  --from-file=02-api-performance.json=monitoring/grafana/dashboards/02-api-performance.json \
  -n monitoring --dry-run=client -o yaml | kubectl apply -f -

kubectl create configmap grafana-dashboard-03-database \
  --from-file=03-database-health.json=monitoring/grafana/dashboards/03-database-health.json \
  -n monitoring --dry-run=client -o yaml | kubectl apply -f -

kubectl create configmap grafana-dashboard-04-infrastructure \
  --from-file=04-infrastructure.json=monitoring/grafana/dashboards/04-infrastructure.json \
  -n monitoring --dry-run=client -o yaml | kubectl apply -f -

kubectl create configmap grafana-dashboard-05-business \
  --from-file=05-business-metrics.json=monitoring/grafana/dashboards/05-business-metrics.json \
  -n monitoring --dry-run=client -o yaml | kubectl apply -f -

kubectl create configmap grafana-dashboard-06-alerts \
  --from-file=06-alerts-slo.json=monitoring/grafana/dashboards/06-alerts-slo.json \
  -n monitoring --dry-run=client -o yaml | kubectl apply -f -
```

Deploy Grafana:
```bash
kubectl apply -f monitoring/grafana/05-deployment.yaml
kubectl apply -f monitoring/grafana/06-service.yaml
kubectl apply -f monitoring/grafana/07-ingress.yaml

kubectl rollout status deployment/grafana -n monitoring
```

---

### Step 13 — Access Grafana

Visit **https://grafana.johnisah.com**

Login with:
- Username: `admin`
- Password: the `GRAFANA_ADMIN_PASSWORD` you set in Infisical (Step 3)

Navigate to **Dashboards → Portfolio MCS** folder.

All 6 dashboards load with live data automatically.

---

### Step 14 — Test an alert fires (optional but recommended)

Temporarily lower the CPU threshold to trigger a warning alert:
```bash
kubectl port-forward -n monitoring svc/prometheus 9090:9090 &

# In Prometheus UI → Alerts — you should see all alert rules defined
# You can manually inspect any rule with the "Evaluate" button

kill %1
```

Send a test email from Alertmanager:
```bash
kubectl port-forward -n monitoring svc/alertmanager 9093:9093 &

curl -X POST http://localhost:9093/api/v2/alerts \
  -H 'Content-Type: application/json' \
  -d '[{
    "labels": {"alertname":"TestAlert","severity":"warning"},
    "annotations": {"summary":"Test alert from Portfolio MCS","description":"This is a manual test alert."}
  }]'

# Check connect@johnisah.com for the alert email
kill %1
```

---

## Quick health check (run anytime)

```bash
# All monitoring pods
kubectl get pods -n monitoring

# All monitoring secrets (should show 3 from Infisical + machine-identity)
kubectl get secrets -n monitoring

# Infisical sync status for all 3 CRDs
kubectl get infisicalsecrets -n monitoring

# Prometheus targets (requires port-forward)
kubectl port-forward -n monitoring svc/prometheus 9090:9090
# → http://localhost:9090/targets
```

---

## Troubleshooting

| Symptom | Diagnosis | Fix |
|---|---|---|
| Infisical secret not created after 60s | Operator can't authenticate | Check `kubectl describe infisicalsecret <name> -n monitoring` |
| `portfolio-api` target DOWN in Prometheus | Network policy blocking port 4000 | Apply `monitoring/network-policies/01-allow-prometheus-scrape.yaml` |
| `postgres-exporter` CrashLoopBackOff | Wrong DSN or user doesn't exist | Verify monitoring_user in DB; check DSN in Infisical |
| Grafana shows "No Data" on dashboards | Wrong Prometheus URL in datasource | Datasource URL must be `http://prometheus:9090` |
| Grafana pod stuck in ContainerCreating | PVC not bound | `kubectl get pvc -n monitoring` — check storageClass |
| node-exporter shows < 3 pods | DaemonSet tolerations missing | Check `kubectl describe ds node-exporter -n monitoring` |
| Alertmanager not sending email | SMTP auth failed | Check alertmanager logs: `kubectl logs -n monitoring deploy/alertmanager` |
| TLS cert for grafana.johnisah.com pending | DNS not propagated or A record missing | Verify A record in Cloudflare; `dig grafana.johnisah.com` |

---

## File structure

```
monitoring/
├── README.md                              ← this file
├── api/
│   ├── metrics.js                         ← reference copy of api/src/metrics.js
│   └── middleware.js                      ← reference copy of api/src/metricsMiddleware.js
├── infisical/
│   ├── 00-machine-identity.example.yaml   ← example only — create secret manually
│   ├── 01-grafana-secret.yaml             ← InfisicalSecret → grafana-admin-secret
│   ├── 02-alertmanager-secret.yaml        ← InfisicalSecret → alertmanager-smtp-secret
│   └── 03-postgres-exporter-secret.yaml   ← InfisicalSecret → postgres-exporter-secret
├── prometheus/
│   ├── 00-namespace.yaml
│   ├── 01-rbac.yaml
│   ├── 02-configmap.yaml
│   ├── 03-pvc.yaml  (5Gi)
│   ├── 04-statefulset.yaml
│   └── 05-service.yaml
├── grafana/
│   ├── 01-pvc.yaml  (2Gi)
│   ├── 02-secret.yaml  (DEPRECATED — managed by Infisical)
│   ├── 03-configmap-datasources.yaml
│   ├── 04-configmap-dashboard-provider.yaml
│   ├── 05-deployment.yaml
│   ├── 06-service.yaml
│   ├── 07-ingress.yaml  (grafana.johnisah.com, Traefik, TLS)
│   └── dashboards/
│       ├── 01-system-overview.json
│       ├── 02-api-performance.json
│       ├── 03-database-health.json
│       ├── 04-infrastructure.json
│       ├── 05-business-metrics.json
│       └── 06-alerts-slo.json
├── alertmanager/
│   ├── 01-configmap.yaml
│   ├── 02-secret.yaml  (DEPRECATED — managed by Infisical)
│   └── 03-deployment.yaml
├── exporters/
│   ├── node-exporter/
│   │   └── 01-daemonset.yaml
│   ├── kube-state-metrics/
│   │   └── 01-all.yaml
│   └── postgres-exporter/
│       ├── 01-secret.yaml  (DEPRECATED — managed by Infisical)
│       └── 02-deployment.yaml
└── network-policies/
    ├── 01-allow-prometheus-scrape.yaml
    └── 02-monitoring-egress.yaml
```
