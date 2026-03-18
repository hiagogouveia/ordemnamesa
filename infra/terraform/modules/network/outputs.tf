output "vcn_id" {
  description = "OCID da VCN criada"
  value       = oci_core_vcn.main.id
}

output "subnet_id" {
  description = "OCID da subnet pública criada"
  value       = oci_core_subnet.public.id
}

output "security_list_id" {
  description = "OCID da security list pública"
  value       = oci_core_security_list.public.id
}
