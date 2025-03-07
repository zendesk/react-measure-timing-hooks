import type { CPUIdleProcessorOptions } from './firstCPUIdle'
import type { SpanMatch, SpanMatcherFn } from './matchSpan'
import type { SpanAndAnnotation } from './spanAnnotationTypes'
import type {
  ActiveTraceInput,
  Attributes,
  DraftTraceInput,
  Span,
  SpanStatus,
} from './spanTypes'
import type { AllPossibleTraces } from './Trace'
import type { TraceRecording } from './traceRecordingTypes'
import type {
  ArrayWithAtLeastOneElement,
  MapTuple,
  UnionToIntersection,
  UnionToTuple,
} from './typeUtils'

export interface Timestamp {
  // absolute count of ms from epoch
  epoch: number
  // performance.now() time
  now: number
}

export type RelationSchemaValue =
  | StringConstructor
  | NumberConstructor
  | BooleanConstructor
  | readonly (string | number | boolean)[]

export type MapSchemaToTypesBase<T> = keyof T extends never
  ? Record<string, never>
  : {
      [K in keyof T]: T[K] extends StringConstructor
        ? string
        : T[K] extends NumberConstructor
        ? number
        : T[K] extends BooleanConstructor
        ? boolean
        : T[K] extends readonly (infer U)[]
        ? U
        : never
    }

export type MapSchemaToTypes<RelationSchemasT> =
  RelationSchemasT extends RelationSchemasT
    ? MapSchemaToTypesBase<RelationSchemasT>
    : never

// a span can have any combination of relations
export type RelationsOnASpan<RelationSchemasT> = Partial<
  MapSchemaToTypes<
    UnionToIntersection<RelationSchemasT[keyof RelationSchemasT]>
  >
>

export type RelatedTo<RelationSchemasT> = MapSchemaToTypes<
  RelationSchemasT[keyof RelationSchemasT]
>

/**
 * Reverse of MapSchemaToTypes:
 *   - boolean => BooleanConstructor
 *   - string => StringConstructor (if it's the wide string)
 *   - number => NumberConstructor (if it's the wide number)
 *   - union of string/number *literals* => a readonly tuple of those literals
 *   - otherwise => never
 */
export type MapTypesToSchema<T> = {
  [K in keyof T]: T[K] extends boolean // 1) If it's (wide) boolean or effectively boolean => BooleanConstructor
    ? BooleanConstructor
    : T[K] extends string | number | boolean
    ? string extends T[K]
      ? StringConstructor
      : number extends T[K]
      ? NumberConstructor
      : boolean extends T[K]
      ? BooleanConstructor
      : readonly [...UnionToTuple<T[K]>]
    : never
}

export type RelationSchemasBase<RelationSchemasT> = {
  [SchemaNameT in keyof RelationSchemasT]: {
    [K in keyof RelationSchemasT[SchemaNameT]]: RelationSchemaValue
  }
}

/**
 * for now this is always 'operation', but in the future we could also implement tracing 'process' types
 */
export type TraceType = 'operation'

export type TraceStatus = SpanStatus | 'interrupted'

export const INVALID_TRACE_INTERRUPTION_REASONS = [
  'timeout',
  'draft-cancelled',
  'invalid-state-transition',
] as const

export type TraceInterruptionReasonForInvalidTraces =
  (typeof INVALID_TRACE_INTERRUPTION_REASONS)[number]

export type TraceInterruptionReasonForValidTraces =
  | 'waiting-for-interactive-timeout'
  | 'another-trace-started'
  | 'aborted'
  | 'idle-component-no-longer-idle'
  | 'matched-on-interrupt'
  | 'matched-on-required-span-with-error'

export type TraceInterruptionReason =
  | TraceInterruptionReasonForInvalidTraces
  | TraceInterruptionReasonForValidTraces

export type SingleTraceReportFn<
  SelectedRelationNameT extends keyof RelationSchemasT,
  RelationSchemasT,
  VariantsT extends string,
> = (
  trace: TraceRecording<SelectedRelationNameT, RelationSchemasT>,
  context: TraceContext<SelectedRelationNameT, RelationSchemasT, VariantsT>,
) => void

export type AnyPossibleReportFn<RelationSchemasT> = <
  SelectedRelationNameT extends keyof RelationSchemasT,
>(
  trace: TraceRecording<SelectedRelationNameT, RelationSchemasT>,
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  context: TraceContext<SelectedRelationNameT, RelationSchemasT, any>,
) => void

export interface TraceManagerConfig<RelationSchemasT> {
  reportFn: AnyPossibleReportFn<RelationSchemasT>

  generateId: () => string

  relationSchemas: RelationSchemasT

  /**
   * IMPLEMENTATION TODO: The span types that should be omitted from the trace report. Or maybe a more general way to filter spans?
   */
  // spanTypesOmittedFromReport?: SpanType[]

  /**
   * Strategy for deduplicating performance entries.
   * If not provided, no deduplication will be performed.
   */
  performanceEntryDeduplicationStrategy?: SpanDeduplicationStrategy<RelationSchemasT>

  // TODO: add trace definition as 2nd arg
  reportErrorFn: (error: Error) => void
  reportWarningFn: (warning: Error) => void
}

export interface TraceManagerUtilities<
  RelationSchemasT extends RelationSchemasBase<RelationSchemasT>,
> extends TraceManagerConfig<RelationSchemasT> {
  /**
   * interrupts the active trace (if any) and replaces it with a new one
   */
  replaceCurrentTrace: (newTrace: AllPossibleTraces<RelationSchemasT>) => void
  cleanupCurrentTrace: (
    traceToCleanUp: AllPossibleTraces<RelationSchemasT>,
  ) => void
  getCurrentTrace: () => AllPossibleTraces<RelationSchemasT> | undefined
}

export interface TraceModificationsBase<
  SelectedRelationNameT extends keyof RelationSchemasT,
  RelationSchemasT,
  VariantsT extends string,
> {
  additionalRequiredSpans?: SpanMatch<
    SelectedRelationNameT,
    RelationSchemasT,
    VariantsT
  >[]
  additionalDebounceOnSpans?: SpanMatch<
    SelectedRelationNameT,
    RelationSchemasT,
    VariantsT
  >[]
}

export interface TraceModifications<
  SelectedRelationNameT extends keyof RelationSchemasT,
  RelationSchemasT,
  VariantsT extends string,
> extends TraceModificationsBase<
    SelectedRelationNameT,
    RelationSchemasT,
    VariantsT
  > {
  relatedTo: MapSchemaToTypes<RelationSchemasT[SelectedRelationNameT]>
  attributes?: Attributes
}

export interface CaptureInteractiveConfig extends CPUIdleProcessorOptions {
  /**
   * How long to wait for CPU Idle before giving up and interrupting the trace.
   */
  timeout?: number
}

export type LabelMatchingInputRecord<
  SelectedRelationNameT extends keyof RelationSchemasT,
  RelationSchemasT,
  VariantsT extends string,
> = Record<
  string,
  SpanMatch<SelectedRelationNameT, RelationSchemasT, VariantsT>
>

export type LabelMatchingFnsRecord<
  SelectedRelationNameT extends keyof RelationSchemasT,
  RelationSchemasT,
  VariantsT extends string,
> = Record<
  string,
  SpanMatcherFn<SelectedRelationNameT, RelationSchemasT, VariantsT>
>

export interface TraceVariant<
  SelectedRelationNameT extends keyof RelationSchemasT,
  RelationSchemasT,
  VariantsT extends string,
> extends TraceModificationsBase<
    SelectedRelationNameT,
    RelationSchemasT,
    VariantsT
  > {
  /**
   * How long before we give up and cancel the trace if the required spans have not been seen
   * In milliseconds.
   */
  timeout: number
}

/**
 * Definition of a trace that includes conditions on when to end, debounce, and interrupt.
 * The "input" version will be transformed into the standardized version internally,
 * converting all matchers into functions.
 */
export interface TraceDefinition<
  SelectedRelationNameT extends keyof RelationSchemasT,
  RelationSchemasT,
  VariantsT extends string,
  ComputedValueDefinitionsT extends {
    [K in keyof ComputedValueDefinitionsT]: ComputedValueDefinitionInput<
      NoInfer<SelectedRelationNameT>,
      RelationSchemasT,
      NoInfer<VariantsT>,
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      any
    >
  },
> {
  /**
   * The name of the trace.
   */
  name: string

  type?: TraceType

  relationSchemaName: SelectedRelationNameT

  // TypeScript TODO: typing this so that the span labels are inferred?
  labelMatching?: LabelMatchingInputRecord<
    NoInfer<SelectedRelationNameT>,
    RelationSchemasT,
    VariantsT
  >

  /**
   * This may include renders spans of components that have to be rendered with all data
   * to consider the operation as visually complete
   * this is close to the idea of "Largest Contentful Paint"
   * but rather than using "Largest" as a shorthand,
   * we're giving the power to the engineer to manually define
   * which parts of the product are "critical" or most important
   */
  requiredSpans: ArrayWithAtLeastOneElement<
    SpanMatch<NoInfer<SelectedRelationNameT>, RelationSchemasT, VariantsT>
  >
  debounceOnSpans?: ArrayWithAtLeastOneElement<
    SpanMatch<NoInfer<SelectedRelationNameT>, RelationSchemasT, VariantsT>
  >
  interruptOnSpans?: ArrayWithAtLeastOneElement<
    SpanMatch<NoInfer<SelectedRelationNameT>, RelationSchemasT, VariantsT>
  >

  /**
   * How long should we wait after the last required span (or debounced span).
   * in anticipation of more spans
   * @default DEFAULT_DEBOUNCE_DURATION (500)
   */
  debounceWindow?: number

  /**
   * variants are used to describe slightly different versions of the same tracer
   * e.g. if a trace is started due to cold boot navigation, it may have a different timeout
   * than if it was started due to a user click
   * the trace might also lead to different places in the app
   * due to different conditions / options related to the action that the user is taking,
   * which is something that might be reflected by providing additional span requirements to that variant.
   * The key is the name of the variant, and the value is the configuration for that variant.
   *
   * We recommend naming the variant by using the following descriptor:
   * - `on_XYZ` - what caused the trace to start, or where it was started
   * - `till_XYZ` - where we ended up, or what else happened that led to the end of the trace
   *
   * You can do either one, or both.
   * Add variants whenever you want to be able to distinguish the trace data
   * based on different triggers or different contexts.
   *
   * For example:
   * - `on_submit_press`
   * - `on_cold_boot`
   * - `till_navigated_home`
   * - `till_logged_in`
   * - `on_submit_press_till_reloaded`
   * - `on_search_till_results`
   */
  variants: {
    [VariantName in VariantsT]: TraceVariant<
      SelectedRelationNameT,
      RelationSchemasT,
      VariantsT
    >
  }

  /**
   * Indicates the operation should continue capturing events after the trace is complete,
   * until the page is considered fully interactive.
   * Provide 'true' for defaults, or a custom configuration object.
   */
  captureInteractive?: boolean | CaptureInteractiveConfig

  /**
   * A list of span matchers that will suppress error status propagation to the trace level.
   * If a span with `status: error` matches any of these matchers,
   * its error status will not affect the overall trace status.
   */
  suppressErrorStatusPropagationOnSpans?: readonly SpanMatch<
    NoInfer<SelectedRelationNameT>,
    RelationSchemasT,
    VariantsT
  >[]

  /**
   * A record of computed span definitions that will be converted to their final form.
   * The key is the name of the computed span. You can add more computed spans later using tracer.defineComputedSpan().
   */
  computedSpanDefinitions?: Record<
    string,
    ComputedSpanDefinitionInput<
      NoInfer<SelectedRelationNameT>,
      RelationSchemasT,
      VariantsT
    >
  >

  /**
   * A record of computed value definitions that will be converted to their final form.
   * The key is the name of the computed value. You can add more computed values later using tracer.defineComputedValue().
   */
  computedValueDefinitions?: ComputedValueDefinitionsT
}

/**
 * Trace Definition with added fields and converting all matchers into functions.
 * Used internally by the TraceManager.
 */
export interface CompleteTraceDefinition<
  SelectedRelationNameT extends keyof RelationSchemasT,
  RelationSchemasT,
  VariantsT extends string,
> extends Omit<
    TraceDefinition<SelectedRelationNameT, RelationSchemasT, VariantsT, {}>,
    'computedSpanDefinitions' | 'computedValueDefinitions'
  > {
  computedSpanDefinitions: Record<
    string,
    ComputedSpanDefinition<
      NoInfer<SelectedRelationNameT>,
      RelationSchemasT,
      VariantsT
    >
  >
  computedValueDefinitions: Record<
    string,
    ComputedValueDefinition<
      NoInfer<SelectedRelationNameT>,
      RelationSchemasT,
      VariantsT
    >
  >

  relationSchema: NoInfer<RelationSchemasT[SelectedRelationNameT]>

  labelMatching?: LabelMatchingFnsRecord<
    NoInfer<SelectedRelationNameT>,
    RelationSchemasT,
    VariantsT
  >

  requiredSpans: ArrayWithAtLeastOneElement<
    SpanMatcherFn<NoInfer<SelectedRelationNameT>, RelationSchemasT, VariantsT>
  >
  debounceOnSpans?: ArrayWithAtLeastOneElement<
    SpanMatcherFn<NoInfer<SelectedRelationNameT>, RelationSchemasT, VariantsT>
  >
  interruptOnSpans?: ArrayWithAtLeastOneElement<
    SpanMatcherFn<NoInfer<SelectedRelationNameT>, RelationSchemasT, VariantsT>
  >

  suppressErrorStatusPropagationOnSpans?: readonly SpanMatcherFn<
    NoInfer<SelectedRelationNameT>,
    RelationSchemasT,
    VariantsT
  >[]
}

/**
 * Strategy for deduplicating performance entries
 */
export interface SpanDeduplicationStrategy<RelationSchemasT> {
  /**
   * Returns an existing span annotation if the span should be considered a duplicate
   */
  findDuplicate: (
    span: Span<RelationSchemasT>,
    recordedItems: Set<SpanAndAnnotation<RelationSchemasT>>,
  ) => SpanAndAnnotation<RelationSchemasT> | undefined

  /**
   * Called when a span is recorded to update deduplication state
   */
  recordSpan: (
    span: Span<RelationSchemasT>,
    spanAndAnnotation: SpanAndAnnotation<RelationSchemasT>,
  ) => void

  /**
   * Called when trace recording is complete to clean up any deduplication state
   */
  reset: () => void

  /**
   * Selects which span should be used when a duplicate is found.
   * @returns the span that should be used in the annotation
   */
  selectPreferredSpan: (
    existingSpan: Span<RelationSchemasT>,
    newSpan: Span<RelationSchemasT>,
  ) => Span<RelationSchemasT>
}

/**
 * Definition of custom spans
 */
export interface ComputedSpanDefinition<
  SelectedRelationNameT extends keyof RelationSchemasT,
  RelationSchemasT,
  VariantsT extends string,
> {
  /**
   * startSpan is the *first* span matching the condition that will be considered as the start of the computed span
   */
  startSpan:
    | SpanMatcherFn<SelectedRelationNameT, RelationSchemasT, VariantsT>
    | 'operation-start'
  /**
   * endSpan is the *last* span matching the condition that will be considered as the end of the computed span
   */
  endSpan:
    | SpanMatcherFn<SelectedRelationNameT, RelationSchemasT, VariantsT>
    | 'operation-end'
    | 'interactive'

  /**
   * If true, we will attempt to compute the span even if the trace was interrupted.
   * Alternatively, specify an array of InterruptionReasons in which the span should be computed.
   */
  // TODO: forceCompute: boolean | InterruptionReason[]
}

/**
 * Definition of custom values
 */
export interface ComputedValueDefinition<
  SelectedRelationNameT extends keyof RelationSchemasT,
  RelationSchemasT,
  VariantsT extends string,
> {
  matches: SpanMatcherFn<SelectedRelationNameT, RelationSchemasT, VariantsT>[]
  /** if returns undefined, will not report the computed value */
  computeValueFromMatches: NoInfer<
    (
      ...matchers: (readonly SpanAndAnnotation<RelationSchemasT>[])[]
    ) => number | string | boolean | undefined
  >

  /**
   * If true, we will attempt to compute the span even if the trace was interrupted.
   * Alternatively, specify an array of InterruptionReasons in which the span should be computed.
   */
  // TODO: forceCompute: boolean | InterruptionReason[]
}

/**
 * Definition of custom spans input
 */
export interface ComputedSpanDefinitionInput<
  SelectedRelationNameT extends keyof RelationSchemasT,
  RelationSchemasT,
  VariantsT extends string,
> {
  startSpan:
    | SpanMatch<SelectedRelationNameT, RelationSchemasT, VariantsT>
    | 'operation-start'
  endSpan:
    | SpanMatch<SelectedRelationNameT, RelationSchemasT, VariantsT>
    | 'operation-end'
    | 'interactive'
}

/**
 * Definition of custom values input
 */
export interface ComputedValueDefinitionInput<
  SelectedRelationNameT extends keyof RelationSchemasT,
  RelationSchemasT,
  VariantsT extends string,
  MatchersT extends NoInfer<
    SpanMatch<SelectedRelationNameT, RelationSchemasT, VariantsT>
  >[],
> {
  matches: [...MatchersT]
  computeValueFromMatches: NoInfer<
    (
      ...matches: MapTuple<
        MatchersT,
        readonly SpanAndAnnotation<RelationSchemasT>[]
      >
    ) => number | string | boolean | undefined
  >
}

export type DeriveRelationsFromPerformanceEntryFn<RelationSchemasT> = (
  entry: PerformanceEntry,
) => RelationsOnASpan<RelationSchemasT> | undefined

export interface DraftTraceContext<
  SelectedRelationNameT extends keyof RelationSchemasT,
  RelationSchemasT,
  VariantsT extends string,
> {
  readonly definition: CompleteTraceDefinition<
    SelectedRelationNameT,
    RelationSchemasT,
    VariantsT
  >
  readonly input: DraftTraceInput<
    RelationSchemasT[SelectedRelationNameT],
    VariantsT
  >
}

export interface TraceContext<
  SelectedRelationNameT extends keyof RelationSchemasT,
  RelationSchemasT,
  VariantsT extends string,
> {
  readonly definition: CompleteTraceDefinition<
    SelectedRelationNameT,
    RelationSchemasT,
    VariantsT
  >
  readonly input:
    | ActiveTraceInput<RelationSchemasT[SelectedRelationNameT], VariantsT>
    | DraftTraceInput<RelationSchemasT[SelectedRelationNameT], VariantsT>
}
