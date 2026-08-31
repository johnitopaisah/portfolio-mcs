# Local state — terraform.tfstate is written to the terraform/ directory.
# Not suitable for team use but sufficient for a solo migration.
# To migrate to GCS later: add a backend "gcs" block and run terraform init -migrate-state.
terraform {
  backend "local" {}
}
