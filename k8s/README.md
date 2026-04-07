# Portfolio MCS — Kubernetes Manifests

Production-grade K8s manifests for all 4 services.
Configured for **Minikube** locally, with a production ingress
ready for a real cluster.

---

## Directory structure

```
k8s/
├── 00-namespace.yaml
├── 01-configmap.yaml          Non-sensitive config (URLs, CORS origins)
│
├── infisical/                 Secret management via Infisical operator
│   ├── 01-machine-identity-secret.example.yaml   Manual one-time secret
│   └── 02-infisical-secret.yaml                  Auto-creates portfolio-secrets
│
├── secrets/
│   ├── 01-app-secret.example.yaml    Key reference (Infisical manages the real values)
│   └── 02-ghcr-pull-secret.example.yaml
│
├── db/
│   ├── 01-pvc.yaml                storageClassName: standard (Minikube)
│   ├── 02-service.yaml            Headless service
│   ├── 03-configmap-schema.yaml   schema.sql init script
│   ├── 04-configmap-seed.yaml     seed.sh init script
│   └── 05-statefulset.yaml        postgres:16-alpine StatefulSet
│
├── api/
│   ├── 01-serviceaccount.yaml
│   ├── 02-service.yaml
│   └── 03-deployment.yaml         image: …/api:v0.0.1-rc, 1 replica (Minikube)
│
├── user-ui/
│   ├── 01-serviceaccount.yaml
│   ├── 02-service.yaml
│   └── 03-deployment.yaml         image: …/user-ui:v0.0.1-rc, 1 replica
│
├── admin-ui/
│   ├── 01-serviceaccount.yaml
│   ├── 02-service.yaml
│   └── 03-deployment.yaml         image: …/admin-ui:v0.0.1-rc, 1 replica
│
├── ingress/
│   ├── 00-cert-manager.yaml           ClusterIssuer (production only)
│   ├── 01-ingress-minikube.yaml       HTTP, local hostnames, no TLS
│   └── 02-ingress-production.yaml     HTTPS, real domains, TLS via cert-manager
│
├── policies/
│   ├── 01-pdb-api.yaml
│   ├── 02-pdb-user-ui.yaml
│   ├── 03-pdb-admin-ui.yaml
│   ├── 04-network-policy.yaml     NOTE: requires Calico CNI to enforce on Minikube
│   ├── 05-resource-quota.yaml     Sized for Minikube (1 CPU / 3 GB)
│   └── 06-limit-range.yaml
│
├── hpa/
│   ├── 01-hpa-api.yaml            min 1, max 4 (Minikube)
│   ├── 02-hpa-user-ui.yaml        min 1, max 3 (Minikube)
│   └── 03-hpa-admin-ui.yaml       min 1, max 2
│
└── deploy.sh                  Bootstrap script (--env local | prod)
```

---

## Minikube setup (first time)

```bash
# Start Minikube with enough resources
minikube start --cpus=4 --memory=4096

# Enable required addons
minikube addons enable ingress
minikube addons enable metrics-server

# Add local DNS entries
echo "$(minikube ip) portfolio.local api.portfolio.local admin.portfolio.local" | sudo tee -a /etc/hosts
```

---

## Infisical setup (required before deploying)

### 1. Install Infisical operator
```bash
kubectl apply -f https://raw.githubusercontent.com/Infisical/infisical/main/k8-operator/config/install/install.yaml
kubectl wait --for=condition=Available deployment --all -n infisical-operator-system --timeout=120s
```

### 2. Create Machine Identity in Infisical
- Infisical dashboard → Your project → Access Control → Machine Identities
- Add Identity → Universal Auth → copy **Client ID** and **Client Secret**

### 3. Create the machine identity secret (once)
```bash
kubectl apply -f k8s/00-namespace.yaml   # namespace must exist first

kubectl create secret generic infisical-machine-identity \
  --namespace portfolio \
  --from-literal=clientId=YOUR_CLIENT_ID \
  --from-literal=clientSecret=YOUR_CLIENT_SECRET
```

### 4. Populate your Infisical project (env: prod)
Add all keys from `k8s/secrets/01-app-secret.example.yaml` to your
Infisical project. The operator will sync them automatically into
the `portfolio-secrets` K8s Secret.

### 5. Update `k8s/infisical/02-infisical-secret.yaml`
Set your actual `projectSlug` and confirm `envSlug` is correct.

---

## GHCR pull secret (required before deploying)

Generate a GitHub PAT with `read:packages` scope at https://github.com/settings/tokens

```bash
kubectl create secret docker-registry ghcr-pull-secret \
  --namespace portfolio \
  --docker-server=ghcr.io \
  --docker-username=johnitopaisah \
  --docker-password=YOUR_GITHUB_PAT \
  --docker-email=johnitopaisah@gmail.com
```

---

## Deploy

```bash
chmod +x k8s/deploy.sh

# Minikube
./k8s/deploy.sh --env local

# Production (real cluster)
./k8s/deploy.sh --env prod
```

---

## Useful commands

```bash
# Check all pods
kubectl get pods -n portfolio

# Tail API logs
kubectl logs -n portfolio -l component=api -f

# Check Infisical sync status
kubectl describe infisicalsecret -n portfolio

# Check portfolio-secrets was created
kubectl get secret portfolio-secrets -n portfolio

# Open shell in DB pod
kubectl exec -it -n portfolio statefulset/portfolio-db -- psql -U portfolio_user -d portfolio_db

# Restart a deployment to pull new image
kubectl rollout restart deployment/portfolio-api -n portfolio

# Enable NetworkPolicy enforcement on Minikube (requires cluster recreate)
minikube delete && minikube start --cni=calico --cpus=4 --memory=4096
```

---

## Moving to production

When ready to move beyond Minikube, the recommended path:

| Option | Cost | Notes |
|---|---|---|
| **k3s on Hetzner VPS** | ~€4/mo | Closest to Minikube workflow, real LoadBalancer |
| **DigitalOcean DOKS** | ~$12/mo | Managed control plane, simplest setup |
| **AWS EKS** | ~$72/mo | Enterprise grade, most complex |

Changes needed when moving to production:
1. `db/01-pvc.yaml` — change `storageClassName: standard` to your cloud provider's class
2. Deployment replicas — increase api and user-ui from 1 → 2
3. ResourceQuota — increase limits in `policies/05-resource-quota.yaml`
4. HPA maxReplicas — increase in `hpa/01-hpa-api.yaml` and `hpa/02-hpa-user-ui.yaml`
5. Use `02-ingress-production.yaml` instead of `01-ingress-minikube.yaml`
6. Point DNS A records at the cluster LoadBalancer IP
7. Update `ADMIN_URL` in Infisical from `http://admin.portfolio.local` → `https://admin.johnisah.com`
