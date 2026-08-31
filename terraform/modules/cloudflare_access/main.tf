# Cloudflare Zero Trust Access application + policy.
#
# This gates the domain at Cloudflare's edge, before any request reaches
# Traefik: an unauthenticated visitor is redirected to a Cloudflare-hosted
# login page and never gets a TCP connection to the origin.
#
# Requires the account's Cloudflare API token to include the
# "Access: Apps and Policies" (Edit) permission — the DNS:Edit-only token
# used for module.cloudflare_dns is NOT sufficient for these two resources.
resource "cloudflare_zero_trust_access_application" "this" {
  account_id       = var.account_id
  name             = var.application_name
  domain           = var.domain
  type             = "self_hosted"
  session_duration = var.session_duration

  # Skip Cloudflare's app-picker landing page — go straight to login.
  auto_redirect_to_identity = false
}

resource "cloudflare_zero_trust_access_policy" "allow" {
  account_id     = var.account_id
  application_id = cloudflare_zero_trust_access_application.this.id
  name           = "allow-listed-emails"
  decision       = "allow"
  precedence     = 1

  include {
    email = var.allowed_emails
  }
}
