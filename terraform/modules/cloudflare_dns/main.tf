# ── Root domain (@) ──────────────────────────────────────────────────────────────
# Proxied through Cloudflare for DDoS protection and CDN caching.
# TTL = 1 means "Auto" — required when proxied = true.
resource "cloudflare_record" "root" {
  zone_id = var.zone_id
  name    = "@"
  type    = "A"
  content = var.vm_ip
  proxied = true
  ttl     = 1
}

# ── www ──────────────────────────────────────────────────────────────────────────
resource "cloudflare_record" "www" {
  zone_id = var.zone_id
  name    = "www"
  type    = "CNAME"
  content = "johnisah.com"
  proxied = true
  ttl     = 1
}

# ── api ──────────────────────────────────────────────────────────────────────────
resource "cloudflare_record" "api" {
  zone_id = var.zone_id
  name    = "api"
  type    = "A"
  content = var.vm_ip
  proxied = true
  ttl     = 1
}

# ── admin ────────────────────────────────────────────────────────────────────────
resource "cloudflare_record" "admin" {
  zone_id = var.zone_id
  name    = "admin"
  type    = "A"
  content = var.vm_ip
  proxied = true
  ttl     = 1
}

# ── argocd-deploy ────────────────────────────────────────────────────────────────
# Proxied — Cloudflare has supported WebSocket passthrough on all plans for years,
# so ArgoCD's live UI updates work fine through the proxy. TTL = 1 ("Auto") is
# required when proxied = true.
resource "cloudflare_record" "argocd" {
  zone_id = var.zone_id
  name    = "argocd-deploy"
  type    = "A"
  content = var.vm_ip
  proxied = true
  ttl     = 1
}

# ── shopnow ──────────────────────────────────────────────────────────────────────
resource "cloudflare_record" "shopnow" {
  zone_id = var.zone_id
  name    = "shopnow"
  type    = "A"
  content = var.vm_ip
  proxied = true
  ttl     = 1
}

# ── grafana ──────────────────────────────────────────────────────────────────────
# Proxied — Cloudflare passes through the WebSocket connections Grafana uses for
# live dashboard updates. TTL = 1 ("Auto") is required when proxied = true.
resource "cloudflare_record" "grafana" {
  zone_id = var.zone_id
  name    = "grafana"
  type    = "A"
  content = var.vm_ip
  proxied = true
  ttl     = 1
}

# ── kube-dashboard ───────────────────────────────────────────────────────────────
# Proxied, same as the other internal dashboards above. Public exposure is gated
# by Cloudflare Access (module.cloudflare_access) — Traefik never sees a request
# that hasn't already authenticated at Cloudflare's edge.
resource "cloudflare_record" "kube_dashboard" {
  zone_id = var.zone_id
  name    = "kube-dashboard"
  type    = "A"
  content = var.vm_ip
  proxied = true
  ttl     = 1
}

# ── prom-dashboard ───────────────────────────────────────────────────────────────
# Proxied, same as the other internal dashboards above.
resource "cloudflare_record" "prom_dashboard" {
  zone_id = var.zone_id
  name    = "prom-dashboard"
  type    = "A"
  content = var.vm_ip
  proxied = true
  ttl     = 1
}
