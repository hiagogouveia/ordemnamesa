# --- OCI Auth (mesmos valores do nonprod; copie o terraform.tfvars de lá) ---

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

variable "region" {
  description = "Região OCI"
  type        = string
  default     = "sa-saopaulo-1"
}

# --- Compartment (REUSA o do nonprod — não cria um novo para um teste efêmero) ---

variable "compartment_id" {
  description = "OCID do compartment onde a VM descartável nasce (usar o do nonprod)"
  type        = string
  default     = "ocid1.compartment.oc1..aaaaaaaahh2yzq6rz4g45m67zyesmgesmzzzrfwsj7prwxvct2mq3pkbmnda"
}

# --- Rede (VCN própria, isolada; CIDR distinto do nonprod por higiene) ---

variable "vcn_cidr" {
  description = "CIDR da VCN"
  type        = string
  default     = "10.9.0.0/16"
}

variable "subnet_cidr" {
  description = "CIDR da subnet pública"
  type        = string
  default     = "10.9.1.0/24"
}

# --- Compute ---

variable "instance_shape" {
  description = "Shape Always Free da instância OCI"
  type        = string
  # Histórico da escolha: E2.1.Micro (free AMD) → tenancy no limite; A1.Flex (free ARM) →
  # "out of host capacity" em sa-saopaulo-1. E4.Flex é PAGO (~R$0,20/h em 1 OCPU/8GB) —
  # aceitável para um teste de DR de poucas horas, sempre destruído ao final.
  default     = "VM.Standard.E4.Flex"
}

variable "instance_shape_config" {
  description = "Config de shape Flex (obrigatório para A1.Flex; null para shapes fixos)"
  type = object({
    ocpus         = number
    memory_in_gbs = number
  })
  default = {
    ocpus         = 1
    memory_in_gbs = 8
  }
}
