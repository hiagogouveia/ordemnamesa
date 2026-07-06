import { Document, Page, Text, View, Image, StyleSheet } from "@react-pdf/renderer";
import type { AuditDocumentData, AuditReportData } from "@/lib/pdf/auditoria/format";

/**
 * Documento raiz do PDF de auditoria em lote.
 * - UM Document, UM blob (sem PDFs intermediários — §4 do plano).
 * - Cada relatório é uma `<Page>` própria → quebra de página garantida por
 *   relatório; conteúdo longo flui para páginas físicas extras automaticamente.
 * - Rodapé `fixed` por página com a trilha auditável (§7): data/hora da geração,
 *   usuário exportador, ID da execução e identificador único do documento.
 *
 * Porta o layout de `app/imprimir/relatorios/[id]` para primitivas react-pdf,
 * mantendo `AuditExecutionDetail` como fonte única de dados.
 */

const c = {
    ink: "#0f172a",
    text: "#1f2d33",
    slate500: "#64748b",
    slate600: "#475569",
    slate300: "#cbd5e1",
    hair: "#e2e8f0",
    surface: "#f1f5f9",
    white: "#ffffff",
    amber: "#a16207",
    amberBg: "#fef3c7",
    amberBorder: "#fcd34d",
    red: "#b91c1c",
    redBg: "#fee2e2",
    redBorder: "#fca5a5",
} as const;

const styles = StyleSheet.create({
    page: {
        paddingTop: 36,
        paddingBottom: 54,
        paddingHorizontal: 40,
        fontFamily: "Helvetica",
        fontSize: 9.5,
        color: c.text,
    },
    header: { flexDirection: "row", justifyContent: "space-between", alignItems: "flex-start", borderBottomWidth: 2, borderBottomColor: c.ink, paddingBottom: 10 },
    headerLeft: { flexDirection: "row", alignItems: "center", flex: 1 },
    logo: { width: 40, height: 40, marginRight: 12, objectFit: "contain" },
    brandLabel: { fontSize: 7.5, color: c.slate500, fontFamily: "Helvetica-Bold", letterSpacing: 1, textTransform: "uppercase" },
    docTitle: { fontSize: 16, fontFamily: "Helvetica-Bold", color: c.ink, marginTop: 2 },
    checklistName: { fontSize: 9.5, color: c.slate600, marginTop: 2 },
    headerRight: { alignItems: "flex-end", width: 170 },
    hrLine: { fontSize: 8.5, color: c.slate500, marginTop: 1, textAlign: "right" },
    hrStrong: { fontFamily: "Helvetica-Bold", color: c.text },

    metaGrid: { flexDirection: "row", flexWrap: "wrap", marginTop: 12 },
    metaItem: { width: "25%", marginBottom: 6 },
    metaItemHalf: { width: "50%", marginBottom: 6 },
    metaLabel: { fontSize: 7, color: c.slate500, fontFamily: "Helvetica-Bold", textTransform: "uppercase", letterSpacing: 0.4 },
    metaValue: { fontSize: 9.5, color: c.ink, fontFamily: "Helvetica-Bold", marginTop: 1 },

    box: { marginTop: 14, borderWidth: 1, borderRadius: 5, padding: 10 },
    boxTitle: { fontSize: 8, fontFamily: "Helvetica-Bold", textTransform: "uppercase", letterSpacing: 0.5, marginBottom: 3 },
    boxText: { fontSize: 9 },
    issueItem: { borderTopWidth: 0.6, borderTopColor: "#00000015", paddingTop: 5, marginTop: 5 },
    issueHead: { flexDirection: "row", justifyContent: "space-between" },
    issueTitle: { fontFamily: "Helvetica-Bold", fontSize: 9 },
    issueStatus: { fontSize: 7.5, textTransform: "uppercase" },
    issueMeta: { fontSize: 7.5, color: c.slate500, marginTop: 1 },

    sectionTitle: { fontSize: 11, fontFamily: "Helvetica-Bold", color: c.ink, marginTop: 18, marginBottom: 6, borderBottomWidth: 1, borderBottomColor: c.hair, paddingBottom: 3 },

    table: { borderWidth: 1, borderColor: c.slate300, borderRadius: 3 },
    tr: { flexDirection: "row", borderBottomWidth: 1, borderBottomColor: c.slate300 },
    trLast: { flexDirection: "row" },
    thead: { backgroundColor: c.surface },
    th: { fontSize: 7.5, fontFamily: "Helvetica-Bold", color: c.slate600, textTransform: "uppercase", letterSpacing: 0.3, paddingVertical: 4, paddingHorizontal: 6 },
    td: { fontSize: 8.5, paddingVertical: 4, paddingHorizontal: 6, color: c.text },
    colIdx: { width: "6%" },
    colItem: { width: "40%" },
    colStatus: { width: "17%", textAlign: "center" },
    colTime: { width: "13%", textAlign: "center" },
    colObs: { width: "24%" },
    taskTitle: { fontFamily: "Helvetica-Bold", color: c.ink, fontSize: 8.5 },
    taskDesc: { fontSize: 7.5, color: c.slate500, marginTop: 1 },
    critical: { fontSize: 7, color: c.red, fontFamily: "Helvetica-Bold" },
    statusPill: { fontSize: 7, fontFamily: "Helvetica-Bold", textTransform: "uppercase", borderRadius: 3, paddingHorizontal: 4, paddingVertical: 2, alignSelf: "center" },

    evGrid: { flexDirection: "row", flexWrap: "wrap", marginTop: 4 },
    evFigure: { width: "33.33%", padding: 4 },
    evImgWrap: { borderWidth: 1, borderColor: c.slate300, borderRadius: 3, padding: 3 },
    evImg: { width: "100%", height: 96, objectFit: "cover" },
    evCaption: { fontSize: 7, color: c.slate600, marginTop: 2 },

    noticeBox: { marginTop: 16, borderWidth: 1, borderColor: c.slate300, backgroundColor: c.surface, borderRadius: 5, padding: 10 },
    noticeStrong: { fontSize: 9, fontFamily: "Helvetica-Bold", color: c.ink },
    noticeText: { fontSize: 7.5, color: c.slate600, marginTop: 2 },

    footerRule: { position: "absolute", bottom: 32, left: 40, right: 40, height: 0, borderTopWidth: 1, borderTopColor: c.hair },
    footerText: { position: "absolute", bottom: 18, left: 40, right: 40, fontSize: 6.5, color: c.slate500 },
    footerPage: { position: "absolute", bottom: 18, left: 0, right: 0, paddingRight: 40, textAlign: "right", fontSize: 6.5, color: c.slate500 },
});

function ReportPage({ report, doc }: { report: AuditReportData; doc: AuditDocumentData }) {
    return (
        <Page size="A4" style={styles.page}>
            {/* Cabeçalho */}
            <View style={styles.header}>
                <View style={styles.headerLeft}>
                    {doc.logoDataUrl ? (
                        // eslint-disable-next-line jsx-a11y/alt-text
                        <Image src={doc.logoDataUrl} style={styles.logo} />
                    ) : null}
                    <View style={{ flex: 1 }}>
                        <Text style={styles.brandLabel}>{doc.restaurantName}</Text>
                        <Text style={styles.docTitle}>Relatório oficial de auditoria</Text>
                        <Text style={styles.checklistName}>{report.checklistName}</Text>
                    </View>
                </View>
                <View style={styles.headerRight}>
                    <Text style={styles.hrLine}>
                        <Text style={styles.hrStrong}>Status: </Text>{report.statusLabel.toUpperCase()}
                    </Text>
                    {report.hadImpediment && report.statusLabel !== "Com impedimento" ? (
                        <Text style={styles.hrLine}>(teve impedimento)</Text>
                    ) : null}
                    <Text style={styles.hrLine}>
                        <Text style={styles.hrStrong}>Data: </Text>{report.dateLabel}
                    </Text>
                    {report.unitName ? (
                        <Text style={styles.hrLine}>
                            <Text style={styles.hrStrong}>Unidade: </Text>{report.unitName}
                        </Text>
                    ) : null}
                </View>
            </View>

            {/* Metadados */}
            <View style={styles.metaGrid}>
                {report.metaTop.map((m, i) => (
                    <View key={i} style={styles.metaItem}>
                        <Text style={styles.metaLabel}>{m.label}</Text>
                        <Text style={styles.metaValue}>{m.value}</Text>
                    </View>
                ))}
                {report.metaTimes.map((m, i) => (
                    <View key={i} style={styles.metaItemHalf}>
                        <Text style={styles.metaLabel}>{m.label}</Text>
                        <Text style={styles.metaValue}>{m.value}</Text>
                    </View>
                ))}
            </View>

            {/* Ocorrências */}
            {report.issuesTitle ? (
                <View
                    style={[
                        styles.box,
                        {
                            borderColor: report.isImpediment ? c.redBorder : c.amberBorder,
                            backgroundColor: report.isImpediment ? c.redBg : c.amberBg,
                        },
                    ]}
                >
                    <Text style={[styles.boxTitle, { color: report.isImpediment ? c.red : c.amber }]}>
                        {report.issuesTitle}
                    </Text>
                    {report.issuesLead ? (
                        <Text style={[styles.boxText, { color: report.isImpediment ? c.red : c.amber }]}>
                            {report.issuesLead}
                        </Text>
                    ) : null}
                    {report.issues.map((issue, i) => (
                        <View key={i} style={styles.issueItem}>
                            <View style={styles.issueHead}>
                                <Text style={styles.issueTitle}>{issue.taskTitle}</Text>
                                <Text style={styles.issueStatus}>{issue.statusLabel}</Text>
                            </View>
                            <Text style={styles.boxText}>{issue.description}</Text>
                            <Text style={styles.issueMeta}>{issue.reporterLine}</Text>
                            {issue.managerComment ? (
                                <Text style={styles.boxText}>Gestor: {issue.managerComment}</Text>
                            ) : null}
                        </View>
                    ))}
                </View>
            ) : null}

            {/* Observação da conclusão */}
            {report.impedimentReason ? (
                <View style={[styles.box, { borderColor: c.slate300, backgroundColor: c.surface }]}>
                    <Text style={[styles.boxTitle, { color: c.slate600 }]}>Observação registrada na conclusão</Text>
                    <Text style={styles.boxText}>{report.impedimentReason}</Text>
                </View>
            ) : null}

            {/* Rotina sem detalhamento */}
            {report.finalizedWithoutDetail ? (
                <View style={styles.noticeBox}>
                    <Text style={styles.noticeStrong}>Esta rotina foi finalizada sem detalhamento de tarefas.</Text>
                    <Text style={styles.noticeText}>
                        A conclusão foi registrada pelo responsável sem marcar cada item individualmente.
                        Status, horários e responsável da finalização constam acima neste documento.
                    </Text>
                </View>
            ) : null}

            {/* Itens inspecionados */}
            {report.hasTaskDetail ? (
                <View>
                    <Text style={styles.sectionTitle}>Itens inspecionados</Text>
                    <View style={styles.table}>
                        <View style={[styles.tr, styles.thead]}>
                            <Text style={[styles.th, styles.colIdx]}>#</Text>
                            <Text style={[styles.th, styles.colItem]}>Item verificado</Text>
                            <Text style={[styles.th, styles.colStatus]}>Status</Text>
                            <Text style={[styles.th, styles.colTime]}>Horário</Text>
                            <Text style={[styles.th, styles.colObs]}>Observação</Text>
                        </View>
                        {report.tasks.map((t, i) => {
                            const last = i === report.tasks.length - 1;
                            return (
                                <View key={i} style={last ? styles.trLast : styles.tr} wrap={false}>
                                    <Text style={[styles.td, styles.colIdx, { color: c.slate500 }]}>{t.index}</Text>
                                    <View style={[styles.td, styles.colItem]}>
                                        <Text style={styles.taskTitle}>
                                            {t.title}
                                            {t.isCritical ? <Text style={styles.critical}>  (crítica)</Text> : null}
                                        </Text>
                                        {t.description ? <Text style={styles.taskDesc}>{t.description}</Text> : null}
                                    </View>
                                    <View style={[styles.td, styles.colStatus]}>
                                        <Text style={[styles.statusPill, { backgroundColor: t.statusBg, color: t.statusColor }]}>
                                            {t.statusLabel}
                                        </Text>
                                    </View>
                                    <Text style={[styles.td, styles.colTime, { color: c.slate600 }]}>{t.time}</Text>
                                    <View style={[styles.td, styles.colObs]}>
                                        {t.ratingStars ? (
                                            <Text style={{ color: c.ink }}>{t.ratingStars} ({t.ratingValue}/5)</Text>
                                        ) : null}
                                        {t.observation ? <Text style={{ color: c.slate600 }}>{t.observation}</Text> : null}
                                        {t.impedimentReason ? (
                                            <Text style={{ color: "#c2410c", marginTop: 1 }}>Impedimento: {t.impedimentReason}</Text>
                                        ) : null}
                                        {!t.ratingStars && !t.observation && !t.impedimentReason ? (
                                            <Text style={{ color: c.slate300 }}>—</Text>
                                        ) : null}
                                    </View>
                                </View>
                            );
                        })}
                    </View>
                </View>
            ) : null}

            {/* Evidências fotográficas (só no modo Completo) */}
            {report.evidences.length > 0 ? (
                <View>
                    <Text style={styles.sectionTitle}>Evidências fotográficas</Text>
                    <View style={styles.evGrid}>
                        {report.evidences.map((ev, i) => (
                            <View key={i} style={styles.evFigure} wrap={false}>
                                <View style={styles.evImgWrap}>
                                    {/* eslint-disable-next-line jsx-a11y/alt-text */}
                                    <Image src={ev.dataUrl} style={styles.evImg} />
                                </View>
                                <Text style={styles.evCaption}>
                                    {ev.caption}{ev.sub ? ` · ${ev.sub}` : ""}
                                </Text>
                            </View>
                        ))}
                    </View>
                </View>
            ) : null}

            {/* Rodapé auditável (§7) */}
            <View style={styles.footerRule} fixed />
            <Text
                style={styles.footerText}
                fixed
                render={() =>
                    `Relatório auditável · Ordem na Mesa  |  Execução ${report.assumptionId}  |  Doc ${report.documentUuid}  |  Exportado por ${doc.exportedBy} em ${doc.generatedAt}`
                }
            />
            <Text
                style={styles.footerPage}
                fixed
                render={({ pageNumber, totalPages }) => `${pageNumber}/${totalPages}`}
            />
        </Page>
    );
}

export function AuditoriaDocument({ data }: { data: AuditDocumentData }) {
    return (
        <Document
            title="Relatórios de Auditoria"
            author={data.exportedBy}
            creator="Ordem na Mesa"
            producer="Ordem na Mesa"
        >
            {data.reports.map((report) => (
                <ReportPage key={report.documentUuid} report={report} doc={data} />
            ))}
        </Document>
    );
}
