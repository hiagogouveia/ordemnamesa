'use client';

/**
 * /debug/photo-trace — inspeção manual do localStorage da instrumentação.
 *
 * Cliente puro. Lê 4 chaves de localStorage e exibe o conteúdo em JSON.
 * Botão "Copiar JSON" → clipboard. Botão "Enviar agora" → POST manual
 * pro endpoint /api/photo-trace (fluxo de fallback se sendBeacon falhar).
 *
 * Nenhum dado de outro usuário é acessado — só o localStorage do
 * próprio device. Página marcada noindex.
 */

import { useEffect, useState } from 'react';

type SnapshotData = {
    cur: unknown;
    prev: unknown;
    hb: string | null;
    inflight: unknown;
};

function readLS(key: string): string | null {
    try { return localStorage.getItem(key); } catch { return null; }
}

function tryParse(raw: string | null): unknown {
    if (!raw) return null;
    try { return JSON.parse(raw); } catch { return raw; }
}

export default function PhotoTraceDebugPage() {
    const [data, setData] = useState<SnapshotData | null>(null);
    const [status, setStatus] = useState<string>('');

    useEffect(() => {
        setData({
            cur: tryParse(readLS('photo_trace:cur')),
            prev: tryParse(readLS('photo_trace:prev')),
            hb: readLS('photo_trace:hb'),
            inflight: tryParse(readLS('photo_trace:inflight')),
        });
    }, []);

    const json = data ? JSON.stringify(data, null, 2) : '...';

    const copy = async () => {
        try {
            await navigator.clipboard.writeText(json);
            setStatus('copiado');
        } catch {
            setStatus('falha ao copiar');
        }
    };

    const send = async () => {
        if (!data) return;
        const bcs = Array.isArray(data.cur) ? data.cur : Array.isArray(data.prev) ? data.prev : [];
        const first = (Array.isArray(bcs) && bcs[0] && typeof bcs[0] === 'object' && 's' in (bcs[0] as object))
            ? String((bcs[0] as { s: unknown }).s)
            : 'manual';
        try {
            const res = await fetch('/api/photo-trace', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    s: first,
                    ua: (navigator.userAgent ?? '').slice(0, 200),
                    reason: 'manual',
                    bcs,
                }),
            });
            setStatus(res.ok ? 'enviado' : `erro ${res.status}`);
        } catch {
            setStatus('erro de rede');
        }
    };

    return (
        <>
            <meta name="robots" content="noindex" />
            <main style={{ padding: 16, fontFamily: 'monospace', fontSize: 12, lineHeight: 1.4, maxWidth: '100vw' }}>
                <h1 style={{ fontSize: 14, fontWeight: 600, marginBottom: 8 }}>photo-trace · debug</h1>
                <div style={{ marginBottom: 12, display: 'flex', gap: 8, flexWrap: 'wrap' }}>
                    <button type="button" onClick={copy} style={btnStyle}>Copiar JSON</button>
                    <button type="button" onClick={send} style={btnStyle}>Enviar agora</button>
                    {status && <span style={{ alignSelf: 'center', color: '#888' }}>{status}</span>}
                </div>
                <pre style={preStyle}>{json}</pre>
            </main>
        </>
    );
}

const btnStyle: React.CSSProperties = {
    padding: '6px 12px',
    fontSize: 12,
    border: '1px solid #ccc',
    background: '#f6f6f6',
    cursor: 'pointer',
    borderRadius: 4,
};

const preStyle: React.CSSProperties = {
    background: '#f6f6f6',
    border: '1px solid #ddd',
    borderRadius: 4,
    padding: 12,
    fontSize: 11,
    overflow: 'auto',
    whiteSpace: 'pre-wrap',
    wordBreak: 'break-all',
    maxHeight: '70vh',
};
