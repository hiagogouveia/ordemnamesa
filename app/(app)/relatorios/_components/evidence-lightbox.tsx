'use client';

import { useEffect } from 'react';
import { createPortal } from 'react-dom';

interface Props {
    src: string;
    title?: string;
    caption?: string;
    onClose: () => void;
}

export function EvidenceLightbox({ src, title, caption, onClose }: Props) {
    useEffect(() => {
        function onEsc(e: KeyboardEvent) {
            if (e.key === 'Escape') onClose();
        }
        window.addEventListener('keydown', onEsc);
        const previousOverflow = document.body.style.overflow;
        document.body.style.overflow = 'hidden';
        return () => {
            window.removeEventListener('keydown', onEsc);
            document.body.style.overflow = previousOverflow;
        };
    }, [onClose]);

    return createPortal(
        <div
            className="fixed inset-0 z-[60] flex items-center justify-center p-4 bg-black/85 backdrop-blur-sm"
            onClick={onClose}
            role="dialog"
            aria-modal="true"
            aria-label="Visualização de evidência"
        >
            <div
                className="relative w-full max-w-3xl flex flex-col gap-3"
                onClick={e => e.stopPropagation()}
            >
                <button
                    onClick={onClose}
                    type="button"
                    aria-label="Fechar"
                    className="absolute -top-3 -right-3 size-9 flex items-center justify-center rounded-full bg-[#1a2c32] border border-[#325a67] text-[#92bbc9] hover:text-white hover:bg-[#233f48] transition-colors z-10"
                >
                    <span className="material-symbols-outlined" style={{ fontSize: 18 }}>close</span>
                </button>
                <div
                    className="rounded-xl overflow-hidden bg-black/40 flex items-center justify-center"
                    style={{ maxHeight: '78vh', minHeight: 200 }}
                >
                    {/* eslint-disable-next-line @next/next/no-img-element */}
                    <img
                        src={src}
                        alt={title ?? 'Evidência'}
                        className="max-w-full max-h-[78vh] object-contain"
                    />
                </div>
                {(title || caption) && (
                    <div className="bg-[#16262c] border border-[#325a67] rounded-xl px-4 py-3">
                        {title && <p className="text-white font-semibold">{title}</p>}
                        {caption && <p className="text-[#92bbc9] text-sm mt-0.5">{caption}</p>}
                    </div>
                )}
            </div>
        </div>,
        document.body,
    );
}
