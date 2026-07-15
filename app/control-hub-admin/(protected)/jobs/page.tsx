import { supabaseAdmin } from '@/lib/admin-leads-control-hub/supabase-admin'
import { JOB_REGISTRY, JOB_NAMES, isJobOverdue, type JobName } from '@/lib/jobs/registry'

export const dynamic = 'force-dynamic'

interface JobStateRow {
    job_name: string
    enabled: boolean
    last_run_at: string | null
    last_success_at: string | null
    consecutive_failures: number
    locked_by: string | null
    locked_until: string | null
    updated_at: string | null
}

interface JobRunRow {
    id: string
    job_name: string
    worker_id: string | null
    started_at: string
    finished_at: string | null
    status: string
    items_processed: number | null
    error: string | null
}

/** "há 3 min", "há 2 h", "há 5 d" — relativo, curto. */
function ago(iso: string | null): string {
    if (!iso) return 'nunca'
    const s = Math.floor((Date.now() - new Date(iso).getTime()) / 1000)
    if (s < 60) return `há ${s}s`
    if (s < 3600) return `há ${Math.floor(s / 60)} min`
    if (s < 86400) return `há ${Math.floor(s / 3600)} h`
    return `há ${Math.floor(s / 86400)} d`
}

function dur(started: string, finished: string | null): string {
    if (!finished) return '—'
    const ms = new Date(finished).getTime() - new Date(started).getTime()
    return ms < 1000 ? `${ms} ms` : `${(ms / 1000).toFixed(1)} s`
}

const STATUS_STYLE: Record<string, string> = {
    success: 'border-emerald-500/30 bg-emerald-500/10 text-emerald-400',
    running: 'border-sky-500/30 bg-sky-500/10 text-sky-400',
    failed: 'border-red-500/30 bg-red-500/10 text-red-400',
    timeout: 'border-orange-500/30 bg-orange-500/10 text-orange-400',
    interrupted: 'border-amber-500/30 bg-amber-500/10 text-amber-400',
}

export default async function JobsPage() {
    const [stateRes, runsRes] = await Promise.all([
        supabaseAdmin
            .from('job_state')
            .select('job_name, enabled, last_run_at, last_success_at, consecutive_failures, locked_by, locked_until, updated_at'),
        supabaseAdmin
            .from('job_runs')
            .select('id, job_name, worker_id, started_at, finished_at, status, items_processed, error')
            .order('started_at', { ascending: false })
            .limit(50),
    ])

    const byName = new Map(((stateRes.data ?? []) as JobStateRow[]).map((r) => [r.job_name, r]))
    const runs = (runsRes.data ?? []) as JobRunRow[]
    const now = Date.now()

    // Último sinal de vida do worker: o updated_at mais recente de qualquer linha.
    const workerSeen = ((stateRes.data ?? []) as JobStateRow[])
        .map((r) => (r.updated_at ? new Date(r.updated_at).getTime() : 0))
        .reduce((a, b) => Math.max(a, b), 0)

    const jobs = JOB_NAMES.map((name: JobName) => {
        const row = byName.get(name)
        const def = JOB_REGISTRY[name]
        const enabled = row?.enabled ?? true
        const overdue = isJobOverdue(
            def,
            {
                enabled,
                lastSuccessAtMs: row?.last_success_at ? new Date(row.last_success_at).getTime() : null,
                updatedAtMs: row?.updated_at ? new Date(row.updated_at).getTime() : null,
            },
            now,
        )
        const running = !!(row?.locked_until && new Date(row.locked_until).getTime() > now)
        return { name, def, row, enabled, overdue, running }
    })

    const anyOverdue = jobs.some((j) => j.overdue)

    return (
        <div className="space-y-8">
            <div className="flex flex-wrap items-end justify-between gap-3">
                <div>
                    <h1 className="text-3xl font-black text-white">Jobs agendados</h1>
                    <p className="text-sm text-text-secondary">
                        Executor interno (worker). Estado e histórico de execução.
                    </p>
                </div>
                <div className="flex items-center gap-4 text-xs text-text-secondary">
                    <span>
                        Worker visto{' '}
                        <span className={workerSeen && now - workerSeen < 60_000 ? 'text-emerald-400' : 'text-red-400'}>
                            {workerSeen ? ago(new Date(workerSeen).toISOString()) : 'nunca'}
                        </span>
                    </span>
                    <span
                        className={`rounded-md border px-2 py-0.5 font-bold uppercase tracking-wider ${
                            anyOverdue
                                ? 'border-red-500/30 bg-red-500/10 text-red-400'
                                : 'border-emerald-500/30 bg-emerald-500/10 text-emerald-400'
                        }`}
                    >
                        {anyOverdue ? 'degradado' : 'saudável'}
                    </span>
                </div>
            </div>

            {/* Estado por job */}
            <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
                {jobs.map((j) => (
                    <div
                        key={j.name}
                        className={`rounded-2xl border bg-surface-dark p-4 ${
                            j.overdue ? 'border-red-500/40' : 'border-border-dark'
                        }`}
                    >
                        <div className="flex items-center justify-between gap-2">
                            <span className="font-mono text-sm font-bold text-white">{j.name}</span>
                            <div className="flex gap-1">
                                {j.running && (
                                    <span className="rounded-md border border-sky-500/30 bg-sky-500/10 px-1.5 py-0.5 text-[10px] font-bold uppercase text-sky-400">
                                        rodando
                                    </span>
                                )}
                                {!j.enabled && (
                                    <span className="rounded-md border border-zinc-500/30 bg-zinc-500/10 px-1.5 py-0.5 text-[10px] font-bold uppercase text-zinc-400">
                                        desligado
                                    </span>
                                )}
                                {j.overdue && (
                                    <span className="rounded-md border border-red-500/30 bg-red-500/10 px-1.5 py-0.5 text-[10px] font-bold uppercase text-red-400">
                                        atrasado
                                    </span>
                                )}
                            </div>
                        </div>
                        <p className="mt-1 text-xs text-text-secondary">{j.def.description}</p>
                        <dl className="mt-3 grid grid-cols-2 gap-y-1 text-xs">
                            <dt className="text-text-secondary">Último sucesso</dt>
                            <dd className="text-right text-white">{ago(j.row?.last_success_at ?? null)}</dd>
                            <dt className="text-text-secondary">Cadência</dt>
                            <dd className="text-right text-white">{Math.round(j.def.everySeconds / 60)} min</dd>
                            <dt className="text-text-secondary">Falhas seguidas</dt>
                            <dd className={`text-right ${j.row?.consecutive_failures ? 'text-red-400' : 'text-white'}`}>
                                {j.row?.consecutive_failures ?? 0}
                            </dd>
                        </dl>
                    </div>
                ))}
            </div>

            {/* Histórico de execuções */}
            <div>
                <h2 className="mb-3 text-lg font-bold text-white">Execuções recentes</h2>
                <p className="mb-3 text-xs text-text-secondary">
                    Só o que aconteceu de fato: execuções sem itens (no-op) não geram linha.
                </p>
                <div className="overflow-hidden rounded-2xl border border-border-dark bg-surface-dark">
                    <div className="overflow-x-auto">
                        <table className="w-full text-sm">
                            <thead className="border-b border-border-dark text-left text-xs uppercase tracking-wider text-text-secondary">
                                <tr>
                                    <th className="px-4 py-3 font-bold">Quando</th>
                                    <th className="px-4 py-3 font-bold">Job</th>
                                    <th className="px-4 py-3 font-bold">Status</th>
                                    <th className="px-4 py-3 font-bold">Itens</th>
                                    <th className="px-4 py-3 font-bold">Duração</th>
                                    <th className="px-4 py-3 font-bold">Erro</th>
                                </tr>
                            </thead>
                            <tbody>
                                {runs.length === 0 && (
                                    <tr>
                                        <td colSpan={6} className="px-4 py-12 text-center text-text-secondary">
                                            Sem execuções registradas.
                                        </td>
                                    </tr>
                                )}
                                {runs.map((r) => (
                                    <tr key={r.id} className="border-b border-border-dark last:border-0 hover:bg-surface-deep/30">
                                        <td className="whitespace-nowrap px-4 py-3 text-xs text-text-secondary">
                                            {ago(r.started_at)}
                                        </td>
                                        <td className="px-4 py-3 font-mono text-xs text-white">{r.job_name}</td>
                                        <td className="px-4 py-3">
                                            <span
                                                className={`rounded-md border px-2 py-0.5 text-xs font-bold ${
                                                    STATUS_STYLE[r.status] ?? 'border-border-dark bg-surface-deep text-text-secondary'
                                                }`}
                                            >
                                                {r.status}
                                            </span>
                                        </td>
                                        <td className="px-4 py-3 text-white">{r.items_processed ?? '—'}</td>
                                        <td className="whitespace-nowrap px-4 py-3 text-xs text-text-secondary">
                                            {dur(r.started_at, r.finished_at)}
                                        </td>
                                        <td className="max-w-xs truncate px-4 py-3 text-xs text-red-400" title={r.error ?? ''}>
                                            {r.error ?? ''}
                                        </td>
                                    </tr>
                                ))}
                            </tbody>
                        </table>
                    </div>
                </div>
            </div>
        </div>
    )
}
