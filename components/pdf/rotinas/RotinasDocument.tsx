import { Document, Page, Text, View } from "@react-pdf/renderer";
import type { RotinasDocumentData } from "@/lib/pdf/rotinas/format";
import { PdfLogo, styles } from "./pdf-primitives";
import { RoutineSection } from "./RoutineSection";

/**
 * Documento raiz do PDF "Rotinas Operacionais".
 * - Cabeçalho fixo no topo do fluxo (logo + nome + título + metadados).
 * - Cada rotina é uma seção com quebra automática de página.
 * - Rodapé `fixed` repetido em todas as páginas com "Página X de Y".
 */
function DocumentFooter() {
    return (
        <View style={styles.footer} fixed>
            <Text style={styles.footerText}>
                Documento gerado automaticamente pelo Ordem na Mesa
            </Text>
            <Text
                style={styles.footerText}
                render={({ pageNumber, totalPages }) =>
                    `Página ${pageNumber} de ${totalPages}`
                }
            />
        </View>
    );
}

export function RotinasDocument({ data }: { data: RotinasDocumentData }) {
    const routineLabel =
        data.routineCount === 1 ? "1 rotina" : `${data.routineCount} rotinas`;

    return (
        <Document
            title="Rotinas Operacionais"
            author={data.exportedBy}
            creator="Ordem na Mesa"
            producer="Ordem na Mesa"
        >
            <Page size="A4" style={styles.page}>
                {/* Cabeçalho */}
                <View style={styles.header}>
                    {data.logoDataUrl ? <PdfLogo src={data.logoDataUrl} /> : null}
                    <View style={styles.headerTextWrap}>
                        <Text style={styles.restaurantName}>{data.restaurantName}</Text>
                        <Text style={styles.docTitle}>Rotinas Operacionais</Text>
                    </View>
                </View>
                <View style={styles.accentRule} />
                <View style={styles.metaRow}>
                    <View style={styles.metaItem}>
                        <Text style={styles.metaLabel}>Gerado em:</Text>
                        <Text style={styles.metaValue}>{data.generatedAt}</Text>
                    </View>
                    <View style={styles.metaItem}>
                        <Text style={styles.metaLabel}>Quantidade:</Text>
                        <Text style={styles.metaValue}>{routineLabel}</Text>
                    </View>
                    <View style={styles.metaItem}>
                        <Text style={styles.metaLabel}>Exportado por:</Text>
                        <Text style={styles.metaValue}>{data.exportedBy}</Text>
                    </View>
                </View>

                {/* Corpo */}
                {data.routines.map((routine, i) => (
                    <RoutineSection key={`${routine.name}-${i}`} routine={routine} />
                ))}

                <DocumentFooter />
            </Page>
        </Document>
    );
}
