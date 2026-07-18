#!/usr/bin/env bash
set -euo pipefail

#############################################
# Configurable variables
#############################################
PROFILE="${PROFILE:-devops-minikube}"
K8S_VERSION="${K8S_VERSION:-v1.34.2}"   # safer default with current Argo CD tested versions
NODES="${NODES:-2}"

# These values are per minikube node for the Docker driver.
# On your 4 OCPU Oracle VM, keep this conservative.
CPUS_PER_NODE="${CPUS_PER_NODE:-2}"
MEMORY_PER_NODE_MB="${MEMORY_PER_NODE_MB:-4096}"
DISK_SIZE="${DISK_SIZE:-20g}"
DRIVER="${DRIVER:-docker}"

ARGO_NAMESPACE="${ARGO_NAMESPACE:-argocd}"
ARGO_RELEASE="${ARGO_RELEASE:-argocd-deploy}"
ARGO_DOMAIN="${ARGO_DOMAIN:-argocd-deploy.johnisah.com}"
SHOPNOW_DOMAIN="${SHOPNOW_DOMAIN:-shopnow.johnisah.com}"

CERT_MANAGER_NAMESPACE="${CERT_MANAGER_NAMESPACE:-cert-manager}"
CERT_MANAGER_VERSION="${CERT_MANAGER_VERSION:-v1.20.0}"

TRAEFIK_NAMESPACE="${TRAEFIK_NAMESPACE:-traefik}"
TRAEFIK_RELEASE="${TRAEFIK_RELEASE:-traefik}"

CLUSTER_ISSUER_PROD="${CLUSTER_ISSUER_PROD:-letsencrypt-prod}"

INFISICAL_NAMESPACE="${INFISICAL_NAMESPACE:-infisical}"
INFISICAL_RELEASE="${INFISICAL_RELEASE:-infisical}"

ECOMMERCE_NAMESPACE="${ECOMMERCE_NAMESPACE:-ecommerce}"
PORTFOLIO_MCS_NAMESPACE="${PORTFOLIO_MCS_NAMESPACE:-portfolio}"
MONITORING_NAMESPACE="${MONITORING_NAMESPACE:-monitoring}"

#############################################
# Helper functions
#############################################
log() {
  echo
  echo "=================================================="
  echo "==> $*"
  echo "=================================================="
}

need_cmd() {
  if ! command -v "$1" >/dev/null 2>&1; then
    echo "ERROR: required command not found: $1"
    exit 1
  fi
}

#############################################
# Prereqs
#############################################
log "Checking required commands"
need_cmd docker
need_cmd minikube
need_cmd kubectl
need_cmd helm

#############################################
# Start / recreate cluster
#############################################
log "Starting Minikube profile '${PROFILE}' with ${NODES} nodes"

if minikube profile list -o json 2>/dev/null | grep -q "\"Name\":\"${PROFILE}\""; then
  echo "Profile '${PROFILE}' already exists."
  echo "If you want a clean rebuild, run:"
  echo "  minikube delete -p ${PROFILE}"
  echo "Continuing with existing profile..."
else
  minikube start \
    -p "${PROFILE}" \
    --driver="${DRIVER}" \
    --container-runtime=containerd \
    --kubernetes-version="${K8S_VERSION}" \
    --nodes="${NODES}" \
    --cpus="${CPUS_PER_NODE}" \
    --memory="${MEMORY_PER_NODE_MB}" \
    --disk-size="${DISK_SIZE}" \
    --embed-certs=true
fi

kubectl config use-context "${PROFILE}"
MINIKUBE_IP="$(minikube -p "${PROFILE}" ip)"
echo "Minikube IP: ${MINIKUBE_IP}"

#############################################
# Core addons
#############################################
log "Enabling required Minikube addons"
minikube -p "${PROFILE}" addons enable metrics-server
# minikube -p "${PROFILE}" addons enable csi-hostpath-driver
minikube -p "${PROFILE}" addons enable default-storageclass
minikube -p "${PROFILE}" addons enable storage-provisioner

#############################################
# Namespaces
#############################################
log "Creating namespaces"
kubectl create namespace "${TRAEFIK_NAMESPACE}" --dry-run=client -o yaml | kubectl apply -f -
kubectl create namespace "${ARGO_NAMESPACE}" --dry-run=client -o yaml | kubectl apply -f -
kubectl create namespace "${CERT_MANAGER_NAMESPACE}" --dry-run=client -o yaml | kubectl apply -f -
kubectl create namespace "${INFISICAL_NAMESPACE}" --dry-run=client -o yaml | kubectl apply -f -
kubectl create namespace "${ECOMMERCE_NAMESPACE}" --dry-run=client -o yaml | kubectl apply -f -
kubectl create namespace "${PORTFOLIO_MCS_NAMESPACE}" --dry-run=client -o yaml | kubectl apply -f -
kubectl create namespace "${MONITORING_NAMESPACE}" --dry-run=client -o yaml | kubectl apply -f -

#############################################
# Helm repos
#############################################
log "Adding/updating Helm repos"
helm repo add argo https://argoproj.github.io/argo-helm >/dev/null 2>&1 || true
helm repo add cert-manager https://charts.jetstack.io >/dev/null 2>&1 || true
helm repo add infisical-helm-charts https://dl.cloudsmith.io/public/infisical/helm-charts/helm/charts/ >/dev/null 2>&1 || true
helm repo add traefik https://traefik.github.io/charts >/dev/null 2>&1 || true
helm repo update

#############################################
# Install cert-manager
#############################################
log "Installing cert-manager"
helm upgrade --install cert-manager cert-manager/cert-manager \
  --version "${CERT_MANAGER_VERSION}" \
  --namespace "${CERT_MANAGER_NAMESPACE}" \
  --create-namespace \
  --set installCRDs=true

kubectl rollout status deploy/cert-manager -n "${CERT_MANAGER_NAMESPACE}" --timeout=300s
kubectl rollout status deploy/cert-manager-cainjector -n "${CERT_MANAGER_NAMESPACE}" --timeout=300s
kubectl rollout status deploy/cert-manager-webhook -n "${CERT_MANAGER_NAMESPACE}" --timeout=300s

##############################################
# Create ClusterIssuer for Let's Encrypt
##############################################
log "Creating ClusterIssuer"
kubectl apply -f ./cluster-issuer.yaml --dry-run=client -o yaml | kubectl apply -f - || true

#############################################
# Wait for ClusterIssuer to be ready
#############################################
log "Waiting for ClusterIssuer 'letsencrypt' to be ready"
kubectl wait --for=condition=Ready clusterissuer/${CLUSTER_ISSUER_PROD} --timeout=300s
kubectl get clusterissuer ${CLUSTER_ISSUER_PROD} --output=jsonpath='{.status.conditions[?(@.type=="Ready")].status}' | grep -q "True" || {
  echo "ERROR: ClusterIssuer '${CLUSTER_ISSUER_PROD}' is not ready"
  exit 1
}

#############################################
# Install Traefik Ingress Controller
#############################################
log "Preparing Traefik Ingress Controller"
helm upgrade --install "${TRAEFIK_RELEASE}" traefik/traefik \
  --namespace "${TRAEFIK_NAMESPACE}" \
  --set service.type=NodePort \
  --set ports.web.nodePort=30080 \
  --set ports.websecure.nodePort=30443 \
  --create-namespace \
  --timeout 300s 

kubectl rollout status deploy/"${TRAEFIK_RELEASE}" -n "${TRAEFIK_NAMESPACE}" --timeout=300s

##############################################
# Install Infisical Operator CRDs
##############################################
log "Installing Infisical Operator CRDs"
helm upgrade --install "${INFISICAL_RELEASE}" infisical-helm-charts/secrets-operator \
  --namespace "${INFISICAL_NAMESPACE}" \
  --create-namespace \
  --set installCRDs=true

kubectl rollout status deploy/"${INFISICAL_RELEASE}"-secre-controller-manager -n "${INFISICAL_NAMESPACE}" --timeout=300s

##############################################
# Create Infisical secrets
##############################################
log "Creating Infisical secrets"
kubectl apply -f ./infisical-auth-secret-ecommerce.yaml --dry-run=client -o yaml  | kubectl apply -f - || true
kubectl apply -f ./infisical-secret-ecommerce.yaml --dry-run=client -o yaml | kubectl apply -f - || true
kubectl apply -f ./infisical-auth-secret-portfolio.yaml --dry-run=client -o yaml  | kubectl apply -f - || true
kubectl apply -f ./infisical-secret-porfolio.yaml --dry-run=client -o yaml | kubectl apply -f - || true

#############################################
# Install Argo CD
#############################################
log "Installing Argo CD release '${ARGO_RELEASE}'"
helm upgrade --install "${ARGO_RELEASE}" argo/argo-cd \
  --namespace "${ARGO_NAMESPACE}" \
  --set global.domain="${ARGO_DOMAIN}" \
  --create-namespace \
  -f ./argocd-values.yaml

kubectl rollout status deploy/"${ARGO_RELEASE}"-server -n "${ARGO_NAMESPACE}" --timeout=300s
kubectl rollout status deploy/"${ARGO_RELEASE}"-repo-server -n "${ARGO_NAMESPACE}" --timeout=300s
kubectl rollout status deploy/"${ARGO_RELEASE}"-applicationset-controller -n "${ARGO_NAMESPACE}" --timeout=300s
kubectl rollout status deploy/"${ARGO_RELEASE}"-notifications-controller -n "${ARGO_NAMESPACE}" --timeout=300s
kubectl rollout status deploy/"${ARGO_RELEASE}"-redis -n "${ARGO_NAMESPACE}" --timeout=300s
kubectl rollout status deploy/"${ARGO_RELEASE}"-dex-server -n "${ARGO_NAMESPACE}" --timeout=300s
kubectl rollout status statefulset/"${ARGO_RELEASE}"-application-controller -n "${ARGO_NAMESPACE}" --timeout=300s

##############################################
# Create Argo CD Ingress
##############################################
log "Creating Argo CD Ingress"
kubectl apply -f ./argocd-ingress-traefik.yaml --dry-run=client -o yaml | kubectl apply -f - || true

#############################################
# Configure Host NGINX Proxy
#############################################
log "Installing and configuring host NGINX proxy"
sudo tee /etc/nginx/nginx.conf >/dev/null < ./nginx.conf
sudo nginx -t
sudo systemctl enable nginx
sudo systemctl restart nginx

log "Cluster bootstrapping complete! Access Argo CD at: https://${ARGO_DOMAIN}"
