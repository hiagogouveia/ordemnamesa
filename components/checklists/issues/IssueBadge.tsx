interface IssueBadgeProps {
    count: number;
    compact?: boolean;
    className?: string;
}

export function IssueBadge({ count, compact = false, className = "" }: IssueBadgeProps) {
    if (!count || count <= 0) return null;
    return (
        <span
            className={`inline-flex items-center gap-1 rounded-full bg-amber-500/15 text-amber-400 border border-amber-500/40 px-2 py-0.5 text-[11px] font-semibold ${className}`}
            title={`${count} ocorrência${count > 1 ? 's' : ''} aberta${count > 1 ? 's' : ''}`}
        >
            <span className="material-symbols-outlined text-[14px] leading-none">warning</span>
            {compact ? count : `${count} ocorrência${count > 1 ? 's' : ''}`}
        </span>
    );
}
