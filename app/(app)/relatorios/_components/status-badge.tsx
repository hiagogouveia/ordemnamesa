'use client';

import type { AuditStatus, AuditTaskStatus } from '@/lib/types/audit';
import { AUDIT_TASK_STATUS_LABEL } from '@/lib/types/audit';

interface StatusVisual {
    icon: string;
    text: string;
    bg: string;
    border: string;
}

const STATUS_VISUAL: Record<AuditTaskStatus, StatusVisual> = {
    completed: {
        icon: 'task_alt',
        text: 'text-[#0bda57]',
        bg: 'bg-[#0bda57]/10',
        border: 'border-[#0bda57]/20',
    },
    incomplete: {
        icon: 'pending',
        text: 'text-[#fbbf24]',
        bg: 'bg-[#fbbf24]/10',
        border: 'border-[#fbbf24]/20',
    },
    impediment: {
        icon: 'report_problem',
        text: 'text-[#fa5f38]',
        bg: 'bg-[#fa5f38]/10',
        border: 'border-[#fa5f38]/20',
    },
    pending: {
        icon: 'schedule',
        text: 'text-[#92bbc9]',
        bg: 'bg-slate-700/20',
        border: 'border-slate-600/20',
    },
};

interface StatusBadgeProps {
    status: AuditStatus | AuditTaskStatus;
    size?: 'sm' | 'md';
    iconOnly?: boolean;
}

export function StatusBadge({ status, size = 'md', iconOnly = false }: StatusBadgeProps) {
    const v = STATUS_VISUAL[status];
    const label = AUDIT_TASK_STATUS_LABEL[status];

    if (iconOnly) {
        return (
            <span
                className={`inline-flex items-center justify-center size-7 rounded-full ${v.bg} ${v.text} border ${v.border}`}
                title={label}
                aria-label={label}
            >
                <span className="material-symbols-outlined text-[16px]">{v.icon}</span>
            </span>
        );
    }

    const sizeCls = size === 'sm'
        ? 'px-2 py-0.5 text-[11px] gap-1'
        : 'px-2.5 py-1 text-xs gap-1.5';
    const iconSize = size === 'sm' ? 14 : 16;

    return (
        <span
            className={`inline-flex items-center font-semibold uppercase tracking-wide rounded-full border ${v.bg} ${v.text} ${v.border} ${sizeCls}`}
        >
            <span
                className="material-symbols-outlined"
                style={{ fontSize: `${iconSize}px` }}
            >
                {v.icon}
            </span>
            {label}
        </span>
    );
}
