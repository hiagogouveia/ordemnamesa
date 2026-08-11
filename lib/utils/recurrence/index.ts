export {
    evaluateV2,
    evaluateCustomRange,
    type EvaluateContext,
    type ShiftForRecurrence,
} from "./evaluate"
export { validateV2, RecurrenceValidationError } from "./validate"
export {
    describeRecurrence,
    WEEKDAY_NAMES,
    MONTH_NAMES,
    type DescribeInput,
} from "./describe"
// Sprint 96 — filtro por ocorrência prevista.
export {
    occursOnDate,
    occursInRange,
    MAX_RANGE_DAYS,
    type ChecklistForOccurrence,
} from "./occurrence"
export {
    buildOccurrenceWindow,
    describeOccurrenceWindow,
    normalizeOccurrenceFilter,
    dateFilter,
    filterDateKey,
    type OccurrenceFilter,
    type OccurrenceWindow,
} from "./occurrence-window"
export {
    findWeekdayPositionInMonth,
    parseDateKey,
    daysInMonth,
} from "./weekday-position"
export {
    buildV2FromDropdownOption,
    computeWeekOfMonth,
    type DropdownRecurrenceOption,
    type BuildV2Context,
} from "./build-from-dropdown"
export { legacyConfigToV2Rrule } from "./legacy-to-v2-rrule"
