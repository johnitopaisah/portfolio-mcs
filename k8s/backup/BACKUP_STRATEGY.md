# Portfolio MCS — Backup & Recovery Strategy

## Overview

This backup solution protects your cluster from data loss during VM migrations by automatically backing up:

1. **Database** — PostgreSQL (portfolio_db)
2. **Monitoring Data** — Prometheus & Grafana volumes
3. **Secrets & ConfigMaps** — Application credentials and configurations
4. **PersistentVolumes** — All stateful data

---

## Architecture

### Data to Backup

| Component | Type | Size | Location | Criticality | Backup Schedule |
|-----------|------|------|----------|-------------|------------------|
| **Portfolio DB** | PostgreSQL | 1Gi | `portfolio` namespace | **CRITICAL** | Daily 02:00 UTC |
| **Prometheus Data** | Time-series DB | 5Gi | `monitoring` namespace | **CRITICAL** | Daily 04:00 UTC |
| **Grafana Config** | Dashboards & Config | 2Gi | `monitoring` namespace | **HIGH** | Daily 04:00 UTC |
| **Secrets** | K8s Secrets | < 1Mi | Multiple namespaces | **CRITICAL** | Daily 03:00 UTC |
| **ConfigMaps** | Configuration | < 10Mi | Multiple namespaces | High | Daily 03:00 UTC |

### Backup Locations

- **PVC Location:** `backup-storage-pvc` (10Gi) in `backup` namespace
- **Backup Path:** `/backups/` inside the PVC
- **Retention:** 7 days for database, 14 days for configs

---

## Backup Jobs

### 1. Database Backup (Daily at 02:00 UTC)

**CronJob:** `portfolio-db-backup`

```bash
# Schedule
0 2 * * *  # Every day at 02:00 UTC (modify in 03-cronjob-db-backup.yaml)

# What it does
- Connects to portfolio-db pod
- Runs pg_dump with gzip compression
- Saves to: /backups/portfolio_db_YYYYMMDD_HHMMSS.sql.gz
- Cleans up backups older than 7 days
- Size: ~100-500 MB (database dependent)
```

**Output:**
```
portfolio_db_20260424_020000.sql.gz  (compressed SQL dump)
```

### 2. ConfigMaps & Secrets Backup (Daily at 03:00 UTC)

**CronJob:** `backup-configmaps-secrets`

```bash
# Schedule
0 3 * * *  # Every day at 03:00 UTC

# What it does
- Exports portfolio-secrets (DB credentials, API keys)
- Exports infisical-secret
- Exports all ConfigMaps from portfolio & monitoring namespaces
- Saves as YAML files
- Compresses to configs_YYYYMMDD_HHMMSS.tar.gz
- Cleans up backups older than 14 days
```

**Output:**
```
portfolio-secrets_20260424_030000.yaml
infisical-secret_20260424_030000.yaml
portfolio-configmaps_20260424_030000.yaml
monitoring-secrets_20260424_030000.yaml
monitoring-configmaps_20260424_030000.yaml
configs_20260424_030000.tar.gz
```

### 3. Monitoring Volumes Backup (Daily at 04:00 UTC)

**CronJob:** `backup-monitoring-volumes`

```bash
# Schedule
0 4 * * *  # Every day at 04:00 UTC

# What it does
- Backs up Prometheus time-series database (5Gi PVC)
  - Captures all metrics collected since deployment
  - Stores: /prometheus/wal, /prometheus/chunks_head directories
  - Size: ~2-4 GB (depends on retention and scrape frequency)
- Backs up Grafana configuration and dashboards (2Gi PVC)
  - Captures all custom dashboards
  - Stores user preferences, datasources, provisioning configs
  - Size: ~200-500 MB (depends on dashboard count)
- Cleans up backups older than 14 days
```

**Output:**
```
monitoring/prometheus_20260424_040000.tar.gz   (Prometheus backup)
monitoring/grafana_20260424_040000.tar.gz      (Grafana backup)
```

---

## Installation

### 1. Deploy Backup Infrastructure

```bash
# Apply all backup manifests
kubectl apply -f k8s/backup/

# Verify deployment
kubectl get ns backup
kubectl get cronjobs -n backup
kubectl get pvc -n backup
```

### 2. Test Backup Manually

```bash
# Trigger database backup immediately
kubectl create job --from=cronjob/portfolio-db-backup \
  manual-db-backup-1 -n backup

# Check logs
kubectl logs -n backup -l job-name=manual-db-backup-1

# List created backups
kubectl exec -it -n backup $(kubectl get pod -n backup -l job-name=manual-db-backup-1 -o jsonpath='{.items[0].metadata.name}') \
  -- ls -lh /backups/
```

### 3. Enable/Disable Backups

Edit the CronJob to suspend/resume:

```bash
# Disable backups (e.g., during cluster upgrade)
kubectl patch cronjob portfolio-db-backup -n backup -p '{"spec":{"suspend":true}}'

# Enable backups
kubectl patch cronjob portfolio-db-backup -n backup -p '{"spec":{"suspend":false}}'
```

---

## Recovery Procedures

### Scenario 1: Restore Database on New Cluster

**When:** After migrating to a new VM and deploying a fresh cluster

**Steps:**

1. **Copy backup file from old cluster:**
   ```bash
   # On old cluster (Minikube)
   POD=$(kubectl get pod -n backup -l app=portfolio-mcs -o jsonpath='{.items[0].metadata.name}')
   kubectl cp backup/$POD:/backups/portfolio_db_20260424_020000.sql.gz \
     ./backup.sql.gz
   ```

2. **Transfer backup to new cluster host:**
   ```bash
   scp ./backup.sql.gz user@new-cluster-host:/tmp/
   ```

3. **Copy into backup PVC on new cluster:**
   ```bash
   # Create temporary pod to access backup PVC
   kubectl run -it --rm debug --image=postgres:16-alpine \
     -n backup -- /bin/bash
   
   # Inside the pod:
   cp /tmp/backup.sql.gz /backups/
   ```

4. **Run restore job:**
   ```bash
   # Create one-time restore job
   kubectl apply -f - <<EOF
   apiVersion: batch/v1
   kind: Job
   metadata:
     name: restore-db-manual
     namespace: backup
   spec:
     template:
       spec:
         serviceAccountName: backup-serviceaccount
         restartPolicy: Never
         containers:
         - name: restore
           image: postgres:16-alpine
           env:
           - name: POSTGRES_HOST
             value: "portfolio-db.portfolio.svc.cluster.local"
           - name: POSTGRES_PORT
             value: "5432"
           - name: POSTGRES_DB
             valueFrom:
               secretKeyRef:
                 name: portfolio-secrets
                 key: POSTGRES_DB
           - name: POSTGRES_USER
             valueFrom:
               secretKeyRef:
                 name: portfolio-secrets
                 key: POSTGRES_USER
           - name: POSTGRES_PASSWORD
             valueFrom:
               secretKeyRef:
                 name: portfolio-secrets
                 key: POSTGRES_PASSWORD
           command:
           - sh
           - -c
           - |
             gunzip -c /backups/backup.sql.gz | psql \
               -h $POSTGRES_HOST -p $POSTGRES_PORT \
               -U $POSTGRES_USER -d $POSTGRES_DB
           volumeMounts:
           - name: backup-storage
             mountPath: /backups
         volumes:
         - name: backup-storage
           persistentVolumeClaim:
             claimName: backup-storage-pvc
   EOF
   
   # Monitor restore
   kubectl logs -n backup -f job/restore-db-manual
   ```

5. **Verify data:**
   ```bash
   kubectl exec -it -n portfolio portfolio-db-0 -- \
     psql -U portfolio_user -d portfolio_db \
     -c "SELECT COUNT(*) FROM visitor_logs;"
   ```

### Scenario 2: Restore Secrets After Fresh Database

**When:** New cluster with new secrets; need to apply old configuration

**Steps:**

```bash
# 1. Extract backed-up secrets
kubectl cp backup/$POD:/backups/configs/portfolio-secrets_*.yaml \
  ./portfolio-secrets.yaml

# 2. Review the backup (DO NOT apply directly - contains old credentials)
cat portfolio-secrets.yaml

# 3. Extract only necessary data and apply selectively
# OR manually recreate secrets with new credentials

# 4. For Infisical/other integrations:
kubectl apply -f portfolio-secrets.yaml  # if credentials are still valid
```

### Scenario 3: Restore Monitoring Data (Prometheus + Grafana)

**When:** Migrating to new cluster and want to keep historical metrics and dashboards

**Prerequisites:**
- New cluster has monitoring namespace deployed
- Prometheus and Grafana pods are running
- Backup storage PVC is available

**Steps:**

```bash
# 1. List available monitoring backups
POD=$(kubectl get pod -n backup -o jsonpath='{.items[0].metadata.name}')
kubectl exec -n backup $POD -- ls -lh /backups/monitoring/

# Expected output:
# prometheus_20260424_040000.tar.gz   (2.3G)
# grafana_20260424_040000.tar.gz      (250M)
```

**3a. Restore Prometheus Data:**

```bash
# Stop Prometheus to ensure clean restore
kubectl scale statefulset/prometheus -n monitoring --replicas=0

# Wait for pod to stop
kubectl wait --for=delete pod/prometheus-0 -n monitoring --timeout=60s || true

# Create restore pod
kUBECTL exec -it <backup-pod> -n backup -- bash

# Inside backup pod:
cd /backups/monitoring
PROM_POD=$(kubectl get pod -n monitoring -l app=prometheus -o jsonpath='{.items[0].metadata.name}' || true)
if [ -n "$PROM_POD" ]; then
  tar xzf prometheus_20260424_040000.tar.gz -C /tmp/
  kubectl cp /tmp/* monitoring/$PROM_POD:/prometheus/
fi

# Restart Prometheus
kubectl scale statefulset/prometheus -n monitoring --replicas=1
kubectl wait --for=condition=ready pod/prometheus-0 -n monitoring --timeout=300s
```

**3b. Restore Grafana Data:**

```bash
# Grafana is stateless, just restore the PVC data
GRAFANA_POD=$(kubectl get pod -n monitoring -l app=grafana -o jsonpath='{.items[0].metadata.name}')

# Extract and restore
cd /backups/monitoring
tar xzf grafana_20260424_040000.tar.gz -C /tmp/
kubectl cp /tmp/* monitoring/$GRAFANA_POD:/var/lib/grafana/

# Restart Grafana to load dashboards
kubectl rollout restart deployment/grafana -n monitoring
kubectl wait --for=condition=available --timeout=300s deployment/grafana -n monitoring
```

**3c. Verify Restoration:**

```bash
# Check Prometheus is scraping metrics
kubectl port-forward -n monitoring svc/prometheus 9090:9090 &
# Open http://localhost:9090 and check Target Status

# Check Grafana has dashboards
kubectl port-forward -n monitoring svc/grafana 3000:3000 &
# Open http://localhost:3000 and verify dashboards are present
```

---

## Monitoring & Alerts

### Check Backup Status

```bash
# View CronJob schedule
kubectl get cronjobs -n backup

# View recent job history
kubectl get jobs -n backup --sort-by=.metadata.creationTimestamp

# Check latest job logs
LATEST_JOB=$(kubectl get jobs -n backup -o jsonpath='{.items[-1].metadata.name}')
kubectl logs -n backup -l job-name=$LATEST_JOB

# View backup PVC usage
kubectl exec -it -n backup $(kubectl get pod -n backup -o jsonpath='{.items[0].metadata.name}') \
  -- du -sh /backups/
```

### Backup Health Checks

```bash
#!/bin/bash
# Script: check-backup-health.sh

echo "=== Backup Health Check ==="

# Check if backups exist and are recent
LATEST_DB_BACKUP=$(ls -t /backups/portfolio_db_*.sql.gz 2>/dev/null | head -1)
LATEST_CONFIG_BACKUP=$(ls -t /backups/configs_*.tar.gz 2>/dev/null | head -1)

if [ -z "$LATEST_DB_BACKUP" ]; then
  echo "❌ No database backups found!"
else
  AGE=$(($(date +%s) - $(stat -f%m "$LATEST_DB_BACKUP" | xargs date -f%s +%s)))
  echo "✓ Latest DB backup: $(basename $LATEST_DB_BACKUP)"
  echo "  Age: $(($AGE / 3600)) hours"
fi

if [ -z "$LATEST_CONFIG_BACKUP" ]; then
  echo "❌ No config backups found!"
else
  echo "✓ Latest config backup: $(basename $LATEST_CONFIG_BACKUP)"
fi

# Check PVC capacity
echo ""
echo "=== Backup Storage Usage ==="
kubectl exec -it -n backup $(kubectl get pod -n backup -o jsonpath='{.items[0].metadata.name}') \
  -- sh -c 'df -h /backups | tail -1'
```

---

## Disaster Recovery Plan

### Pre-Migration Checklist

- [ ] Database backups exist and are recent (<24h)
- [ ] Secrets backup contains all credentials
- [ ] ConfigMaps backup is current
- [ ] Backup PVC has sufficient storage
- [ ] Test restore procedure on staging cluster

### During Migration

1. **Pause backups:**
   ```bash
   kubectl patch cronjob portfolio-db-backup -n backup -p '{"spec":{"suspend":true}}'
   kubectl patch cronjob backup-configmaps-secrets -n backup -p '{"spec":{"suspend":true}}'
   ```

2. **Copy backups to external storage:**
   ```bash
   kubectl cp backup/$(kubectl get pod -n backup -o jsonpath='{.items[0].metadata.name}'):/backups \
     ./backup-20260424 -n backup
   ```

3. **Store in secure location** (S3, external disk, etc.)

### After Migration

1. Deploy new cluster
2. Apply backup manifests
3. Copy backup files into new PVC
4. Run restore jobs
5. Re-enable automatic backups
6. Verify data integrity

---

## Best Practices

### Frequency

| Data Type | Frequency | Retention | Reason |
|-----------|-----------|-----------|--------|
| Database | Daily (02:00) | 7 days | RPO: 1 day, manageable size |
| Configs | Daily (03:00) | 14 days | Lower volume, useful history |
| Monitoring (Prometheus + Grafana) | Daily (04:00) | 14 days | Keep metrics + dashboards, ~600MB/day |
| Volumes | As-needed via monitoring backup | 14 days | Captured in monitoring backup job |

### Storage

- **Local PVC (current):** Fast, works for single-node clusters, risk of data loss if host fails
- **Upgrade path:** NFS/S3 for multi-cluster/HA setup

### Testing

- [ ] Monthly: Test restore on a separate cluster
- [ ] Before each migration: Run full backup cycle
- [ ] After restore: Verify data integrity (row counts, timestamps)

### Maintenance

- Monitor PVC usage (aim for <80% capacity)
- Review backup logs weekly
- Test restore procedures quarterly
- Update retention policies based on data growth

---

## Troubleshooting

### Backup Job Fails

```bash
# Check job status
kubectl describe job -n backup portfolio-db-backup

# View detailed logs
kubectl logs -n backup -l job-name=portfolio-db-backup-xxxxx --all-containers=true

# Common issues:
# - Network: Check if postgres pod is reachable
#   kubectl exec -n backup <backup-pod> -- nc -zv portfolio-db.portfolio.svc.cluster.local 5432
# - Credentials: Verify portfolio-secrets contains correct values
#   kubectl get secret -n portfolio portfolio-secrets -o yaml
# - Storage: Check PVC capacity
#   kubectl get pvc -n backup
```

### Restore Fails

```bash
# Check database connectivity
kubectl exec -it -n portfolio portfolio-db-0 -- pg_isready

# Verify backup file integrity
kubectl exec -it -n backup <pod> -- gunzip -t /backups/portfolio_db_*.sql.gz

# Check for errors in restore job
kubectl logs -n backup restore-db-manual
```

---

## Next Steps

1. ✅ Deploy backup infrastructure: `kubectl apply -f k8s/backup/`
2. ✅ Monitor first backup cycle (tomorrow at 02:00 UTC)
3. ✅ Test manual restore on staging cluster
4. ✅ Set calendar reminder for quarterly restore tests
5. ✅ Document backup location in runbook
