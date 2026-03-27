# Kubernetes Deployment - Quick Reference

This directory contains all Kubernetes manifests for deploying the Portfolio MCS application.

## 📁 Directory Structure

```
k8s/
├── 00-namespace.yaml           # Kubernetes namespace
├── 01-configmap.yaml           # Application configuration
├── 02-policies.yaml            # PodDisruptionBudget and NetworkPolicies
├── 03-advanced.yaml            # HPA, ResourceQuota, Monitoring (optional)
├── DEPLOYMENT_GUIDE.md         # Detailed deployment instructions
├── README.md                   # This file
├── deploy.sh                   # Automated deployment script
├── secrets/
│   └── 01-secrets.yaml         # Sensitive data (database, JWT, etc)
├── db/
│   ├── 01-storage.yaml         # PersistentVolume and PersistentVolumeClaim
│   ├── 02-deployment.yaml      # PostgreSQL deployment and service
│   └── 03-configmaps.yaml      # Database schema and seed scripts
├── api/
│   └── 01-deployment.yaml      # API deployment and service
├── user-ui/
│   └── 01-deployment.yaml      # User UI deployment and service
├── admin-ui/
│   └── 01-deployment.yaml      # Admin UI deployment and service
└── ingress/
    └── 01-ingress.yaml         # Ingress for routing
```

## 🚀 Quick Start

### Option 1: Automated Deployment (Recommended)

```bash
cd k8s
chmod +x deploy.sh

# Build, push, and deploy everything
./deploy.sh all

# Or step by step
./deploy.sh build
./deploy.sh push
./deploy.sh deploy
```

### Option 2: Manual Deployment

```bash
# Create namespace
kubectl apply -f k8s/00-namespace.yaml

# Create secrets (EDIT FIRST!)
kubectl apply -f k8s/secrets/01-secrets.yaml

# Create ConfigMaps
kubectl apply -f k8s/01-configmap.yaml

# Deploy database
kubectl apply -f k8s/db/

# Deploy API
kubectl apply -f k8s/api/

# Deploy frontends
kubectl apply -f k8s/user-ui/
kubectl apply -f k8s/admin-ui/

# Deploy policies and ingress
kubectl apply -f k8s/02-policies.yaml
kubectl apply -f k8s/ingress/
```

### Option 3: Deploy All at Once

```bash
kubectl apply -f k8s/
```

## ⚙️ Configuration

### 1. Before Deploying - CRITICAL STEPS

**Edit `secrets/01-secrets.yaml`:**
- Change `POSTGRES_PASSWORD` to a strong password
- Change `JWT_SECRET` (generate: `openssl rand -hex 32`)
- Change `ADMIN_PASSWORD_HASH` (generate: `node -e "require('bcryptjs').hash('yourpassword',12).then(console.log)"`)

**Edit `01-configmap.yaml`:**
- Update `ALLOWED_ORIGINS` with your domain names
- Update `NEXT_PUBLIC_API_URL` with your API domain

**Edit `ingress/01-ingress.yaml`:**
- Update all domain names in the `rules` section
- Configure HTTPS/TLS if needed

**Edit `db/01-storage.yaml`:**
- Update `nodeAffinity` to match your node name
- For cloud deployments, use cloud provider storage classes

**Edit deployment files:**
- Update image references to use your container registry
- Change `imagePullPolicy` to `Always` for production

### 2. Create Storage Directory (for local clusters)

```bash
# On each node that will run the database
mkdir -p /mnt/data/portfolio-db
chmod 755 /mnt/data/portfolio-db
```

### 3. Deploy to Cluster

```bash
kubectl apply -f k8s/
```

## 🔍 Verification

### Check Deployment Status

```bash
# Show all resources
kubectl get all -n portfolio

# Watch pods come up
kubectl get pods -n portfolio -w

# Check specific component
kubectl get deployment/portfolio-api -n portfolio -o wide
```

### View Logs

```bash
# Database logs
kubectl logs -f deployment/portfolio-db -n portfolio

# API logs
kubectl logs -f deployment/portfolio-api -n portfolio

# All logs
kubectl logs -f -n portfolio --all-containers=true -l app=portfolio-mcs
```

### Test Connectivity

```bash
# Port forward to test locally
kubectl port-forward svc/portfolio-api 4000:4000 -n portfolio
kubectl port-forward svc/portfolio-user-ui 3000:3000 -n portfolio

# Then visit: http://localhost:4000/api/health
```

## 📊 Key Files Explained

### `00-namespace.yaml`
Creates the `portfolio` namespace where all resources are isolated.

### `01-configmap.yaml`
Non-sensitive configuration like domain names, ports, and API URLs.

### `secrets/01-secrets.yaml`
**SENSITIVE** - Contains database credentials, JWT secrets, and initial admin credentials.

### `db/01-storage.yaml`
Defines storage for the PostgreSQL database. For production, consider managed database services.

### `db/02-deployment.yaml`
PostgreSQL database deployment with health checks and init scripts.

### `api/01-deployment.yaml`
Node.js REST API with automatic scaling, resource limits, and health checks.

### `user-ui/01-deployment.yaml` & `admin-ui/01-deployment.yaml`
Next.js frontends with server-side rendering support.

### `ingress/01-ingress.yaml`
Routes traffic to services. Supports both host-based and path-based routing.

### `02-policies.yaml`
Pod Disruption Budgets (for availability) and NetworkPolicies (for security).

## 🔄 Updates

### Update Application Code

```bash
# Build and push new image
docker build -t your-registry/portfolio-api:v1.0.1 ./api
docker push your-registry/portfolio-api:v1.0.1

# Update deployment
kubectl set image deployment/portfolio-api \
  api=your-registry/portfolio-api:v1.0.1 \
  -n portfolio
```

### Update Configuration

```bash
# Edit ConfigMap
kubectl edit configmap portfolio-config -n portfolio

# Restart deployments to pick up changes
kubectl rollout restart deployment/portfolio-api -n portfolio
```

### Update Secrets

```bash
# Edit secret
kubectl edit secret portfolio-secrets -n portfolio

# Restart deployments
kubectl rollout restart deployment/portfolio-api -n portfolio
```

## 🛡️ Security Best Practices

1. **Secrets Management**
   - Use external secret management (HashiCorp Vault, AWS Secrets Manager)
   - Never commit secrets to git
   - Rotate secrets regularly

2. **Image Security**
   - Use private container registry
   - Sign images with Cosign
   - Scan images for vulnerabilities

3. **RBAC**
   - Limit service account permissions
   - Use network policies
   - Enable Pod Security Policies

4. **Monitoring**
   - Enable audit logging
   - Monitor resource usage
   - Set up alerting

## 🐛 Troubleshooting

### Pod CrashLoopBackOff

```bash
# Check logs
kubectl logs <pod-name> -n portfolio

# Describe pod for events
kubectl describe pod <pod-name> -n portfolio
```

### Database Connection Failed

```bash
# Check database pod
kubectl get pod -l component=database -n portfolio

# Check database logs
kubectl logs -f deployment/portfolio-db -n portfolio

# Verify storage
kubectl get pvc -n portfolio
```

### Ingress Not Working

```bash
# Check ingress controller
kubectl get pods -n ingress-nginx

# Check ingress resource
kubectl get ingress -n portfolio
kubectl describe ingress portfolio-ingress -n portfolio

# Check DNS
nslookup api.johnisah.com
```

## 📚 Additional Resources

- [Kubernetes Documentation](https://kubernetes.io/docs/)
- [Deployment Guide](./DEPLOYMENT_GUIDE.md)
- [Next.js on Kubernetes](https://nextjs.org/docs/deployment/kubernetes)
- [PostgreSQL on Kubernetes](https://wal-e.readthedocs.io/)

## 🆘 Getting Help

For issues:
1. Check logs: `kubectl logs -f <pod> -n portfolio`
2. Describe resources: `kubectl describe <resource> -n portfolio`
3. Review manifests in this directory
4. Consult the DEPLOYMENT_GUIDE.md file

---

Kubernetes Version: 1.34+
