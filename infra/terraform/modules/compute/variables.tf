variable "compartment_id" {
  description = "OCID do compartment onde a instância será criada"
  type        = string
}

variable "prefix" {
  description = "Prefixo para nomear recursos"
  type        = string
}

variable "subnet_id" {
  description = "OCID da subnet onde a instância será provisionada"
  type        = string
}

variable "availability_domain" {
  description = "Availability Domain da OCI (ex: AvailabilityDomain-1)"
  type        = string
}

variable "shape" {
  description = "Shape da instância OCI"
  type        = string
  default     = "VM.Standard.E2.1.Micro"
}

variable "user_data_base64" {
  description = "Script cloud-init codificado em base64"
  type        = string
}

variable "tags" {
  description = "Tags freeform aplicadas aos recursos"
  type        = map(string)
  default     = {}
}
