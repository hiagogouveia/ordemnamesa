"use client"

import { createContext, useContext, useState, useCallback } from "react"
import { createPortal } from "react-dom"

interface BillingBlockInfo {
    reason: string
    message: string
}

interface BillingContextValue {
    showBillingBlock: (info: BillingBlockInfo) => void
}

const BillingContext = createContext<BillingContextValue>({
    showBillingBlock: () => {},
})

export function useBillingBlock() {
    return useContext(BillingContext)
}

function BillingBlockModal({ info, onClose }: { info: BillingBlockInfo; onClose: () => void }) {
    const isLimit = info.reason === "limit_reached"
    const isCanceled = info.reason === "canceled"

    return createPortal(
        <div
            className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/60 backdrop-blur-sm"
            onClick={onClose}
        >
            <div
                className="w-full max-w-sm bg-[#16262c] border border-[#233f48] rounded-2xl shadow-2xl p-6 flex flex-col gap-5"
                onClick={(e) => e.stopPropagation()}
            >
                <div className="flex items-center gap-3">
                    <div className={`w-10 h-10 rounded-full flex items-center justify-center shrink-0 ${isCanceled ? "bg-red-500/15" : "bg-amber-500/15"}`}>
                        <span className={`material-symbols-outlined text-xl ${isCanceled ? "text-red-400" : "text-amber-400"}`}>
                            {isLimit ? "workspace_premium" : "lock"}
                        </span>
                    </div>
                    <h3 className="text-base font-bold text-white">
                        {isLimit ? "Limite do plano atingido" : isCanceled ? "Conta desativada" : "Ação bloqueada"}
                    </h3>
                </div>

                <p className="text-sm text-[#92bbc9] leading-relaxed">{info.message}</p>

                <div className="flex flex-col gap-2">
                    <a
                        href="https://wa.me/5567991364767?text=Olá, preciso de ajuda com meu plano no Ordem na Mesa"
                        target="_blank"
                        rel="noopener noreferrer"
                        className="flex items-center justify-center gap-2 bg-[#13b6ec] text-[#101d22] px-4 py-2.5 rounded-lg font-semibold hover:bg-white transition-colors text-sm"
                    >
                        <span className="material-symbols-outlined text-[18px]">chat</span>
                        Fale com o suporte
                    </a>
                    <button
                        onClick={onClose}
                        className="text-sm text-[#92bbc9] hover:text-white transition-colors py-2"
                    >
                        Fechar
                    </button>
                </div>
            </div>
        </div>,
        document.body
    )
}

export function BillingProvider({ children }: { children: React.ReactNode }) {
    const [blockInfo, setBlockInfo] = useState<BillingBlockInfo | null>(null)

    const showBillingBlock = useCallback((info: BillingBlockInfo) => {
        setBlockInfo(info)
    }, [])

    return (
        <BillingContext.Provider value={{ showBillingBlock }}>
            {children}
            {blockInfo && (
                <BillingBlockModal info={blockInfo} onClose={() => setBlockInfo(null)} />
            )}
        </BillingContext.Provider>
    )
}
