import type { CPUIdleProcessorOptions } from './firstCPUIdle'
import type { SpanMatch, SpanMatchDefinition, SpanMatcherFn } from './matchSpan'
import type { SpanAndAnnotation } from './spanAnnotationTypes'
import type {
  ActiveTraceInput,
  Attributes,
  BaseStartTraceConfig,
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
  OriginatedFromT extends string,
> = (
  trace: TraceRecording<TracerScopeKeysT, AllPossibleScopesT>,
  context: TraceContext<TracerScopeKeysT, AllPossibleScopesT, OriginatedFromT>,
) => void

export type ReportFn<
  ForEachPossibleScopeT,
  AllPossibleScopesT extends ForEachPossibleScopeT = ForEachPossibleScopeT,
  OriginatedFromT extends string = string,
> = UnionToIntersection<
  ForEachPossibleScopeT extends ForEachPossibleScopeT
    ? SingleTraceReportFn<
        KeysOfUnion<ForEachPossibleScopeT> & KeysOfUnion<AllPossibleScopesT>,
        AllPossibleScopesT,
        OriginatedFromT
      >
    : never
>

export interface TraceManagerConfig<
  AllPossibleScopesT,
  OriginatedFromT extends string,
> {
  reportFn: ReportFn<AllPossibleScopesT, AllPossibleScopesT, OriginatedFromT>

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

  reportErrorFn: (error: Error) => void
}

export interface TraceModifications<
  TracerScopeKeysT extends KeysOfUnion<AllPossibleScopesT>,
  AllPossibleScopesT,
  OriginatedFromT extends string,
> {
  scope: SelectScopeByKey<TracerScopeKeysT, AllPossibleScopesT>
  attributes?: Attributes
  additionalRequiredSpans?: SpanMatcherFn<
    TracerScopeKeysT,
    AllPossibleScopesT,
    OriginatedFromT
  >[]
  additionalDebounceOnSpans?: SpanMatcherFn<
    TracerScopeKeysT,
    AllPossibleScopesT,
    OriginatedFromT
  >[]
}

export interface Tracer<
  TracerScopeKeysT extends KeysOfUnion<AllPossibleScopesT>,
  AllPossibleScopesT,
  OriginatedFromT extends string,
> {
  /**
   * @returns The ID of the trace.
   */
  start: (
    input: StartTraceConfig<
      SelectScopeByKey<TracerScopeKeysT, AllPossibleScopesT>,
      OriginatedFromT
    >,
  ) => string | undefined

  provisionalStart: (
    input: BaseStartTraceConfig<OriginatedFromT>,
  ) => string | undefined

  initializeProvisional: (
    mods: TraceModifications<
      TracerScopeKeysT,
      AllPossibleScopesT,
      OriginatedFromT
    >,
  ) => void

  defineComputedSpan: (
    computedSpanDefinition: ComputedSpanDefinitionInput<
      TracerScopeKeysT,
      AllPossibleScopesT,
      OriginatedFromT
    >,
  ) => void

  defineComputedValue: <
    MatchersT extends (
      | SpanMatcherFn<TracerScopeKeysT, AllPossibleScopesT, OriginatedFromT>
      | SpanMatchDefinition<TracerScopeKeysT, AllPossibleScopesT>
    )[],
  >(
    computedValueDefinition: ComputedValueDefinitionInput<
      TracerScopeKeysT,
      AllPossibleScopesT,
      MatchersT,
      OriginatedFromT
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
  OriginatedFromT extends string,
> = Record<
  string,
  SpanMatch<TracerScopeKeysT, AllPossibleScopesT, OriginatedFromT>
>

export type LabelMatchingFnsRecord<
  TracerScopeKeysT extends KeysOfUnion<AllPossibleScopesT>,
  AllPossibleScopesT,
  OriginatedFromT extends string,
> = Record<
  string,
  SpanMatcherFn<TracerScopeKeysT, AllPossibleScopesT, OriginatedFromT>
>

export interface OriginatedFromVariant {
  timeoutDuration: number
}

/**
 * Definition of a trace that includes conditions on when to end, debounce, and interrupt.
 * The "input" version will be transformed into the standardized version internally,
 * converting all matchers into functions.
 */
export interface TraceDefinition<
  TracerScopeKeysT extends KeysOfUnion<AllPossibleScopesT>,
  AllPossibleScopesT,
  OriginatedFromT extends string,
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
    AllPossibleScopesT,
    OriginatedFromT
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
    SpanMatch<NoInfer<TracerScopeKeysT>, AllPossibleScopesT, OriginatedFromT>
  >
  debounceOn?: ArrayWithAtLeastOneElement<
    SpanMatch<NoInfer<TracerScopeKeysT>, AllPossibleScopesT, OriginatedFromT>
  >
  interruptOn?: ArrayWithAtLeastOneElement<
    SpanMatch<NoInfer<TracerScopeKeysT>, AllPossibleScopesT, OriginatedFromT>
  >
  debounceDuration?: number

  variantsByOriginatedFrom: Record<OriginatedFromT, OriginatedFromVariant>

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
    AllPossibleScopesT,
    OriginatedFromT
  >[]
}

/**
 * Trace Definition with added fields and converting all matchers into functions.
 * Used internally by the TraceManager.
 */
export interface CompleteTraceDefinition<
  TracerScopeKeysT extends KeysOfUnion<AllPossibleScopesT>,
  AllPossibleScopesT,
  OriginatedFromT extends string,
> extends TraceDefinition<
    TracerScopeKeysT,
    AllPossibleScopesT,
    OriginatedFromT
  > {
  computedSpanDefinitions: readonly ComputedSpanDefinition<
    NoInfer<TracerScopeKeysT>,
    AllPossibleScopesT,
    OriginatedFromT
  >[]
  computedValueDefinitions: readonly ComputedValueDefinition<
    NoInfer<TracerScopeKeysT>,
    AllPossibleScopesT,
    OriginatedFromT,
    SpanMatcherFn<
      NoInfer<TracerScopeKeysT>,
      AllPossibleScopesT,
      OriginatedFromT
    >[]
  >[]

  labelMatching?: LabelMatchingFnsRecord<
    NoInfer<TracerScopeKeysT>,
    AllPossibleScopesT,
    OriginatedFromT
  >

  requiredSpans: ArrayWithAtLeastOneElement<
    SpanMatcherFn<
      NoInfer<TracerScopeKeysT>,
      AllPossibleScopesT,
      OriginatedFromT
    >
  >
  debounceOn?: ArrayWithAtLeastOneElement<
    SpanMatcherFn<
      NoInfer<TracerScopeKeysT>,
      AllPossibleScopesT,
      OriginatedFromT
    >
  >
  interruptOn?: ArrayWithAtLeastOneElement<
    SpanMatcherFn<
      NoInfer<TracerScopeKeysT>,
      AllPossibleScopesT,
      OriginatedFromT
    >
  >

  /**
   * A list of span matchers that will suppress error status propagation to the trace level.
   * If a span matches any of these matchers, its error status will not affect the trace status.
   */
  suppressErrorStatusPropagationOn?: readonly SpanMatcherFn<
    NoInfer<TracerScopeKeysT>,
    AllPossibleScopesT,
    OriginatedFromT
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
  OriginatedFromT extends string,
> {
  name: string
  /**
   * startSpan is the *first* span matching the condition that will be considered as the start of the computed span
   */
  startSpan:
    | SpanMatcherFn<TracerScopeKeysT, AllPossibleScopesT, OriginatedFromT>
    | 'operation-start'
  /**
   * endSpan is the *last* span matching the condition that will be considered as the end of the computed span
   */
  endSpan:
    | SpanMatcherFn<TracerScopeKeysT, AllPossibleScopesT, OriginatedFromT>
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
  OriginatedFromT extends string,
  MatchersT extends SpanMatcherFn<
    TracerScopeKeysT,
    AllPossibleScopesT,
    OriginatedFromT
  >[] = SpanMatcherFn<TracerScopeKeysT, AllPossibleScopesT, OriginatedFromT>[],
> {
  name: string
  matches: [...MatchersT]
  /** if returns undefined, will not report the computed value */
  computeValueFromMatches: (
    // as many matches as match of type Span<ScopeT>
    ...matches: MapTuple<MatchersT, SpanAndAnnotation<AllPossibleScopesT>[]>
  ) => number | string | boolean | undefined

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
  TracerScopeKeysT extends KeysOfUnion<AllPossibleScopesT>,
  AllPossibleScopesT,
  OriginatedFromT extends string,
> {
  name: string
  startSpan:
    | SpanMatch<TracerScopeKeysT, AllPossibleScopesT, OriginatedFromT>
    | 'operation-start'
  endSpan:
    | SpanMatch<TracerScopeKeysT, AllPossibleScopesT, OriginatedFromT>
    | 'operation-end'
    | 'interactive'
}

/**
 * Definition of custom values input
 */
export interface ComputedValueDefinitionInput<
  TracerScopeKeysT extends KeysOfUnion<AllPossibleScopesT>,
  AllPossibleScopesT,
  MatchersT extends SpanMatch<
    TracerScopeKeysT,
    AllPossibleScopesT,
    OriginatedFromT
  >[],
  OriginatedFromT extends string,
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
  OriginatedFromT extends string,
> {
  readonly definition: CompleteTraceDefinition<
    TracerScopeKeysT,
    AllPossibleScopesT,
    OriginatedFromT
  >
  readonly input: ActiveTraceInput<
    SelectScopeByKey<TracerScopeKeysT, AllPossibleScopesT>,
    OriginatedFromT
  >
}
