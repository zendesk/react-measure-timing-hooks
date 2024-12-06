import type { CPUIdleProcessorOptions } from './firstCPUIdle'
import type { SpanMatch, SpanMatchDefinition, SpanMatcherFn } from './matchSpan'
import type { SpanAndAnnotation } from './spanAnnotationTypes'
import type { Span, SpanStatus, SpanType, StartTraceConfig } from './spanTypes'
import type { TraceRecording } from './traceRecordingTypes'
import type { ArrayWithAtLeastOneElement, MapTuple } from './typeUtils'

export interface Timestamp {
  // absolute count of ms from epoch
  epoch: number
  // performance.now() time
  now: number
}

export type ScopeBase = Record<string, string | number | boolean>

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

export type ReportFn<ScopeT extends ScopeBase> = (
  trace: TraceRecording<ScopeT>,
) => void

export interface TraceManagerConfig<ScopeT extends ScopeBase> {
  reportFn: ReportFn<ScopeT>
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
  performanceEntryDeduplicationStrategy?: SpanDeduplicationStrategy<ScopeT>
}

export interface Tracer<ScopeT extends ScopeBase> {
  /**
   * @returns The ID of the trace.
   */
  start: (input: StartTraceConfig<ScopeT>) => string

  defineComputedSpan: (
    computedSpanDefinition: ComputedSpanDefinitionInput<ScopeT>,
  ) => void

  defineComputedValue: <
    MatchersT extends (SpanMatcherFn<ScopeT> | SpanMatchDefinition<ScopeT>)[],
  >(
    computedValueDefinition: ComputedValueDefinitionInput<ScopeT, MatchersT>,
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
export interface TraceDefinition<ScopeT extends ScopeBase> {
  /**
   * The name of the trace.
   */
  name: string

  type?: TraceType

  // TODO: implement this with typechecking
  // to ensure we cannot start a trace without the required scope keys
  requiredScopeKeys: (keyof ScopeT)[]

  /**
   * This may include renders spans of components that have to be rendered with all data
   * to consider the operation as visually complete
   * this is close to the idea of "Largest Contentful Paint"
   * but rather than using "Largest" as a shorthand,
   * we're giving the power to the engineer to manually define
   * which parts of the product are "critical" or most important
   */
  // TODO: should we rename `requiredToEnd` to `requiredToComplete` for consistency?
  requiredToEnd: ArrayWithAtLeastOneElement<SpanMatch<ScopeT>>
  debounceOn?: ArrayWithAtLeastOneElement<SpanMatch<ScopeT>>
  interruptOn?: ArrayWithAtLeastOneElement<SpanMatch<ScopeT>>
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
  suppressErrorStatusPropagationOn?: SpanMatch<ScopeT>[]
}

/**
 * Trace Definition with added fields and converting all matchers into functions.
 * Used internally by the TraceManager.
 */
export interface CompleteTraceDefinition<ScopeT extends ScopeBase>
  extends TraceDefinition<ScopeT> {
  computedSpanDefinitions: readonly ComputedSpanDefinition<ScopeT>[]
  computedValueDefinitions: readonly ComputedValueDefinition<
    ScopeT,
    SpanMatcherFn<ScopeT>[]
  >[]

  requiredToEnd: ArrayWithAtLeastOneElement<SpanMatcherFn<ScopeT>>
  debounceOn?: ArrayWithAtLeastOneElement<SpanMatcherFn<ScopeT>>
  interruptOn?: ArrayWithAtLeastOneElement<SpanMatcherFn<ScopeT>>

  /**
   * A list of span matchers that will suppress error status propagation to the trace level.
   * If a span matches any of these matchers, its error status will not affect the trace status.
   */
  suppressErrorStatusPropagationOn?: SpanMatcherFn<ScopeT>[]
}

/**
 * Strategy for deduplicating performance entries
 */
export interface SpanDeduplicationStrategy<ScopeT extends ScopeBase> {
  /**
   * Returns an existing span annotation if the span should be considered a duplicate
   */
  findDuplicate: (
    span: Span<ScopeT>,
    recordedItems: SpanAndAnnotation<ScopeT>[],
  ) => SpanAndAnnotation<ScopeT> | undefined

  /**
   * Called when a span is recorded to update deduplication state
   */
  recordSpan: (
    span: Span<ScopeT>,
    spanAndAnnotation: SpanAndAnnotation<ScopeT>,
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
    existingSpan: Span<ScopeT>,
    newSpan: Span<ScopeT>,
  ) => Span<ScopeT>
}

/**
 * Definition of custom spans
 */
export interface ComputedSpanDefinition<ScopeT extends ScopeBase> {
  name: string
  /**
   * startSpan is the *first* span matching the condition that will be considered as the start of the computed span
   */
  startSpan: SpanMatcherFn<ScopeT> | 'operation-start'
  /**
   * endSpan is the *last* span matching the condition that will be considered as the end of the computed span
   */
  endSpan: SpanMatcherFn<ScopeT> | 'operation-end' | 'interactive'
}

/**
 * Definition of custom values
 */
export interface ComputedValueDefinition<
  ScopeT extends ScopeBase,
  MatchersT extends SpanMatcherFn<ScopeT>[],
> {
  name: string
  matches: [...MatchersT]
  computeValueFromMatches: (
    // as many matches as match of type Span<ScopeT>
    ...matches: MapTuple<MatchersT, SpanAndAnnotation<ScopeT>[]>
  ) => number | string | boolean
}

/**
 * Definition of custom spans input
 */
export interface ComputedSpanDefinitionInput<ScopeT extends ScopeBase> {
  name: string
  startSpan:
    | SpanMatcherFn<ScopeT>
    | SpanMatchDefinition<ScopeT>
    | 'operation-start'
  endSpan:
    | SpanMatcherFn<ScopeT>
    | SpanMatchDefinition<ScopeT>
    | 'operation-end'
    | 'interactive'
}

/**
 * Definition of custom values input
 */
export interface ComputedValueDefinitionInput<
  ScopeT extends ScopeBase,
  MatchersT extends (SpanMatcherFn<ScopeT> | SpanMatchDefinition<ScopeT>)[],
> {
  name: string
  matches: [...MatchersT]
  computeValueFromMatches: (
    ...matches: MapTuple<MatchersT, SpanAndAnnotation<ScopeT>[]>
  ) => number | string | boolean
}
