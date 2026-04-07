import { createClient } from './client';

/**
 * @deprecated Bucket 'photos' é privado — usar getPhotoSignedUrl() em vez disso.
 */
export function getPhotoPublicUrl(filePath: string): string {
    const supabase = createClient();
    const { data } = supabase.storage.from('photos').getPublicUrl(filePath);
    return data.publicUrl;
}

/** Gera uma signed URL válida por 1 hora para o bucket privado 'photos'. */
export async function getPhotoSignedUrl(filePath: string): Promise<string | null> {
    const supabase = createClient();
    const { data, error } = await supabase.storage
        .from('photos')
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

    const validTypes = ['image/jpeg', 'image/jpg', 'image/png'];
    if (!validTypes.includes(file.type)) {
        throw new Error('Apenas imagens em formato JPG ou PNG são aceitas.');
    }

    if (file.size > 10 * 1024 * 1024) {
        throw new Error('A imagem não pode exceder 10MB.');
    }

    const timestamp = new Date().getTime();
    const extension = file.name.split('.').pop() || 'jpg';
    const filename = `${timestamp}.${extension}`;
    const filePath = `${restaurantId}/${executionId}/${filename}`;

    const { error: uploadError } = await supabase.storage
        .from('photos')
        .upload(filePath, file, {
            cacheControl: '3600',
            upsert: false
        });

    if (uploadError) {
        console.error('[Storage Upload Error]', uploadError);
        throw new Error(`Falha ao enviar foto: ${uploadError.message}`);
    }

    return filePath;
}
