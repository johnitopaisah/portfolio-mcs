# Cloudflare Zero Trust Access application.
#
# This gates the domain at Cloudflare's edge, before any request reaches
# Traefik: an unauthenticated visitor is redirected to a Cloudflare-hosted
# login page and never gets a TCP connection to the origin.
#
# Requires the account's Cloudflare API token to include the "Access: Apps"
# (Edit) permission — the DNS:Edit-only token used for module.cloudflare_dns
# is NOT sufficient for this resource.
#
# Policy attachment is intentionally NOT managed here. This account's API
# token returns auth.forbidden on every Access Policy write (both the
# legacy app-nested endpoint and the standalone /access/policies endpoint —
# confirmed via direct curl, unrelated to token scope: reads succeed,
# writes don't), while the Cloudflare dashboard UI works fine. Same
# manual-dashboard pattern already used for every other internal-tool
# Access app in this account (Admin/ArgoCD/Prometheus/Grafana), all of
# which share one dashboard-created policy, "ArgoCD-UI-Access-Policy" —
# this app is attached to that same policy the same way.
resource "cloudflare_zero_trust_access_application" "this" {
  account_id       = var.account_id
  name             = var.application_name
  domain           = var.domain
  type             = "self_hosted"
  session_duration = var.session_duration

  # Skip Cloudflare's app-picker landing page — go straight to login.
  auto_redirect_to_identity = false

  lifecycle {
    ignore_changes = [policies]
  }
}
