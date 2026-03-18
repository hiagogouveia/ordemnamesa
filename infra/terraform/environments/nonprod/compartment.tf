resource "oci_identity_compartment" "nonprod" {
  compartment_id = var.tenancy_ocid
  name           = "ordem-na-mesa-nonprod"
  description    = "Compartment NONPROD do projeto Ordem na Mesa"
  enable_delete  = true

  freeform_tags = local.tags
}
