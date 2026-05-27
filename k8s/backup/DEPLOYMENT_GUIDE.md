# Backup System Deployment Guide

## Overview

This guide walks through deploying the complete backup infrastructure to your Kubernetes cluster. Once deployed, backups will run automatically every day.

---

## Prerequisites

✅ Kubernetes cluster running (Minikube or cloud)  
✅ `kubectl` configured and authenticated  
✅ Portfolio namespace with running API and database  
✅ `portfolio-secrets` ConfigMap with database credentials  

Verify prerequisites:

```bash
# Check cluster access
kubectl cluster-info

# Verify portfolio namespace exists
kubectl get ns portfolio

# Verify database is running
kubectl get pod -n portfolio portfolio-db-0

# Verify secrets exist
kubectl get secret -n portfolio portfolio-secrets
```

---

## Deployment Steps

### Step 1: Apply Backup Infrastructure (5 minutes)

```bash
cd /Users/isahjohna/ALX/portfolio-mcs

# Apply all backup manifests at once
kubectl apply -f k8s/backup/

# Expected output:
# namespace/backup created
# serviceaccount/backup-serviceaccount created
# clusterrole.rbac.authorization.k8s.io/backup-role created
# clusterrolebinding.rbac.authorization.k8s.io/backup-rolebinding created
# configmap/db-backup-scripts created
# persistentvolumeclaim/backup-storage-pvc created
# cronjob.batch/portfolio-db-backup created
# cronjob.batch/backup-configmaps-secrets created
```

### Step 2: Verify Deployment

```bash
# Check namespace creation
kubectl get ns backup
# Output: NAME    STATUS   AGE
#         backup  Active   1m

# Check service account
kubectl get sa -n backup
# Output: NAME                      SECRETS   AGE
#         backup-serviceaccount     1         1m

# Check RBAC roles
kubectl get clusterrole | grep backup
# Output: backup-role                              ...

# Check ConfigMap
kubectl get configmap -n backup
# Output: NAME                 DATA   AGE
#         db-backup-scripts    3      1m

# Check PVC (will be in Pending until first job runs)
kubectl get pvc -n backup
# Output: NAME                   STATUS    VOLUME   CAPACITY   ...
#         backup-storage-pvc     Pending   ...

# Check CronJobs
kubectl get cronjobs -n backup -o wide
# Output: NAME                          SCHEDULE    SUSPEND   ACTIVE   ...
#         backup-configmaps-secrets     0 3 * * *   False     0        ...
#         portfolio-db-backup           0 2 * * *   False     0        ...
```

### Step 3: Manual Test Backup (10 minutes)

Test the backup system before relying on automatic schedules:

```bash
# Trigger manual database backup
kubectl create job --from=cronjob/portfolio-db-backup \
  test-db-backup-1 -n backup

# Wait for job to complete (check every 30 seconds)
kubectl get jobs -n backup -w

# Check job logs
LATEST_JOB=$(kubectl get jobs -n backup -o jsonpath='{.items[-1].metadata.name}')
kubectl logs -n backup -l "job-name=$LATEST_JOB" --all-containers=true

# Expected log output:
# [2026-04-24 16:04:23] Starting database backup...
# [2026-04-24 16:04:45] ✓ Backup successful: /backups/portfolio_db_20260424_160423.sql.gz (89M)
# [2026-04-24 16:04:46] Old backups cleaned up (>7 days)
```

### Step 4: Verify Backup Storage

```bash
# Find backup pod (pod that has the PVC mounted)
POD=$(kubectl get pod -n backup -o jsonpath='{.items[0].metadata.name}')

# List backup files
kubectl exec -it -n backup $POD -- ls -lh /backups/
# Output: -rw-r--r-- 1 postgres postgres 89M Apr 24 16:04 portfolio_db_20260424_160423.sql.gz

# Check storage usage
kubectl exec -it -n backup $POD -- du -sh /backups/
# Output: 89M /backups/
```

### Step 5: Test Config Backup

```bash
# Trigger manual config backup
kubectl create job --from=cronjob/backup-configmaps-secrets \
  test-config-backup-1 -n backup

# Wait for completion
kubectl get jobs -n backup -w

# Check logs
LATEST_JOB=$(kubectl get jobs -n backup -o jsonpath='{.items[-1].metadata.name}')
kubectl logs -n backup -l "job-name=$LATEST_JOB" --all-containers=true

# List created config backups
POD=$(kubectl get pod -n backup -o jsonpath='{.items[0].metadata.name}')
kubectl exec -it -n backup $POD -- ls -lh /backups/configs/ 2>/dev/null || echo "Config backups stored separately"
```

---

## Verify with Backup Manager Script

For easier interaction, use the provided backup manager script:

```bash
# Make script executable (one-time)
chmod +x scripts/backup-manager.sh

# Check complete backup status
./scripts/backup-manager.sh status

# Expected output:
# ℹ Backup Infrastructure Status
# ✓ Backup namespace exists
# ℹ CronJob Status:
# NAME                          SCHEDULE    SUSPEND   ACTIVE
# backup-configmaps-secrets     0 3 * * *   False     0
# portfolio-db-backup           0 2 * * *   False     0
# ...
```

---

## Automatic Backup Schedule

Once deployed, backups will run automatically:

| Task | Schedule | Time Zone | Description |
|------|----------|-----------|-------------|
| Database backup | Daily | 02:00 UTC | `0 2 * * *` |
| Config backup | Daily | 03:00 UTC | `0 3 * * *` |

**To convert UTC to your timezone:**
- UTC 02:00 → EST 21:00 (previous day)
- UTC 02:00 → CST 20:00 (previous day)
- UTC 02:00 → PST 18:00 (previous day)

---

## Customization

### Change Backup Time

Edit the CronJob schedule:

```bash
# Edit database backup time
kubectl patch cronjob portfolio-db-backup -n backup \
  -p '{"spec":{"schedule":"0 4 * * *"}}'

# Edit config backup time
kubectl patch cronjob backup-configmaps-secrets -n backup \
  -p '{"spec":{"schedule":"0 5 * * *"}}'
```

Or edit the files directly:

```bash
# k8s/backup/03-cronjob-db-backup.yaml
# Change: schedule: "0 2 * * *"

# k8s/backup/04-backup-all-ns.yaml
# Change: schedule: "0 3 * * *"

# Apply changes
kubectl apply -f k8s/backup/
```

### Increase Backup Retention

Edit the CronJob to keep more backups:

```bash
# Edit k8s/backup/03-cronjob-db-backup.yaml
# In script, change: find "$BACKUP_DIR" -name "portfolio_db_*.sql.gz" -mtime +7 -delete
# To: find "$BACKUP_DIR" -name "portfolio_db_*.sql.gz" -mtime +14 -delete

# Apply changes
kubectl apply -f k8s/backup/02-db-backup-configmap.yaml
```

### Increase Storage Size

If backups are consuming more than 10Gi:

```bash
# Option 1: Edit the manifest
# Edit k8s/backup/03-cronjob-db-backup.yaml
# Change: storage: 10Gi -> storage: 20Gi
kubectl apply -f k8s/backup/03-cronjob-db-backup.yaml

# Option 2: Patch directly (if PVC is dynamic)
kubectl patch pvc backup-storage-pvc -n backup \
  -p '{"spec":{"resources":{"requests":{"storage":"20Gi"}}}}'
```

---

## Common Operations

### View Recent Backup Status

```bash
# See last 7 backup jobs
kubectl get jobs -n backup --sort-by='.metadata.creationTimestamp' | tail -10

# See latest job logs
LATEST=$(kubectl get jobs -n backup -o jsonpath='{.items[-1].metadata.name}')
kubectl logs -n backup -l "job-name=$LATEST" --all-containers=true
```

### Manually Trigger Backup

```bash
# Database backup
kubectl create job --from=cronjob/portfolio-db-backup \
  manual-db-backup-$(date +%s) -n backup

# Config backup
kubectl create job --from=cronjob/backup-configmaps-secrets \
  manual-config-backup-$(date +%s) -n backup

# Monitor
kubectl get jobs -n backup -w
```

### Disable Backups (e.g., during cluster maintenance)

```bash
# Disable all
kubectl patch cronjob portfolio-db-backup -n backup -p '{"spec":{"suspend":true}}'
kubectl patch cronjob backup-configmaps-secrets -n backup -p '{"spec":{"suspend":true}}'

# Re-enable
kubectl patch cronjob portfolio-db-backup -n backup -p '{"spec":{"suspend":false}}'
kubectl patch cronjob backup-configmaps-secrets -n backup -p '{"spec":{"suspend":false}}'
```

---

## Troubleshooting Deployment

### PVC stuck in "Pending"

```bash
# Check PVC status
kubectl describe pvc backup-storage-pvc -n backup

# Minikube users: ensure storage provisioner is running
kubectl get sc
# Output should show "standard" class

# If not available, create manually:
kubectl apply -f - <<EOF
apiVersion: storage.k8s.io/v1
kind: StorageClass
metadata:
  name: standard
provisioner: kubernetes.io/minikube-hostpath
EOF
```

### RBAC permission denied errors

```bash
# Verify RBAC is set up
kubectl get clusterrole backup-role
kubectl get clusterrolebinding backup-rolebinding

# Check service account permissions
kubectl describe sa backup-serviceaccount -n backup

# If RBAC needs updating:
kubectl apply -f k8s/backup/01-rbac.yaml
```

### Jobs fail immediately

```bash
# Check job definition
kubectl describe job <job-name> -n backup

# View pod logs
POD=$(kubectl get pod -n backup --sort-by=.metadata.creationTimestamp | tail -1)
kubectl logs -n backup $POD --all-containers=true --previous

# Common issues:
# - Database not reachable: kubectl get pod -n portfolio portfolio-db-0
# - Secrets missing: kubectl get secret -n portfolio portfolio-secrets
# - Storage full: kubectl exec -it -n backup <pod> -- df -h
```

---

## Next Steps

After successful deployment:

1. **Monitor first scheduled backup** (tomorrow at 02:00 UTC)
   ```bash
   # Check if job ran
   kubectl get jobs -n backup --sort-by='.metadata.creationTimestamp' | tail -5
   
   # If not visible, check CronJob status
   kubectl describe cronjob portfolio-db-backup -n backup
   ```

2. **Set up monitoring/alerts** (optional)
   - Configure Prometheus to alert on failed backup jobs
   - Set up Slack/email notifications for job failures

3. **Test restore procedure** (on staging cluster)
   - Download a backup
   - Deploy fresh cluster
   - Restore from backup
   - Verify data integrity

4. **Document for operations team**
   - Share [README.md](./README.md) with team
   - Document backup location and recovery procedures
   - Schedule quarterly restore tests

---

## Files Reference

| File | Purpose |
|------|---------|
| `00-namespace.yaml` | Creates backup namespace |
| `01-rbac.yaml` | RBAC permissions for backup operations |
| `02-db-backup-configmap.yaml` | Backup/restore shell scripts |
| `03-cronjob-db-backup.yaml` | Daily database backup job |
| `04-backup-all-ns.yaml` | Daily secrets/ConfigMaps backup job |
| `BACKUP_STRATEGY.md` | Comprehensive backup architecture docs |
| `README.md` | Quick start guide |
| `MAKEFILE_TARGETS.mk` | Optional: add to root Makefile |
| `../scripts/backup-manager.sh` | Helper script for backup operations |

---

## Support

For detailed recovery procedures, see: [BACKUP_STRATEGY.md](./BACKUP_STRATEGY.md)  
For quick reference guide, see: [README.md](./README.md)
