output "public_ip" {
  description = "IP público reservado da VM NONPROD"
  value       = module.compute.public_ip
}

output "dns_hint" {
  description = "Registro DNS a configurar no provedor de domínio"
  value       = "nonprod.ordemnamesa.com → ${module.compute.public_ip}"
}

output "ssh_command" {
  description = "Comando SSH para acessar a VM"
  value       = "ssh -i ~/.ssh/ordem-na-mesa-nonprod.pem ubuntu@${module.compute.public_ip}"
}

output "instance_id" {
  description = "OCID da instância OCI"
  value       = module.compute.instance_id
}

output "compartment_id" {
  description = "OCID do compartment NONPROD"
  value       = oci_identity_compartment.nonprod.id
}
