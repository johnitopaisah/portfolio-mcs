# Kubernetes Deployment - Getting Started

Welcome! This guide will walk you through deploying Portfolio MCS to Kubernetes.

## 📋 What's Included

```
k8s/
├── 00-namespace.yaml           # Kubernetes namespace
├── 01-configmap.yaml           # Application configuration
├── 02-policies.yaml            # PDB and Network Policies
├── 03-advanced.yaml            # Optional: HPA, ResourceQuota
├── deploy.sh                   # Automated deployment script
├── Makefile.k8s                # Make commands
├── README.md                   # Quick reference
├── DEPLOYMENT_GUIDE.md         # Detailed instructions
├── MANIFEST_SUMMARY.md         # Complete manifest overview
├── PRE_DEPLOYMENT_CHECKLIST.md # Pre-deployment checklist
├── GETTING_STARTED.md          # This file
├── secrets/
│   └── 01-secrets.yaml         # Database & JWT secrets
├── db/
│   ├── 01-storage.yaml         # Storage resources
│   ├── 02-deployment.yaml      # PostgreSQL
│   └── 03-configmaps.yaml      # DB schema & seed script
├── api/
│   └── 01-deployment.yaml      # REST API
├── user-ui/
│   └── 01-deployment.yaml      # Public portfolio
├── admin-ui/
│   └── 01-deployment.yaml      # Admin dashboard
└── ingress/
    └── 01-ingress.yaml         # Traffic routing
```

## 🚀 Quick Start (5 Minutes)

### 1. Configure Secrets (CRITICAL)

```bash
cd k8s

# Edit secrets file and update:
# - POSTGRES_PASSWORD (strong random password)
# - JWT_SECRET (run: openssl rand -hex 32)
# - ADMIN_PASSWORD_HASH (run: node -e "require('bcryptjs').hash('password', 12).then(console.log)")
nano secrets/01-secrets.yaml
```

### 2. Configure Domains

```bash
# Edit ConfigMap with your domains
nano 01-configmap.yaml

# Look for:
# - ALLOWED_ORIGINS
# - NEXT_PUBLIC_API_URL
```

### 3. Update Ingress

```bash
# Edit ingress with your domain names
nano ingress/01-ingress.yaml

# Update all host entries to your domains
```

### 4. Deploy

```bash
# Option A: Automated script (recommended)
chmod +x deploy.sh
./deploy.sh all

# Option B: Manual
kubectl apply -f k8s/

# Option C: Step by step (safe)
./deploy.sh deploy
```

### 5. Verify

```bash
# Check status
kubectl get all -n portfolio

# View logs
kubectl logs -f deployment/portfolio-api -n portfolio
```

## 📚 Documentation

### For First-Time Users
👉 Start with: **README.md**

### For Detailed Steps
👉 Read: **DEPLOYMENT_GUIDE.md**

### Understanding Architecture
👉 See: **MANIFEST_SUMMARY.md**

### Pre-Deployment Checklist
👉 Use: **PRE_DEPLOYMENT_CHECKLIST.md**

## 🎯 Common Tasks

### Deploy Everything

```bash
./deploy.sh all
```

### Just Build & Push Images

```bash
./deploy.sh build
./deploy.sh push
```

### Just Deploy to Cluster

```bash
./deploy.sh deploy
```

### Check Status

```bash
make -f Makefile.k8s k8s-status
```

### View Logs

```bash
make -f Makefile.k8s k8s-logs

# Or specific component
make -f Makefile.k8s k8s-logs-api
```

### Port Forward for Testing

```bash
make -f Makefile.k8s k8s-port-forward
```

### Backup Database

```bash
make -f Makefile.k8s k8s-backup-db
```

## 🔧 Prerequisites

### Required
- [ ] Kubernetes cluster (1.20+)
- [ ] kubectl configured
- [ ] 4GB RAM available
- [ ] 50GB storage available

### Optional
- [ ] Docker (for building images)
- [ ] Container registry (for pushing images)
- [ ] cert-manager (for HTTPS)

### Check Prerequisites

```bash
# Kubernetes cluster
kubectl cluster-info

# Access
kubectl get nodes

# Storage
kubectl get storageclass
```

## 🎨 Configuration

### Images

Update image registry in deployments:

```bash
# Find and replace
sed -i 's|portfolio-mcs-|your-registry/portfolio-|g' {api,user-ui,admin-ui}/*.yaml
```

### Domains

Update your domains in:
1. `01-configmap.yaml` - ALLOWED_ORIGINS, NEXT_PUBLIC_API_URL
2. `ingress/01-ingress.yaml` - host names
3. `secrets/01-secrets.yaml` - No changes needed (local setup)

### Replicas & Scaling

Change replicas in deployment files:

```yaml
spec:
  replicas: 3  # Change this number
```

Or use kubectl:

```bash
kubectl scale deployment/portfolio-api --replicas=5 -n portfolio
```

### Resource Limits

Adjust in deployment files:

```yaml
resources:
  requests:
    memory: "256Mi"
    cpu: "200m"
  limits:
    memory: "1Gi"
    cpu: "1000m"
```

## 🐛 Troubleshooting

### Check Logs

```bash
# API logs
kubectl logs deployment/portfolio-api -n portfolio

# Database logs
kubectl logs deployment/portfolio-db -n portfolio

# All logs
kubectl logs -f -n portfolio -l app=portfolio-mcs --all-containers=true
```

### Check Pod Status

```bash
# Show all pods
kubectl get pods -n portfolio

# Detailed info
kubectl describe pod <pod-name> -n portfolio

# Check events
kubectl get events -n portfolio
```

### Test Connectivity

```bash
# Port forward and test
kubectl port-forward svc/portfolio-api 4000:4000 -n portfolio &
curl http://localhost:4000/api/health
kill %1
```

### Reset Everything

```bash
# Delete namespace (careful - removes all data!)
kubectl delete namespace portfolio

# Reapply manifests
kubectl apply -f k8s/
```

## 🔐 Security

### Secrets Management

**Important**: Never commit secrets to git!

1. Generate strong secrets before deploying
2. Use secret management tools (Vault, Sealed Secrets)
3. Rotate secrets regularly
4. Restrict access to secrets

### Network Security

Network policies restrict traffic between pods. Review in `02-policies.yaml` for your needs.

### RBAC

ServiceAccounts are created for each component. Expand RBAC as needed.

## 📊 Monitoring

### Basic Health Check

```bash
# Pod status
kubectl get pods -n portfolio

# Pod resources
kubectl top pods -n portfolio

# Pod events
kubectl get events -n portfolio
```

### With Monitoring Tools

Enable in `03-advanced.yaml`:
- Prometheus ServiceMonitor
- Grafana dashboards
- ELK Stack logging

## 🚢 Production Considerations

Before going to production:

- [ ] Enable HTTPS with cert-manager
- [ ] Configure monitoring (Prometheus/Grafana)
- [ ] Enable logging (ELK, Loki, etc)
- [ ] Set up automated backups
- [ ] Use managed database service
- [ ] Configure auto-scaling (HPA)
- [ ] Review network policies
- [ ] Implement RBAC policies
- [ ] Security audit completed
- [ ] Disaster recovery plan

## 📞 Getting Help

### If deployment fails:

1. **Check logs**: `kubectl logs <pod> -n portfolio`
2. **Check events**: `kubectl describe pod <pod> -n portfolio`
3. **Review docs**: Look at README.md and DEPLOYMENT_GUIDE.md
4. **Common issues**: Check PRE_DEPLOYMENT_CHECKLIST.md

### Common Issues Solutions

| Problem | Command |
|---------|---------|
| Pods stuck | `kubectl describe pod <pod> -n portfolio` |
| DB not starting | `kubectl logs deployment/portfolio-db -n portfolio` |
| API connection error | `kubectl get pod -l component=database -n portfolio` |
| Ingress not working | `kubectl get ingress -n portfolio` |

## 📝 Next Steps

1. ✅ Read this file (you're here!)
2. 📄 Review **README.md** for quick reference
3. 🔍 Read **DEPLOYMENT_GUIDE.md** carefully
4. ✓ Complete **PRE_DEPLOYMENT_CHECKLIST.md**
5. 🚀 Run `./deploy.sh all` to deploy
6. ✔️ Verify with `kubectl get all -n portfolio`
7. 🎉 Access your application!

## 📞 Support & Questions

For issues, refer to:
- README.md - Quick reference
- DEPLOYMENT_GUIDE.md - Step-by-step instructions
- MANIFEST_SUMMARY.md - Architecture details
- PRE_DEPLOYMENT_CHECKLIST.md - Verification checklist

## 🎉 What's Next?

Once deployed:

1. **Login** to admin dashboard (https://admin.johnisah.com)
2. **Configure** profile, projects, skills, etc
3. **Share** public portfolio (https://johnisah.com)
4. **Monitor** logs and health
5. **Backup** data regularly

---

**Happy deploying! 🚀**

Questions? Check the documentation files in this directory.
