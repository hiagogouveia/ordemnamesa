'use client';

import { useMemo } from 'react';
import type { AuditFilters, AuditStatus, PeriodPreset, Shift } from '@/lib/types/audit';
import { AUDIT_STATUS_LABEL, AUDIT_STATUS_OFFICIAL, SHIFT_LABEL } from '@/lib/types/audit';
import { useAllAreas } from '@/lib/hooks/use-areas';
import { useEquipe } from '@/lib/hooks/use-equipe';
import { MultiSelectPopover } from './multi-select-popover';
import type { Scope } from '@/lib/types/scope';

interface Props {
    scope: Scope;
    filters: AuditFilters;
    onChange: (next: AuditFilters) => void;
}

const PRESET_OPTIONS: { value: PeriodPreset; label: string }[] = [
    { value: 'today', label: 'Hoje' },
    { value: '7days', label: 'Últimos 7 dias' },
    { value: '30days', label: 'Últimos 30 dias' },
    { value: 'custom', label: 'Personalizado' },
];

const SHIFT_OPTIONS: { value: Shift; label: string }[] = (
    Object.keys(SHIFT_LABEL) as Shift[]
).map(s => ({ value: s, label: SHIFT_LABEL[s] }));

const STATUS_OPTIONS: { value: AuditStatus; label: string }[] =
    AUDIT_STATUS_OFFICIAL.map(s => ({ value: s, label: AUDIT_STATUS_LABEL[s] }));

export function AuditFiltersBar({ scope, filters, onChange }: Props) {
    const restaurantIdForLookups = scope.mode === 'single' ? scope.restaurantId : null;

    const { data: areas = [] } = useAllAreas(restaurantIdForLookups ?? undefined);
    const equipeArg = scope.mode === 'global'
        ? { restaurantId: null, accountId: scope.accountId, mode: 'global' as const }
        : { restaurantId: scope.restaurantId, mode: 'single' as const };
    const { data: equipeData } = useEquipe(equipeArg);

    const areaOptions = useMemo(
        () => areas.map(a => ({ value: a.id, label: a.name })),
        [areas],
    );
    const userOptions = useMemo(
        () => (equipeData?.equipe ?? []).map(m => ({ value: m.user_id, label: m.name })),
        [equipeData],
    );

    function patch(p: Partial<AuditFilters>) {
        onChange({ ...filters, ...p, page: 0 });
    }

    function setPreset(preset: PeriodPreset) {
        if (preset === 'custom') {
            patch({ preset: 'custom' });
            return;
        }
        // start_date/end_date serão recalculados server-side; limpamos pra refletir o preset
        patch({ preset, start_date: null, end_date: null });
    }

    return (
        <div className="bg-[#16262c] border border-[#325a67] rounded-xl p-4 flex flex-col gap-4">
            {/* ── Linha 1: período ── */}
            <div className="flex flex-col sm:flex-row gap-3 items-start sm:items-center">
                <span className="text-xs uppercase tracking-wider text-[#557682] font-bold shrink-0">
                    Período
                </span>
                <div className="flex flex-wrap gap-2">
                    {PRESET_OPTIONS.map(p => (
                        <button
                            key={p.value}
                            type="button"
                            onClick={() => setPreset(p.value)}
                            className={[
                                'px-3 py-1.5 rounded-lg text-sm font-medium transition-colors border',
                                filters.preset === p.value
                                    ? 'bg-[#13b6ec] border-[#13b6ec] text-white shadow-[0_0_15px_rgba(19,182,236,0.3)]'
                                    : 'bg-[#101d22] border-[#325a67] text-[#92bbc9] hover:text-white hover:border-[#13b6ec]/40',
                            ].join(' ')}
                        >
                            {p.label}
                        </button>
                    ))}
                </div>
                {filters.preset === 'custom' && (
                    <div className="flex flex-wrap gap-2 sm:ml-2">
                        <input
                            type="date"
                            value={filters.start_date ?? ''}
                            onChange={e => patch({ start_date: e.target.value || null })}
                            className="bg-[#101d22] text-white border border-[#325a67] rounded-lg px-2.5 py-1.5 text-sm focus:ring-1 focus:ring-[#13b6ec] focus:border-[#13b6ec] outline-none [color-scheme:dark]"
                            aria-label="Data inicial"
                        />
                        <span className="text-[#557682] self-center">até</span>
                        <input
                            type="date"
                            value={filters.end_date ?? ''}
                            onChange={e => patch({ end_date: e.target.value || null })}
                            className="bg-[#101d22] text-white border border-[#325a67] rounded-lg px-2.5 py-1.5 text-sm focus:ring-1 focus:ring-[#13b6ec] focus:border-[#13b6ec] outline-none [color-scheme:dark]"
                            aria-label="Data final"
                        />
                    </div>
                )}
            </div>

            {/* ── Linha 2: busca + multi-selects ── */}
            <div className="flex flex-col lg:flex-row gap-3 items-stretch lg:items-center">
                <div className="relative flex-1 min-w-0 lg:max-w-sm">
                    <span className="absolute left-3 top-1/2 -translate-y-1/2 text-[#557682] material-symbols-outlined" style={{ fontSize: 18 }}>
                        search
                    </span>
                    <input
                        type="text"
                        value={filters.search}
                        onChange={e => patch({ search: e.target.value })}
                        placeholder="Buscar pelo nome do checklist..."
                        className="w-full bg-[#101d22] border border-[#325a67] rounded-lg pl-10 pr-3 py-2 text-sm text-white placeholder-[#557682] focus:ring-1 focus:ring-[#13b6ec] focus:border-[#13b6ec] outline-none"
                    />
                </div>

                <div className="flex flex-wrap gap-2">
                    <MultiSelectPopover
                        label="Área"
                        icon="layers"
                        options={areaOptions}
                        value={filters.area_ids}
                        onChange={v => patch({ area_ids: v })}
                        disabled={areaOptions.length === 0}
                    />
                    <MultiSelectPopover
                        label="Colaborador"
                        icon="person"
                        options={userOptions}
                        value={filters.user_ids}
                        onChange={v => patch({ user_ids: v })}
                        disabled={userOptions.length === 0}
                    />
                    <MultiSelectPopover
                        label="Turno"
                        icon="schedule"
                        options={SHIFT_OPTIONS}
                        value={filters.shifts}
                        onChange={v => patch({ shifts: v as Shift[] })}
                        searchable={false}
                    />
                    <MultiSelectPopover
                        label="Status"
                        icon="rule"
                        options={STATUS_OPTIONS}
                        value={filters.statuses}
                        onChange={v => patch({ statuses: v as AuditStatus[] })}
                        searchable={false}
                    />
                </div>
            </div>
        </div>
    );
}
