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

export type ComponentLifecycleEntryType =
  | 'component-render-start'
  | 'component-render'
  | 'component-unmount'

export type EntryType = NativePerformanceEntryType | ComponentLifecycleEntryType | 'asset' | 'iframe'

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

export type TraceEntryStatus = 'ok' | 'error'

export interface Attributes {
  resource?: {
    type?:
    | 'document'
    | 'xhr'
    | 'beacon'
    | 'fetch'
    | 'css'
    | 'js'
    | 'image'
    | 'font'
    | 'media'
    | 'other'
    | 'native'
    method?:
    | 'POST'
    | 'GET'
    | 'HEAD'
    | 'PUT'
    | 'DELETE'
    | 'PATCH'
    | 'TRACE'
    | 'OPTIONS'
    | 'CONNECT'
    status?: number | undefined
  }
  resourceQuery?: Record<string, string | string[]>
  resourceHash?: string

  [key: string]: unknown
}

export interface TraceEntryBase<ScopeT extends ScopeBase> {
  type: EntryType

  /**
   * The common name of the trace entry.
   * If converted from a PerformanceEntry, this is a sanitized version of the name.
   */
  name: string

  startTime: Timestamp

  scope: ScopeT

  attributes: Attributes

  /**
   * The duration of this trace entry.
   * If this trace entry is just an event (a point in time), this will be 0.
   * On the other hand, spans will have duration > 0.
   */
  duration: number

  /**
   * Status of the trace entry ('error' or 'ok').
   */
  status: TraceEntryStatus

  /**
   * The original PerformanceEntry from which the TraceEntry
   */
  performanceEntry?: PerformanceEntry

  /**
   * if status is error, optionally provide the Error object with additional metadata
   */
  error?: Error
}

export interface ComponentRenderTraceEntry<ScopeT extends ScopeBase>
  extends TraceEntryBase<ScopeT>,
  BeaconConfig<ScopeT> {
  type: ComponentLifecycleEntryType
  errorInfo?: ErrorInfo
}

/**
 * All possible trace entries
 */
export type TraceEntry<ScopeT extends ScopeBase> =
  | TraceEntryBase<ScopeT>
  | ComponentRenderTraceEntry<ScopeT>

/**
 * Criteria for matching performance entries.
 */
export interface TraceEntryMatchCriteria<ScopeT extends ScopeBase> {
  /**
   * The common name of the trace entry to match. Can be a string, RegExp, or function.
   */
  name?: string | RegExp | ((name: string) => boolean)

  /**
   * The PerformanceEntry.name of the entry to match. Can be a string, RegExp, or function.
   */
  performanceEntryName?: string | RegExp | ((name: string) => boolean)

  /**
   * The subset of attributes (metadata) to match against the trace entry.
   */
  attributes?: Attributes

  status?: TraceEntryStatus
  type?: EntryType

  scope?: ScopeT

  /**
   * The occurrence of the trace entry with the same name within the operation.
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
export type TraceEntryMatchFunction<ScopeT extends ScopeBase> = (
  entry: TraceEntry<ScopeT>,
) => boolean

/**
 * Entries can either by matched by a criteria or function
 */
export type TraceEntryMatcher<ScopeT extends ScopeBase> =
  | TraceEntryMatchCriteria<ScopeT>
  | TraceEntryMatchFunction<ScopeT>

export interface TraceEntryAnnotation {
  /**
   * The ID of the operation the event belongs to.
   */
  id: string
  /**
   * The occurrence of the entry with the same name within the operation.
   * Usually 1 (first entry)
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

export interface TraceEntryAnnotationRecord {
  [operationName: string]: TraceEntryAnnotation
}

export interface TraceEntryAndAnnotation<ScopeT extends ScopeBase> {
  entry: TraceEntry<ScopeT>
  annotation: TraceEntryAnnotation
}

/**
 * for now this is always 'operation', but in the future we could also implement tracing 'process' types
 */
export type TraceType = 'operation'

export type TraceStatus = TraceEntryStatus | 'interrupted'

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

  // set to 'error' if any entry with status: 'error' was part of the actual trace
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

  entryAttributes: {
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
  entries: TraceEntry<ScopeT>[]
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
  // TODO: embeddedEntryTypes: EntryType[] would actually goes to configuration of the "convertRecordingToRum" function
  // which would be called inside of reportFn
  generateId: () => string

  /**
   * The entry types that should be omitted from the trace report.
   */
  entryTypesOmittedFromReport?: EntryType[]
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

  defineComputedValue: <MatchersT extends TraceEntryMatchCriteria<ScopeT>[]>(
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

  requiredToEnd: TraceEntryMatchCriteria<ScopeT>[]
  debounceOn?: TraceEntryMatchCriteria<ScopeT>[]
  interruptOn?: TraceEntryMatchCriteria<ScopeT>[]

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
  startEntry: TraceEntryMatchCriteria<ScopeT>
  endEntry: TraceEntryMatchCriteria<ScopeT>
}

/**
 * Definition of custom values
 */
export interface ComputedValueDefinition<
  ScopeT extends ScopeBase,
  MatchersT extends TraceEntryMatchCriteria<ScopeT>[],
> {
  name: string
  matches: [...MatchersT]
  computeValueFromMatches: (
    // as many matches as match of type TraceEntry<ScopeT>
    matches: MapTuple<MatchersT, TraceEntry<ScopeT>>,
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
    TraceEntryMatchCriteria<ScopeT>[]
  >[]
}

export type GetScopeTFromTraceManager<
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  TraceManagerT extends TraceManager<any>,
> = TraceManagerT extends TraceManager<infer ScopeT> ? ScopeT : never
