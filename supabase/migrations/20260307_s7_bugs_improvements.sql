-- ============================================================
-- Sprint 7 — Bugs e Melhorias
-- ============================================================

-- BUG 1: Coluna active ausente na tabela roles
-- Sem ela, roles.filter(r => r.active) retorna vazio
ALTER TABLE roles
  ADD COLUMN IF NOT EXISTS active boolean NOT NULL DEFAULT true;

-- MELHORIA 3: Recorrência em checklists
ALTER TABLE checklists
  ADD COLUMN IF NOT EXISTS recurrence text DEFAULT 'none'
    CHECK (recurrence IN ('none','daily','weekly','monthly','yearly','weekdays')),
  ADD COLUMN IF NOT EXISTS last_reset_at timestamptz;

-- MELHORIA 2 (Rodada 2): Atribuir rotina inteira a colaborador específico
ALTER TABLE checklists
  ADD COLUMN IF NOT EXISTS assigned_to_user_id uuid REFERENCES users(id);
