import { Document, Page, Text, View } from "@react-pdf/renderer";
import type { RotinasDocumentData } from "@/lib/pdf/rotinas/format";
import { PdfFooterLogo, PdfLogo, styles } from "./pdf-primitives";
import { RoutineSection } from "./RoutineSection";

/**
 * Documento raiz do PDF "Rotinas Operacionais".
 * - Cabeçalho fixo no topo do fluxo (logo + nome + título + metadados).
 * - Cada rotina é uma seção com quebra automática de página.
 * - Rodapé `fixed` repetido em todas as páginas com "Página X de Y".
 *
 * O rodapé é renderizado INLINE (não como subcomponente): o `render` dinâmico
 * de `pageNumber` só é reavaliado por página quando o nó `fixed` é descendente
 * direto da `<Page>` — através de uma fronteira de componente o callback não
 * dispara e o número de página some.
 */
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

                {/* Rodapé fixo (inline — ver nota acima) */}
                <View style={styles.footerRule} fixed />
                <View style={styles.footerLeft} fixed>
                    {data.brandLogoDataUrl ? (
                        <PdfFooterLogo src={data.brandLogoDataUrl} />
                    ) : null}
                    <Text style={styles.footerText}>
                        Documento gerado automaticamente pelo Ordem na Mesa
                    </Text>
                </View>
                <Text
                    style={styles.footerPageText}
                    fixed
                    render={({ pageNumber, totalPages }) =>
                        `Página ${pageNumber} de ${totalPages}`
                    }
                />
            </Page>
        </Document>
    );
}
