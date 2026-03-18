variable "compartment_id" {
  description = "OCID do compartment onde os recursos de rede serão criados"
  type        = string
}

variable "prefix" {
  description = "Prefixo para nomear recursos (ex: ordem-na-mesa-nonprod)"
  type        = string
}

variable "vcn_cidr" {
  description = "CIDR block da VCN"
  type        = string
  default     = "10.0.0.0/16"
}

variable "subnet_cidr" {
  description = "CIDR block da subnet pública"
  type        = string
  default     = "10.0.1.0/24"
}

variable "tags" {
  description = "Tags freeform aplicadas aos recursos"
  type        = map(string)
  default     = {}
}
