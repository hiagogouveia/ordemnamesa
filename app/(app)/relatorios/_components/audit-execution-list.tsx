'use client';

import type { AuditExecution } from '@/lib/types/audit';
import { Avatar } from '@/components/ui/avatar';
import { Checkbox } from '@/components/ui/checkbox';
import { UnitBadge } from '@/components/ui/unit-badge';
import { StatusBadge } from './status-badge';
import { formatDate, formatDuration, formatShift, formatTime } from './format';

interface Props {
    entries: AuditExecution[];
    isLoading: boolean;
    onSelect: (assumptionId: string) => void;
    isGlobal: boolean;
    /** Seleção em lote — ids marcados para exportação. */
    selectedIds: Set<string>;
    /** Alterna a seleção de um único registro. */
    onToggle: (assumptionId: string) => void;
    /** Marca/desmarca todos os registros visíveis da página atual. */
    onTogglePage: (ids: string[], select: boolean) => void;
}

/**
 * Marcador secundário discreto — sinaliza que a execução PASSOU por algum
 * impedimento no caminho (uma task chegou a status blocked/flagged), sem
 * conflitar com o status final ("Concluída").
 */
function ImpedimentMarker() {
    return (
        <span
            className="inline-flex items-center gap-1 px-1.5 py-0.5 rounded text-[10px] font-semibold uppercase tracking-wide text-[#fbbf24] bg-[#fbbf24]/10 border border-[#fbbf24]/20 whitespace-nowrap"
            title="Esta rotina passou por impedimento durante a execução."
        >
            <span className="material-symbols-outlined" style={{ fontSize: 12 }}>history</span>
            Teve impedimento
        </span>
    );
}

function SkeletonRow({ isGlobal }: { isGlobal: boolean }) {
    // +1 coluna do checkbox de seleção
    const cols = (isGlobal ? 9 : 8) + 1;
    return (
        <tr>
            {Array.from({ length: cols }).map((_, i) => (
                <td key={i} className="px-4 py-3.5">
                    <div className="h-3.5 rounded bg-[#233f48] animate-pulse" />
                </td>
            ))}
        </tr>
    );
}

function SkeletonCard() {
    return (
        <div className="bg-[#16262c] border border-[#325a67] rounded-xl p-4 animate-pulse">
            <div className="h-4 w-2/3 rounded bg-[#233f48] mb-3" />
            <div className="h-3 w-1/3 rounded bg-[#233f48] mb-2" />
            <div className="h-3 w-1/2 rounded bg-[#233f48]" />
        </div>
    );
}

export function AuditExecutionList({ entries, isLoading, onSelect, isGlobal, selectedIds, onToggle, onTogglePage }: Props) {
    const pageIds = entries.map(e => e.assumption_id);
    const pageSelectedCount = pageIds.reduce((n, id) => n + (selectedIds.has(id) ? 1 : 0), 0);
    const allPageSelected = pageIds.length > 0 && pageSelectedCount === pageIds.length;
    const somePageSelected = pageSelectedCount > 0 && !allPageSelected;
    // colunas de dados (8/9) + 1 do checkbox
    const emptyColSpan = (isGlobal ? 9 : 8) + 1;

    return (
        <>
            {/* ── Desktop table ── */}
            <div className="hidden md:block rounded-xl border border-[#325a67] overflow-hidden bg-[#16262c]">
                <div className="overflow-x-auto">
                    <table className="w-full text-left text-sm">
                        <thead className="bg-[#192d33] text-xs uppercase tracking-wider text-[#92bbc9] font-bold">
                            <tr>
                                <th className="px-4 py-3.5 w-10">
                                    <Checkbox
                                        aria-label="Selecionar todos desta página"
                                        checked={allPageSelected}
                                        indeterminate={somePageSelected}
                                        disabled={pageIds.length === 0}
                                        onChange={() => onTogglePage(pageIds, !allPageSelected)}
                                    />
                                </th>
                                <th className="px-4 py-3.5">Data / Hora</th>
                                <th className="px-4 py-3.5">Checklist</th>
                                <th className="px-4 py-3.5">Área</th>
                                <th className="px-4 py-3.5">Turno</th>
                                <th className="px-4 py-3.5">Responsável</th>
                                <th className="px-4 py-3.5">Duração</th>
                                <th className="px-4 py-3.5">Status</th>
                                <th className="px-4 py-3.5 text-right">Evidências</th>
                                {isGlobal && <th className="px-4 py-3.5">Unidade</th>}
                            </tr>
                        </thead>
                        <tbody className="divide-y divide-[#325a67]">
                            {isLoading && Array.from({ length: 6 }).map((_, i) =>
                                <SkeletonRow key={i} isGlobal={isGlobal} />,
                            )}

                            {!isLoading && entries.length === 0 && (
                                <tr>
                                    <td colSpan={emptyColSpan} className="px-4 py-16 text-center">
                                        <div className="flex flex-col items-center gap-2 text-[#92bbc9]">
                                            <span className="material-symbols-outlined text-5xl text-[#325a67]">
                                                history_toggle_off
                                            </span>
                                            <p className="font-medium">Nenhuma execução para este filtro.</p>
                                            <p className="text-xs text-[#557682]">Ajuste o período ou os filtros para visualizar registros.</p>
                                        </div>
                                    </td>
                                </tr>
                            )}

                            {!isLoading && entries.map(e => {
                                const isChecked = selectedIds.has(e.assumption_id);
                                return (
                                <tr
                                    key={e.assumption_id}
                                    onClick={() => onSelect(e.assumption_id)}
                                    className={`cursor-pointer transition-colors ${isChecked ? 'bg-[#13b6ec]/10 hover:bg-[#13b6ec]/15' : 'hover:bg-[#101d22]/50'}`}
                                >
                                    <td className="px-4 py-3.5 w-10" onClick={ev => ev.stopPropagation()}>
                                        <Checkbox
                                            aria-label={`Selecionar execução de ${e.checklist.name}`}
                                            checked={isChecked}
                                            onChange={() => onToggle(e.assumption_id)}
                                        />
                                    </td>
                                    <td className="px-4 py-3.5 whitespace-nowrap">
                                        <div className="flex flex-col">
                                            <span className="text-white font-medium">{formatDate(e.assumed_at)}</span>
                                            <span className="text-[#557682] text-xs">{formatTime(e.assumed_at)}</span>
                                        </div>
                                    </td>
                                    <td className="px-4 py-3.5">
                                        <div className="flex flex-col gap-0.5">
                                            <span className="text-white font-medium">{e.checklist.name}</span>
                                            {e.supplier && (
                                                <span className="inline-flex items-center gap-1 text-[11px] text-[#13b6ec] font-semibold">
                                                    <span className="material-symbols-outlined text-[13px]">local_shipping</span>
                                                    {e.supplier.name}
                                                </span>
                                            )}
                                        </div>
                                    </td>
                                    <td className="px-4 py-3.5 whitespace-nowrap">
                                        {/* s92 — a rotina pode ter várias áreas: até 2 + "+N". */}
                                        {e.areas.length > 0 ? (
                                            <span
                                                className="inline-flex items-center gap-1 flex-wrap"
                                                title={e.areas.map((a) => a.name).join(', ')}
                                            >
                                                {e.areas.slice(0, 2).map((a) => (
                                                    <span
                                                        key={a.id}
                                                        className="inline-flex items-center gap-1.5 px-2.5 py-0.5 rounded-full text-xs font-medium border"
                                                        style={{
                                                            backgroundColor: `${a.color ?? '#13b6ec'}1a`,
                                                            borderColor: `${a.color ?? '#13b6ec'}33`,
                                                            color: a.color ?? '#13b6ec',
                                                        }}
                                                    >
                                                        {a.name}
                                                    </span>
                                                ))}
                                                {e.areas.length > 2 && (
                                                    <span className="text-[#5a8a99] text-xs">+{e.areas.length - 2}</span>
                                                )}
                                            </span>
                                        ) : (
                                            <span className="text-[#557682] text-xs">—</span>
                                        )}
                                    </td>
                                    <td className="px-4 py-3.5 whitespace-nowrap text-[#92bbc9]">
                                        {formatShift(e.checklist.shift)}
                                    </td>
                                    <td className="px-4 py-3.5">
                                        <div className="flex items-center gap-2">
                                            <Avatar src={e.user.avatar_url} name={e.user.name} size={28} border="border-[#325a67]" />
                                            <span className="text-[#92bbc9] truncate max-w-[140px]" title={e.user.name}>
                                                {e.user.name}
                                            </span>
                                        </div>
                                    </td>
                                    <td className="px-4 py-3.5 whitespace-nowrap text-[#92bbc9] text-sm">
                                        {formatDuration(e.duration_seconds)}
                                    </td>
                                    <td className="px-4 py-3.5">
                                        <div className="flex items-center gap-1.5 flex-wrap">
                                            <StatusBadge status={e.status} size="sm" />
                                            {e.status === 'completed' && e.had_impediment && <ImpedimentMarker />}
                                        </div>
                                    </td>
                                    <td className="px-4 py-3.5 text-right text-sm whitespace-nowrap">
                                        {e.evidence_count > 0 ? (
                                            <span className="inline-flex items-center gap-1 text-[#13b6ec]">
                                                <span className="material-symbols-outlined" style={{ fontSize: 16 }}>
                                                    image
                                                </span>
                                                {e.evidence_count}
                                            </span>
                                        ) : (
                                            <span className="text-[#557682]">—</span>
                                        )}
                                    </td>
                                    {isGlobal && (
                                        <td className="px-4 py-3.5 whitespace-nowrap">
                                            {e.unit && <UnitBadge name={e.unit.name} />}
                                        </td>
                                    )}
                                </tr>
                                );
                            })}
                        </tbody>
                    </table>
                </div>
            </div>

            {/* ── Mobile cards ── */}
            <div className="md:hidden flex flex-col gap-3">
                {isLoading && Array.from({ length: 4 }).map((_, i) => <SkeletonCard key={i} />)}

                {!isLoading && entries.length === 0 && (
                    <div className="bg-[#16262c] border border-[#325a67] rounded-xl p-8 flex flex-col items-center gap-2 text-[#92bbc9]">
                        <span className="material-symbols-outlined text-5xl text-[#325a67]">history_toggle_off</span>
                        <p className="font-medium text-center">Nenhuma execução para este filtro.</p>
                    </div>
                )}

                {!isLoading && entries.map(e => {
                    const isChecked = selectedIds.has(e.assumption_id);
                    return (
                    <div
                        key={e.assumption_id}
                        onClick={() => onSelect(e.assumption_id)}
                        role="button"
                        tabIndex={0}
                        onKeyDown={ev => { if (ev.key === 'Enter' || ev.key === ' ') { ev.preventDefault(); onSelect(e.assumption_id); } }}
                        className={`text-left border rounded-xl p-4 active:scale-[0.99] transition-all cursor-pointer ${isChecked ? 'bg-[#13b6ec]/10 border-[#13b6ec]/50' : 'bg-[#16262c] border-[#325a67] hover:border-[#13b6ec]/40'}`}
                    >
                        <div className="flex items-start justify-between gap-3 mb-2">
                            <div className="pt-0.5 shrink-0" onClick={ev => ev.stopPropagation()}>
                                <Checkbox
                                    aria-label={`Selecionar execução de ${e.checklist.name}`}
                                    checked={isChecked}
                                    onChange={() => onToggle(e.assumption_id)}
                                />
                            </div>
                            <div className="min-w-0 flex-1">
                                <p className="text-white font-bold truncate">{e.checklist.name}</p>
                                {e.supplier && (
                                    <p className="inline-flex items-center gap-1 text-[#13b6ec] text-xs font-bold mt-0.5">
                                        <span className="material-symbols-outlined text-[13px]">local_shipping</span>
                                        {e.supplier.name}
                                    </p>
                                )}
                                <p className="text-[#557682] text-xs mt-0.5">
                                    {formatDate(e.assumed_at)} · {formatTime(e.assumed_at)} · {formatShift(e.checklist.shift)}
                                </p>
                            </div>
                            <div className="flex flex-col items-end gap-1 shrink-0">
                                <StatusBadge status={e.status} size="sm" />
                                {e.status === 'completed' && e.had_impediment && <ImpedimentMarker />}
                            </div>
                        </div>

                        <div className="flex items-center gap-2 mt-3">
                            <Avatar src={e.user.avatar_url} name={e.user.name} size={24} border="border-[#325a67]" />
                            <span className="text-[#92bbc9] text-sm truncate flex-1">{e.user.name}</span>
                        </div>

                        <div className="flex items-center justify-between gap-3 mt-3 pt-3 border-t border-[#233f48] text-xs text-[#92bbc9]">
                            <div className="flex items-center gap-3">
                                <span className="inline-flex items-center gap-1">
                                    <span className="material-symbols-outlined" style={{ fontSize: 14 }}>schedule</span>
                                    {formatDuration(e.duration_seconds)}
                                </span>
                                {e.evidence_count > 0 && (
                                    <span className="inline-flex items-center gap-1 text-[#13b6ec]">
                                        <span className="material-symbols-outlined" style={{ fontSize: 14 }}>image</span>
                                        {e.evidence_count}
                                    </span>
                                )}
                            </div>
                            {e.areas.slice(0, 2).map((a) => (
                                <span
                                    key={a.id}
                                    className="px-2 py-0.5 rounded-full text-[10px] font-medium"
                                    style={{
                                        backgroundColor: `${a.color ?? '#13b6ec'}1a`,
                                        color: a.color ?? '#13b6ec',
                                    }}
                                >
                                    {a.name}
                                </span>
                            ))}
                            {e.areas.length > 2 && (
                                <span className="text-[#5a8a99] text-[10px]">+{e.areas.length - 2}</span>
                            )}
                            {e.unit && <UnitBadge name={e.unit.name} />}
                        </div>
                    </div>
                    );
                })}
            </div>
        </>
    );
}
