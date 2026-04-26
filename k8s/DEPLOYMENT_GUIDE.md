---
apiVersion: v1
kind: ConfigMap
metadata:
  name: portfolio-deployment-guide
  namespace: portfolio
data:
  DEPLOYMENT_GUIDE.md: |
    # Portfolio MCS - Kubernetes Deployment Guide

    ## Prerequisites

    - Kubernetes cluster (1.20+)
    - kubectl configured to access your cluster
    - Docker images built and pushed to a registry
    - An Ingress controller (e.g., nginx-ingress)

    ## Deployment Steps

    ### 1. Prepare Docker Images

    Build and push all images to your container registry:

    ```bash
    # Build all images
    docker build -t your-registry/portfolio-api:latest ./api
    docker build -t your-registry/portfolio-user-ui:latest ./user-ui
    docker build -t your-registry/portfolio-admin-ui:latest ./admin-ui
    
    # Push to registry
    docker push your-registry/portfolio-api:latest
    docker push your-registry/portfolio-user-ui:latest
    docker push your-registry/portfolio-admin-ui:latest
    ```

    ### 2. Update Image References

    Update `k8s/api/01-deployment.yaml`, `k8s/user-ui/01-deployment.yaml`, and `k8s/admin-ui/01-deployment.yaml`:

    Change:
    ```yaml
    image: portfolio-mcs-api:latest
    image: portfolio-mcs-user-ui:latest
    image: portfolio-mcs-admin-ui:latest
    ```

    To:
    ```yaml
    image: your-registry/portfolio-api:latest
    image: your-registry/portfolio-user-ui:latest
    image: your-registry/portfolio-admin-ui:latest
    ```

    Also update `imagePullPolicy` to `Always` for production.

    ### 3. Configure Secrets

    Edit `k8s/secrets/01-secrets.yaml` and set:

    - `POSTGRES_PASSWORD` - Strong database password
    - `JWT_SECRET` - Generate with: `openssl rand -hex 32`
    - `ADMIN_PASSWORD_HASH` - Generate with: `node -e "require('bcryptjs').hash('yourpassword',12).then(console.log)"`

    Then apply secrets:
    ```bash
    kubectl apply -f k8s/secrets/01-secrets.yaml
    ```

    ### 4. Configure Domain Names

    Edit `k8s/01-configmap.yaml`:

    Update `ALLOWED_ORIGINS` and `NEXT_PUBLIC_API_URL` with your actual domain names:

    ```yaml
    ALLOWED_ORIGINS: "https://yoursite.com,https://api.yoursite.com,https://admin.yoursite.com"
    NEXT_PUBLIC_API_URL: "https://api.yoursite.com"
    ```

    ### 5. Configure Ingress

    Edit `k8s/ingress/01-ingress.yaml`:

    Update the host names:
    ```yaml
    - host: yoursite.com
    - host: api.yoursite.com
    - host: admin.yoursite.com
    ```

    If using HTTPS with cert-manager, uncomment the TLS section.

    ### 6. Create Storage Path (for single-node clusters)

    On your node(s), create the storage directory:

    ```bash
    mkdir -p /mnt/data/portfolio-db
    chmod 755 /mnt/data/portfolio-db
    ```

    Update the `nodeAffinity` in `k8s/db/01-storage.yaml` to match your node name.

    ### 7. Deploy in Order

    ```bash
    # Create namespace and initial resources
    kubectl apply -f k8s/00-namespace.yaml
    
    # Create ConfigMaps and Secrets
    kubectl apply -f k8s/01-configmap.yaml
    kubectl apply -f k8s/secrets/01-secrets.yaml
    
    # Deploy database
    kubectl apply -f k8s/db/
    
    # Wait for database to be ready
    kubectl wait --for=condition=ready pod -l component=database -n portfolio --timeout=300s
    
    # Deploy API
    kubectl apply -f k8s/api/
    
    # Wait for API to be ready
    kubectl wait --for=condition=ready pod -l component=api -n portfolio --timeout=300s
    
    # Deploy frontends
    kubectl apply -f k8s/user-ui/
    kubectl apply -f k8s/admin-ui/
    
    # Deploy policies and ingress
    kubectl apply -f k8s/02-policies.yaml
    kubectl apply -f k8s/ingress/
    ```

    Or apply everything at once:
    ```bash
    kubectl apply -f k8s/
    ```

    ### 8. Verify Deployment

    ```bash
    # Check pod status
    kubectl get pods -n portfolio
    
    # View logs
    kubectl logs -n portfolio -l component=api
    kubectl logs -n portfolio -l component=database
    
    # Check services
    kubectl get svc -n portfolio
    
    # Check ingress
    kubectl get ingress -n portfolio
    ```

    ### 9. Access Your Application

    - Public portfolio: https://yoursite.com
    - Admin dashboard: https://admin.yoursite.com
    - API: https://api.yoursite.com/api/health

    ## Updating the Application

    ### Update Image

    ```bash
    # Rebuild and push new image
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
    
    # Rollout restart to apply changes
    kubectl rollout restart deployment/portfolio-api -n portfolio
    ```

    ### Update Secrets

    ```bash
    # Edit secret
    kubectl edit secret portfolio-secrets -n portfolio
    
    # Rollout restart services using the secret
    kubectl rollout restart deployment/portfolio-api -n portfolio
    ```

    ## Monitoring and Logs

    ```bash
    # Tail logs
    kubectl logs -f deployment/portfolio-api -n portfolio
    
    # Follow all logs
    kubectl logs -f -n portfolio --all-containers=true -l app=portfolio-mcs
    
    # Describe pod for events
    kubectl describe pod <pod-name> -n portfolio
    
    # Get resource usage
    kubectl top pods -n portfolio
    ```

    ## Troubleshooting

    ### Pod stuck in CrashLoopBackOff

    ```bash
    # Check logs
    kubectl logs <pod-name> -n portfolio
    
    # Check events
    kubectl describe pod <pod-name> -n portfolio
    ```

    ### Database connection failed

    - Verify DATABASE_URL is correct in secrets
    - Check database pod is running: `kubectl get pod -n portfolio -l component=database`
    - Check storage directory exists and is writable

    ### API returns 500 error

    - Check API pod logs: `kubectl logs <pod-name> -n portfolio`
    - Verify JWT_SECRET is set correctly
    - Ensure database is ready and reachable

    ### Ingress not routing traffic

    - Check ingress controller is deployed: `kubectl get pods -n ingress-nginx`
    - Verify ingress resource: `kubectl get ingress -n portfolio`
    - Check ingress events: `kubectl describe ingress portfolio-ingress -n portfolio`
    - Verify DNS records point to ingress controller IP

    ## Scaling

    ```bash
    # Scale API deployment
    kubectl scale deployment/portfolio-api --replicas=3 -n portfolio
    
    # Scale frontend deployments
    kubectl scale deployment/portfolio-user-ui --replicas=3 -n portfolio
    kubectl scale deployment/portfolio-admin-ui --replicas=3 -n portfolio
    ```

    ## Backup and Recovery

    ### Backup Database

    ```bash
    # Exec into database pod
    kubectl exec -it <db-pod> -n portfolio -- \
      pg_dump -U portfolio_user -d portfolio_db > backup.sql
    ```

    ### Restore Database

    ```bash
    # Exec into database pod
    kubectl exec -i <db-pod> -n portfolio -- \
      psql -U portfolio_user -d portfolio_db < backup.sql
    ```

    ## Production Recommendations

    1. **Use managed databases** - Consider using cloud provider managed databases (AWS RDS, GCP Cloud SQL, etc.)
    2. **Enable HTTPS** - Use cert-manager with Let's Encrypt
    3. **Set resource limits** - Adjust memory and CPU requests/limits based on your needs
    4. **Enable monitoring** - Use Prometheus and Grafana for monitoring
    5. **Use private container registry** - Update imagePullSecrets
    6. **Enable network policies** - Restrict traffic between pods
    7. **Regular backups** - Implement automated backup strategy
    8. **Use StatefulSet for database** - If keeping database in cluster, use StatefulSet instead of Deployment
    9. **Enable pod security policies** - Restrict container capabilities
    10. **Use namespace isolation** - Deploy in separate namespaces for different environments
