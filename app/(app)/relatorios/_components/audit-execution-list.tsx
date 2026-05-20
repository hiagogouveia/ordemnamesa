'use client';

import type { AuditExecution } from '@/lib/types/audit';
import { Avatar } from '@/components/ui/avatar';
import { UnitBadge } from '@/components/ui/unit-badge';
import { StatusBadge } from './status-badge';
import { formatDate, formatDuration, formatShift, formatTime } from './format';

interface Props {
    entries: AuditExecution[];
    isLoading: boolean;
    onSelect: (assumptionId: string) => void;
    isGlobal: boolean;
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
    const cols = isGlobal ? 9 : 8;
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

export function AuditExecutionList({ entries, isLoading, onSelect, isGlobal }: Props) {
    return (
        <>
            {/* ── Desktop table ── */}
            <div className="hidden md:block rounded-xl border border-[#325a67] overflow-hidden bg-[#16262c]">
                <div className="overflow-x-auto">
                    <table className="w-full text-left text-sm">
                        <thead className="bg-[#192d33] text-xs uppercase tracking-wider text-[#92bbc9] font-bold">
                            <tr>
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
                                    <td colSpan={isGlobal ? 9 : 8} className="px-4 py-16 text-center">
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

                            {!isLoading && entries.map(e => (
                                <tr
                                    key={e.assumption_id}
                                    onClick={() => onSelect(e.assumption_id)}
                                    className="hover:bg-[#101d22]/50 cursor-pointer transition-colors"
                                >
                                    <td className="px-4 py-3.5 whitespace-nowrap">
                                        <div className="flex flex-col">
                                            <span className="text-white font-medium">{formatDate(e.assumed_at)}</span>
                                            <span className="text-[#557682] text-xs">{formatTime(e.assumed_at)}</span>
                                        </div>
                                    </td>
                                    <td className="px-4 py-3.5">
                                        <span className="text-white font-medium">{e.checklist.name}</span>
                                    </td>
                                    <td className="px-4 py-3.5 whitespace-nowrap">
                                        {e.area ? (
                                            <span
                                                className="inline-flex items-center gap-1.5 px-2.5 py-0.5 rounded-full text-xs font-medium border"
                                                style={{
                                                    backgroundColor: `${e.area.color ?? '#13b6ec'}1a`,
                                                    borderColor: `${e.area.color ?? '#13b6ec'}33`,
                                                    color: e.area.color ?? '#13b6ec',
                                                }}
                                            >
                                                {e.area.name}
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
                            ))}
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

                {!isLoading && entries.map(e => (
                    <button
                        key={e.assumption_id}
                        onClick={() => onSelect(e.assumption_id)}
                        className="text-left bg-[#16262c] border border-[#325a67] rounded-xl p-4 hover:border-[#13b6ec]/40 active:scale-[0.99] transition-all"
                    >
                        <div className="flex items-start justify-between gap-3 mb-2">
                            <div className="min-w-0 flex-1">
                                <p className="text-white font-bold truncate">{e.checklist.name}</p>
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
                            {e.area && (
                                <span
                                    className="px-2 py-0.5 rounded-full text-[10px] font-medium"
                                    style={{
                                        backgroundColor: `${e.area.color ?? '#13b6ec'}1a`,
                                        color: e.area.color ?? '#13b6ec',
                                    }}
                                >
                                    {e.area.name}
                                </span>
                            )}
                            {e.unit && <UnitBadge name={e.unit.name} />}
                        </div>
                    </button>
                ))}
            </div>
        </>
    );
}
