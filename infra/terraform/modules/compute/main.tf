resource "tls_private_key" "ssh" {
  algorithm = "RSA"
  rsa_bits  = 4096
}

data "oci_core_images" "ubuntu" {
  compartment_id           = var.compartment_id
  operating_system         = "Canonical Ubuntu"
  operating_system_version = "22.04"
  shape                    = var.shape
  sort_by                  = "TIMECREATED"
  sort_order               = "DESC"
  state                    = "AVAILABLE"
}

resource "oci_core_instance" "main" {
  compartment_id      = var.compartment_id
  availability_domain = var.availability_domain
  display_name        = "${var.prefix}-vm"
  shape               = var.shape

  source_details {
    source_type             = "image"
    source_id               = data.oci_core_images.ubuntu.images[0].id
    boot_volume_size_in_gbs = 50
  }

  create_vnic_details {
    subnet_id        = var.subnet_id
    display_name     = "${var.prefix}-vnic"
    assign_public_ip = false # IP reservado associado separadamente
    hostname_label   = "nonprod"
  }

  metadata = {
    ssh_authorized_keys = tls_private_key.ssh.public_key_openssh
    user_data           = var.user_data_base64
  }

  freeform_tags = var.tags

  lifecycle {
    ignore_changes = [source_details[0].source_id]
  }
}

# IP público reservado (lifetime = RESERVED)
resource "oci_core_public_ip" "reserved" {
  compartment_id = var.compartment_id
  lifetime       = "RESERVED"
  display_name   = "${var.prefix}-public-ip"

  private_ip_id = data.oci_core_private_ips.vnic.private_ips[0].id

  freeform_tags = var.tags
}

data "oci_core_vnic_attachments" "main" {
  compartment_id = var.compartment_id
  instance_id    = oci_core_instance.main.id
}

data "oci_core_private_ips" "vnic" {
  vnic_id = data.oci_core_vnic_attachments.main.vnic_attachments[0].vnic_id
}
