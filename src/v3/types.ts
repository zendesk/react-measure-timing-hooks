/* eslint-disable @typescript-eslint/consistent-indexed-object-style */

import type { CPUIdleProcessorOptions } from './firstCPUIdle'
import type {
  Span,
  SpanMatchCriteria,
  SpanStatus,
  SpanType,
  StartTraceConfig,
} from './spanTypes'
import type {
  ComputedSpanDefinition,
  ComputedValueDefinition,
  TraceRecording,
} from './traceRecordingTypes'

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
}

export type MapTuple<KeysTuple extends readonly unknown[], MapToValue> = {
  [Index in keyof KeysTuple]: MapToValue // T[KeysTuple[Index]]
}

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

export interface CaptureInteractiveConfig extends CPUIdleProcessorOptions {
  /**
   * How long to wait for CPU Idle before giving up.
   */
  timeout: number
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
  requiredScopeKeys: (keyof ScopeT)[]

  /**
   * This may include components that have to be rendered with all data
   * to consider the operation as visually complete
   * this is close to the idea of "Largest Contentful Paint"
   * but rather than using "Largest" as a shorthand,
   * we're giving the power to the engineer to manually define
   * which parts of the product are "critical" or most important
   */
  requiredToEnd: SpanMatchCriteria<ScopeT>[]
  debounceOn?: SpanMatchCriteria<ScopeT>[]
  interruptOn?: SpanMatchCriteria<ScopeT>[]

  debounceDuration?: number
  timeoutDuration?: number

  /**
   * Indicates the operation should continue capturing events until interactivity is reached after the operation ends.
   * Provide a boolean or a configuration object.
   */
  captureInteractive?: boolean | CaptureInteractiveConfig
}

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

export interface SpanAndAnnotation<ScopeT extends ScopeBase> {
  span: Span<ScopeT>
  annotation: SpanAnnotation
}
