# Infraestrutura NONPROD — Ordem na Mesa

Infraestrutura OCI (Always Free) para o ambiente NONPROD do projeto Ordem na Mesa.

## Arquitetura

```
OCI (sa-saopaulo-1)
└── Compartment: ordem-na-mesa-nonprod
    └── VCN: 10.0.0.0/16
        └── Subnet pública: 10.0.1.0/24
            └── VM.Standard.E2.1.Micro (Ubuntu 22.04)
                └── Docker
                    ├── Traefik v3 (proxy + SSL automático)
                    └── Next.js standalone (porta 3000)
```

> O Supabase continua sendo o único backend. A VM hospeda apenas o frontend Next.js.

---

## Estrutura

```
infra/
├── terraform/
│   ├── modules/
│   │   ├── network/     # VCN, subnet, IGW, route table, security list
│   │   └── compute/     # instância, IP reservado, SSH key
│   └── environments/
│       └── nonprod/     # root module (chama os módulos acima)
├── docker/
│   ├── Dockerfile           # multi-stage Next.js standalone
│   ├── docker-compose.yml   # Traefik + Next.js
│   └── traefik/
│       └── traefik.yml      # config estática Traefik
└── scripts/
    └── userdata.sh          # cloud-init da VM
```

---

## Pré-requisitos

### 1. Bucket para Terraform state

Criar manualmente no OCI Console antes de qualquer `terraform init`:

```bash
# Obter namespace do tenancy
oci os ns get

# Criar bucket
oci os bucket create \
  --name ordem-na-mesa-nonprod-tfstate \
  --compartment-id <TENANCY_OCID> \
  --versioning Enabled
```

### 2. Customer Secret Key (para o backend S3)

No OCI Console: **Identity → User → Customer Secret Keys → Generate Secret Key**

Guardar o `access_key_id` e o `secret_key` gerados.

### 3. Atualizar endpoint do backend

Em [infra/terraform/environments/nonprod/providers.tf](terraform/environments/nonprod/providers.tf), substituir `PLACEHOLDER_NAMESPACE` pelo namespace real:

```hcl
endpoint = "https://<SEU_NAMESPACE>.compat.objectstorage.sa-saopaulo-1.oraclecloud.com"
```

---

## Executar localmente

```bash
cd infra/terraform/environments/nonprod

# Copiar e preencher variáveis
cp terraform.tfvars.example terraform.tfvars

# Exportar credenciais do backend S3
export AWS_ACCESS_KEY_ID=<customer_secret_key_id>
export AWS_SECRET_ACCESS_KEY=<customer_secret_key>

terraform init
terraform plan
terraform apply
```

Após o apply, a chave SSH privada é salva automaticamente em `~/.ssh/ordem-na-mesa-nonprod.pem`.

---

## Secrets do GitHub Actions

Configurar em **Settings → Secrets and variables → Actions**:

| Secret | Descrição |
|--------|-----------|
| `OCI_TENANCY_OCID` | OCID do tenancy |
| `OCI_USER_OCID` | OCID do usuário |
| `OCI_FINGERPRINT` | Fingerprint da API key |
| `OCI_PRIVATE_KEY` | Conteúdo do arquivo .pem |
| `OCI_OBJECT_STORAGE_NAMESPACE` | Namespace do tenancy |
| `OCI_OBJECT_STORAGE_ACCESS_KEY` | Customer Secret Key ID |
| `OCI_OBJECT_STORAGE_SECRET_KEY` | Customer Secret Key |
| `VM_HOST` | IP público da VM (após primeiro apply) |
| `VM_SSH_PRIVATE_KEY` | Chave SSH privada da VM |
| `NEXT_PUBLIC_SUPABASE_URL` | URL do projeto Supabase |
| `NEXT_PUBLIC_SUPABASE_ANON_KEY` | Chave anon do Supabase |
| `SUPABASE_SERVICE_ROLE_KEY` | Service role key do Supabase |
| `RESEND_API_KEY` | API key do Resend |

---

## Pipelines CI/CD

| Workflow | Trigger | O que faz |
|----------|---------|-----------|
| `infra-nonprod.yml` | push em `main` em `infra/terraform/**` | terraform init → plan → apply |
| `app-nonprod.yml` | push em `develop` em `app/**`, `components/**`, etc. | build Docker → push GHCR → SSH deploy |

---

## Outputs do Terraform

| Output | Descrição |
|--------|-----------|
| `public_ip` | IP público reservado da VM |
| `dns_hint` | `nonprod.ordemnamesa.com → <IP>` |
| `ssh_command` | Comando SSH pronto para uso |
| `instance_id` | OCID da instância |
| `compartment_id` | OCID do compartment nonprod |

---

## DNS

Após o primeiro `terraform apply`, configurar no provedor de DNS:

```
nonprod.ordemnamesa.com  A  <public_ip>
```
