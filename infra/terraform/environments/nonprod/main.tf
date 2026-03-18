locals {
  prefix = "ordem-na-mesa-nonprod"
  tags = {
    project     = "ordem-na-mesa"
    environment = "nonprod"
    managed_by  = "terraform"
  }
}

data "oci_identity_availability_domains" "ads" {
  compartment_id = oci_identity_compartment.nonprod.id
}

module "network" {
  source = "../../modules/network"

  compartment_id = oci_identity_compartment.nonprod.id
  prefix         = local.prefix
  vcn_cidr       = var.vcn_cidr
  subnet_cidr    = var.subnet_cidr
  tags           = local.tags
}

module "compute" {
  source = "../../modules/compute"

  compartment_id      = oci_identity_compartment.nonprod.id
  prefix              = local.prefix
  subnet_id           = module.network.subnet_id
  availability_domain = data.oci_identity_availability_domains.ads.availability_domains[0].name
  shape               = var.instance_shape
  user_data_base64    = filebase64("${path.module}/../../../scripts/userdata.sh")
  tags                = local.tags
}

# Salvar chave SSH privada localmente após apply
resource "local_sensitive_file" "ssh_private_key" {
  content         = module.compute.ssh_private_key_pem
  filename        = pathexpand("~/.ssh/ordem-na-mesa-nonprod.pem")
  file_permission = "0600"
}
