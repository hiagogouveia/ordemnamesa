export function UnitBadge({ name }: { name: string }) {
    return (
        <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-medium bg-[#13b6ec]/10 text-[#13b6ec] border border-[#13b6ec]/30">
            <span className="material-symbols-outlined text-[12px]">storefront</span>
            {name}
        </span>
    );
}
