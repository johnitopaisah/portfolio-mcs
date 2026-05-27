# Scripts

Utility scripts for cluster operations and maintenance.

---

## backup-manager.sh

An interactive CLI for managing Kubernetes-based database backups. Wraps `kubectl` commands to list, trigger, download, and restore backups without needing to remember long `kubectl exec` chains.

### Prerequisites

- `kubectl` configured and pointing at the target cluster
- `backup` namespace deployed (see [k8s/backup/README.md](../k8s/backup/README.md))
- `CLUSTER_NAME` env var set (optional, defaults to `default`)

### Usage

```bash
chmod +x scripts/backup-manager.sh

# Show available commands
./scripts/backup-manager.sh help

# List all backup files on the node
./scripts/backup-manager.sh list

# Trigger a manual backup immediately (runs the CronJob as a one-off Job)
./scripts/backup-manager.sh trigger

# Download the latest backup to ./backups/
./scripts/backup-manager.sh download

# Restore from a specific backup file
./scripts/backup-manager.sh restore <backup-file.sql.gz>

# Check backup CronJob status
./scripts/backup-manager.sh status
```

### Environment variables

| Variable | Default | Description |
|---|---|---|
| `CLUSTER_NAME` | `default` | Cluster name used in log output |
| `BACKUP_NS` | `backup` | Kubernetes namespace where the backup CronJob lives |

---

## Adding new scripts

Place new scripts in this directory with a descriptive name. Mark them executable (`chmod +x`) and document them here with purpose, prerequisites, and usage examples.
