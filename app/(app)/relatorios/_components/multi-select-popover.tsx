'use client';

import { useEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';

export interface MultiSelectOption {
    value: string;
    label: string;
    hint?: string;
}

interface Props {
    label: string;
    icon?: string;
    options: MultiSelectOption[];
    value: string[];
    onChange: (next: string[]) => void;
    disabled?: boolean;
    searchable?: boolean;
    /** Label da opção sintética "todos" no topo. Default: 'Todos'. */
    allLabel?: string;
}

/**
 * Botão + popover com checkboxes. Mantém a estética do FilterDropdown
 * mas permite múltipla seleção. Usa Portal pra evitar overflow clipping.
 */
export function MultiSelectPopover({
    label, icon, options, value, onChange, disabled, searchable = true,
    allLabel = 'Todos',
}: Props) {
    const [open, setOpen] = useState(false);
    const [search, setSearch] = useState('');
    const [pos, setPos] = useState({ top: 0, left: 0, width: 0 });
    const btnRef = useRef<HTMLButtonElement>(null);
    const popRef = useRef<HTMLDivElement>(null);

    const selected = new Set(value);
    const isActive = value.length > 0;

    const filtered = search.trim()
        ? options.filter(o => o.label.toLowerCase().includes(search.toLowerCase()))
        : options;

    function toggle() {
        if (disabled || !btnRef.current) return;
        if (open) { setOpen(false); return; }
        const rect = btnRef.current.getBoundingClientRect();
        setPos({
            top: rect.bottom + window.scrollY + 4,
            left: rect.left + window.scrollX,
            width: Math.max(rect.width, 240),
        });
        setOpen(true);
    }

    useEffect(() => {
        if (!open) return;
        function handleClickOutside(e: MouseEvent) {
            if (
                popRef.current && !popRef.current.contains(e.target as Node) &&
                btnRef.current && !btnRef.current.contains(e.target as Node)
            ) setOpen(false);
        }
        function handleEsc(e: KeyboardEvent) {
            if (e.key === 'Escape') setOpen(false);
        }
        document.addEventListener('mousedown', handleClickOutside);
        document.addEventListener('keydown', handleEsc);
        return () => {
            document.removeEventListener('mousedown', handleClickOutside);
            document.removeEventListener('keydown', handleEsc);
        };
    }, [open]);

    function toggleValue(v: string) {
        if (selected.has(v)) {
            onChange(value.filter(x => x !== v));
        } else {
            onChange([...value, v]);
        }
    }

    function clear() {
        onChange([]);
    }

    const buttonLabel = isActive
        ? `${label} · ${value.length}`
        : `${label}: ${allLabel}`;

    return (
        <>
            <button
                ref={btnRef}
                onClick={toggle}
                disabled={disabled}
                type="button"
                className={[
                    'flex items-center gap-1.5 px-3 py-2 rounded-lg border text-sm font-medium transition-colors whitespace-nowrap',
                    'disabled:opacity-50 disabled:cursor-not-allowed',
                    isActive
                        ? 'bg-[#13b6ec]/15 border-[#13b6ec]/40 text-[#13b6ec]'
                        : 'bg-[#16262c] border-[#325a67] text-[#92bbc9] hover:border-[#13b6ec]/40 hover:text-white',
                ].join(' ')}
            >
                {icon && (
                    <span className="material-symbols-outlined" style={{ fontSize: 16 }}>{icon}</span>
                )}
                <span>{buttonLabel}</span>
                <span
                    className={`material-symbols-outlined transition-transform ${open ? 'rotate-180' : ''}`}
                    style={{ fontSize: 16 }}
                >
                    expand_more
                </span>
            </button>

            {open && createPortal(
                <div
                    ref={popRef}
                    style={{
                        position: 'absolute',
                        top: pos.top,
                        left: pos.left,
                        minWidth: pos.width,
                        maxWidth: 320,
                        zIndex: 9999,
                    }}
                    className="bg-[#16262c] border border-[#325a67] rounded-lg shadow-xl overflow-hidden flex flex-col"
                >
                    {searchable && options.length > 6 && (
                        <div className="p-2 border-b border-[#325a67]">
                            <input
                                type="text"
                                value={search}
                                onChange={e => setSearch(e.target.value)}
                                placeholder="Buscar..."
                                className="w-full bg-[#101d22] text-white placeholder-[#557682] border border-[#325a67] rounded px-2.5 py-1.5 text-sm focus:ring-1 focus:ring-[#13b6ec] focus:border-[#13b6ec] outline-none"
                                autoFocus
                            />
                        </div>
                    )}
                    <div className="max-h-72 overflow-y-auto py-1">
                        {/* Opção sintética "Todos" — sempre no topo */}
                        <button
                            type="button"
                            onClick={clear}
                            className="w-full flex items-center gap-2.5 px-3 py-2 text-sm text-left hover:bg-[#1a2c32] transition-colors border-b border-[#233f48]"
                        >
                            <span
                                className={[
                                    'shrink-0 size-4 rounded border flex items-center justify-center transition-colors',
                                    !isActive
                                        ? 'bg-[#13b6ec] border-[#13b6ec]'
                                        : 'bg-transparent border-[#557682]',
                                ].join(' ')}
                            >
                                {!isActive && (
                                    <span className="material-symbols-outlined text-white" style={{ fontSize: 14 }}>
                                        check
                                    </span>
                                )}
                            </span>
                            <span className={`font-semibold ${!isActive ? 'text-white' : 'text-[#92bbc9]'}`}>
                                {allLabel}
                            </span>
                        </button>

                        {filtered.length === 0 && (
                            <div className="px-3 py-2 text-xs text-[#557682]">Nenhum resultado.</div>
                        )}
                        {filtered.map(opt => {
                            const checked = selected.has(opt.value);
                            return (
                                <button
                                    key={opt.value}
                                    type="button"
                                    onClick={() => toggleValue(opt.value)}
                                    className="w-full flex items-center gap-2.5 px-3 py-2 text-sm text-left hover:bg-[#1a2c32] transition-colors"
                                >
                                    <span
                                        className={[
                                            'shrink-0 size-4 rounded border flex items-center justify-center transition-colors',
                                            checked
                                                ? 'bg-[#13b6ec] border-[#13b6ec]'
                                                : 'bg-transparent border-[#557682]',
                                        ].join(' ')}
                                    >
                                        {checked && (
                                            <span className="material-symbols-outlined text-white" style={{ fontSize: 14 }}>
                                                check
                                            </span>
                                        )}
                                    </span>
                                    <span className="flex-1 truncate">
                                        <span className={checked ? 'text-white' : 'text-[#92bbc9]'}>
                                            {opt.label}
                                        </span>
                                        {opt.hint && (
                                            <span className="ml-1.5 text-[#557682] text-xs">{opt.hint}</span>
                                        )}
                                    </span>
                                </button>
                            );
                        })}
                    </div>
                </div>,
                document.body,
            )}
        </>
    );
}
