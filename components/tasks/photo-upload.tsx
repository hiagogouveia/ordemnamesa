'use client';

import React, { useRef, useState } from 'react';
import { uploadEvidencePhoto, getPhotoPublicUrl } from '@/lib/supabase/storage';

interface PhotoUploadProps {
    restaurantId: string;
    onUpload: (filePath: string, previewUrl: string) => void;
    existingFilePath?: string;
    disabled?: boolean;
}

export function PhotoUpload({ restaurantId, onUpload, existingFilePath, disabled = false }: PhotoUploadProps) {
    const inputRef = useRef<HTMLInputElement>(null);
    const [uploading, setUploading] = useState(false);
    const [error, setError] = useState<string | null>(null);
    const [previewUrl, setPreviewUrl] = useState<string | null>(
        existingFilePath ? getPhotoPublicUrl(existingFilePath) : null
    );

    const handleFileChange = async (e: React.ChangeEvent<HTMLInputElement>) => {
        const file = e.target.files?.[0];
        if (!file) return;

        setError(null);
        setUploading(true);

        try {
            // Gera um ID único para o caminho do arquivo no storage
            const uploadId = crypto.randomUUID();
            const filePath = await uploadEvidencePhoto(file, restaurantId, uploadId);
            const publicUrl = getPhotoPublicUrl(filePath);
            setPreviewUrl(publicUrl);
            onUpload(filePath, publicUrl);
        } catch (err) {
            setError(err instanceof Error ? err.message : 'Erro ao enviar foto.');
        } finally {
            setUploading(false);
            // Limpar o input para permitir reenvio do mesmo arquivo
            if (inputRef.current) inputRef.current.value = '';
        }
    };

    return (
        <div className="flex flex-col gap-2 mt-2">
            {/* Preview da foto */}
            {previewUrl && (
                <div className="relative w-full rounded-xl overflow-hidden border border-[#233f48] bg-[#0a1215]">
                    {/* eslint-disable-next-line @next/next/no-img-element */}
                    <img
                        src={previewUrl}
                        alt="Foto da tarefa"
                        className="w-full max-h-48 object-cover"
                    />
                    {!disabled && (
                        <button
                            type="button"
                            onClick={() => inputRef.current?.click()}
                            className="absolute top-2 right-2 bg-[#1a2c32]/90 border border-[#233f48] text-white text-xs font-semibold px-2 py-1 rounded-lg flex items-center gap-1 active:scale-95 transition-transform"
                        >
                            <span className="material-symbols-outlined text-[14px]">photo_camera</span>
                            Substituir
                        </button>
                    )}
                </div>
            )}

            {/* Botão de upload */}
            {!disabled && (
                <button
                    type="button"
                    onClick={() => inputRef.current?.click()}
                    disabled={uploading}
                    className={`
                        w-full flex items-center justify-center gap-2 px-4 py-3 rounded-xl border text-sm font-semibold
                        transition-all duration-200 active:scale-[0.98]
                        ${previewUrl
                            ? 'border-[#13b6ec]/30 bg-[#13b6ec]/10 text-[#13b6ec]'
                            : 'border-amber-500/30 bg-amber-500/10 text-amber-400'
                        }
                        disabled:opacity-60 disabled:cursor-not-allowed
                    `}
                >
                    {uploading ? (
                        <>
                            <span className="material-symbols-outlined animate-spin text-[16px]">progress_activity</span>
                            Enviando...
                        </>
                    ) : (
                        <>
                            <span className="material-symbols-outlined text-[16px]">photo_camera</span>
                            {previewUrl ? 'Foto adicionada — substituir' : 'Adicionar foto'}
                        </>
                    )}
                </button>
            )}

            {/* Erro */}
            {error && (
                <p className="text-red-400 text-xs font-semibold flex items-center gap-1">
                    <span className="material-symbols-outlined text-[14px]">error</span>
                    {error}
                </p>
            )}

            {/* Input oculto — capture="environment" abre câmera no mobile, ignorado no desktop */}
            <input
                ref={inputRef}
                type="file"
                accept="image/*"
                capture="environment"
                className="hidden"
                onChange={handleFileChange}
                disabled={uploading || disabled}
            />
        </div>
    );
}
