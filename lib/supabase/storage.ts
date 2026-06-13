import { createClient } from './client';

const STORAGE_BUCKET = 'photos';

// Gated por env var. Sem importar lib/photo-trace.ts (mantém boundary
// limpa entre storage e instrumentação). Build-time inlined → quando OFF,
// minifier elimina os blocos abaixo.
const PHOTO_TRACE_ENABLED = process.env.NEXT_PUBLIC_PHOTO_TRACE === 'on';

function inflightSet(file: File): void {
    if (!PHOTO_TRACE_ENABLED) return;
    try {
        localStorage.setItem('photo_trace:inflight', JSON.stringify({
            t: Date.now(),
            size: file.size,
            type: file.type,
        }));
    } catch { /* quota, modo privado, SSR */ }
}

function inflightClear(): void {
    if (!PHOTO_TRACE_ENABLED) return;
    try { localStorage.removeItem('photo_trace:inflight'); } catch { /* idem */ }
}

/**
 * @deprecated Bucket 'photos' é privado — usar getPhotoSignedUrl() em vez disso.
 */
export function getPhotoPublicUrl(filePath: string): string {
    const supabase = createClient();
    const { data } = supabase.storage.from(STORAGE_BUCKET).getPublicUrl(filePath);
    return data.publicUrl;
}

/** Gera uma signed URL válida por 1 hora para o bucket privado 'photos'. */
export async function getPhotoSignedUrl(filePath: string): Promise<string | null> {
    const supabase = createClient();
    const { data, error } = await supabase.storage
        .from(STORAGE_BUCKET)
        .createSignedUrl(filePath, 60 * 60); // 1h

    if (error) {
        console.error('[Storage SignedUrl Error]', error);
        return null;
    }

    return data?.signedUrl ?? null;
}

export async function uploadEvidencePhoto(
    file: File,
    restaurantId: string,
    executionId: string
): Promise<string> {
    const supabase = createClient();

    const extByMime: Record<string, string> = {
        'image/jpeg': 'jpg',
        'image/jpg': 'jpg',
        'image/png': 'png',
    };
    if (!extByMime[file.type]) {
        throw new Error('Apenas imagens em formato JPG ou PNG são aceitas.');
    }

    if (file.size > 10 * 1024 * 1024) {
        throw new Error('A imagem não pode exceder 10MB.');
    }

    const timestamp = new Date().getTime();
    // Extensão derivada do MIME validado (NÃO de file.name, que é controlável e
    // poderia conter '/' e escapar o prefixo restaurant_id do path).
    const extension = extByMime[file.type];
    const filename = `${timestamp}.${extension}`;
    const filePath = `${restaurantId}/${executionId}/${filename}`;

    inflightSet(file);
    let uploadResult;
    try {
        uploadResult = await supabase.storage
            .from(STORAGE_BUCKET)
            .upload(filePath, file, {
                cacheControl: '3600',
                upsert: false
            });
    } finally {
        inflightClear();
    }
    const { error: uploadError } = uploadResult;

    if (uploadError) {
        console.error('[Storage Upload Error]', uploadError);
        throw new Error(`Falha ao enviar foto: ${uploadError.message}`);
    }

    return filePath;
}
