"use client";

/* eslint-disable @next/next/no-img-element */

import { useCallback, useEffect, useRef, useState } from "react";
import { useAccountSessionStore } from "@/lib/store/account-session-store";
import { useRestaurantStore } from "@/lib/store/restaurant-store";
import { useUnits, type Unit } from "@/lib/hooks/use-units";
import {
    useAccountLogo,
    useUploadBrandLogo,
    useRemoveBrandLogo,
    type BrandingScope,
} from "@/lib/hooks/use-branding";
import { brandPublicUrl } from "@/lib/branding/storage";
import {
    normalizeLogo,
    formatBytes,
    LogoValidationError,
    ACCEPTED_MIME_TYPES,
    type NormalizedLogo,
} from "@/lib/branding/normalize";
import { BrandPreview } from "@/components/branding/brand-preview";
import { Modal } from "@/components/ui/modal";

/**
 * Sprint 93 — Aba "Marca": upload da logo por grupo e por filial.
 *
 * Owner-only (mesmo guard da aba Conta). A cascata exibida ao usuário é a mesma que
 * `lib/branding/resolve.ts` aplica em runtime: filial → grupo → Ordem na Mesa. Por
 * isso cada card de unidade sem logo própria mostra explicitamente de onde ela está
 * herdando — sem isso o owner não entende por que "não mudou nada".
 */

interface PendingUpload {
    scope: BrandingScope;
    targetId: string;
    targetName: string;
    normalized: NormalizedLogo;
}

export function MarcaTab() {
    const accountId = useAccountSessionStore((s) => s.accountId);
    const userRole = useRestaurantStore((s) => s.userRole);
    const isOwner = userRole === "owner";

    const { data: units = [], isLoading: unitsLoading } = useUnits(isOwner ? accountId : null);
    const { data: accountLogoPath } = useAccountLogo(isOwner ? accountId : null);

    const uploadLogo = useUploadBrandLogo();
    const removeLogo = useRemoveBrandLogo();

    const [pending, setPending] = useState<PendingUpload | null>(null);
    const [error, setError] = useState<string | null>(null);
    const [busyTarget, setBusyTarget] = useState<string | null>(null);

    // Object URLs da prévia precisam ser revogados — senão cada arquivo escolhido
    // deixa um blob preso na memória da aba até o reload.
    const revokeRef = useRef<string | null>(null);
    const releasePending = useCallback(() => {
        if (revokeRef.current) {
            URL.revokeObjectURL(revokeRef.current);
            revokeRef.current = null;
        }
        setPending(null);
    }, []);
    useEffect(() => () => {
        if (revokeRef.current) URL.revokeObjectURL(revokeRef.current);
    }, []);

    const isMultiUnit = units.length >= 2;

    const handleFile = useCallback(
        async (file: File, scope: BrandingScope, targetId: string, targetName: string) => {
            setError(null);
            setBusyTarget(targetId);
            try {
                const normalized = await normalizeLogo(file);
                if (revokeRef.current) URL.revokeObjectURL(revokeRef.current);
                revokeRef.current = normalized.previewUrl;
                setPending({ scope, targetId, targetName, normalized });
            } catch (e) {
                setError(
                    e instanceof LogoValidationError
                        ? e.message
                        : "Não foi possível processar a imagem. Tente outro arquivo."
                );
            } finally {
                setBusyTarget(null);
            }
        },
        []
    );

    const handleConfirm = useCallback(async () => {
        if (!pending || !accountId) return;
        setError(null);
        try {
            await uploadLogo.mutateAsync({
                scope: pending.scope,
                targetId: pending.targetId,
                accountId,
                normalized: pending.normalized,
            });
            releasePending();
        } catch (e) {
            setError(e instanceof Error ? e.message : "Falha ao salvar a logo.");
        }
    }, [pending, accountId, uploadLogo, releasePending]);

    const handleRemove = useCallback(
        async (scope: BrandingScope, targetId: string) => {
            setError(null);
            setBusyTarget(targetId);
            try {
                await removeLogo.mutateAsync({ scope, targetId });
            } catch (e) {
                setError(e instanceof Error ? e.message : "Falha ao remover a logo.");
            } finally {
                setBusyTarget(null);
            }
        },
        [removeLogo]
    );

    if (!isOwner) {
        return (
            <div className="flex items-center justify-center h-full min-h-[400px]">
                <div className="flex flex-col items-center justify-center max-w-sm text-center">
                    <div className="w-16 h-16 rounded-full bg-[#1a2c32] flex items-center justify-center mb-6">
                        <span className="material-symbols-outlined text-[#325a67] text-3xl">lock</span>
                    </div>
                    <h2 className="text-xl font-bold text-white mb-2">Acesso restrito</h2>
                    <p className="text-sm text-[#92bbc9]">
                        Apenas proprietários podem alterar a identidade visual.
                    </p>
                </div>
            </div>
        );
    }

    return (
        <div className="max-w-3xl">
            <div className="mb-8">
                <div className="flex items-center gap-3 mb-2">
                    <span className="material-symbols-outlined text-[#13b6ec] text-[22px]">palette</span>
                    <h2 className="text-lg font-bold text-white">Identidade visual</h2>
                </div>
                <p className="text-sm text-[#92bbc9]">
                    A logo enviada aparece no menu, no topo e nos relatórios em PDF da sua operação.
                    Onde não houver logo cadastrada, seguimos usando a marca do Ordem na Mesa.
                </p>
            </div>

            {error && (
                <div className="mb-6 rounded-xl border border-red-500/30 bg-red-500/10 p-4">
                    <p className="text-red-400 text-sm">{error}</p>
                </div>
            )}

            {unitsLoading ? (
                <div className="flex flex-col gap-3">
                    {[1, 2].map((i) => (
                        <div
                            key={i}
                            className="rounded-xl border border-[#233f48] bg-[#16262c] p-5 flex items-center gap-4 animate-pulse"
                        >
                            <div className="w-20 h-20 rounded-lg bg-[#233f48]" />
                            <div className="flex-1 flex flex-col gap-2">
                                <div className="h-4 bg-[#233f48] rounded w-1/3" />
                                <div className="h-3 bg-[#233f48] rounded w-1/4" />
                            </div>
                        </div>
                    ))}
                </div>
            ) : (
                <div className="flex flex-col gap-4">
                    {/* Logo do grupo — só faz sentido com 2+ unidades. Com uma unidade só,
                        dois campos de logo confundiriam sem oferecer nada. */}
                    {isMultiUnit && accountId && (
                        <LogoCard
                            title="Logo do grupo"
                            subtitle="Usada pelas filiais que não tiverem logo própria."
                            icon="domain"
                            logoPath={accountLogoPath ?? null}
                            inheritedFrom={null}
                            busy={busyTarget === accountId}
                            onPick={(file) => handleFile(file, "account", accountId, "Grupo")}
                            onRemove={() => handleRemove("account", accountId)}
                        />
                    )}

                    {units.map((unit) => (
                        <LogoCard
                            key={unit.id}
                            title={unit.name}
                            subtitle={unit.is_primary ? "Unidade principal" : undefined}
                            icon="storefront"
                            logoPath={unit.logo_path ?? null}
                            inheritedFrom={
                                unit.logo_path
                                    ? null
                                    : isMultiUnit && accountLogoPath
                                        ? "grupo"
                                        : "plataforma"
                            }
                            busy={busyTarget === unit.id}
                            onPick={(file) => handleFile(file, "restaurant", unit.id, unit.name)}
                            onRemove={() => handleRemove("restaurant", unit.id)}
                        />
                    ))}
                </div>
            )}

            <p className="mt-6 text-xs text-[#5c7d89]">
                PNG, JPG ou WebP de até 5 MB. A imagem é recortada, redimensionada para 512px e
                convertida em PNG automaticamente — margens vazias em volta da arte são removidas.
            </p>

            <Modal
                isOpen={!!pending}
                onClose={releasePending}
                title="Confirmar nova logo"
                maxWidthClass="max-w-2xl"
            >
                {pending && (
                    <div className="flex flex-col gap-6">
                        <div>
                            <p className="text-sm text-[#92bbc9] mb-4">
                                Veja como a logo de <span className="text-white font-semibold">{pending.targetName}</span>{" "}
                                vai aparecer antes de salvar.
                            </p>
                            <BrandPreview
                                src={pending.normalized.previewUrl}
                                restaurantName={pending.targetName}
                            />
                        </div>

                        <div className="rounded-lg border border-[#233f48] bg-[#101d22] p-4">
                            <p className="text-xs font-semibold uppercase tracking-wider text-[#92bbc9] mb-2">
                                Informações da imagem
                            </p>
                            <div className="flex flex-wrap gap-x-6 gap-y-1 text-sm text-white">
                                <span>{pending.normalized.width} × {pending.normalized.height} px</span>
                                <span>{formatBytes(pending.normalized.bytes)}</span>
                                <span>PNG</span>
                            </div>
                            {pending.normalized.trimmed && (
                                <p className="mt-2 text-xs text-[#13b6ec]">
                                    Margens vazias em volta da arte foram removidas para a logo ocupar melhor o espaço.
                                </p>
                            )}
                        </div>

                        <div className="flex items-center justify-end gap-3">
                            <button
                                type="button"
                                onClick={releasePending}
                                disabled={uploadLogo.isPending}
                                className="px-4 py-2 text-sm text-[#92bbc9] hover:text-white transition-colors disabled:opacity-50"
                            >
                                Cancelar
                            </button>
                            <button
                                type="button"
                                onClick={handleConfirm}
                                disabled={uploadLogo.isPending}
                                className="px-4 py-2 rounded-lg bg-[#13b6ec] hover:bg-[#0fa3d4] text-[#101d22] text-sm font-bold transition-colors disabled:opacity-50"
                            >
                                {uploadLogo.isPending ? "Salvando..." : "Salvar logo"}
                            </button>
                        </div>
                    </div>
                )}
            </Modal>
        </div>
    );
}

interface LogoCardProps {
    title: string;
    subtitle?: string;
    icon: string;
    logoPath: string | null;
    /** Quando não há logo própria, de onde ela está sendo herdada. */
    inheritedFrom: "grupo" | "plataforma" | null;
    busy: boolean;
    onPick: (file: File) => void;
    onRemove: () => void;
}

function LogoCard({
    title,
    subtitle,
    icon,
    logoPath,
    inheritedFrom,
    busy,
    onPick,
    onRemove,
}: LogoCardProps) {
    const inputRef = useRef<HTMLInputElement>(null);
    const url = brandPublicUrl(logoPath);

    return (
        <div className="rounded-xl border border-[#233f48] bg-[#16262c] p-5 flex flex-col sm:flex-row sm:items-center gap-5">
            {/* Placa em fundo escuro real — a logo é julgada no contexto em que vai viver. */}
            <div className="w-20 h-20 shrink-0 rounded-lg border border-[#233f48] bg-[#111e22] flex items-center justify-center overflow-hidden p-2">
                {url ? (
                    <img src={url} alt={`Logo ${title}`} className="max-h-full max-w-full object-contain" />
                ) : (
                    <span className="material-symbols-outlined text-[#325a67] text-3xl">{icon}</span>
                )}
            </div>

            <div className="flex-1 min-w-0">
                <p className="text-white font-semibold truncate">{title}</p>
                {subtitle && <p className="text-[#92bbc9] text-xs mt-0.5">{subtitle}</p>}
                {inheritedFrom && (
                    <p className="text-[#5c7d89] text-xs mt-1">
                        {inheritedFrom === "grupo"
                            ? "Sem logo própria — usando a logo do grupo."
                            : "Sem logo própria — usando a marca Ordem na Mesa."}
                    </p>
                )}
            </div>

            <div className="flex items-center gap-2 shrink-0">
                <input
                    ref={inputRef}
                    type="file"
                    accept={ACCEPTED_MIME_TYPES.join(",")}
                    aria-label={`Selecionar arquivo de logo para ${title}`}
                    className="hidden"
                    onChange={(e) => {
                        const file = e.target.files?.[0];
                        // Zerar o value permite reescolher o MESMO arquivo depois de
                        // cancelar — sem isso o onChange não dispara na segunda vez.
                        e.target.value = "";
                        if (file) onPick(file);
                    }}
                />
                <button
                    type="button"
                    onClick={() => inputRef.current?.click()}
                    disabled={busy}
                    className="px-3 py-2 rounded-lg border border-[#233f48] text-sm text-white hover:border-[#13b6ec]/50 hover:bg-[#1a2c32] transition-colors disabled:opacity-50"
                >
                    {busy ? "Processando..." : url ? "Substituir" : "Enviar logo"}
                </button>
                {url && (
                    <button
                        type="button"
                        onClick={onRemove}
                        disabled={busy}
                        aria-label={`Remover logo de ${title}`}
                        className="p-2 rounded-lg border border-[#233f48] text-[#92bbc9] hover:text-red-400 hover:border-red-400/40 transition-colors disabled:opacity-50"
                    >
                        <span className="material-symbols-outlined text-[18px]">delete</span>
                    </button>
                )}
            </div>
        </div>
    );
}
