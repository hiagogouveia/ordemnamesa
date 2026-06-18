/**
 * Janela de retenção das fotos de evidência, em dias. Parametrizável via env
 * `PHOTO_RETENTION_DAYS` (default 60 = ~2 meses). Único ponto de verdade — não
 * espalhar o número pelo código. Usado pela rotina /api/cron/photo-retention.
 */
const DEFAULT_RETENTION_DAYS = 60;

const parsed = Number(process.env.PHOTO_RETENTION_DAYS);
export const PHOTO_RETENTION_DAYS =
    Number.isFinite(parsed) && parsed > 0 ? Math.floor(parsed) : DEFAULT_RETENTION_DAYS;
