/* eslint-disable @typescript-eslint/consistent-indexed-object-style */

import { ErrorInfo } from 'react'
import type { TraceManager } from './traceManager'

export type ScopeBase = Record<string, string | number | boolean>

export type NativePerformanceEntryType =
  | 'element'
  | 'event'
  | 'first-input'
  | 'largest-contentful-paint'
  | 'layout-shift'
  | 'long-animation-frame'
  | 'longtask'
  | 'mark'
  | 'measure'
  | 'navigation'
  | 'paint'
  | 'resource'
  | 'taskattribution'
  | 'visibility-state'

export type ComponentLifecycleSpanType =
  | 'component-render-start'
  | 'component-render'
  | 'component-unmount'

export type SpanType = NativePerformanceEntryType | ComponentLifecycleSpanType

export interface Timestamp {
  // absolute count of ms from epoch
  epoch: number
  // performance.now() time
  now: number
}

export interface StartTraceConfig<ScopeT extends ScopeBase> {
  id?: string
  scope: ScopeT
  startTime?: Partial<Timestamp>
  /**
   * any attributes that should be
   */
  attributes?: {
    [name: string]: unknown
  }
}

export type OnEndFn<ScopeT extends ScopeBase> = (
  trace: TraceRecording<ScopeT>,
) => void

export interface ActiveTraceConfig<ScopeT extends ScopeBase>
  extends StartTraceConfig<ScopeT> {
  id: string
  startTime: Timestamp
  onEnd: OnEndFn<ScopeT>
}

export type SpanStatus = 'ok' | 'error'

export interface Attributes {
  [key: string]: unknown
}

export interface SpanBase<ScopeT extends ScopeBase> {
  type: SpanType

  /**
   * The common name of the span.
   * If converted from a PerformanceEntry, this is a sanitized version of the name.
   */
  name: string

  startTime: Timestamp

  // non performance entries, scope would be coming from outside like ticket id or user id
  // performance entries, there is no scope OR scope is in performance detail
  scope?: ScopeT

  attributes: Attributes

  /**
   * The duration of this span.
   * If this span is just an event (a point in time), this will be 0.
   * On the other hand, spans will have duration > 0.
   */
  duration: number

  /**
   * Status of the span ('error' or 'ok').
   */
  // TODO: come back to this decision
  status?: SpanStatus

  /**
   * The original PerformanceEntry from which the Span was created
   */
  performanceEntry?: PerformanceEntry

  /**
   * if status is error, optionally provide the Error object with additional metadata
   */
  error?: Error
}

export interface ComponentRenderSpan<ScopeT extends ScopeBase>
  extends SpanBase<ScopeT>,
  BeaconConfig<ScopeT> {
  type: ComponentLifecycleSpanType
  errorInfo?: ErrorInfo
}

export type InitiatorType =
  | 'audio'
  | 'beacon'
  | 'body'
  | 'css'
  | 'early-hint'
  | 'embed'
  | 'fetch'
  | 'frame'
  | 'iframe'
  | 'icon'
  | 'image'
  | 'img'
  | 'input'
  | 'link'
  | 'navigation'
  | 'object'
  | 'ping'
  | 'script'
  | 'track'
  | 'video'
  | 'xmlhttprequest'
  | 'other';

export interface ResourceSpan<ScopeT extends ScopeBase> extends SpanBase<ScopeT> {
  resourceDetails: {
    initiatorType: InitiatorType
    query: Record<string, string | string[]>
    hash: string
  }
}

/**
 * All possible trace entries
 */
export type Span<ScopeT extends ScopeBase> =
  | SpanBase<ScopeT>
  | ComponentRenderSpan<ScopeT>
  | ResourceSpan<ScopeT>

/**
 * Criteria for matching performance entries.
 */
export interface SpanMatchCriteria<ScopeT extends ScopeBase> {
  /**
   * The common name of the span to match. Can be a string, RegExp, or function.
   */
  name?: string | RegExp | ((name: string) => boolean)

  /**
   * The PerformanceEntry.name of the entry to match. Can be a string, RegExp, or function.
   */
  performanceEntryName?: string | RegExp | ((name: string) => boolean)

  /**
   * The subset of attributes (metadata) to match against the span.
   */
  attributes?: Attributes

  status?: SpanStatus
  type?: SpanType

  scope?: ScopeT

  /**
   * The occurrence of the span with the same name within the operation.
   */
  occurrence?: number

  /**
   * only applicable for component-lifecycle entries
   */
  isIdle?: boolean
}

/**
 * Function type for matching performance entries.
 */
export type SpanMatchFunction<ScopeT extends ScopeBase> = (
  span: Span<ScopeT>,
) => boolean

/**
 * Entries can either by matched by a criteria or function
 */
export type SpanMatcher<ScopeT extends ScopeBase> =
  | SpanMatchCriteria<ScopeT>
  | SpanMatchFunction<ScopeT>

export interface SpanAnnotation {
  /**
   * The ID of the operation the event belongs to.
   */
  id: string
  /**
   * The occurrence of the span with the same name within the operation.
   * Usually 1 (first span)
   */
  occurrence: number
  /**
   * Offset from the start of the operation to the start of the event.
   * aka operationStartOffset or operationStartToEventStart
   */
  operationRelativeStartTime: number
  /**
   * Relative end time of the event within the operation.
   */
  operationRelativeEndTime: number
}

export interface SpanAnnotationRecord {
  [operationName: string]: SpanAnnotation
}

export interface SpanAndAnnotationEntry<ScopeT extends ScopeBase> {
  span: Span<ScopeT>
  annotation: SpanAnnotation
}

/**
 * for now this is always 'operation', but in the future we could also implement tracing 'process' types
 */
export type TraceType = 'operation'

export type TraceStatus = SpanStatus | 'interrupted'

export type TraceInterruptionReason =
  | 'timeout'
  | 'another-trace-started'
  | 'manually-aborted'
  | 'idle-component-no-longer-idle'
  | 'matched-on-interrupt'

export interface TraceRecordingBase<ScopeT extends ScopeBase> {
  /**
   * random generated unique value or provided by the user at start
   */
  id: string

  /**
   * name of the trace / operation
   */
  // TODO: define naming convention
  name: string

  scope: ScopeT

  type: TraceType

  // set to 'error' if any span with status: 'error' was part of the actual trace
  // (except if it happened while in the waiting-for-interactive state)
  status: TraceStatus

  interruptionReason?: TraceInterruptionReason
  duration: number

  startTillInteractive: number | null
  completeTillInteractive: number | null

  attributes: {
    // feature flags, etc.
    [attributeName: string]: unknown
  }

  // these are manually defined and have to be unique
  computedSpans: {
    [spanName: string]: {
      // time relative to beginning of the trace
      startOffset: number
      duration: number
    }
  }

  computedValues: {
    [valueName: string]: number | string | boolean
  }

  spanAttributes: {
    [typeAndName: string]: {
      [attributeName: string]: unknown
    }
  }

  // all the other spans that did get recorded
  // spans: {
  //   [spanCommonName: string]: {
  //     count: number
  //     totalDuration: number
  //     firstSpanStartOffset: number
  //   }
  // }
}

export interface TraceRecording<ScopeT extends ScopeBase>
  extends TraceRecordingBase<ScopeT> {
  entries: SpanAndAnnotationEntry<ScopeT>[]
}

export type RenderedOutput = 'null' | 'loading' | 'content' | 'error'

export interface BeaconConfig<ScopeT extends ScopeBase> {
  name: string
  scope: ScopeT
  renderedOutput: RenderedOutput
  isIdle: boolean
  attributes: Attributes
  error?: Error
}

export type UseBeacon<ScopeT extends ScopeBase> = (
  beaconConfig: BeaconConfig<ScopeT>,
) => void

export type ReportFn<ScopeT extends ScopeBase> = (
  trace: TraceRecording<ScopeT>,
) => void

export interface TraceManagerConfig<ScopeT extends ScopeBase> {
  reportFn: ReportFn<ScopeT>
  // TODO: embeddedSpanTypes: SpanType[] would actually goes to configuration of the "convertRecordingToRum" function
  // which would be called inside of reportFn
  generateId: () => string

  /**
   * The span types that should be omitted from the trace report.
   */
  spanTypesOmittedFromReport?: SpanType[]
}

type MapTuple<KeysTuple extends readonly unknown[], MapToValue> = {
  [Index in keyof KeysTuple]: MapToValue // T[KeysTuple[Index]]
}
/**
 *
 */
export interface Tracer<ScopeT extends ScopeBase> {
  /**
   * @returns The ID of the trace.
   */
  start: (input: StartTraceConfig<ScopeT>) => string

  defineComputedSpan: (
    computedSpanDefinition: ComputedSpanDefinition<ScopeT>,
  ) => void

  defineComputedValue: <MatchersT extends SpanMatchCriteria<ScopeT>[]>(
    computedValueDefinition: ComputedValueDefinition<ScopeT, MatchersT>,
  ) => void
}

export interface CaptureInteractiveConfig {
  /**
   * How long to wait for the page to be interactive.
   */
  timeout: number
  /**
   * Duration to debounce long events before considering the page interactive.
   */
  debounceLongTasksBy?: number
  /**
   * Ignore long events that are shorter than this duration.
   */
  skipDebounceForLongEventsShorterThan?: number
}

/**
 * Definition of a trace that includes conditions on when to end, debounce, and interrupt.
 */
export interface TraceDefinition<ScopeT extends ScopeBase> {
  /**
   * The name of the trace.
   */
  name: string

  type: TraceType

  // TODO: implement this with typechecking
  // to ensure we cannot start a trace without the required scope keys
  requiredScopeKeys: keyof ScopeT[]

  requiredToEnd: SpanMatchCriteria<ScopeT>[]
  debounceOn?: SpanMatchCriteria<ScopeT>[]
  interruptOn?: SpanMatchCriteria<ScopeT>[]

  /**
   * Indicates the operation should continue capturing events until interactivity is reached after the operation ends.
   * Provide a boolean or a configuration object.
   */
  captureInteractive?: boolean | CaptureInteractiveConfig
}

/**
 * Definition of custom spans
 */
export interface ComputedSpanDefinition<ScopeT extends ScopeBase> {
  name: string
  startSpan: SpanMatchCriteria<ScopeT>
  endSpan: SpanMatchCriteria<ScopeT>
}

/**
 * Definition of custom values
 */
export interface ComputedValueDefinition<
  ScopeT extends ScopeBase,
  MatchersT extends SpanMatchCriteria<ScopeT>[],
> {
  name: string
  matches: [...MatchersT]
  computeValueFromMatches: (
    // as many matches as match of type Span<ScopeT>
    matches: MapTuple<MatchersT, SpanAndAnnotationEntry<ScopeT>>,
  ) => number | string | boolean
}

/**
 * Trace Definition with added fields
 */
export interface CompleteTraceDefinition<ScopeT extends ScopeBase>
  extends TraceDefinition<ScopeT> {
  computedSpanDefinitions: readonly ComputedSpanDefinition<ScopeT>[]
  computedValueDefinitions: readonly ComputedValueDefinition<
    ScopeT,
    SpanMatchCriteria<ScopeT>[]
  >[]
}

export type GetScopeTFromTraceManager<
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  TraceManagerT extends TraceManager<any>,
> = TraceManagerT extends TraceManager<infer ScopeT> ? ScopeT : never
