import type { CPUIdleProcessorOptions } from './firstCPUIdle'
import type { SpanMatch, SpanMatchDefinition, SpanMatcherFn } from './matchSpan'
import type { SpanAndAnnotation } from './spanAnnotationTypes'
import type { Span, SpanStatus, SpanType, StartTraceConfig } from './spanTypes'
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

export type ReportFn<TracerScopeT, AllPossibleScopesT> = (
  trace: TraceRecording<TracerScopeT, AllPossibleScopesT>,
) => void

export interface TraceManagerConfig<TracerScopeT, AllPossibleScopesT> {
  reportFn: ReportFn<TracerScopeT, AllPossibleScopesT>
  // NEED CLARIFIATION TODO: what are the embeddedSpanTypes: SpanType[] that would actually goes to configuration of the "convertRecordingToRum" function
  // which would be called inside of reportFn
  generateId: () => string

  /**
   * The span types that should be omitted from the trace report.
   */
  spanTypesOmittedFromReport?: SpanType[]

  /**
   * Strategy for deduplicating performance entries.
   * If not provided, no deduplication will be performed.
   */
  performanceEntryDeduplicationStrategy?: SpanDeduplicationStrategy<AllPossibleScopesT>
}

export interface Tracer<TracerScopeT, AllPossibleScopesT> {
  /**
   * @returns The ID of the trace.
   */
  start: (input: StartTraceConfig<TracerScopeT>) => string

  defineComputedSpan: (
    computedSpanDefinition: ComputedSpanDefinitionInput<
      TracerScopeT,
      AllPossibleScopesT
    >,
  ) => void

  defineComputedValue: <
    MatchersT extends (
      | SpanMatcherFn<TracerScopeT, AllPossibleScopesT>
      | SpanMatchDefinition<TracerScopeT, AllPossibleScopesT>
    )[],
  >(
    computedValueDefinition: ComputedValueDefinitionInput<
      TracerScopeT,
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

/**
 * Definition of a trace that includes conditions on when to end, debounce, and interrupt.
 * The "input" version will be transformed into the standardized version internally,
 * converting all matchers into functions.
 */
export interface TraceDefinition<TracerScopeT, AllPossibleScopesT> {
  /**
   * The name of the trace.
   */
  name: string

  type?: TraceType

  scopes: readonly KeysOfUnion<TracerScopeT>[]

  /**
   * This may include renders spans of components that have to be rendered with all data
   * to consider the operation as visually complete
   * this is close to the idea of "Largest Contentful Paint"
   * but rather than using "Largest" as a shorthand,
   * we're giving the power to the engineer to manually define
   * which parts of the product are "critical" or most important
   */
  // TODO: should we rename `requiredToEnd` to `requiredToComplete` for consistency?
  requiredToEnd: ArrayWithAtLeastOneElement<
    SpanMatch<NoInfer<TracerScopeT>, AllPossibleScopesT>
  >
  debounceOn?: ArrayWithAtLeastOneElement<
    SpanMatch<NoInfer<TracerScopeT>, AllPossibleScopesT>
  >
  interruptOn?: ArrayWithAtLeastOneElement<
    SpanMatch<NoInfer<TracerScopeT>, AllPossibleScopesT>
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
    NoInfer<TracerScopeT>,
    AllPossibleScopesT
  >[]
}

/**
 * Trace Definition with added fields and converting all matchers into functions.
 * Used internally by the TraceManager.
 */
export interface CompleteTraceDefinition<TracerScopeT, AllPossibleScopesT>
  extends TraceDefinition<TracerScopeT, AllPossibleScopesT> {
  computedSpanDefinitions: readonly ComputedSpanDefinition<
    TracerScopeT,
    AllPossibleScopesT
  >[]
  computedValueDefinitions: readonly ComputedValueDefinition<
    TracerScopeT,
    AllPossibleScopesT,
    SpanMatcherFn<TracerScopeT, AllPossibleScopesT>[]
  >[]

  requiredToEnd: ArrayWithAtLeastOneElement<
    SpanMatcherFn<TracerScopeT, AllPossibleScopesT>
  >
  debounceOn?: ArrayWithAtLeastOneElement<
    SpanMatcherFn<TracerScopeT, AllPossibleScopesT>
  >
  interruptOn?: ArrayWithAtLeastOneElement<
    SpanMatcherFn<TracerScopeT, AllPossibleScopesT>
  >

  /**
   * A list of span matchers that will suppress error status propagation to the trace level.
   * If a span matches any of these matchers, its error status will not affect the trace status.
   */
  suppressErrorStatusPropagationOn?: readonly SpanMatcherFn<
    TracerScopeT,
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
    recordedItems: SpanAndAnnotation<AllPossibleScopesT>[],
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
export interface ComputedSpanDefinition<TracerScopeT, AllPossibleScopesT> {
  name: string
  /**
   * startSpan is the *first* span matching the condition that will be considered as the start of the computed span
   */
  startSpan: SpanMatcherFn<TracerScopeT, AllPossibleScopesT> | 'operation-start'
  /**
   * endSpan is the *last* span matching the condition that will be considered as the end of the computed span
   */
  endSpan:
    | SpanMatcherFn<TracerScopeT, AllPossibleScopesT>
    | 'operation-end'
    | 'interactive'
}

/**
 * Definition of custom values
 */
export interface ComputedValueDefinition<
  TracerScopeT,
  AllPossibleScopesT,
  MatchersT extends SpanMatcherFn<TracerScopeT, AllPossibleScopesT>[],
> {
  name: string
  matches: [...MatchersT]
  computeValueFromMatches: (
    // as many matches as match of type Span<ScopeT>
    ...matches: MapTuple<MatchersT, SpanAndAnnotation<AllPossibleScopesT>[]>
  ) => number | string | boolean
}

/**
 * Definition of custom spans input
 */
export interface ComputedSpanDefinitionInput<TracerScopeT, AllPossibleScopesT> {
  name: string
  startSpan: SpanMatch<TracerScopeT, AllPossibleScopesT> | 'operation-start'
  endSpan:
    | SpanMatch<TracerScopeT, AllPossibleScopesT>
    | 'operation-end'
    | 'interactive'
}

/**
 * Definition of custom values input
 */
export interface ComputedValueDefinitionInput<
  TracerScopeT,
  AllPossibleScopesT,
  MatchersT extends SpanMatch<TracerScopeT, AllPossibleScopesT>[],
> {
  name: string
  matches: [...MatchersT]
  computeValueFromMatches: (
    ...matches: MapTuple<MatchersT, SpanAndAnnotation<AllPossibleScopesT>[]>
  ) => number | string | boolean
}

export type SelectScopeByKey<
  SelectScopeKeyT extends PropertyKey,
  ScopesT,
> = Prettify<
  ScopesT extends { [AnyKey in SelectScopeKeyT]: ScopeValue } ? ScopesT : never
>

export type DeriveScopeFromPerformanceEntryFn<AllPossibleScopesT> = (
  entry: PerformanceEntry,
) => ScopeOnASpan<AllPossibleScopesT> | undefined
