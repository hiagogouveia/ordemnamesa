# --- OCI Auth ---

variable "tenancy_ocid" {
  description = "OCID do tenancy OCI"
  type        = string
}

variable "user_ocid" {
  description = "OCID do usuário OCI para autenticação via API key"
  type        = string
}

variable "fingerprint" {
  description = "Fingerprint da API key OCI"
  type        = string
}

variable "private_key_path" {
  description = "Caminho local para a chave privada OCI (.pem)"
  type        = string
  default     = "~/.oci/oci_api_key.pem"
}

# --- Região ---

variable "region" {
  description = "Região OCI"
  type        = string
  default     = "sa-saopaulo-1"
}

# --- Rede ---

variable "vcn_cidr" {
  description = "CIDR da VCN"
  type        = string
  default     = "10.0.0.0/16"
}

variable "subnet_cidr" {
  description = "CIDR da subnet pública"
  type        = string
  default     = "10.0.1.0/24"
}

# --- Compute ---

variable "instance_shape" {
  description = "Shape Always Free da instância OCI"
  type        = string
  default     = "VM.Standard.E2.1.Micro"
}
