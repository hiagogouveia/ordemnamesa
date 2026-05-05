-- admin-leads-control-hub: tabelas de captura de leads, auditoria e staff interno
-- Sprint 30 - canal qualificado de aquisição

-- ============================================================================
-- 1. leads — captura pública qualificada
-- ============================================================================
CREATE TABLE IF NOT EXISTS public.leads (
    id uuid PRIMARY KEY DEFAULT gen_random_uuid(),

    name text NOT NULL,
    organization_name text NOT NULL,
    email text NOT NULL,
    phone text NOT NULL,
    city text,
    state text,

    custom_fields jsonb NOT NULL DEFAULT '{}'::jsonb,

    status text NOT NULL DEFAULT 'new'
        CHECK (status IN ('new','contacted','approved','rejected')),

    approved_entity_id uuid,
    approved_user_id uuid REFERENCES auth.users(id) ON DELETE SET NULL,

    notes text,
    created_at timestamptz NOT NULL DEFAULT now(),
    updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_leads_status ON public.leads(status);
CREATE INDEX IF NOT EXISTS idx_leads_created_at ON public.leads(created_at DESC);
CREATE INDEX IF NOT EXISTS idx_leads_approved_entity ON public.leads(approved_entity_id);

ALTER TABLE public.leads ENABLE ROW LEVEL SECURITY;

CREATE OR REPLACE FUNCTION public.set_leads_updated_at()
RETURNS trigger AS $$
BEGIN
    NEW.updated_at = now();
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS leads_set_updated_at ON public.leads;
CREATE TRIGGER leads_set_updated_at
    BEFORE UPDATE ON public.leads
    FOR EACH ROW EXECUTE FUNCTION public.set_leads_updated_at();

-- ============================================================================
-- 2. admin_logs — auditoria de ações administrativas
-- ============================================================================
CREATE TABLE IF NOT EXISTS public.admin_logs (
    id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    admin_email text NOT NULL,
    action text NOT NULL,
    target_type text,
    target_id uuid,
    metadata jsonb NOT NULL DEFAULT '{}'::jsonb,
    ip_address text,
    user_agent text,
    created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_admin_logs_created_at ON public.admin_logs(created_at DESC);
CREATE INDEX IF NOT EXISTS idx_admin_logs_admin_email ON public.admin_logs(admin_email);
CREATE INDEX IF NOT EXISTS idx_admin_logs_target ON public.admin_logs(target_type, target_id);

ALTER TABLE public.admin_logs ENABLE ROW LEVEL SECURITY;

-- ============================================================================
-- 3. ordemnamesa_staff — staff interno (SUPER_ADMIN / SUPPORT_AGENT)
-- ============================================================================
CREATE TABLE IF NOT EXISTS public.ordemnamesa_staff (
    id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id uuid NOT NULL UNIQUE REFERENCES auth.users(id) ON DELETE CASCADE,
    role text NOT NULL CHECK (role IN ('SUPER_ADMIN','SUPPORT_AGENT')),
    created_at timestamptz NOT NULL DEFAULT now(),
    created_by text NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_ordemnamesa_staff_user_id ON public.ordemnamesa_staff(user_id);
CREATE INDEX IF NOT EXISTS idx_ordemnamesa_staff_role ON public.ordemnamesa_staff(role);

ALTER TABLE public.ordemnamesa_staff ENABLE ROW LEVEL SECURITY;
