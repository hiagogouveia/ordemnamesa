/**
 * Janela de retenção das fotos de evidência, em dias. Parametrizável via env
 * `PHOTO_RETENTION_DAYS` (default 60 = ~2 meses). Único ponto de verdade — não
 * espalhar o número pelo código. Usado pelo job photo-retention do worker.
 */
const DEFAULT_RETENTION_DAYS = 60;

const parsed = Number(process.env.PHOTO_RETENTION_DAYS);
export const PHOTO_RETENTION_DAYS =
    Number.isFinite(parsed) && parsed > 0 ? Math.floor(parsed) : DEFAULT_RETENTION_DAYS;

/**
 * Janela de retenção do HISTÓRICO de execução (task_executions / checklist_assumptions /
 * task_issues), em dias. Parametrizável via env `HISTORY_RETENTION_DAYS` (default 60). Usado pela
 * job history-retention (worker) para evitar crescimento indefinido do banco. NUNCA remove
 * definições de rotina nem recebimentos — apenas o histórico além do período.
 */
const parsedHistory = Number(process.env.HISTORY_RETENTION_DAYS);
export const HISTORY_RETENTION_DAYS =
    Number.isFinite(parsedHistory) && parsedHistory > 0 ? Math.floor(parsedHistory) : DEFAULT_RETENTION_DAYS;
