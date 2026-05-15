#!/bin/bash
# ============================================================
#  Backup Management Helper Scripts
#  Place this in: /Users/isahjohna/ALX/portfolio-mcs/scripts/backup-manager.sh
# ============================================================

set -e

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
CLUSTER_NAME="${CLUSTER_NAME:-default}"
BACKUP_NS="backup"

# Colors
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m' # No Color

# ============================================================
#  Utility Functions
# ============================================================

log_info() { echo -e "${BLUE}ℹ${NC} $1"; }
log_success() { echo -e "${GREEN}✓${NC} $1"; }
log_warn() { echo -e "${YELLOW}⚠${NC} $1"; }
log_error() { echo -e "${RED}✗${NC} $1"; }

# Check prerequisites
check_deps() {
  local deps=("kubectl" "date" "tar")
  for cmd in "${deps[@]}"; do
    if ! command -v "$cmd" &> /dev/null; then
      log_error "$cmd is not installed"
      exit 1
    fi
  done
  log_success "All dependencies available"
}

# Get backup pod name
get_backup_pod() {
  kubectl get pod -n "$BACKUP_NS" -l app=portfolio-mcs,component=backup \
    -o jsonpath='{.items[0].metadata.name}' 2>/dev/null || echo ""
}

# ============================================================
#  Backup Management Commands
# ============================================================

cmd_status() {
  log_info "Backup Infrastructure Status"
  echo ""
  
  # Namespace
  if kubectl get ns "$BACKUP_NS" &>/dev/null; then
    log_success "Backup namespace exists"
  else
    log_error "Backup namespace NOT found (run: kubectl apply -f k8s/backup/)"
    return 1
  fi
  
  # CronJobs
  echo ""
  log_info "CronJob Status:"
  kubectl get cronjobs -n "$BACKUP_NS" -o wide || true
  
  # Recent Jobs
  echo ""
  log_info "Recent Backup Jobs (last 7 days):"
  kubectl get jobs -n "$BACKUP_NS" \
    --sort-by='.metadata.creationTimestamp' \
    -o wide | tail -10 || true
  
  # PVC
  echo ""
  log_info "Backup Storage:"
  kubectl get pvc -n "$BACKUP_NS" -o wide || true
  
  # Storage Usage
  echo ""
  POD=$(get_backup_pod)
  if [ -n "$POD" ]; then
    log_info "Storage Usage:"
    kubectl exec -n "$BACKUP_NS" "$POD" -- sh -c \
      'echo "Total: $(du -sh /backups 2>/dev/null | cut -f1)"; echo ""; echo "Database backups:"; ls -lh /backups/portfolio_db_*.sql.gz 2>/dev/null | awk "{print \$9, \"(\" \$5 \")\"}"; echo ""; echo "Config backups:"; ls -lh /backups/configs_*.tar.gz 2>/dev/null | awk "{print \$9, \"(\" \$5 \")\"}"; ' || true
  fi
}

cmd_list() {
  log_info "Available Backups"
  POD=$(get_backup_pod)
  
  if [ -z "$POD" ]; then
    log_error "No backup pod found"
    return 1
  fi
  
  echo ""
  log_info "Database Backups:"
  kubectl exec -n "$BACKUP_NS" "$POD" -- sh -c \
    'ls -1 /backups/portfolio_db_*.sql.gz 2>/dev/null | xargs -I {} basename {} || echo "None found"'
  
  echo ""
  log_info "Config Backups:"
  kubectl exec -n "$BACKUP_NS" "$POD" -- sh -c \
    'ls -1 /backups/configs_*.tar.gz 2>/dev/null | xargs -I {} basename {} || echo "None found"'
}

cmd_trigger() {
  local backup_type="${1:-db}"
  
  case "$backup_type" in
    db)
      log_info "Triggering database backup..."
      kubectl create job --from=cronjob/portfolio-db-backup \
        "manual-db-backup-$(date +%s)" -n "$BACKUP_NS"
      log_success "Database backup job created"
      ;;
    config)
      log_info "Triggering config backup..."
      kubectl create job --from=cronjob/backup-configmaps-secrets \
        "manual-config-backup-$(date +%s)" -n "$BACKUP_NS"
      log_success "Config backup job created"
      ;;
    *)
      log_error "Invalid backup type: $backup_type"
      echo "Usage: backup-manager.sh trigger [db|config]"
      return 1
      ;;
  esac
}

cmd_download() {
  local backup_file="$1"
  local dest="${2:-.}"
  
  if [ -z "$backup_file" ]; then
    log_error "Usage: backup-manager.sh download <backup-file> [destination]"
    return 1
  fi
  
  POD=$(get_backup_pod)
  if [ -z "$POD" ]; then
    log_error "No backup pod found"
    return 1
  fi
  
  log_info "Downloading backup: $backup_file -> $dest/"
  kubectl cp "$BACKUP_NS/$POD:/backups/$backup_file" "$dest/"
  log_success "Backup downloaded"
}

cmd_upload() {
  local backup_file="$1"
  
  if [ -z "$backup_file" ] || [ ! -f "$backup_file" ]; then
    log_error "Usage: backup-manager.sh upload <backup-file>"
    log_error "File not found: $backup_file"
    return 1
  fi
  
  POD=$(get_backup_pod)
  if [ -z "$POD" ]; then
    log_error "No backup pod found"
    return 1
  fi
  
  log_info "Uploading backup: $backup_file"
  kubectl cp "$backup_file" "$BACKUP_NS/$POD:/backups/$(basename "$backup_file")"
  log_success "Backup uploaded"
}

cmd_restore() {
  local backup_file="$1"
  
  if [ -z "$backup_file" ]; then
    log_error "Usage: backup-manager.sh restore <backup-file>"
    return 1
  fi
  
  log_warn "About to restore database from: $backup_file"
  log_warn "This will OVERWRITE the current database!"
  read -p "Are you sure? (yes/no): " -r
  
  if [[ ! $REPLY =~ ^[Yy][Ee][Ss]$ ]]; then
    log_info "Restore cancelled"
    return 0
  fi
  
  # Check if backup file exists
  POD=$(get_backup_pod)
  if ! kubectl exec -n "$BACKUP_NS" "$POD" test -f "/backups/$backup_file"; then
    log_error "Backup file not found: $backup_file"
    return 1
  fi
  
  log_info "Creating restore job..."
  
  # Create restore job
  kubectl apply -f - <<EOF
apiVersion: batch/v1
kind: Job
metadata:
  name: restore-db-$(date +%s)
  namespace: $BACKUP_NS
spec:
  ttlSecondsAfterFinished: 86400
  template:
    metadata:
      labels:
        app: portfolio-mcs
        job-type: restore
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
          echo "Starting restore from: $backup_file"
          gunzip -c /backups/$backup_file | psql \\
            -h \$POSTGRES_HOST -p \$POSTGRES_PORT \\
            -U \$POSTGRES_USER -d \$POSTGRES_DB
          echo "Restore complete"
        volumeMounts:
        - name: backup-storage
          mountPath: /backups
      volumes:
      - name: backup-storage
        persistentVolumeClaim:
          claimName: backup-storage-pvc
EOF
  
  log_success "Restore job created"
  log_info "Monitor with: kubectl logs -n $BACKUP_NS -l job-type=restore -f"
}

cmd_verify() {
  local backup_file="${1}"
  
  if [ -z "$backup_file" ]; then
    log_error "Usage: backup-manager.sh verify <backup-file>"
    return 1
  fi
  
  POD=$(get_backup_pod)
  if [ -z "$POD" ]; then
    log_error "No backup pod found"
    return 1
  fi
  
  log_info "Verifying backup: $backup_file"
  
  if kubectl exec -n "$BACKUP_NS" "$POD" -- gunzip -t "/backups/$backup_file"; then
    log_success "Backup integrity verified (valid gzip file)"
    
    # Show file size
    SIZE=$(kubectl exec -n "$BACKUP_NS" "$POD" -- ls -lh "/backups/$backup_file" | awk '{print $5}')
    log_info "Backup size: $SIZE"
  else
    log_error "Backup file is corrupted or invalid"
    return 1
  fi
}

cmd_logs() {
  local job_type="${1:-db}"
  
  case "$job_type" in
    db)
      log_info "Database backup job logs (latest):"
      LATEST=$(kubectl get jobs -n "$BACKUP_NS" -l job-name~="manual-db-backup" \
        --sort-by='.metadata.creationTimestamp' -o jsonpath='{.items[-1].metadata.name}' 2>/dev/null)
      ;;
    config)
      log_info "Config backup job logs (latest):"
      LATEST=$(kubectl get jobs -n "$BACKUP_NS" -l job-name~="manual-config-backup" \
        --sort-by='.metadata.creationTimestamp' -o jsonpath='{.items[-1].metadata.name}' 2>/dev/null)
      ;;
    all)
      log_info "All backup job logs:"
      kubectl logs -n "$BACKUP_NS" -l app=portfolio-mcs,component=backup --all-containers=true -f
      return 0
      ;;
    *)
      log_error "Invalid job type: $job_type"
      return 1
      ;;
  esac
  
  if [ -n "$LATEST" ]; then
    kubectl logs -n "$BACKUP_NS" -l "job-name=$LATEST" --all-containers=true -f
  else
    log_warn "No recent backup jobs found"
  fi
}

cmd_enable() {
  log_info "Enabling automated backups..."
  kubectl patch cronjob portfolio-db-backup -n "$BACKUP_NS" -p '{"spec":{"suspend":false}}'
  kubectl patch cronjob backup-configmaps-secrets -n "$BACKUP_NS" -p '{"spec":{"suspend":false}}'
  log_success "Backups enabled"
}

cmd_disable() {
  log_warn "Disabling automated backups..."
  kubectl patch cronjob portfolio-db-backup -n "$BACKUP_NS" -p '{"spec":{"suspend":true}}'
  kubectl patch cronjob backup-configmaps-secrets -n "$BACKUP_NS" -p '{"spec":{"suspend":true}}'
  log_success "Backups disabled"
}

cmd_schedule() {
  log_info "Current backup schedule:"
  echo ""
  kubectl get cronjobs -n "$BACKUP_NS" -o custom-columns=\
NAME:.metadata.name,SCHEDULE:.spec.schedule,SUSPEND:.spec.suspend
}

cmd_help() {
  cat <<EOF
Portfolio MCS — Backup Manager

USAGE:
  backup-manager.sh <command> [options]

COMMANDS:
  status              Show backup infrastructure status
  list                List all available backups
  trigger [db|config] Trigger manual backup (default: db)
  download <file>     Download backup file locally
  upload <file>       Upload backup file to cluster
  restore <file>      Restore database from backup
  verify <file>       Verify backup file integrity
  logs [db|config]    View latest backup job logs
  enable              Enable automated backups
  disable             Disable automated backups
  schedule            Show backup schedule
  help                Show this help message

EXAMPLES:
  # Check backup status
  ./backup-manager.sh status

  # List all backups
  ./backup-manager.sh list

  # Trigger immediate backup
  ./backup-manager.sh trigger db

  # Download a backup
  ./backup-manager.sh download portfolio_db_20260424_020000.sql.gz

  # Restore from backup
  ./backup-manager.sh restore portfolio_db_20260424_020000.sql.gz

  # Monitor backup logs
  ./backup-manager.sh logs all

EOF
}

# ============================================================
#  Main
# ============================================================

main() {
  check_deps
  
  local command="${1:-help}"
  shift || true
  
  case "$command" in
    status)   cmd_status "$@" ;;
    list)     cmd_list "$@" ;;
    trigger)  cmd_trigger "$@" ;;
    download) cmd_download "$@" ;;
    upload)   cmd_upload "$@" ;;
    restore)  cmd_restore "$@" ;;
    verify)   cmd_verify "$@" ;;
    logs)     cmd_logs "$@" ;;
    enable)   cmd_enable "$@" ;;
    disable)  cmd_disable "$@" ;;
    schedule) cmd_schedule "$@" ;;
    help)     cmd_help "$@" ;;
    *)
      log_error "Unknown command: $command"
      cmd_help
      exit 1
      ;;
  esac
}

main "$@"
