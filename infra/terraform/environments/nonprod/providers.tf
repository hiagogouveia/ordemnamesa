terraform {
  required_version = ">= 1.5.0"

  required_providers {
    oci = {
      source  = "oracle/oci"
      version = "~> 6.0"
    }
    tls = {
      source  = "hashicorp/tls"
      version = "~> 4.0"
    }
    local = {
      source  = "hashicorp/local"
      version = "~> 2.0"
    }
  }

  # Backend: OCI Object Storage via API S3-compatível
  # Pré-requisito: criar bucket manualmente via console OCI antes do terraform init
  # Configurar credenciais via env vars:
  #   export AWS_ACCESS_KEY_ID=<customer_secret_key_id>
  #   export AWS_SECRET_ACCESS_KEY=<customer_secret_key>
  backend "s3" {
    bucket = "ordem-na-mesa-nonprod-tfstate"
    key    = "nonprod/terraform.tfstate"
    region = "sa-saopaulo-1"

    endpoints = {
      s3 = "https://gryltqvrrfr9.compat.objectstorage.sa-saopaulo-1.oraclecloud.com"
    }

    skip_region_validation      = true
    skip_credentials_validation = true
    skip_requesting_account_id  = true
    skip_metadata_api_check     = true
    use_path_style              = true
    skip_s3_checksum            = true
  }
}

provider "oci" {
  region = var.region

  # Credenciais via variáveis de ambiente (recomendado para CI/CD):
  #   TF_VAR_tenancy_ocid
  #   TF_VAR_user_ocid
  #   TF_VAR_fingerprint
  #   TF_VAR_private_key_path  (local)
  #   TF_VAR_private_key_content (CI/CD)
  tenancy_ocid     = var.tenancy_ocid
  user_ocid        = var.user_ocid
  fingerprint      = var.fingerprint
  private_key_path = var.private_key_path
}
