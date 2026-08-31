output "application_id" {
  value       = cloudflare_zero_trust_access_application.this.id
  description = "Cloudflare Access application ID."
}

output "aud" {
  value       = cloudflare_zero_trust_access_application.this.aud
  description = "Application Audience (AUD) tag — needed if a JWT is ever validated in-cluster."
}
