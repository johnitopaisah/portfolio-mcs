# Pre-Deployment Checklist

Use this checklist to ensure all resources are properly configured before deploying to Kubernetes.

## Phase 1: Prerequisites

- [ ] Kubernetes cluster is running (1.34+)
- [ ] kubectl is installed and configured
- [ ] Docker is installed (for building images)
- [ ] You have cluster admin access
- [ ] Ingress controller is installed (e.g., nginx-ingress)
- [ ] Storage provisioner is available (or manual PV created)

### Check Prerequisites

```bash
# Verify kubectl
kubectl version --client

# Verify cluster access
kubectl cluster-info

# Verify ingress controller
kubectl get deployment -A | grep ingress

# Verify storage
kubectl get storageclass
```

## Phase 2: Image Preparation

- [ ] API image built: `docker build -t your-registry/portfolio-api:latest ./api`
- [ ] User UI image built: `docker build -t your-registry/portfolio-user-ui:latest ./user-ui`
- [ ] Admin UI image built: `docker build -t your-registry/portfolio-admin-ui:latest ./admin-ui`
- [ ] All images pushed to registry
- [ ] Images are accessible from cluster (test: `docker pull your-registry/...`)

### Verify Images

```bash
# List images in registry
docker images | grep portfolio

# Test pull from target registry
docker pull your-registry/portfolio-api:latest
```

## Phase 3: Configuration Review

### Secrets (`k8s/secrets/01-secrets.yaml`)

- [ ] POSTGRES_PASSWORD changed from default ✅ REQUIRED
- [ ] JWT_SECRET generated and set ✅ REQUIRED (use: `openssl rand -hex 32`)
- [ ] ADMIN_PASSWORD_HASH set to new hash ✅ REQUIRED
- [ ] ADMIN_USERNAME updated (optional)
- [ ] Profile data updated (name, email, GitHub, LinkedIn)
- [ ] Email settings configured (or left empty if not using)
- [ ] Twilio settings configured (or left empty if not using)
- [ ] No values left with obvious placeholders or "CHANGE ME"

**Generation Commands**:

```bash
# Generate JWT_SECRET
openssl rand -hex 32

# Generate password hash
node -e "require('bcryptjs').hash('your-password', 12).then(console.log)"

# Or with Docker (if bcryptjs not installed)
docker run -it node:20-alpine node -e "require('bcryptjs').hash('your-password', 12).then(console.log)"
```

### ConfigMap (`k8s/01-configmap.yaml`)

- [ ] ALLOWED_ORIGINS updated with your domains
- [ ] NEXT_PUBLIC_API_URL points to your API domain
- [ ] DB_HOST is correct (default: portfolio-db is OK)
- [ ] DB_PORT is correct (default: 5432 is OK)
- [ ] DB_NAME is correct (default: portfolio_db is OK)

### Deployments (api, user-ui, admin-ui)

- [ ] Image names updated to use your registry
- [ ] imagePullPolicy set to `IfNotPresent` for local testing, `Always` for production
- [ ] Resource requests/limits are appropriate for your cluster
- [ ] Replicas match your scaling needs (default 2 is OK)

### Ingress (`k8s/ingress/01-ingress.yaml`)

- [ ] Domain names updated (johnisah.com, api.johnisah.com, admin.johnisah.com)
- [ ] Ingress controller class matches your setup (default: nginx)
- [ ] TLS section commented out (unless using cert-manager)
- [ ] CORS configuration matches your needs

### Storage (`k8s/db/01-storage.yaml`)

- [ ] Storage size is appropriate (default 2Gi)
- [ ] Storage class exists: `kubectl get storageclass`
- [ ] (For hostPath) Node name matches actual node: `kubectl get nodes`
- [ ] (For hostPath) Directory created on node: `/mnt/data/portfolio-db`
- [ ] (For cloud) Using appropriate provider (EBS, GCE PD, Azure Disk, etc)

**Create hostPath directory on node**:

```bash
# SSH into node
ssh user@node-ip

# Create directory
sudo mkdir -p /mnt/data/portfolio-db
sudo chmod 755 /mnt/data/portfolio-db

# Verify
ls -la /mnt/data/portfolio-db
```

## Phase 4: Dry Run

- [ ] Manifest syntax is valid: `kubectl apply -f k8s/ --dry-run=client`
- [ ] No obvious errors in validation
- [ ] All ConfigMaps can be created
- [ ] All Secrets can be created

### Validate All Manifests

```bash
# Syntax validation
kubectl apply -f k8s/ --dry-run=client -o yaml

# Or use kubeval (if installed)
kubeval k8s/**/*.yaml
```

## Phase 5: Deployment

- [ ] Read the DEPLOYMENT_GUIDE.md carefully
- [ ] Create namespace: `kubectl apply -f k8s/00-namespace.yaml`
- [ ] Create secrets: `kubectl apply -f k8s/secrets/01-secrets.yaml`
- [ ] Create ConfigMap: `kubectl apply -f k8s/01-configmap.yaml`
- [ ] Create storage: `kubectl apply -f k8s/db/01-storage.yaml`
- [ ] Create database: `kubectl apply -f k8s/db/02-deployment.yaml`
- [ ] Wait for database to be ready
- [ ] Create API: `kubectl apply -f k8s/api/01-deployment.yaml`
- [ ] Wait for API to be ready
- [ ] Create frontends: `kubectl apply -f k8s/user-ui/` and `k8s/admin-ui/`
- [ ] Create policies: `kubectl apply -f k8s/02-policies.yaml`
- [ ] Create ingress: `kubectl apply -f k8s/ingress/01-ingress.yaml`

### Quick Deploy

```bash
# All at once
kubectl apply -f k8s/

# Or use script
./k8s/deploy.sh deploy

# Or use Makefile
make -f k8s/Makefile.k8s k8s-deploy
```

## Phase 6: Verification

### Pod Status

- [ ] Database pod running: `kubectl get pod -l component=database -n portfolio`
- [ ] API pods running (2): `kubectl get pod -l component=api -n portfolio`
- [ ] User UI pods running (2): `kubectl get pod -l component=user-ui -n portfolio`
- [ ] Admin UI pods running (2): `kubectl get pod -l component=admin-ui -n portfolio`
- [ ] No pods in CrashLoopBackOff or Error state

### Services

- [ ] All services created: `kubectl get svc -n portfolio`
- [ ] Services have cluster IPs assigned
- [ ] Ports match expectations (3000, 3001, 4000, 5432)

### Ingress

- [ ] Ingress created: `kubectl get ingress -n portfolio`
- [ ] Ingress has address assigned (may take a minute)
- [ ] Rules are correct: `kubectl describe ingress portfolio-ingress -n portfolio`

### Health Checks

```bash
# Check database
kubectl get pod -l component=database -n portfolio -o jsonpath='{.items[0].status.conditions[?(@.type=="Ready")].status}'

# Check API
kubectl logs deployment/portfolio-api -n portfolio | head -20

# Test API health
kubectl port-forward svc/portfolio-api 4000:4000 -n portfolio &
curl http://localhost:4000/api/health
kill %1
```

## Phase 7: DNS & Access

- [ ] DNS records created/updated to point to ingress IP
  - johnisah.com → ingress IP
  - api.johnisah.com → ingress IP
  - admin.johnisah.com → ingress IP

- [ ] Wait for DNS propagation (5-10 minutes)
- [ ] DNS records resolve: `nslookup api.johnisah.com`

## Phase 8: Access Testing

- [ ] Public portfolio accessible: https://johnisah.com
- [ ] Admin dashboard accessible: https://admin.johnisah.com
- [ ] API health check: https://api.johnisah.com/api/health
- [ ] Can login with admin credentials
- [ ] Can create/edit portfolio content
- [ ] Static images load correctly

### Test Locally (without DNS)

```bash
# Port-forward to test
kubectl port-forward svc/portfolio-api 4000:4000 -n portfolio &
kubectl port-forward svc/portfolio-user-ui 3000:3000 -n portfolio &
kubectl port-forward svc/portfolio-admin-ui 3001:3001 -n portfolio &

# Test in browser
# http://localhost:3000
# http://localhost:3001
# http://localhost:4000/api/health

# Kill port-forwards
killall kubectl
```

## Phase 9: Monitoring & Logging

- [ ] Logs are readable: `kubectl logs deployment/portfolio-api -n portfolio`
- [ ] No obvious errors in logs
- [ ] Pods restart count is 0: `kubectl get pod -n portfolio`
- [ ] Resource usage is reasonable: `kubectl top pods -n portfolio`

## Phase 10: Backup & Recovery

- [ ] Backup script tested: `make -f k8s/Makefile.k8s k8s-backup-db`
- [ ] Backup file created successfully
- [ ] Restore procedure documented
- [ ] Regular backups scheduled (optional)

## Phase 11: Production Readiness

- [ ] HTTPS/TLS configured (cert-manager + Let's Encrypt)
- [ ] Auto-scaling enabled (HPA configured)
- [ ] Monitoring configured (Prometheus/Grafana)
- [ ] Logging aggregated (ELK, Loki, etc)
- [ ] Backup strategy implemented
- [ ] Disaster recovery plan documented
- [ ] On-call runbook created
- [ ] Performance tested under load
- [ ] Security audit completed
- [ ] Documentation updated

## Common Issues & Solutions

### Pod CrashLoopBackOff

```bash
# Check logs
kubectl logs <pod-name> -n portfolio

# Describe pod for events
kubectl describe pod <pod-name> -n portfolio

# Check resource limits aren't being exceeded
kubectl top pod <pod-name> -n portfolio
```

### Database Connection Failed

```bash
# Check database pod
kubectl get pod -l component=database -n portfolio

# Check database logs
kubectl logs -f deployment/portfolio-db -n portfolio

# Verify storage
kubectl get pvc -n portfolio

# Check storage directory on node
ssh user@node && ls -la /mnt/data/portfolio-db/
```

### Ingress Not Routing

```bash
# Check ingress controller
kubectl get pods -n ingress-nginx

# Check ingress resource
kubectl get ingress -n portfolio -o yaml

# Check DNS
dig api.johnisah.com
nslookup api.johnisah.com

# Port-forward ingress (if needed)
kubectl port-forward -n ingress-nginx svc/ingress-nginx 8080:80 &
curl -H "Host: api.johnisah.com" http://localhost:8080/api/health
```

### Docker Image Pull Failed

```bash
# Check image exists
docker images

# Push to registry
docker push your-registry/portfolio-api:latest

# Verify pull works
docker pull your-registry/portfolio-api:latest

# Check imagePullSecrets if using private registry
kubectl get secrets -n portfolio
```

## Deployment Sign-Off

- [ ] All checks passed
- [ ] All systems operational
- [ ] Stakeholders notified
- [ ] Deployment logged
- [ ] Post-deployment communications sent
- [ ] Application monitoring verified

---

**Last Updated**: 2026-03-26
**Deployment Date**: _______________
**Deployed By**: _______________
**Sign-Off**: _______________
