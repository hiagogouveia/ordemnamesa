"use client";

interface ChecklistHeaderProps {
    searchQuery: string;
    onSearchChange: (q: string) => void;
    showFilters: boolean;
    onToggleFilters: () => void;
    view: "list" | "board";
    onViewChange: (v: "list" | "board") => void;
    onNewChecklist: () => void;
}

export function ChecklistHeader({
    searchQuery,
    onSearchChange,
    showFilters,
    onToggleFilters,
    view,
    onViewChange,
    onNewChecklist,
}: ChecklistHeaderProps) {
    return (
        <div className="shrink-0 px-4 pt-4 pb-3 border-b border-[#233f48] bg-[#0a1215]">
            {/* Busca + Filtros + Toggle de visualização + Nova lista */}
            <div className="flex items-center gap-2">
                {/* Search */}
                <div className="flex-1 relative">
                    <span className="material-symbols-outlined absolute left-2.5 top-1/2 -translate-y-1/2 text-[#325a67] text-[18px] pointer-events-none">
                        search
                    </span>
                    <input
                        type="text"
                        placeholder="Buscar por nome..."
                        value={searchQuery}
                        onChange={(e) => onSearchChange(e.target.value)}
                        className="w-full bg-[#16262c] border border-[#233f48] rounded-lg pl-8 pr-3 py-2 text-sm text-white placeholder-[#325a67] focus:outline-none focus:border-[#13b6ec] transition-colors"
                    />
                    {searchQuery && (
                        <button
                            onClick={() => onSearchChange("")}
                            className="absolute right-2.5 top-1/2 -translate-y-1/2 text-[#325a67] hover:text-white"
                        >
                            <span className="material-symbols-outlined text-[16px]">close</span>
                        </button>
                    )}
                </div>

                {/* Filtros toggle */}
                <button
                    onClick={onToggleFilters}
                    className={`flex items-center gap-1 px-3 py-2 rounded-lg border text-xs font-bold transition-colors ${
                        showFilters
                            ? "bg-[#13b6ec]/20 border-[#13b6ec]/40 text-[#13b6ec]"
                            : "bg-[#16262c] border-[#233f48] text-[#92bbc9] hover:text-white"
                    }`}
                >
                    <span className="material-symbols-outlined text-[16px]">filter_list</span>
                    Filtros
                </button>

                {/* View toggle */}
                <div className="flex bg-[#16262c] border border-[#233f48] rounded-lg p-0.5">
                    <button
                        onClick={() => onViewChange("list")}
                        title="Modo Lista"
                        className={`flex items-center gap-1 px-2.5 py-1.5 rounded-md text-xs font-bold transition-all ${
                            view === "list"
                                ? "bg-[#233f48] text-[#13b6ec]"
                                : "text-[#92bbc9] hover:text-white"
                        }`}
                    >
                        <span className="material-symbols-outlined text-[16px]">view_list</span>
                        <span className="hidden sm:inline">Lista</span>
                    </button>
                    <button
                        onClick={() => onViewChange("board")}
                        title="Modo Cards"
                        className={`flex items-center gap-1 px-2.5 py-1.5 rounded-md text-xs font-bold transition-all ${
                            view === "board"
                                ? "bg-[#233f48] text-[#13b6ec]"
                                : "text-[#92bbc9] hover:text-white"
                        }`}
                    >
                        <span className="material-symbols-outlined text-[16px]">view_column</span>
                        <span className="hidden sm:inline">Cards</span>
                    </button>
                </div>

                {/* Nova lista */}
                <button
                    onClick={onNewChecklist}
                    className="flex items-center gap-1.5 bg-[#13b6ec] hover:bg-[#0ea5d4] text-[#0a1215] font-bold text-xs px-3 py-2 rounded-lg transition-colors shrink-0"
                >
                    <span className="material-symbols-outlined text-[16px]">add</span>
                    <span className="hidden sm:inline">Nova lista</span>
                </button>
            </div>
        </div>
    );
}
