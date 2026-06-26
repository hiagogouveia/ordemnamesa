import { Text, View } from "@react-pdf/renderer";
import type { RoutineSectionData } from "@/lib/pdf/rotinas/format";
import { FieldRow, StepItem, styles, theme } from "./pdf-primitives";

/**
 * Uma rotina como card. `wrap` permite que a seção quebre entre páginas sem
 * cortar conteúdo; `wrap={false}` nos itens internos evita órfãos no meio de
 * uma linha de campo/etapa.
 */
export function RoutineSection({ routine }: { routine: RoutineSectionData }) {
    return (
        <View style={styles.section} wrap>
            <View style={styles.sectionHead} wrap={false}>
                {routine.areaName ? (
                    <>
                        <View
                            style={[
                                styles.areaChip,
                                { backgroundColor: routine.areaColor || theme.primary },
                            ]}
                        />
                        <Text style={styles.areaLabel}>{routine.areaName}</Text>
                    </>
                ) : null}
            </View>

            <Text style={styles.routineName}>{routine.name}</Text>

            {routine.description ? (
                <Text style={styles.description}>{routine.description}</Text>
            ) : null}

            {routine.fields.length > 0 ? (
                <View style={styles.fieldGrid}>
                    {routine.fields.map((field) => (
                        <FieldRow key={field.label} field={field} />
                    ))}
                </View>
            ) : null}

            {routine.steps.length > 0 ? (
                <View style={styles.stepsWrap}>
                    <Text style={styles.stepsTitle}>
                        Etapas ({routine.steps.length})
                    </Text>
                    {routine.steps.map((step, i) => (
                        <StepItem key={`${step.title}-${i}`} step={step} />
                    ))}
                </View>
            ) : null}
        </View>
    );
}
