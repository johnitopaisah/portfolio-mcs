# Portfolio MCS - Kubernetes Manifests Summary

Generated: 2026-03-26

## Overview

This document provides a comprehensive guide to all Kubernetes manifests generated for the Portfolio MCS application. These manifests are fully configured for production deployment with proper health checks, resource limits, security policies, and high availability.

## Generated Files

### Root Configuration Files

| File | Purpose |
|------|---------|
| `00-namespace.yaml` | Creates the portfolio namespace for resource isolation |
| `01-configmap.yaml` | Non-sensitive configuration (domains, API URLs, ports) |
| `02-policies.yaml` | Pod Disruption Budgets and Network Policies |
| `03-advanced.yaml` | Optional: HPA, ResourceQuota, Monitoring, SSL (commented) |

### Secrets

| File | Purpose |
|------|---------|
| `secrets/01-secrets.yaml` | **SENSITIVE** - Database credentials, JWT secret, admin user hash |

### Database (PostgreSQL)

| File | Purpose |
|------|---------|
| `db/01-storage.yaml` | PersistentVolume and PersistentVolumeClaim for data persistence |
| `db/02-deployment.yaml` | PostgreSQL deployment with liveliness/readiness probes, init containers |
| `db/03-configmaps.yaml` | Database schema (schema.sql) and seed script (seed.sh) |

### API (Node.js Express)

| File | Purpose |
|------|---------|
| `api/01-deployment.yaml` | API deployment (2 replicas), service, and ServiceAccount |

### User UI (Next.js)

| File | Purpose |
|------|---------|
| `user-ui/01-deployment.yaml` | Public portfolio deployment (2 replicas), service, and ServiceAccount |

### Admin UI (Next.js)

| File | Purpose |
|------|---------|
| `admin-ui/01-deployment.yaml` | Admin dashboard deployment (2 replicas), service, and ServiceAccount |

### Ingress

| File | Purpose |
|------|---------|
| `ingress/01-ingress.yaml` | Ingress configuration with host-based and path-based routing |

### Deployment Helpers

| File | Purpose |
|------|---------|
| `deploy.sh` | Automated deployment script (bash) |
| `Makefile.k8s` | Make commands for K8s operations |
| `DEPLOYMENT_GUIDE.md` | Detailed deployment instructions |
| `README.md` | Quick reference and troubleshooting |

## Architecture

```
┌─────────────────────────────────────────────────────────┐
│                  Ingress Controller                       │
│         (nginx-ingress or equivalent)                     │
└─────────────────────────────────────────────────────────┘
         ↓                    ↓                    ↓
┌──────────────────┬──────────────────┬──────────────────┐
│ portfolio-user-ui│ portfolio-api    │ portfolio-admin-ui│
│  (3000, x2)      │  (4000, x2)      │  (3001, x2)       │
│   Next.js        │   Express.js     │   Next.js         │
│   Service        │   Service        │   Service         │
└──────────────────┴──────────────────┴──────────────────┘
                         ↓
                  ┌──────────────┐
                  │portfolio-db  │
                  │  (5432, x1)  │
                  │ PostgreSQL   │
                  │ Service      │
                  └──────────────┘
                         ↓
                  ┌──────────────┐
                  │ Persistent   │
                  │ Volume (20Gi)│
                  └──────────────┘
```

## Component Details

### 1. Namespace (portfolio)

- **Name**: portfolio
- **Labels**: app=portfolio-mcs
- **Purpose**: Isolates all resources in a dedicated namespace

### 2. Secrets

- **Name**: portfolio-secrets
- **Type**: Opaque
- **Contents**:
  - POSTGRES_DB, POSTGRES_USER, POSTGRES_PASSWORD
  - JWT_SECRET, JWT_EXPIRES_IN
  - ADMIN_USERNAME, ADMIN_PASSWORD_HASH
  - PROFILE data (name, bio, email, URLs)
  - Optional: Email and Twilio settings

**⚠️ CRITICAL**: Edit before deploying!

### 3. ConfigMap

- **Name**: portfolio-config
- **Type**: Application configuration
- **Contents**:
  - Database host/port/name
  - API configuration
  - CORS origins
  - API URLs for frontends

### 4. PostgreSQL Database

**Deployment**:
- Replicas: 1 (stateful service)
- Image: postgres:16-alpine
- Port: 5432
- Health Check: pg_isready
- Init Scripts: schema.sql, seed.sh

**Storage**:
- Type: PersistentVolume (hostPath for local clusters)
- Size: 20Gi
- Access Mode: ReadWriteOnce
- Reclaim Policy: Retain

**Init Containers**:
- None (runs via Docker entrypoint)

### 5. API Deployment

**Configuration**:
- Replicas: 2 (auto-scales 2-10 via HPA)
- Image: portfolio-mcs-api:latest
- Port: 4000
- Resource Requests: 100m CPU, 128Mi Memory
- Resource Limits: 500m CPU, 512Mi Memory

**Health Checks**:
- Liveness: GET /api/health (30s delay, 10s interval)
- Readiness: GET /api/health (10s delay, 5s interval)

**Init Containers**:
- wait-for-db: Ensures database is ready
- Uses `nc` (netcat) to check port 5432

**Features**:
- Rolling update strategy
- Pod anti-affinity (spread across nodes)
- ServiceAccount for RBAC
- Lifecycle preStop hook (graceful shutdown)

### 6. User UI Deployment

**Configuration**:
- Replicas: 2 (auto-scales 2-5 via HPA)
- Image: portfolio-mcs-user-ui:latest
- Port: 3000
- Resource Requests: 100m CPU, 128Mi Memory
- Resource Limits: 500m CPU, 512Mi Memory

**Health Checks**:
- Liveness: GET / (30s delay, 10s interval)
- Readiness: GET / (10s delay, 5s interval)

**Init Containers**:
- wait-for-api: Ensures API is ready

**Features**:
- Next.js server-side rendering
- Pod anti-affinity
- Graceful shutdown via preStop hook

### 7. Admin UI Deployment

**Configuration**:
- Replicas: 2 (auto-scales 1-3 via HPA)
- Image: portfolio-mcs-admin-ui:latest
- Port: 3001
- Resource Requests: 100m CPU, 128Mi Memory
- Resource Limits: 500m CPU, 512Mi Memory

**Health Checks**:
- Liveness: GET / (30s delay, 10s interval)
- Readiness: GET / (10s delay, 5s interval)

**Init Containers**:
- wait-for-api: Ensures API is ready

**Features**:
- Next.js server-side rendering
- SecurityContext: non-root user (1001)
- Pod anti-affinity
- Graceful shutdown

### 8. Services

All services are ClusterIP type (internal routing):

- **portfolio-api**: Port 4000
- **portfolio-user-ui**: Port 3000
- **portfolio-admin-ui**: Port 3001
- **portfolio-db**: Port 5432 (headless service)

### 9. Ingress

**Configuration**:
- Controller: nginx
- Routing Type: Host-based (primary) and path-based (secondary)

**Host-Based Routes**:
- `johnisah.com` → portfolio-user-ui:3000
- `api.johnisah.com` → portfolio-api:4000
- `admin.johnisah.com` → portfolio-admin-ui:3001

**Path-Based Routes** (alternative):
- `/` → portfolio-user-ui:3000
- `/api/*` → portfolio-api:4000
- `/admin/*` → portfolio-admin-ui:3001

**Features**:
- CORS enabled (all origins)
- Rate limiting (100 RPS)
- Security headers (X-Frame-Options, CSP, etc)
- TLS/SSL ready (cert-manager compatible)

### 10. Policies

**Pod Disruption Budgets**:
- API: minAvailable = 1
- User UI: minAvailable = 1
- Admin UI: minAvailable = 1

**Network Policies**:
- Egress allowed to: DNS, external HTTPS, inter-pod traffic
- Ingress allowed from: Ingress Controller, inter-pod traffic

### 11. Advanced Resources (Optional)

**HorizontalPodAutoscaler**:
- API: 2-10 replicas (target 70% CPU / 80% memory)
- User UI: 2-5 replicas (target 75% CPU)
- Admin UI: 1-3 replicas (target 75% CPU)

**ResourceQuota** (namespace-level):
- CPU: 2 cores request, 4 cores limit
- Memory: 2Gi request, 4Gi limit
- Pods: 30 max

**LimitRange** (pod-level):
- CPU: 50m min, 1 core max
- Memory: 64Mi min, 1Gi max
- Defaults: 100m CPU, 128Mi memory

## Environment Variables

### Database

```
POSTGRES_DB=portfolio_db
POSTGRES_USER=portfolio_user
POSTGRES_PASSWORD=<CHANGE ME>
DATABASE_URL=postgres://portfolio_user:<CHANGE ME>@portfolio-db:5432/portfolio_db
```

### API

```
NODE_ENV=production
PORT=4000
JWT_SECRET=<CHANGE ME>
JWT_EXPIRES_IN=20m
ALLOWED_ORIGINS=https://...
```

### Frontends

```
NODE_ENV=production
NEXT_PUBLIC_API_URL=https://api.johnisah.com
INTERNAL_API_URL=http://portfolio-api:4000
```

## Storage

- **Type**: PersistentVolume (hostPath)
- **Size**: 20Gi
- **Mount Point**: /var/lib/postgresql/data on postgres container
- **Reclaim Policy**: Retain (data persists after pod deletion)

For production, use:
- AWS: EBS volumes
- GCP: Persistent Disks
- Azure: Azure Disk
- Or managed database service

## Security Features

- ✅ Network policies for ingress/egress control
- ✅ Non-root users (Deployments run as UID 1001, 1000)
- ✅ Pod security contexts
- ✅ Pod Disruption Budgets for availability
- ✅ Resource limits and requests
- ✅ Health checks (liveness & readiness)
- ✅ CORS configuration
- ✅ Rate limiting (100 RPS)
- ✅ Security headers (X-Frame-Options, X-XSS-Protection, etc)
- ✅ ServiceAccounts and RBAC ready

## Scaling

### Horizontal Scaling (add pods)

```bash
kubectl scale deployment/portfolio-api --replicas=5 -n portfolio
```

### Vertical Scaling (more resources)

Edit deployments and update resource requests/limits:

```yaml
resources:
  requests:
    memory: "256Mi"
    cpu: "200m"
  limits:
    memory: "1Gi"
    cpu: "1000m"
```

### Auto-scaling (via HPA)

Enabled in `03-advanced.yaml` (uncommented). Scales based on CPU/memory usage.

## Deployment Commands

### One-liner Deploy

```bash
kubectl apply -f k8s/
```

### Step-by-Step Deploy

```bash
./k8s/deploy.sh all
```

### Manual Deploy

```bash
make -f k8s/Makefile.k8s k8s-deploy
```

## Verification Checklist

- [ ] All secrets are updated with strong values
- [ ] Domain names are configured in ConfigMaps and Ingress
- [ ] Storage path exists on nodes
- [ ] Node names match in storage nodeAffinity
- [ ] Image references use your container registry
- [ ] imagePullPolicy is set correctly
- [ ] Database pod is running: `kubectl get pod -l component=database -n portfolio`
- [ ] API pod is running: `kubectl get pod -l component=api -n portfolio`
- [ ] Ingress is created: `kubectl get ingress -n portfolio`
- [ ] Health check passes: `curl http://api.johnisah.com/api/health` (after DNS setup)

## Troubleshooting Quick Links

| Problem | Solution |
|---------|----------|
| Pod CrashLoopBackOff | Check logs: `kubectl logs <pod> -n portfolio` |
| Database not ready | Check storage: `kubectl get pvc -n portfolio` |
| API connection failed | `kubectl exec <api-pod> -n portfolio -- env \| grep DATABASE` |
| Ingress not working | `kubectl describe ingress -n portfolio` |
| Secret not found | `kubectl get secrets -n portfolio` |

## Next Steps

1. **Review and edit** `secrets/01-secrets.yaml` with your values
2. **Update** `01-configmap.yaml` with your domain names
3. **Configure** `ingress/01-ingress.yaml` for your domains
4. **Update** image references in deployment files
5. **Deploy**: `./k8s/deploy.sh all` or `kubectl apply -f k8s/`
6. **Verify**: `kubectl get all -n portfolio`
7. **Test**: Access applications via ingress or port-forward

---

**Version**: 1.0
**Last Updated**: 2026-03-26
**Kubernetes**: 1.20+
**Components**: Postgres 16, Node.js 20, Next.js 14
