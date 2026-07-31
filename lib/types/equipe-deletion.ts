/**
 * Sprint 95 — contrato da exclusão permanente de colaborador.
 *
 * Compartilhado por migration ↔ rota ↔ hook ↔ modal. Fica fora de lib/types/index.ts
 * porque é contrato de feature, não entidade de domínio (mesmo critério de lib/types/audit.ts).
 *
 * A API devolve apenas `key` + `count`; os rótulos em português vivem aqui, no cliente.
 */

// ─── Bloqueadores ────────────────────────────────────────────────────────────

/**
 * Espelha as chaves de public.restaurant_member_deletion_blockers.
 * Mudou a função SQL, muda esta union.
 */
export type DeletionBlockerKey =
    | 'task_executions'
    | 'checklist_assumptions'
    | 'task_issues'
    | 'task_issue_events'
    | 'checklist_temporary_transfers'
    | 'checklists_created'
    | 'receiving_templates_created'
    | 'suppliers_created'
    | 'restaurants_owned'
    | 'admin_audit_log'
    | 'data_export_events'
    | 'domain_events'
    | 'ordemnamesa_staff'
    | 'leads_approved'
    | 'account_owner';

export interface DeletionBlocker {
    key: DeletionBlockerKey;
    /** Satura em 101 na função SQL — exiba "100+" acima de 100. */
    count: number;
}

/** Rótulo em português de cada bloqueador. Fonte única do modal. */
export const BLOCKER_LABELS: Record<DeletionBlockerKey, string> = {
    task_executions: 'Tarefas executadas',
    checklist_assumptions: 'Rotinas assumidas',
    task_issues: 'Ocorrências registradas',
    task_issue_events: 'Movimentações de ocorrência',
    checklist_temporary_transfers: 'Transferências temporárias',
    checklists_created: 'Rotinas criadas',
    receiving_templates_created: 'Modelos de recebimento criados',
    suppliers_created: 'Fornecedores cadastrados',
    restaurants_owned: 'Unidades das quais é proprietário',
    admin_audit_log: 'Ações administrativas registradas',
    data_export_events: 'Exportações de dados',
    domain_events: 'Eventos do sistema gerados',
    ordemnamesa_staff: 'Vínculo com a equipe Ordem na Mesa',
    leads_approved: 'Aprovações de cadastro',
    account_owner: 'Proprietário da conta',
};

/** Formata a contagem respeitando a saturação em 101 da função SQL. */
export function formatBlockerCount(count: number): string {
    return count > 100 ? '100+' : String(count);
}

// ─── Resultado da operação ───────────────────────────────────────────────────

/**
 * Por que a identidade (public.users + auth.users) foi preservada mesmo com a
 * exclusão autorizada. `null` = identidade apagada.
 */
export type IdentityKeptReason = 'other_units' | 'global_traces' | null;

/** Rotinas e modelos que perderam o responsável ao excluir. */
export interface UnlinkedCounts {
    checklists: number;
    receiving_templates: number;
}

export interface DeletionTarget {
    user_id: string;
    email: string | null;
    name: string | null;
    role: string;
}

export type DeleteMemberErrorCode =
    | 'SESSION_EXPIRED'
    | 'FORBIDDEN'
    | 'FORBIDDEN_SELF_DELETE'
    | 'FORBIDDEN_TARGET_OWNER'
    | 'FORBIDDEN_MANAGER_SCOPE'
    | 'GLOBAL_MODE'
    | 'MEMBER_NOT_FOUND'
    | 'MEMBER_HAS_HISTORY'
    | 'INTERNAL_ERROR';

/** Espelha 1:1 o jsonb de public.delete_restaurant_member. Mudou lá, muda aqui. */
export interface DeleteMemberRpcResult {
    ok: boolean;
    code: 'DELETED' | 'CAN_DELETE' | DeleteMemberErrorCode;
    blockers?: DeletionBlocker[];
    identity_deleted?: boolean;
    identity_kept_reason?: IdentityKeptReason;
    remaining_units?: number;
    unlinked?: UnlinkedCounts;
    target?: DeletionTarget;
}

/**
 * Type guard para o retorno de supabase.rpc(), que é tipado de forma larga.
 *
 * Nunca usar `as DeleteMemberRpcResult` cru: se a migration não estiver aplicada,
 * `data` vem null e o cast produziria um crash de runtime disfarçado de tipo válido.
 * Segue o idioma de isGlobalScopeResult em lib/api/global-scope.ts.
 */
export function isDeleteMemberRpcResult(value: unknown): value is DeleteMemberRpcResult {
    return (
        typeof value === 'object' &&
        value !== null &&
        'ok' in value &&
        'code' in value &&
        typeof (value as { ok: unknown }).ok === 'boolean'
    );
}

// ─── Respostas HTTP ──────────────────────────────────────────────────────────

/** GET /api/equipe/[id]/deletion-preview */
export interface DeleteMemberPreview {
    can_delete: boolean;
    blockers: DeletionBlocker[];
    identity_deleted: boolean;
    identity_kept_reason: IdentityKeptReason;
    remaining_units: number;
    unlinked: UnlinkedCounts;
    target: DeletionTarget | null;
}

/** DELETE /api/equipe/[id] — 200 */
export interface DeleteMemberResponse {
    success: true;
    identity_deleted: boolean;
    identity_kept_reason: IdentityKeptReason;
    /**
     * true quando a RPC commitou mas a remoção em auth.users falhou. O vínculo já
     * não existe (sem acesso indevido), mas o e-mail segue ocupado até limpeza manual.
     */
    auth_cleanup_pending: boolean;
    unlinked: UnlinkedCounts;
    target: { user_id: string; name: string | null };
}

/** Corpo de erro das duas rotas. */
export interface DeleteMemberErrorResponse {
    error: DeleteMemberErrorCode;
    blockers?: DeletionBlocker[];
}

/**
 * Status HTTP por código de erro.
 *
 * MEMBER_HAS_HISTORY é 409 (não 422): o payload está correto, o ESTADO do recurso é
 * que não permite. Mesmo critério já usado no DELETE de /api/units/[id].
 */
export const DELETE_MEMBER_ERROR_STATUS: Record<DeleteMemberErrorCode, number> = {
    SESSION_EXPIRED: 401,
    FORBIDDEN: 403,
    FORBIDDEN_SELF_DELETE: 403,
    FORBIDDEN_TARGET_OWNER: 403,
    FORBIDDEN_MANAGER_SCOPE: 403,
    GLOBAL_MODE: 403,
    MEMBER_NOT_FOUND: 404,
    MEMBER_HAS_HISTORY: 409,
    INTERNAL_ERROR: 500,
};

/** Mensagens exibidas ao usuário por código de erro. */
export const DELETE_MEMBER_ERROR_MESSAGES: Record<DeleteMemberErrorCode, string> = {
    SESSION_EXPIRED: 'Sua sessão expirou. Faça login novamente.',
    FORBIDDEN: 'Você não tem permissão para excluir colaboradores.',
    FORBIDDEN_SELF_DELETE: 'Você não pode excluir o seu próprio cadastro.',
    FORBIDDEN_TARGET_OWNER:
        'Administradores não podem ser excluídos. Utilize a opção "Inativar".',
    FORBIDDEN_MANAGER_SCOPE: 'Gerência só pode excluir colaboradores.',
    GLOBAL_MODE: 'Selecione uma unidade para excluir um colaborador.',
    MEMBER_NOT_FOUND: 'Colaborador não encontrado nesta unidade.',
    MEMBER_HAS_HISTORY:
        'Este colaborador já possui histórico operacional e não pode ser excluído. Utilize a opção "Inativar" para preservar a auditoria do sistema.',
    INTERNAL_ERROR: 'Erro interno. Tente novamente.',
};
