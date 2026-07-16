# ═══════════════════════════════════════════════════════════════════════════
# dr-test — VPS DESCARTÁVEL para validação de DR (s91, F9).
#
# Prova o critério nº 1 do plano: "uma VPS nova sobe com um comando". Usa o MESMO
# cloud-init do nonprod (userdata.sh.tftpl + provision.sh — a fonte única) num
# ambiente isolado e efêmero:
#   - estado LOCAL (sem backend remoto): o ambiente é para nascer, provar e morrer;
#   - REUSA o compartment nonprod existente (criar/deletar compartment na OCI é lento
#     e desnecessário para um teste);
#   - rede própria (prefixo drtest) → `terraform destroy` remove tudo.
#
# Uso:
#   cp ../nonprod/terraform.tfvars .   # auth OCI (gitignored) + compartment_id (ver variables.tf)
#   terraform init && terraform apply
#   ... validação (ver docs do F9) ...
#   terraform destroy
#
# Shape Always Free (VM.Standard.E2.1.Micro): a tenancy permite 2; nonprod usa 1.
# ═══════════════════════════════════════════════════════════════════════════

locals {
  prefix = "ordem-na-mesa-drtest"
  tags = {
    project     = "ordem-na-mesa"
    environment = "drtest"
    managed_by  = "terraform"
    disposable  = "true"
  }
}

data "oci_identity_availability_domains" "ads" {
  compartment_id = var.compartment_id
}

# REUSA a subnet do nonprod: a free tier limita vcn-count (não dá para criar outra VCN).
# Para uma VM descartável, compartilhar a subnet é inofensivo — IP próprio, e a security
# list já libera 22/80/443. O que o teste de DR prova é o PROVISIONAMENTO (cloud-init) e a
# subida da stack, não a topologia de rede.
data "oci_core_subnets" "nonprod" {
  compartment_id = var.compartment_id
  display_name   = "ordem-na-mesa-nonprod-subnet-public"
}

module "compute" {
  source = "../../modules/compute"

  compartment_id      = var.compartment_id
  prefix              = local.prefix
  subnet_id           = data.oci_core_subnets.nonprod.subnets[0].id
  availability_domain = data.oci_identity_availability_domains.ads.availability_domains[0].name
  shape               = var.instance_shape
  shape_config        = var.instance_shape_config
  # O MESMO cloud-init do nonprod — é exatamente isto que o teste de DR prova.
  user_data_base64 = base64encode(templatefile("${path.module}/../../../scripts/userdata.sh.tftpl", {
    provision_script = file("${path.module}/../../../scripts/provision.sh")
  }))
  tags = local.tags
}

resource "local_sensitive_file" "ssh_private_key" {
  content         = module.compute.ssh_private_key_pem
  filename        = pathexpand("~/.ssh/ordem-na-mesa-drtest.pem")
  file_permission = "0600"
}

output "public_ip" {
  value = module.compute.public_ip
}
