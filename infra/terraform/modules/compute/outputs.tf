output "instance_id" {
  description = "OCID da instância criada"
  value       = oci_core_instance.main.id
}

output "public_ip" {
  description = "IP público reservado associado à instância"
  value       = oci_core_public_ip.reserved.ip_address
}

output "private_ip" {
  description = "IP privado da instância"
  value       = data.oci_core_private_ips.vnic.private_ips[0].ip_address
}

output "ssh_private_key_pem" {
  description = "Chave SSH privada gerada pelo Terraform (sensitive)"
  value       = tls_private_key.ssh.private_key_pem
  sensitive   = true
}

output "ssh_public_key_openssh" {
  description = "Chave SSH pública em formato OpenSSH"
  value       = tls_private_key.ssh.public_key_openssh
}
