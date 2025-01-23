import type { CPUIdleProcessorOptions } from './firstCPUIdle'
import type { SpanMatch, SpanMatchDefinition, SpanMatcherFn } from './matchSpan'
import type { SpanAndAnnotation } from './spanAnnotationTypes'
import type {
  ActiveTraceInput,
  Span,
  SpanStatus,
  StartTraceConfig,
} from './spanTypes'
import type { TraceRecording } from './traceRecordingTypes'
import type {
  ArrayWithAtLeastOneElement,
  KeysOfUnion,
  MapTuple,
  Prettify,
  UnionToIntersection,
} from './typeUtils'

export interface Timestamp {
  // absolute count of ms from epoch
  epoch: number
  // performance.now() time
  now: number
}

export type ScopeValue = string | number | boolean
export type PossibleScopeObject = Record<string, ScopeValue>

// a span can have any combination of scopes
export type ScopeOnASpan<AllPossibleScopesT> = Prettify<
  UnionToIntersection<Partial<AllPossibleScopesT>>
>

/**
 * for now this is always 'operation', but in the future we could also implement tracing 'process' types
 */
export type TraceType = 'operation'

export type TraceStatus = SpanStatus | 'interrupted'

export type TraceInterruptionReason =
  | 'timeout'
  | 'waiting-for-interactive-timeout'
  | 'another-trace-started'
  | 'manually-aborted'
  | 'idle-component-no-longer-idle'
  | 'matched-on-interrupt'
  | 'invalid-state-transition'

export type SingleTraceReportFn<
  TracerScopeKeysT extends KeysOfUnion<AllPossibleScopesT>,
  AllPossibleScopesT,
> = (
  trace: TraceRecording<TracerScopeKeysT, AllPossibleScopesT>,
  context: TraceContext<TracerScopeKeysT, AllPossibleScopesT>,
) => void

export type ReportFn<
  ForEachPossibleScopeT,
  AllPossibleScopesT extends ForEachPossibleScopeT = ForEachPossibleScopeT,
> = UnionToIntersection<
  ForEachPossibleScopeT extends ForEachPossibleScopeT
    ? SingleTraceReportFn<
        KeysOfUnion<ForEachPossibleScopeT> & KeysOfUnion<AllPossibleScopesT>,
        AllPossibleScopesT
      >
    : never
>

export interface TraceManagerConfig<AllPossibleScopesT> {
  reportFn: ReportFn<AllPossibleScopesT>

  generateId: () => string

  /**
   * IMPLEMENTATION TODO: The span types that should be omitted from the trace report. Or maybe a more general way to filter spans?
   */
  // spanTypesOmittedFromReport?: SpanType[]

  /**
   * Strategy for deduplicating performance entries.
   * If not provided, no deduplication will be performed.
   */
  performanceEntryDeduplicationStrategy?: SpanDeduplicationStrategy<
    Partial<AllPossibleScopesT>
  >
}

export interface Tracer<
  TracerScopeKeysT extends KeysOfUnion<AllPossibleScopesT>,
  AllPossibleScopesT,
> {
  /**
   * @returns The ID of the trace.
   */
  start: (
    input: StartTraceConfig<
      SelectScopeByKey<TracerScopeKeysT, AllPossibleScopesT>
    >,
  ) => string

  defineComputedSpan: (
    computedSpanDefinition: ComputedSpanDefinitionInput<
      TracerScopeKeysT,
      AllPossibleScopesT
    >,
  ) => void

  defineComputedValue: <
    MatchersT extends (
      | SpanMatcherFn<TracerScopeKeysT, AllPossibleScopesT>
      | SpanMatchDefinition<TracerScopeKeysT, AllPossibleScopesT>
    )[],
  >(
    computedValueDefinition: ComputedValueDefinitionInput<
      TracerScopeKeysT,
      AllPossibleScopesT,
      MatchersT
    >,
  ) => void
}

export interface CaptureInteractiveConfig extends CPUIdleProcessorOptions {
  /**
   * How long to wait for CPU Idle before giving up.
   */
  timeout?: number
}

export type LabelMatchingInputRecord<
  TracerScopeKeysT extends KeysOfUnion<AllPossibleScopesT>,
  AllPossibleScopesT,
> = Record<string, SpanMatch<TracerScopeKeysT, AllPossibleScopesT>>

export type LabelMatchingFnsRecord<
  TracerScopeKeysT extends KeysOfUnion<AllPossibleScopesT>,
  AllPossibleScopesT,
> = Record<string, SpanMatcherFn<TracerScopeKeysT, AllPossibleScopesT>>

/**
 * Definition of a trace that includes conditions on when to end, debounce, and interrupt.
 * The "input" version will be transformed into the standardized version internally,
 * converting all matchers into functions.
 */
export interface TraceDefinition<
  TracerScopeKeysT extends KeysOfUnion<AllPossibleScopesT>,
  AllPossibleScopesT,
> {
  /**
   * The name of the trace.
   */
  name: string

  type?: TraceType

  scopes: readonly TracerScopeKeysT[]

  // TypeScript TODO: typing this so that the span labels are inferred?
  labelMatching?: LabelMatchingInputRecord<
    NoInfer<TracerScopeKeysT>,
    AllPossibleScopesT
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
    SpanMatch<NoInfer<TracerScopeKeysT>, AllPossibleScopesT>
  >
  debounceOn?: ArrayWithAtLeastOneElement<
    SpanMatch<NoInfer<TracerScopeKeysT>, AllPossibleScopesT>
  >
  interruptOn?: ArrayWithAtLeastOneElement<
    SpanMatch<NoInfer<TracerScopeKeysT>, AllPossibleScopesT>
  >
  debounceDuration?: number
  timeoutDuration?: number

  /**
   * Indicates the operation should continue capturing events until interactivity is reached after the operation ends.
   * Provide a boolean or a configuration object.
   */
  captureInteractive?: boolean | CaptureInteractiveConfig

  /**
   * A list of span matchers that will suppress error status propagation to the trace level.
   * If a span with `status: error` matches any of these matchers,
   * its error status will not affect the overall trace status.
   */
  suppressErrorStatusPropagationOn?: readonly SpanMatch<
    NoInfer<TracerScopeKeysT>,
    AllPossibleScopesT
  >[]
}

/**
 * Trace Definition with added fields and converting all matchers into functions.
 * Used internally by the TraceManager.
 */
export interface CompleteTraceDefinition<
  TracerScopeKeysT extends KeysOfUnion<AllPossibleScopesT>,
  AllPossibleScopesT,
> extends TraceDefinition<TracerScopeKeysT, AllPossibleScopesT> {
  computedSpanDefinitions: readonly ComputedSpanDefinition<
    NoInfer<TracerScopeKeysT>,
    AllPossibleScopesT
  >[]
  computedValueDefinitions: readonly ComputedValueDefinition<
    NoInfer<TracerScopeKeysT>,
    AllPossibleScopesT,
    SpanMatcherFn<NoInfer<TracerScopeKeysT>, AllPossibleScopesT>[]
  >[]

  labelMatching?: LabelMatchingFnsRecord<
    NoInfer<TracerScopeKeysT>,
    AllPossibleScopesT
  >

  requiredSpans: ArrayWithAtLeastOneElement<
    SpanMatcherFn<NoInfer<TracerScopeKeysT>, AllPossibleScopesT>
  >
  debounceOn?: ArrayWithAtLeastOneElement<
    SpanMatcherFn<NoInfer<TracerScopeKeysT>, AllPossibleScopesT>
  >
  interruptOn?: ArrayWithAtLeastOneElement<
    SpanMatcherFn<NoInfer<TracerScopeKeysT>, AllPossibleScopesT>
  >

  /**
   * A list of span matchers that will suppress error status propagation to the trace level.
   * If a span matches any of these matchers, its error status will not affect the trace status.
   */
  suppressErrorStatusPropagationOn?: readonly SpanMatcherFn<
    NoInfer<TracerScopeKeysT>,
    AllPossibleScopesT
  >[]
}

/**
 * Strategy for deduplicating performance entries
 */
export interface SpanDeduplicationStrategy<AllPossibleScopesT> {
  /**
   * Returns an existing span annotation if the span should be considered a duplicate
   */
  findDuplicate: (
    span: Span<AllPossibleScopesT>,
    recordedItems: Set<SpanAndAnnotation<AllPossibleScopesT>>,
  ) => SpanAndAnnotation<AllPossibleScopesT> | undefined

  /**
   * Called when a span is recorded to update deduplication state
   */
  recordSpan: (
    span: Span<AllPossibleScopesT>,
    spanAndAnnotation: SpanAndAnnotation<AllPossibleScopesT>,
  ) => void

  /**
   * Called when trace recording is complete to clean up any state
   */
  reset: () => void

  /**
   * Selects which span should be used when a duplicate is found.
   * @returns the span that should be used in the annotation
   */
  selectPreferredSpan: (
    existingSpan: Span<AllPossibleScopesT>,
    newSpan: Span<AllPossibleScopesT>,
  ) => Span<AllPossibleScopesT>
}

/**
 * Definition of custom spans
 */
export interface ComputedSpanDefinition<
  TracerScopeKeysT extends KeysOfUnion<AllPossibleScopesT>,
  AllPossibleScopesT,
> {
  name: string
  /**
   * startSpan is the *first* span matching the condition that will be considered as the start of the computed span
   */
  startSpan:
    | SpanMatcherFn<TracerScopeKeysT, AllPossibleScopesT>
    | 'operation-start'
  /**
   * endSpan is the *last* span matching the condition that will be considered as the end of the computed span
   */
  endSpan:
    | SpanMatcherFn<TracerScopeKeysT, AllPossibleScopesT>
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
  TracerScopeKeysT extends KeysOfUnion<AllPossibleScopesT>,
  AllPossibleScopesT,
  MatchersT extends SpanMatcherFn<
    TracerScopeKeysT,
    AllPossibleScopesT
  >[] = SpanMatcherFn<TracerScopeKeysT, AllPossibleScopesT>[],
> {
  name: string
  matches: [...MatchersT]
  /** if returns undefined, will not report the computed value */
  computeValueFromMatches: (
    // as many matches as match of type Span<ScopeT>
    ...matches: MapTuple<MatchersT, SpanAndAnnotation<AllPossibleScopesT>[]>
  ) => number | string | boolean | undefined
}

/**
 * Definition of custom spans input
 */
export interface ComputedSpanDefinitionInput<
  TracerScopeKeysT extends KeysOfUnion<AllPossibleScopesT>,
  AllPossibleScopesT,
> {
  name: string
  startSpan: SpanMatch<TracerScopeKeysT, AllPossibleScopesT> | 'operation-start'
  endSpan:
    | SpanMatch<TracerScopeKeysT, AllPossibleScopesT>
    | 'operation-end'
    | 'interactive'
}

/**
 * Definition of custom values input
 */
export interface ComputedValueDefinitionInput<
  TracerScopeKeysT extends KeysOfUnion<AllPossibleScopesT>,
  AllPossibleScopesT,
  MatchersT extends SpanMatch<TracerScopeKeysT, AllPossibleScopesT>[],
> {
  name: string
  matches: [...MatchersT]
  computeValueFromMatches: (
    ...matches: MapTuple<MatchersT, SpanAndAnnotation<AllPossibleScopesT>[]>
  ) => number | string | boolean | undefined
}

export type SelectScopeByKey<
  SelectScopeKeyT extends keyof ScopesT,
  ScopesT,
> = Prettify<
  ScopesT extends { [AnyKey in SelectScopeKeyT]: ScopeValue } ? ScopesT : never
>

export type DeriveScopeFromPerformanceEntryFn<AllPossibleScopesT> = (
  entry: PerformanceEntry,
) => ScopeOnASpan<AllPossibleScopesT> | undefined

export interface TraceContext<
  TracerScopeKeysT extends KeysOfUnion<AllPossibleScopesT>,
  AllPossibleScopesT,
> {
  readonly definition: CompleteTraceDefinition<
    TracerScopeKeysT,
    AllPossibleScopesT
  >
  readonly input: ActiveTraceInput<
    SelectScopeByKey<TracerScopeKeysT, AllPossibleScopesT>
  >
}
