/**
 * Audit Service — Central de Auditoria Operacional.
 *
 * Funções server-side puras: parsing de filtros, queries Supabase,
 * derivação de status canônico, montagem de CSV. Nenhuma lógica vive nas
 * route handlers (que apenas validam auth e chamam estas funções).
 *
 * Estratégia de vínculo task_execution ↔ assumption:
 * O campo `task_executions.checklist_assumption_id` existe (s25) mas só é
 * preenchido no fluxo de "block" — a criação normal em /api/task-executions/assume
 * não o popula. Por isso, matchamos por janela temporal:
 *   (checklist_id, user_id, executed_at ∈ [assumed_at, completed_at + buffer])
 * Esse critério é robusto e funciona com dados históricos.
 */

import type { SupabaseClient } from '@supabase/supabase-js';
import type {
    AuditExecution,
    AuditExecutionDetail,
    AuditFilters,
    AuditIssue,
    AuditListResponse,
    AuditStatus,
    AuditTaskDetail,
    AuditTaskStatus,
    AuditEvidence,
    AreaInfo,
    PeriodPreset,
    Shift,
    UnitInfo,
} from '@/lib/types/audit';
import { AUDIT_STATUS_LABEL, SHIFT_LABEL } from '@/lib/types/audit';
import { OPERATIONAL_PREDICATE } from '@/lib/utils/operational-activity';

// ─── Constantes ──────────────────────────────────────────────────────────────

const PAGE_SIZE_DEFAULT = 20;
const PAGE_SIZE_MAX = 100;
const SIGNED_URL_TTL_SECONDS = 60 * 30; // 30 min — cobre uma sessão de revisão
const STORAGE_BUCKET = 'photos';
const ASSUMPTION_WINDOW_BUFFER_MS = 48 * 60 * 60 * 1000; // 48h após assumed_at quando completed_at não existe
const VALID_STATUSES: ReadonlySet<AuditStatus> = new Set([
    'completed', 'incomplete', 'impediment',
]);
const VALID_SHIFTS: ReadonlySet<Shift> = new Set(['morning', 'afternoon', 'evening']);
const VALID_PRESETS: ReadonlySet<PeriodPreset> = new Set(['today', '7days', '30days', 'custom']);

// ─── Filtros ─────────────────────────────────────────────────────────────────

export const DEFAULT_FILTERS: AuditFilters = {
    start_date: null,
    end_date: null,
    preset: '30days',
    search: '',
    area_ids: [],
    user_ids: [],
    shifts: [],
    statuses: [],
    page: 0,
    limit: PAGE_SIZE_DEFAULT,
};

function toDateKey(d: Date): string {
    const y = d.getFullYear();
    const m = String(d.getMonth() + 1).padStart(2, '0');
    const day = String(d.getDate()).padStart(2, '0');
    return `${y}-${m}-${day}`;
}

function clampInt(raw: string | null, min: number, max: number, fallback: number): number {
    if (raw === null) return fallback;
    const n = parseInt(raw, 10);
    if (Number.isNaN(n)) return fallback;
    return Math.max(min, Math.min(max, n));
}

function parseList(sp: URLSearchParams, key: string): string[] {
    const raw = sp.get(key);
    if (!raw) return [];
    return raw.split(',').map(s => s.trim()).filter(Boolean);
}

function resolvePeriod(
    preset: PeriodPreset,
    explicitStart: string | null,
    explicitEnd: string | null,
): { start_date: string; end_date: string } {
    if (preset === 'custom' && explicitStart && explicitEnd) {
        return { start_date: explicitStart, end_date: explicitEnd };
    }
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    const todayStr = toDateKey(today);

    if (preset === 'today') {
        return { start_date: todayStr, end_date: todayStr };
    }
    if (preset === '7days') {
        const d = new Date(today); d.setDate(d.getDate() - 6);
        return { start_date: toDateKey(d), end_date: todayStr };
    }
    const d = new Date(today); d.setDate(d.getDate() - 29);
    return { start_date: toDateKey(d), end_date: todayStr };
}

export function parseFiltersFromSearchParams(sp: URLSearchParams): AuditFilters {
    const presetRaw = sp.get('preset') as PeriodPreset | null;
    const preset: PeriodPreset = (presetRaw && VALID_PRESETS.has(presetRaw)) ? presetRaw : '30days';

    const { start_date, end_date } = resolvePeriod(
        preset,
        sp.get('start_date'),
        sp.get('end_date'),
    );

    const statuses = parseList(sp, 'statuses').filter((s): s is AuditStatus =>
        VALID_STATUSES.has(s as AuditStatus));
    const shifts = parseList(sp, 'shifts').filter((s): s is Shift =>
        VALID_SHIFTS.has(s as Shift));

    return {
        start_date,
        end_date,
        preset,
        search: sp.get('search') ?? '',
        area_ids: parseList(sp, 'area_ids'),
        user_ids: parseList(sp, 'user_ids'),
        shifts,
        statuses,
        page: clampInt(sp.get('page'), 0, Number.MAX_SAFE_INTEGER, 0),
        limit: clampInt(sp.get('limit'), 1, PAGE_SIZE_MAX, PAGE_SIZE_DEFAULT),
    };
}

export function filtersToSearchParams(filters: AuditFilters): URLSearchParams {
    const sp = new URLSearchParams();
    if (filters.preset) sp.set('preset', filters.preset);
    if (filters.start_date) sp.set('start_date', filters.start_date);
    if (filters.end_date) sp.set('end_date', filters.end_date);
    if (filters.search) sp.set('search', filters.search);
    if (filters.area_ids.length) sp.set('area_ids', filters.area_ids.join(','));
    if (filters.user_ids.length) sp.set('user_ids', filters.user_ids.join(','));
    if (filters.shifts.length) sp.set('shifts', filters.shifts.join(','));
    if (filters.statuses.length) sp.set('statuses', filters.statuses.join(','));
    sp.set('page', String(filters.page));
    sp.set('limit', String(filters.limit));
    return sp;
}

// ─── Status canônico ─────────────────────────────────────────────────────────

/**
 * Mapeia status interno da task (banco) para o status canônico exibido.
 * - done   → 'completed' (concluída)
 * - blocked, flagged → 'impediment' (concluída com impedimento/ressalva)
 * - skipped, doing, null → 'pending' (não executada) — vira 'incomplete' no nível assumption
 */
function mapTaskExecutionStatus(raw: string | null | undefined): AuditTaskStatus {
    switch (raw) {
        case 'done':    return 'completed';
        case 'blocked': return 'impediment';
        case 'flagged': return 'impediment';
        case 'skipped': return 'pending';
        case 'doing':   return 'pending';
        default:        return 'pending';
    }
}

/**
 * Status FINAL da assumption (Sprint 45 — ocorrências em `task_issues`).
 *
 * Source of truth: `checklist_assumptions.execution_status='done'` (a lista
 * filtra) + ocorrências (`task_issues`) vinculadas à execução.
 *
 * - 'impediment' → existe ocorrência PENDENTE: `task_issues.status` em
 *   (open|investigating) E a task afetada NÃO foi concluída na janela
 *   (sem task_execution status='done'). É o caso "encerrou com problema".
 * - 'completed'  → demais casos. Quando houve ocorrência mas a task foi
 *   retomada/concluída (ou o gestor resolveu o issue), `had_impediment=true`
 *   sinaliza o evento via badge secundária, sem rebaixar o status.
 *
 * NÃO usamos mais `task_executions.status='blocked'`: a s45 removeu esse
 * status do schema e migrou o conceito para `task_issues`.
 *
 * Nota de saneamento (fora do escopo): assumptions com `completed_at != null`
 * mas `execution_status='in_progress'` (resíduo do bug s26) ficam fora da
 * lista pelo filtro `done`. Revisitar como tarefa de legado.
 */
function deriveAssumptionStatus(opts: { hasPendingIssue: boolean }): AuditStatus {
    if (opts.hasPendingIssue) return 'impediment';
    return 'completed';
}

// ─── Tipos internos das queries ──────────────────────────────────────────────

interface RawAssumption {
    id: string;
    restaurant_id: string;
    checklist_id: string;
    user_id: string;
    user_name: string | null;
    date_key: string;
    assumed_at: string;
    completed_at: string | null;
    execution_status: 'in_progress' | 'blocked' | 'done';
    blocked_reason: string | null;
    checklists: {
        id: string;
        name: string;
        shift: Shift | null;
        recurrence: string | null;
        area_id: string | null;
        description?: string | null;
    } | null;
}

interface RawUser {
    id: string;
    name: string | null;
    avatar_url: string | null;
}

interface RawTaskExec {
    id: string;
    task_id: string | null;
    checklist_id: string;
    user_id: string;
    status: string;
    executed_at: string | null;
    started_at: string | null;
    notes: string | null;
    observation: string | null;
    photo_url: string | null;
    photos: unknown; // JSONB array
    blocked_reason: string | null;
}

interface RawTaskIssue {
    id: string;
    checklist_assumption_id: string | null;
    checklist_id: string;
    task_id: string;
    reported_by: string;
    description: string;
    photos: unknown; // text[]
    status: 'open' | 'investigating' | 'resolved';
    manager_comment: string | null;
    resolved_at: string | null;
    created_at: string;
}

const ISSUE_OPEN_STATUSES: ReadonlySet<string> = new Set(['open', 'investigating']);

/** text[] do Postgres pode vir como array JS ou string — normaliza. */
function normalizePhotoArray(raw: unknown): string[] {
    if (Array.isArray(raw)) {
        return raw.filter((p): p is string => typeof p === 'string' && p.length > 0);
    }
    return [];
}

/** Window de tempo em que uma task_execution conta como pertencente à assumption. */
function assumptionWindow(a: RawAssumption): { startMs: number; endMs: number } {
    const startMs = new Date(a.assumed_at).getTime();
    const endMs = a.completed_at
        ? new Date(a.completed_at).getTime()
        : startMs + ASSUMPTION_WINDOW_BUFFER_MS;
    return { startMs, endMs };
}

/**
 * Extrai paths de fotos de uma execução. Considera tanto `photos` (JSONB array,
 * sprint 35) quanto `photo_url` (legado). Dedup mantendo ordem do array novo.
 */
function extractPhotoPaths(ex: RawTaskExec): string[] {
    const arr = Array.isArray(ex.photos)
        ? ex.photos.filter((p): p is string => typeof p === 'string' && p.length > 0)
        : [];
    if (ex.photo_url && !arr.includes(ex.photo_url)) {
        arr.push(ex.photo_url);
    }
    return arr;
}

function consolidateObservation(ex: RawTaskExec): string | null {
    const o = (ex.observation ?? '').trim();
    if (o) return o;
    const n = (ex.notes ?? '').trim();
    return n || null;
}

// ─── Lista ───────────────────────────────────────────────────────────────────

export async function fetchAuditList(
    admin: SupabaseClient,
    restaurantIds: string[],
    filters: AuditFilters,
    unitsById: Record<string, UnitInfo>,
    isGlobal: boolean,
): Promise<AuditListResponse> {
    if (restaurantIds.length === 0) {
        return { entries: [], total: 0, page: filters.page, limit: filters.limit };
    }

    const from = filters.page * filters.limit;
    const to = from + filters.limit - 1;

    // Apenas execuções FINALIZADAS — rotinas em curso (in_progress/blocked) não entram no histórico.
    // Sprint 54: receivings recurring NÃO entram em relatório (painel próprio em
    // /admin/recebimentos), mas quick receivings (is_one_shot=true) entram como
    // execução operacional auditável. Predicado canônico em OPERATIONAL_PREDICATE.
    let query = admin
        .from('checklist_assumptions')
        .select(`
            id, restaurant_id, checklist_id, user_id, user_name,
            date_key, assumed_at, completed_at, execution_status, blocked_reason,
            checklists!inner(id, name, shift, recurrence, area_id)
        `, { count: 'exact' })
        .in('restaurant_id', restaurantIds)
        .eq('execution_status', 'done')
        .or(OPERATIONAL_PREDICATE, { foreignTable: 'checklists' })
        .order('assumed_at', { ascending: false });

    if (filters.start_date) query = query.gte('date_key', filters.start_date);
    if (filters.end_date) query = query.lte('date_key', filters.end_date);
    if (filters.user_ids.length > 0) query = query.in('user_id', filters.user_ids);
    if (filters.search.trim()) {
        query = query.ilike('checklists.name', `%${filters.search.trim()}%`);
    }
    if (filters.area_ids.length > 0) {
        query = query.in('checklists.area_id', filters.area_ids);
    }
    if (filters.shifts.length > 0) {
        query = query.in('checklists.shift', filters.shifts);
    }

    query = query.range(from, to);

    const { data: rawData, count, error } = await query;
    if (error) throw error;

    const rawAssumptions = (rawData ?? []) as unknown as RawAssumption[];
    if (rawAssumptions.length === 0) {
        return { entries: [], total: count ?? 0, page: filters.page, limit: filters.limit };
    }

    const checklistIds = Array.from(new Set(rawAssumptions.map(a => a.checklist_id)));
    const userIds = Array.from(new Set(rawAssumptions.map(a => a.user_id).filter(Boolean)));

    // ── Total de tasks por checklist ────────────────────────────────────────
    const taskTotalByChecklist: Record<string, number> = {};
    {
        const { data: tasks, error: tErr } = await admin
            .from('checklist_tasks')
            .select('checklist_id')
            .in('checklist_id', checklistIds);
        if (tErr) throw tErr;
        for (const t of (tasks ?? []) as Array<{ checklist_id: string }>) {
            taskTotalByChecklist[t.checklist_id] = (taskTotalByChecklist[t.checklist_id] ?? 0) + 1;
        }
    }

    // ── Buscar task_executions cobrindo a janela GLOBAL da página ───────────
    // Lower bound = menor assumed_at; upper bound = maior completed_at (todas done) + buffer
    const minAssumedAt = rawAssumptions.reduce(
        (acc, a) => Math.min(acc, new Date(a.assumed_at).getTime()),
        Number.POSITIVE_INFINITY,
    );
    const maxEndAt = rawAssumptions.reduce(
        (acc, a) => {
            const end = a.completed_at
                ? new Date(a.completed_at).getTime()
                : new Date(a.assumed_at).getTime() + ASSUMPTION_WINDOW_BUFFER_MS;
            return Math.max(acc, end);
        },
        0,
    );

    const { data: execsRaw, error: execErr } = await admin
        .from('task_executions')
        .select('id, task_id, checklist_id, user_id, status, executed_at, started_at, notes, observation, photo_url, photos, blocked_reason')
        .in('checklist_id', checklistIds)
        .in('user_id', userIds)
        .gte('executed_at', new Date(minAssumedAt).toISOString())
        .lte('executed_at', new Date(maxEndAt).toISOString());
    if (execErr) throw execErr;
    const allExecs = (execsRaw ?? []) as RawTaskExec[];

    // ── Ocorrências (task_issues) por assumption ────────────────────────────
    const assumptionIds = rawAssumptions.map(a => a.id);
    const issuesByAssumption: Record<string, RawTaskIssue[]> = {};
    {
        const { data: issuesRaw, error: iErr } = await admin
            .from('task_issues')
            .select('id, checklist_assumption_id, checklist_id, task_id, reported_by, description, photos, status, manager_comment, resolved_at, created_at')
            .in('checklist_assumption_id', assumptionIds);
        if (iErr) throw iErr;
        for (const it of (issuesRaw ?? []) as RawTaskIssue[]) {
            if (!it.checklist_assumption_id) continue;
            (issuesByAssumption[it.checklist_assumption_id] ??= []).push(it);
        }
    }

    // ── Áreas ───────────────────────────────────────────────────────────────
    const areaIds = Array.from(new Set(
        rawAssumptions
            .map(a => a.checklists?.area_id)
            .filter((id): id is string => !!id),
    ));
    const areaMap: Record<string, AreaInfo> = {};
    if (areaIds.length > 0) {
        const { data: areas, error: aErr } = await admin
            .from('areas')
            .select('id, name, color')
            .in('id', areaIds);
        if (aErr) throw aErr;
        for (const a of (areas ?? []) as Array<{ id: string; name: string; color: string | null }>) {
            areaMap[a.id] = { id: a.id, name: a.name, color: a.color ?? null };
        }
    }

    // ── Users ───────────────────────────────────────────────────────────────
    const userMap: Record<string, RawUser> = {};
    if (userIds.length > 0) {
        const { data: users, error: uErr } = await admin
            .from('users')
            .select('id, name, avatar_url')
            .in('id', userIds);
        if (uErr) throw uErr;
        for (const u of (users ?? []) as RawUser[]) {
            userMap[u.id] = u;
        }
    }

    // ── Indexar execs por (checklist_id|user_id) para match O(1) ───────────
    const execsByKey: Record<string, RawTaskExec[]> = {};
    for (const e of allExecs) {
        if (!e.executed_at) continue;
        const key = `${e.checklist_id}|${e.user_id}`;
        (execsByKey[key] ??= []).push(e);
    }

    const todayKey = toDateKey(new Date());

    let entries: AuditExecution[] = rawAssumptions.map(a => {
        const { startMs, endMs } = assumptionWindow(a);
        const execsForA = (execsByKey[`${a.checklist_id}|${a.user_id}`] ?? [])
            .filter(e => {
                const t = new Date(e.executed_at!).getTime();
                return t >= startMs && t <= endMs;
            });

        // Dedup por task_id — mantemos a execução mais recente por task
        const lastByTask: Record<string, RawTaskExec> = {};
        for (const e of execsForA) {
            if (!e.task_id) continue;
            const prev = lastByTask[e.task_id];
            if (!prev || new Date(e.executed_at!).getTime() > new Date(prev.executed_at!).getTime()) {
                lastByTask[e.task_id] = e;
            }
        }
        const dedupedExecs = Object.values(lastByTask);

        const totalTasks = taskTotalByChecklist[a.checklist_id] ?? 0;
        let completedCount = 0;
        let evidenceCount = 0;
        for (const e of dedupedExecs) {
            const s = mapTaskExecutionStatus(e.status);
            if (s === 'completed') completedCount++;
            evidenceCount += extractPhotoPaths(e).length;
        }
        // Tasks concluídas (done) na janela — usado para resolver pendência de ocorrência
        const doneTaskIds = new Set(
            dedupedExecs.filter(e => e.status === 'done').map(e => e.task_id!).filter(Boolean),
        );

        // ── Ocorrências da execução ──
        const issuesForA = issuesByAssumption[a.id] ?? [];
        const pendingIssueTaskIds = new Set<string>();
        for (const it of issuesForA) {
            const taskConcluida = doneTaskIds.has(it.task_id);
            const isPending = ISSUE_OPEN_STATUSES.has(it.status) && !taskConcluida;
            if (isPending) pendingIssueTaskIds.add(it.task_id);
        }
        const hasAnyIssue = issuesForA.length > 0;
        const hasPendingIssue = pendingIssueTaskIds.size > 0;

        // Contagem informativa — diferença vs. template ATUAL. Não afeta o status agregado.
        const executedTaskIds = new Set(dedupedExecs.map(e => e.task_id!).filter(Boolean));
        const incompleteCount = Math.max(0, totalTasks - executedTaskIds.size);

        const status = deriveAssumptionStatus({ hasPendingIssue });

        const duration_seconds = a.completed_at
            ? Math.max(0, Math.round(
                (new Date(a.completed_at).getTime() - new Date(a.assumed_at).getTime()) / 1000,
            ))
            : null;

        const cl = a.checklists;
        const area = cl?.area_id ? areaMap[cl.area_id] ?? null : null;
        const u = userMap[a.user_id] ?? null;

        const entry: AuditExecution = {
            assumption_id: a.id,
            date_key: a.date_key,
            assumed_at: a.assumed_at,
            completed_at: a.completed_at,
            duration_seconds,
            status,
            had_impediment: hasAnyIssue,
            checklist: {
                id: cl?.id ?? a.checklist_id,
                name: cl?.name ?? '—',
                shift: cl?.shift ?? null,
                recurrence: cl?.recurrence ?? null,
            },
            area,
            user: {
                id: u?.id ?? a.user_id,
                name: u?.name ?? a.user_name ?? 'Colaborador',
                avatar_url: u?.avatar_url ?? null,
            },
            task_counts: {
                total: totalTasks,
                completed: completedCount,
                impediment: pendingIssueTaskIds.size,
                incomplete: incompleteCount,
            },
            evidence_count: evidenceCount,
        };
        if (isGlobal) {
            const unit = unitsById[a.restaurant_id];
            if (unit) entry.unit = unit;
        }
        // Marca de uso futuro (variável removida sem prejuízo) — todayKey
        void todayKey;
        return entry;
    });

    if (filters.statuses.length > 0) {
        const allowed = new Set(filters.statuses);
        entries = entries.filter(e => allowed.has(e.status));
    }

    return {
        entries,
        total: count ?? 0,
        page: filters.page,
        limit: filters.limit,
    };
}

// ─── Detalhe ─────────────────────────────────────────────────────────────────

export async function fetchAuditDetail(
    admin: SupabaseClient,
    assumptionId: string,
    restaurantIds: string[],
    unitsById: Record<string, UnitInfo>,
    isGlobal: boolean,
): Promise<AuditExecutionDetail | null> {
    const { data: rawData, error } = await admin
        .from('checklist_assumptions')
        .select(`
            id, restaurant_id, checklist_id, user_id, user_name,
            date_key, assumed_at, completed_at, execution_status, blocked_reason,
            checklists(id, name, description, shift, area_id)
        `)
        .eq('id', assumptionId)
        .in('restaurant_id', restaurantIds)
        .maybeSingle();

    if (error) throw error;
    if (!rawData) return null;
    const a = rawData as unknown as RawAssumption;

    // User
    const { data: userRow, error: uErr } = await admin
        .from('users')
        .select('id, name, avatar_url')
        .eq('id', a.user_id)
        .maybeSingle();
    if (uErr) throw uErr;
    const u = userRow as RawUser | null;

    // Tasks definidas (order é palavra reservada — só no ORDER BY)
    const { data: tasksRaw, error: tErr } = await admin
        .from('checklist_tasks')
        .select('id, title, description, is_critical')
        .eq('checklist_id', a.checklist_id)
        .order('order', { ascending: true });
    if (tErr) throw tErr;

    type RawTask = {
        id: string;
        title: string;
        description: string | null;
        is_critical: boolean;
    };
    const taskList = (tasksRaw ?? []) as RawTask[];

    // Task executions na janela desta assumption
    const { startMs, endMs } = assumptionWindow(a);
    const { data: execsRaw, error: eErr } = await admin
        .from('task_executions')
        .select('id, task_id, checklist_id, user_id, status, executed_at, started_at, notes, observation, photo_url, photos, blocked_reason')
        .eq('checklist_id', a.checklist_id)
        .eq('user_id', a.user_id)
        .gte('executed_at', new Date(startMs).toISOString())
        .lte('executed_at', new Date(endMs).toISOString());
    if (eErr) throw eErr;
    const execList = (execsRaw ?? []) as RawTaskExec[];

    // Dedup por task_id: manter a mais recente
    const lastByTask: Record<string, RawTaskExec> = {};
    for (const e of execList) {
        if (!e.task_id) continue;
        const prev = lastByTask[e.task_id];
        if (!prev || new Date(e.executed_at!).getTime() > new Date(prev.executed_at!).getTime()) {
            lastByTask[e.task_id] = e;
        }
    }
    const doneTaskIds = new Set(
        execList.filter(e => e.status === 'done').map(e => e.task_id!).filter(Boolean),
    );

    // ── Ocorrências (task_issues) da execução ───────────────────────────────
    const { data: issuesRaw, error: iErr } = await admin
        .from('task_issues')
        .select('id, checklist_assumption_id, checklist_id, task_id, reported_by, description, photos, status, manager_comment, resolved_at, created_at')
        .eq('checklist_assumption_id', assumptionId)
        .order('created_at', { ascending: true });
    if (iErr) throw iErr;
    const rawIssues = (issuesRaw ?? []) as RawTaskIssue[];

    // Nomes dos reporters
    const reporterIds = Array.from(new Set(rawIssues.map(it => it.reported_by).filter(Boolean)));
    const reporterMap: Record<string, string> = {};
    if (reporterIds.length > 0) {
        const { data: reporters } = await admin
            .from('users')
            .select('id, name')
            .in('id', reporterIds);
        for (const r of (reporters ?? []) as Array<{ id: string; name: string | null }>) {
            reporterMap[r.id] = r.name ?? 'Colaborador';
        }
    }

    const taskTitleById: Record<string, string> = {};
    for (const t of taskList) taskTitleById[t.id] = t.title;

    // Monta AuditIssue[] com signed URLs das fotos da ocorrência
    const auditIssues: AuditIssue[] = await Promise.all(
        rawIssues.map(async (it): Promise<AuditIssue> => {
            const photoPaths = normalizePhotoArray(it.photos);
            const photos: AuditEvidence[] = await Promise.all(
                photoPaths.map(async (path) => {
                    const { data: signed } = await admin.storage
                        .from(STORAGE_BUCKET)
                        .createSignedUrl(path, SIGNED_URL_TTL_SECONDS);
                    return { storage_path: path, signed_url: signed?.signedUrl ?? null };
                }),
            );
            const taskConcluida = doneTaskIds.has(it.task_id);
            const isPending = ISSUE_OPEN_STATUSES.has(it.status) && !taskConcluida;
            return {
                id: it.id,
                task_id: it.task_id,
                task_title: taskTitleById[it.task_id] ?? 'Tarefa',
                description: it.description,
                photos,
                status: it.status,
                is_pending: isPending,
                reporter_name: reporterMap[it.reported_by] ?? 'Colaborador',
                manager_comment: it.manager_comment,
                created_at: it.created_at,
                resolved_at: it.resolved_at,
            };
        }),
    );

    // Tasks com ocorrência pendente → marcadas como impediment na lista de tasks
    const pendingIssueByTask: Record<string, AuditIssue> = {};
    for (const it of auditIssues) {
        if (it.is_pending) pendingIssueByTask[it.task_id] = it;
    }
    const hasPendingIssue = Object.keys(pendingIssueByTask).length > 0;

    // Signed URLs em paralelo (sob demanda — só no detalhe)
    const taskDetails: AuditTaskDetail[] = await Promise.all(
        taskList.map(async (t, idx): Promise<AuditTaskDetail> => {
            const ex = lastByTask[t.id];
            const pendingIssue = pendingIssueByTask[t.id];
            const evidences: AuditEvidence[] = [];
            if (ex) {
                const paths = extractPhotoPaths(ex);
                for (const path of paths) {
                    const { data: signed } = await admin.storage
                        .from(STORAGE_BUCKET)
                        .createSignedUrl(path, SIGNED_URL_TTL_SECONDS);
                    evidences.push({
                        storage_path: path,
                        signed_url: signed?.signedUrl ?? null,
                    });
                }
            }
            // Task com ocorrência pendente assume status 'impediment' (sobrepõe skipped/etc)
            const status: AuditTaskStatus = pendingIssue
                ? 'impediment'
                : mapTaskExecutionStatus(ex?.status);
            return {
                task_id: t.id,
                title: t.title,
                description: t.description,
                is_critical: !!t.is_critical,
                order: idx,
                execution_id: ex?.id ?? null,
                status,
                observation: ex ? consolidateObservation(ex) : null,
                impediment_reason: pendingIssue?.description ?? null,
                executed_at: ex?.executed_at ?? null,
                started_at: ex?.started_at ?? null,
                evidences,
            };
        }),
    );

    const status = deriveAssumptionStatus({ hasPendingIssue });
    const hadImpediment = auditIssues.length > 0;

    const duration_seconds = a.completed_at
        ? Math.max(0, Math.round(
            (new Date(a.completed_at).getTime() - new Date(a.assumed_at).getTime()) / 1000,
        ))
        : null;

    const cl = a.checklists;
    let area: AreaInfo | null = null;
    if (cl?.area_id) {
        const { data: areaRow } = await admin
            .from('areas')
            .select('id, name, color')
            .eq('id', cl.area_id)
            .maybeSingle();
        if (areaRow) {
            area = { id: areaRow.id, name: areaRow.name, color: areaRow.color ?? null };
        }
    }

    const detail: AuditExecutionDetail = {
        assumption_id: a.id,
        status,
        had_impediment: hadImpediment,
        date_key: a.date_key,
        assumed_at: a.assumed_at,
        completed_at: a.completed_at,
        duration_seconds,
        impediment_reason: a.blocked_reason,
        checklist: {
            id: cl?.id ?? a.checklist_id,
            name: cl?.name ?? '—',
            description: cl?.description ?? null,
            shift: cl?.shift ?? null,
        },
        area,
        user: {
            id: u?.id ?? a.user_id,
            name: u?.name ?? a.user_name ?? 'Colaborador',
            avatar_url: u?.avatar_url ?? null,
        },
        tasks: taskDetails,
        issues: auditIssues,
    };
    if (isGlobal) {
        const unit = unitsById[a.restaurant_id];
        if (unit) detail.unit = unit;
    }
    return detail;
}

// ─── CSV ─────────────────────────────────────────────────────────────────────

/** Aceita qualquer valor e devolve string CSV-safe. Resiliente a undefined/null. */
function csvEscape(v: unknown): string {
    if (v === null || v === undefined) return '""';
    const s = typeof v === 'string' ? v : String(v);
    return `"${s.replace(/"/g, '""')}"`;
}

function formatDateBR(iso: string | null): string {
    if (!iso) return '';
    try { return new Date(iso).toLocaleDateString('pt-BR'); }
    catch { return ''; }
}
function formatTimeBR(iso: string | null): string {
    if (!iso) return '';
    try { return new Date(iso).toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' }); }
    catch { return ''; }
}
function shiftLabel(s: Shift | null | undefined): string {
    return s ? SHIFT_LABEL[s] : '';
}
function durationMinutes(seconds: number | null): string {
    if (seconds === null) return '';
    return String(Math.round(seconds / 60));
}

export function buildCsv(list: AuditListResponse, includeUnit: boolean): string {
    const header = [
        'Data', 'Hora', 'Checklist', 'Área', 'Turno', 'Responsável', 'Status',
        'Teve impedimento', 'Duração (min)', 'Tarefas Concluídas',
        'Tarefas com Impedimento', 'Tarefas Não Executadas', 'Evidências',
    ];
    if (includeUnit) header.push('Unidade');

    const rows = list.entries.map(e => {
        const row: unknown[] = [
            formatDateBR(e.assumed_at),
            formatTimeBR(e.assumed_at),
            e.checklist?.name ?? '',
            e.area?.name ?? '',
            shiftLabel(e.checklist?.shift),
            e.user?.name ?? '',
            AUDIT_STATUS_LABEL[e.status] ?? '',
            e.had_impediment ? 'Sim' : 'Não',
            durationMinutes(e.duration_seconds),
            e.task_counts?.completed ?? 0,
            e.task_counts?.impediment ?? 0,
            e.task_counts?.incomplete ?? 0,
            e.evidence_count ?? 0,
        ];
        if (includeUnit) row.push(e.unit?.name ?? '');
        return row;
    });

    const lines = [header, ...rows].map(r => r.map(csvEscape).join(','));
    return '﻿' + lines.join('\n'); // BOM UTF-8 para Excel pt-BR
}

export function csvFilename(filters: AuditFilters): string {
    const start = filters.start_date ?? 'inicio';
    const end = filters.end_date ?? 'fim';
    return `auditoria_${start}_${end}.csv`;
}
