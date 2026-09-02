variable "account_id" {
  type        = string
  description = "Cloudflare account ID that owns Zero Trust / Access for this domain."
}

variable "application_name" {
  type        = string
  description = "Display name for the Access application (shown in the Cloudflare Zero Trust dashboard)."
}

variable "domain" {
  type        = string
  description = "Fully-qualified hostname this Access application protects, e.g. kube-dashboard.johnisah.com."
}

variable "session_duration" {
  type        = string
  description = "How long an authenticated session lasts before Cloudflare Access re-prompts for login."
  default     = "24h"
}
