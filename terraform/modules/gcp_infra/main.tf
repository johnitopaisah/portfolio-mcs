# ── Ubuntu 26.04 LTS image ───────────────────────────────────────────────────────
# Look up the latest Ubuntu 26.04 LTS image from the GCP-managed ubuntu-os-cloud
# project. Using a data source (instead of a hardcoded image ID) ensures we always
# get the current patched image within the family on each fresh deployment.
# LTS (not an interim release) so the family stays live for years instead of
# disappearing ~9 months after release — see boot_disk.initialize_params.image
# below for why that matters for the already-running instance.
data "google_compute_image" "ubuntu_2604" {
  family  = "ubuntu-2604-lts-amd64"
  project = "ubuntu-os-cloud"
}

# ── Static external IP ───────────────────────────────────────────────────────────
# Reserved before instance creation so Cloudflare DNS records always have a stable
# target. VM recreates never change this address.
resource "google_compute_address" "static_ip" {
  name   = "devops-instance-ip"
  region = var.region
}

# ── Firewall: SSH ────────────────────────────────────────────────────────────────
# Overrides the default-allow-ssh rule to restrict SSH to your IP only.
resource "google_compute_firewall" "allow_ssh" {
  name    = "portfolio-mcs-allow-ssh"
  network = "default"

  allow {
    protocol = "tcp"
    ports    = ["22"]
  }

  source_ranges = var.ssh_source_ranges
  target_tags   = ["devops-instance"]
}

# ── Firewall: HTTP / HTTPS ───────────────────────────────────────────────────────
# Required for: Cloudflare proxy (ports 80, 443), Let's Encrypt ACME HTTP-01 challenges.
resource "google_compute_firewall" "allow_http_https" {
  name    = "portfolio-mcs-allow-http-https"
  network = "default"

  allow {
    protocol = "tcp"
    ports    = ["80", "443"]
  }

  source_ranges = ["0.0.0.0/0"]
  target_tags   = ["devops-instance"]
}

# ── Firewall: NodePorts ──────────────────────────────────────────────────────────
# Traefik is exposed via Minikube NodePorts 30080 (HTTP) and 30443 (HTTPS).
# NGINX on the host proxies external traffic to these ports.
resource "google_compute_firewall" "allow_nodeports" {
  name    = "portfolio-mcs-allow-nodeports"
  network = "default"

  allow {
    protocol = "tcp"
    ports    = ["30000-32767"]
  }

  source_ranges = ["0.0.0.0/0"]
  target_tags   = ["devops-instance"]
}

# ── VM service account ───────────────────────────────────────────────────────────
# Separate from the Terraform SA. Attached to the instance for any GCP API calls
# the VM itself needs to make (e.g. pulling images from Artifact Registry later).
# Scoped to cloud-platform on the instance but no project-level IAM roles granted
# here — add them explicitly when a specific GCP service is needed from the VM.
resource "google_service_account" "vm_sa" {
  account_id   = "devops-instance-sa"
  display_name = "DevOps Instance Service Account"
  project      = var.project
}

# ── Backup storage bucket ────────────────────────────────────────────────────────
# Destination for the DB and monitoring-data backup CronJobs (k8s/backup/).
# Pods authenticate as vm_sa via the GCE metadata server — this project's org
# policy blocks service-account key creation, and this isn't a GKE cluster with
# native Workload Identity, so every workload on this box shares vm_sa's identity
# rather than getting its own narrowly-scoped credential. The IAM binding below is
# still scoped to just this one bucket, not a project-wide role.
resource "google_storage_bucket" "backups" {
  name                        = "portfolio-mcs-backups"
  project                     = var.project
  location                    = var.region
  uniform_bucket_level_access = true
  labels                      = var.common_labels

  lifecycle_rule {
    condition {
      age = 14
    }
    action {
      type = "Delete"
    }
  }
}

resource "google_storage_bucket_iam_member" "backups_vm_sa_writer" {
  bucket = google_storage_bucket.backups.name
  role   = "roles/storage.objectAdmin"
  member = "serviceAccount:${google_service_account.vm_sa.email}"
}

# ── ShopNow product media bucket ─────────────────────────────────────────────────
# Permanent storage for ecommerce-platform's product images (Django's MEDIA_ROOT).
# Deliberately a separate bucket from "backups" — that one has a 14-day delete
# lifecycle rule which is correct for rolling DB backups but would be catastrophic
# for user-facing product images, so it is never reused for media. No lifecycle
# rule here — objects persist until explicitly deleted by the application.
# Same ambient vm_sa auth pattern as the backups bucket (see comment above);
# additionally readable by allUsers since product images are public storefront
# assets served directly to browsers.
resource "google_storage_bucket" "shopnow_media" {
  name                        = "shopnow-media"
  project                     = var.project
  location                    = var.region
  uniform_bucket_level_access = true
  labels                      = var.common_labels
}

resource "google_storage_bucket_iam_member" "shopnow_media_vm_sa_admin" {
  bucket = google_storage_bucket.shopnow_media.name
  role   = "roles/storage.objectAdmin"
  member = "serviceAccount:${google_service_account.vm_sa.email}"
}

resource "google_storage_bucket_iam_member" "shopnow_media_public_read" {
  bucket = google_storage_bucket.shopnow_media.name
  role   = "roles/storage.objectViewer"
  member = "allUsers"
}

# ── GCE instance ─────────────────────────────────────────────────────────────────
resource "google_compute_instance" "devops_instance" {
  name         = "devops-instance"
  machine_type = var.machine_type
  allow_stopping_for_update = true
  zone         = var.zone
  tags         = ["devops-instance"]
  labels       = var.common_labels

  boot_disk {
    # Explicit — the provider defaults this to true when unset, which doesn't
    # match the live disk's actual false (set this way since the original
    # apply) and was showing up as a phantom "must be replaced" diff.
    auto_delete = false

    initialize_params {
      # pd-balanced — migrated from pd-ssd 2026-08-31 (snapshot + recreate,
      # same 250GB size: GCP can't shrink a disk, and a disk created from a
      # snapshot can never be smaller than the snapshot's source disk either).
      # pd-balanced is meaningfully cheaper than pd-ssd for this workload's
      # actual IOPS/throughput needs.
      image = data.google_compute_image.ubuntu_2604.self_link
      size  = var.disk_size_gb
      type  = "pd-balanced"
    }
  }

  network_interface {
    network = "default"

    access_config {
      # Bind the pre-reserved static IP to this instance.
      nat_ip = google_compute_address.static_ip.address
    }
  }

  service_account {
    email  = google_service_account.vm_sa.email
    scopes = ["cloud-platform"]
  }

  # Two SSH access methods coexist here:
  #
  # 1. Custom key (ssh-keys metadata) — used by Terraform remote-exec provisioner.
  #    Key path comes from var.ssh_public_key_path in terraform.tfvars.
  #
  # 2. gcloud compute ssh — uses gcloud's own managed key (~/.ssh/google_compute_engine).
  #    gcloud injects its key at the GCP PROJECT level automatically on first use.
  #    block-project-ssh-keys is explicitly false so project-level keys are always allowed.
  #    This lets you run: gcloud compute ssh isahjohna@devops-instance
  metadata = {
    ssh-keys               = "isahjohna:${file(var.ssh_public_key_path)}"
    block-project-ssh-keys = "false"
  }

  # Grant isahjohna passwordless sudo.
  # The guest agent creates the user from metadata; this startup script adds the
  # sudoers entry. Both run on first boot — the || true handles race conditions
  # if the user already exists by the time this script runs.
  metadata_startup_script = <<-EOT
    #!/bin/bash
    set -e
    useradd -m -s /bin/bash isahjohna 2>/dev/null || true
    usermod -aG sudo isahjohna
    echo 'isahjohna ALL=(ALL) NOPASSWD:ALL' > /etc/sudoers.d/100-isahjohna
    chmod 0440 /etc/sudoers.d/100-isahjohna
  EOT

  # Prevent accidental recreation of the already-running instance on:
  #  - metadata_startup_script changes after initial provisioning.
  #  - boot_disk image drift — the ubuntu_2604 data source re-resolves to a new
  #    patch version (or a new LTS family) on every plan, but GCP can't re-image
  #    a live boot disk in place, so any diff here is ForceNew.
  #  - boot_disk size/type drift — initialize_params.size and .type are both
  #    creation-only in this resource. Growing the live disk is done
  #    out-of-band via `gcloud compute disks resize` + resize2fs; changing
  #    type (as done 2026-08-31, pd-ssd -> pd-balanced) is done out-of-band
  #    via snapshot + recreate + boot-disk swap (not Terraform), so both
  #    fields in tfvars/here will keep drifting from whatever was set at
  #    instance-creation time. Any diff on either — grow/shrink or type
  #    change — is ForceNew.
  #  Either of the above would destroy the instance (and its boot disk, and
  #  everything on it — cluster_init, cluster_bootstrap, and argocd_apps only
  #  re-run off vm_ip, which is the static IP and doesn't change on instance
  #  replacement, so nothing would reprovision automatically). Remove entries
  #  here if you intentionally need to replace the instance (e.g. deliberate
  #  OS upgrade, machine type change) — and be ready to manually re-run the
  #  other 3 stages after.
  lifecycle {
    ignore_changes = [
      metadata_startup_script,
      boot_disk[0].initialize_params[0].image,
      boot_disk[0].initialize_params[0].size,
      boot_disk[0].initialize_params[0].type,
    ]
  }
}
