import {
    StyleSheet,
    Text,
    View,
    Image,
    Svg,
    Path,
    Circle,
    Rect,
    Line,
} from "@react-pdf/renderer";
import type { PdfIconName, RoutineFieldRow, RoutineStep } from "@/lib/pdf/rotinas/format";

/**
 * Primitivos visuais do PDF de rotinas. Sem estado, sem lógica de negócio —
 * apenas apresentação. Paleta sóbria (cinza/preto) com a cor primária do
 * Ordem na Mesa apenas em detalhes, para continuar legível em P&B.
 */

export const theme = {
    primary: "#13b6ec",
    ink: "#101d22",
    text: "#1f2d33",
    muted: "#5f7178",
    faint: "#8a9aa1",
    hair: "#dce4e7",
    surface: "#f6f8f8",
    white: "#ffffff",
} as const;

export const styles = StyleSheet.create({
    page: {
        paddingTop: 40,
        paddingBottom: 56,
        paddingHorizontal: 40,
        fontFamily: "Helvetica",
        fontSize: 9.5,
        color: theme.text,
        lineHeight: 1.4,
    },
    // Cabeçalho
    header: {
        flexDirection: "row",
        alignItems: "center",
        marginBottom: 14,
    },
    logo: {
        width: 44,
        height: 44,
        marginRight: 14,
        objectFit: "contain",
    },
    headerTextWrap: { flex: 1 },
    restaurantName: {
        fontSize: 11,
        fontFamily: "Helvetica-Bold",
        color: theme.muted,
        letterSpacing: 0.3,
    },
    docTitle: {
        fontSize: 19,
        fontFamily: "Helvetica-Bold",
        color: theme.ink,
        marginTop: 1,
    },
    accentRule: {
        height: 2,
        backgroundColor: theme.primary,
        marginTop: 10,
        marginBottom: 8,
        borderRadius: 1,
    },
    metaRow: {
        flexDirection: "row",
        flexWrap: "wrap",
        marginBottom: 18,
    },
    metaItem: { flexDirection: "row", marginRight: 18, alignItems: "center" },
    metaLabel: { color: theme.faint, fontSize: 8.5 },
    metaValue: {
        color: theme.muted,
        fontSize: 8.5,
        fontFamily: "Helvetica-Bold",
        marginLeft: 3,
    },
    // Seção de rotina
    section: {
        marginBottom: 16,
        borderWidth: 1,
        borderColor: theme.hair,
        borderRadius: 6,
        padding: 14,
    },
    sectionHead: { flexDirection: "row", alignItems: "center", marginBottom: 2 },
    areaChip: {
        width: 7,
        height: 7,
        borderRadius: 2,
        marginRight: 6,
    },
    areaLabel: {
        fontSize: 8.5,
        color: theme.muted,
        fontFamily: "Helvetica-Bold",
        textTransform: "uppercase",
        letterSpacing: 0.4,
    },
    routineName: {
        fontSize: 13.5,
        fontFamily: "Helvetica-Bold",
        color: theme.ink,
        marginBottom: 6,
    },
    description: {
        fontSize: 9.5,
        color: theme.text,
        marginBottom: 10,
    },
    // Grade de campos
    fieldGrid: { flexDirection: "row", flexWrap: "wrap" },
    field: {
        flexDirection: "row",
        alignItems: "flex-start",
        width: "50%",
        paddingRight: 10,
        marginBottom: 5,
    },
    fieldIcon: { marginRight: 5, marginTop: 1 },
    fieldBody: { flex: 1 },
    fieldLabel: { fontSize: 7.5, color: theme.faint, textTransform: "uppercase", letterSpacing: 0.3 },
    fieldValue: { fontSize: 9.5, color: theme.text, fontFamily: "Helvetica-Bold" },
    // Etapas
    stepsWrap: { marginTop: 8, borderTopWidth: 1, borderTopColor: theme.hair, paddingTop: 8 },
    stepsTitle: {
        fontSize: 8.5,
        color: theme.muted,
        fontFamily: "Helvetica-Bold",
        textTransform: "uppercase",
        letterSpacing: 0.4,
        marginBottom: 6,
    },
    step: { flexDirection: "row", alignItems: "flex-start", marginBottom: 5 },
    stepCheckbox: {
        width: 9,
        height: 9,
        borderWidth: 1,
        borderColor: theme.muted,
        borderRadius: 2,
        marginRight: 7,
        marginTop: 1.5,
    },
    stepBody: { flex: 1 },
    stepTitleRow: { flexDirection: "row", flexWrap: "wrap", alignItems: "center" },
    stepTitle: { fontSize: 9.5, color: theme.text },
    stepDesc: { fontSize: 8.5, color: theme.muted, marginTop: 1 },
    badge: {
        fontSize: 6.8,
        color: theme.muted,
        backgroundColor: theme.surface,
        borderWidth: 0.6,
        borderColor: theme.hair,
        borderRadius: 3,
        paddingHorizontal: 4,
        paddingVertical: 1,
        marginLeft: 5,
    },
    // Rodapé
    footer: {
        position: "absolute",
        bottom: 24,
        left: 40,
        right: 40,
        flexDirection: "row",
        justifyContent: "space-between",
        alignItems: "center",
        borderTopWidth: 1,
        borderTopColor: theme.hair,
        paddingTop: 6,
    },
    footerText: { fontSize: 7.5, color: theme.faint },
});

/** Ícones vetoriais minimalistas (12×12, stroke fino) — discretos por design. */
export function PdfIcon({
    name,
    size = 9,
    color = theme.muted,
}: {
    name: PdfIconName;
    size?: number;
    color?: string;
}) {
    const s = { width: size, height: size };
    const stroke = color;
    const sw = 1.4;
    switch (name) {
        case "area":
            return (
                <Svg style={s} viewBox="0 0 12 12">
                    <Rect x={1.5} y={1.5} width={9} height={9} rx={1.5} stroke={stroke} strokeWidth={sw} fill="none" />
                </Svg>
            );
        case "category":
            return (
                <Svg style={s} viewBox="0 0 12 12">
                    <Path d="M2 2 L6.5 2 L10 5.5 L6 9.5 L2 6 Z" stroke={stroke} strokeWidth={sw} fill="none" />
                    <Circle cx={4} cy={4} r={0.8} fill={stroke} />
                </Svg>
            );
        case "type":
            return (
                <Svg style={s} viewBox="0 0 12 12">
                    <Path d="M3 1.5 L7 1.5 L9.5 4 L9.5 10.5 L3 10.5 Z" stroke={stroke} strokeWidth={sw} fill="none" />
                    <Line x1={4.5} y1={6} x2={8} y2={6} stroke={stroke} strokeWidth={sw} />
                    <Line x1={4.5} y1={8} x2={8} y2={8} stroke={stroke} strokeWidth={sw} />
                </Svg>
            );
        case "shift":
            return (
                <Svg style={s} viewBox="0 0 12 12">
                    <Circle cx={6} cy={6} r={2.4} stroke={stroke} strokeWidth={sw} fill="none" />
                    <Line x1={6} y1={1} x2={6} y2={2.4} stroke={stroke} strokeWidth={sw} />
                    <Line x1={6} y1={9.6} x2={6} y2={11} stroke={stroke} strokeWidth={sw} />
                    <Line x1={1} y1={6} x2={2.4} y2={6} stroke={stroke} strokeWidth={sw} />
                    <Line x1={9.6} y1={6} x2={11} y2={6} stroke={stroke} strokeWidth={sw} />
                </Svg>
            );
        case "recurrence":
            return (
                <Svg style={s} viewBox="0 0 12 12">
                    <Path d="M9.5 4 A4 4 0 1 0 10 7" stroke={stroke} strokeWidth={sw} fill="none" />
                    <Path d="M7.5 3.5 L9.7 3.7 L9.5 1.5" stroke={stroke} strokeWidth={sw} fill="none" />
                </Svg>
            );
        case "time":
            return (
                <Svg style={s} viewBox="0 0 12 12">
                    <Circle cx={6} cy={6} r={4.2} stroke={stroke} strokeWidth={sw} fill="none" />
                    <Line x1={6} y1={6} x2={6} y2={3.4} stroke={stroke} strokeWidth={sw} />
                    <Line x1={6} y1={6} x2={8} y2={6.8} stroke={stroke} strokeWidth={sw} />
                </Svg>
            );
        case "responsible":
            return (
                <Svg style={s} viewBox="0 0 12 12">
                    <Circle cx={6} cy={4} r={2.1} stroke={stroke} strokeWidth={sw} fill="none" />
                    <Path d="M2.2 10.5 A3.8 3.8 0 0 1 9.8 10.5" stroke={stroke} strokeWidth={sw} fill="none" />
                </Svg>
            );
        case "role":
            return (
                <Svg style={s} viewBox="0 0 12 12">
                    <Rect x={2} y={4} width={8} height={6} rx={1} stroke={stroke} strokeWidth={sw} fill="none" />
                    <Path d="M4.5 4 L4.5 2.8 A1 1 0 0 1 5.5 2 L6.5 2 A1 1 0 0 1 7.5 2.8 L7.5 4" stroke={stroke} strokeWidth={sw} fill="none" />
                </Svg>
            );
        case "required":
            return (
                <Svg style={s} viewBox="0 0 12 12">
                    <Line x1={6} y1={2} x2={6} y2={10} stroke={stroke} strokeWidth={sw} />
                    <Line x1={2.5} y1={4} x2={9.5} y2={8} stroke={stroke} strokeWidth={sw} />
                    <Line x1={9.5} y1={4} x2={2.5} y2={8} stroke={stroke} strokeWidth={sw} />
                </Svg>
            );
        case "sequential":
            return (
                <Svg style={s} viewBox="0 0 12 12">
                    <Line x1={2} y1={3} x2={2} y2={3} stroke={stroke} strokeWidth={sw} />
                    <Circle cx={2.2} cy={3} r={0.7} fill={stroke} />
                    <Circle cx={2.2} cy={6} r={0.7} fill={stroke} />
                    <Circle cx={2.2} cy={9} r={0.7} fill={stroke} />
                    <Line x1={4.5} y1={3} x2={10} y2={3} stroke={stroke} strokeWidth={sw} />
                    <Line x1={4.5} y1={6} x2={10} y2={6} stroke={stroke} strokeWidth={sw} />
                    <Line x1={4.5} y1={9} x2={10} y2={9} stroke={stroke} strokeWidth={sw} />
                </Svg>
            );
        case "photo":
            return (
                <Svg style={s} viewBox="0 0 12 12">
                    <Rect x={1.5} y={3.5} width={9} height={6.5} rx={1} stroke={stroke} strokeWidth={sw} fill="none" />
                    <Path d="M4.5 3.5 L5.2 2.3 L6.8 2.3 L7.5 3.5" stroke={stroke} strokeWidth={sw} fill="none" />
                    <Circle cx={6} cy={6.7} r={1.6} stroke={stroke} strokeWidth={sw} fill="none" />
                </Svg>
            );
        case "observation":
            return (
                <Svg style={s} viewBox="0 0 12 12">
                    <Path d="M2 2.5 L10 2.5 L10 8 L5.5 8 L3.5 10 L3.5 8 L2 8 Z" stroke={stroke} strokeWidth={sw} fill="none" />
                </Svg>
            );
        case "critical":
            return (
                <Svg style={s} viewBox="0 0 12 12">
                    <Path d="M6 1.5 L11 10.5 L1 10.5 Z" stroke={stroke} strokeWidth={sw} fill="none" />
                    <Line x1={6} y1={5} x2={6} y2={7.8} stroke={stroke} strokeWidth={sw} />
                    <Circle cx={6} cy={9.2} r={0.6} fill={stroke} />
                </Svg>
            );
        case "value":
            return (
                <Svg style={s} viewBox="0 0 12 12">
                    <Line x1={4} y1={2} x2={3} y2={10} stroke={stroke} strokeWidth={sw} />
                    <Line x1={9} y1={2} x2={8} y2={10} stroke={stroke} strokeWidth={sw} />
                    <Line x1={2} y1={4.5} x2={10} y2={4.5} stroke={stroke} strokeWidth={sw} />
                    <Line x1={2} y1={7.5} x2={10} y2={7.5} stroke={stroke} strokeWidth={sw} />
                </Svg>
            );
    }
}

export function FieldRow({ field }: { field: RoutineFieldRow }) {
    return (
        <View style={styles.field} wrap={false}>
            <View style={styles.fieldIcon}>
                <PdfIcon name={field.icon} />
            </View>
            <View style={styles.fieldBody}>
                <Text style={styles.fieldLabel}>{field.label}</Text>
                <Text style={styles.fieldValue}>{field.value}</Text>
            </View>
        </View>
    );
}

export function StepItem({ step }: { step: RoutineStep }) {
    return (
        <View style={styles.step} wrap={false}>
            <View style={styles.stepCheckbox} />
            <View style={styles.stepBody}>
                <View style={styles.stepTitleRow}>
                    <Text style={styles.stepTitle}>{step.title}</Text>
                    {step.badges.map((b) => (
                        <Text key={b} style={styles.badge}>
                            {b}
                        </Text>
                    ))}
                </View>
                {step.description ? <Text style={styles.stepDesc}>{step.description}</Text> : null}
            </View>
        </View>
    );
}

export function PdfLogo({ src }: { src: string }) {
    // eslint-disable-next-line jsx-a11y/alt-text -- @react-pdf Image não suporta alt
    return <Image src={src} style={styles.logo} />;
}
