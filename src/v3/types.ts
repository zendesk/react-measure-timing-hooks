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

export type ScopeBase<ScopeT> = Record<keyof ScopeT, string | number | boolean>

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

export type ReportFn<AllScopesT extends Partial<ScopeBase<AllScopesT>>> = <
  ThisTraceScopeKeysT extends keyof AllScopesT,
>(
  trace: TraceRecording<Pick<AllScopesT, ThisTraceScopeKeysT>>,
) => void

export interface TraceManagerConfig<AllScopesT extends ScopeBase<AllScopesT>> {
  reportFn: ReportFn<Partial<AllScopesT>>
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
  performanceEntryDeduplicationStrategy?: SpanDeduplicationStrategy<AllScopesT>
}

export interface Tracer<
  AllScopesT extends ScopeBase<AllScopesT>,
  ThisTraceScopeKeysT extends keyof AllScopesT,
> {
  /**
   * @returns The ID of the trace.
   */
  start: (
    input: StartTraceConfig<Pick<AllScopesT, ThisTraceScopeKeysT>>,
  ) => string

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
export interface TraceDefinition<
  AllScopesT extends ScopeBase<AllScopesT>,
  ThisTraceScopeKeysT extends keyof AllScopesT,
> {
  /**
   * The name of the trace.
   */
  name: string

  type?: TraceType

  scopes: readonly ThisTraceScopeKeysT[]

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
    SpanMatch<AllScopesT, NoInfer<ThisTraceScopeKeysT>>
  >
  debounceOn?: ArrayWithAtLeastOneElement<
    SpanMatch<AllScopesT, NoInfer<ThisTraceScopeKeysT>>
  >
  interruptOn?: ArrayWithAtLeastOneElement<
    SpanMatch<AllScopesT, NoInfer<ThisTraceScopeKeysT>>
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
    AllScopesT,
    NoInfer<ThisTraceScopeKeysT>
  >[]
}

/**
 * Trace Definition with added fields and converting all matchers into functions.
 * Used internally by the TraceManager.
 */
export interface CompleteTraceDefinition<
  AllScopesT extends ScopeBase<AllScopesT>,
  ThisTraceScopeKeysT extends keyof AllScopesT,
> extends TraceDefinition<AllScopesT, ThisTraceScopeKeysT> {
  computedSpanDefinitions: readonly ComputedSpanDefinition<AllScopesT>[]
  computedValueDefinitions: readonly ComputedValueDefinition<
    AllScopesT,
    SpanMatcherFn<AllScopesT, ThisTraceScopeKeysT>[]
  >[]

  requiredToEnd: ArrayWithAtLeastOneElement<
    SpanMatcherFn<AllScopesT, ThisTraceScopeKeysT>
  >
  debounceOn?: ArrayWithAtLeastOneElement<
    SpanMatcherFn<AllScopesT, ThisTraceScopeKeysT>
  >
  interruptOn?: ArrayWithAtLeastOneElement<
    SpanMatcherFn<AllScopesT, ThisTraceScopeKeysT>
  >

  /**
   * A list of span matchers that will suppress error status propagation to the trace level.
   * If a span matches any of these matchers, its error status will not affect the trace status.
   */
  suppressErrorStatusPropagationOn?: readonly SpanMatcherFn<
    AllScopesT,
    ThisTraceScopeKeysT
  >[]
}

/**
 * Strategy for deduplicating performance entries
 */
export interface SpanDeduplicationStrategy<
  AllScopesT extends Partial<ScopeBase<AllScopesT>>,
> {
  /**
   * Returns an existing span annotation if the span should be considered a duplicate
   */
  findDuplicate: (
    span: Span<AllScopesT>,
    recordedItems: SpanAndAnnotation<AllScopesT>[],
  ) => SpanAndAnnotation<AllScopesT> | undefined

  /**
   * Called when a span is recorded to update deduplication state
   */
  recordSpan: (
    span: Span<AllScopesT>,
    spanAndAnnotation: SpanAndAnnotation<AllScopesT>,
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
    existingSpan: Span<AllScopesT>,
    newSpan: Span<AllScopesT>,
  ) => Span<AllScopesT>
}

/**
 * Definition of custom spans
 */
export interface ComputedSpanDefinition<
  ScopeT extends Partial<ScopeBase<ScopeT>>,
> {
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
  ScopeT extends Partial<ScopeBase<ScopeT>>,
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
export interface ComputedSpanDefinitionInput<
  ScopeT extends Partial<ScopeBase<ScopeT>>,
> {
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
  ScopeT extends Partial<ScopeBase<ScopeT>>,
  MatchersT extends (SpanMatcherFn<ScopeT> | SpanMatchDefinition<ScopeT>)[],
> {
  name: string
  matches: [...MatchersT]
  computeValueFromMatches: (
    ...matches: MapTuple<MatchersT, SpanAndAnnotation<ScopeT>[]>
  ) => number | string | boolean
}
