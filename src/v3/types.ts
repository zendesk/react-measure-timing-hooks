/* eslint-disable @typescript-eslint/consistent-indexed-object-style */

import { ErrorInfo } from 'react'

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
  | 'visibility-state'

export type ComponentLifecycleEntryType =
  | 'component-render-start'
  | 'component-render'
  | 'component-unmount'

export type EntryType = NativePerformanceEntryType | ComponentLifecycleEntryType

export interface Timestamp {
  // absolute count of ms from epoch
  epoch: number
  // performance.now() time
  now: number
}

export interface StartTraceInput<ScopeT extends ScopeBase> {
  id?: string
  scope: ScopeT
  startTime?: Partial<Timestamp>
  attributes?: {
    [name: string]: unknown
  }
}

export interface ActiveTraceInput<ScopeT extends ScopeBase>
  extends StartTraceInput<ScopeT> {
  id: string
  startTime: Timestamp
  onEnd: (trace: TraceRecording<ScopeT>) => void
}

export type EntryStatus = 'ok' | 'error'

export interface TraceEntryBase<ScopeT extends ScopeBase> {
  type: EntryType
  /**
   * The common name of the entry.
   * If converted from a PerformanceEntry, this is a sanitized version of the name.
   */
  name: string

  startTime: Timestamp

  scope: ScopeT

  attributes: {
    [name: string]: unknown
  }

  // if this is just an event, this 0, span will have > 0
  duration: number

  status: EntryStatus

  // // the complete name of the related event, that's specific to this event
  // // e.g. https://domain.zendesk.com/apis/ticket/123.json
  // originalName: string

  performanceEntry?: PerformanceEntry

  error?: Error
}

export interface ComponentRenderEntryInput<ScopeT extends ScopeBase>
  extends TraceEntryBase<ScopeT>,
    BeaconConfig<ScopeT> {
  type: ComponentLifecycleEntryType
  errorInfo?: ErrorInfo
}

export type TraceEntry<ScopeT extends ScopeBase> = TraceEntryBase<ScopeT>

export type Attributes = Record<string, unknown>

/**
 * Criteria for matching performance entries.
 */
export interface EntryMatchCriteria<ScopeT extends ScopeBase> {
  /**
   * The common name of the entry to match. Can be a string, RegExp, or function.
   */
  name?: string | RegExp | ((name: string) => boolean)

  /**
   * The PerformanceEntry.name of the entry to match. Can be a string, RegExp, or function.
   */
  performanceEntryName?: string | RegExp | ((name: string) => boolean)

  /**
   * The subset of attributes (metadata) to match against the entry.
   */
  attributes?: Attributes

  status?: EntryStatus
  type?: EntryType

  scope?: ScopeT

  /**
   * The occurrence of the entry with the same name within the operation.
   */
  occurrence?: number

  /**
   * only applicable for component-lifecycle entries
   */
  isIdle?: boolean
}

export interface EntryAnnotation {
  [operationName: string]: {
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
}

export type TraceType = 'operation' | 'process'

export type TraceStatus = EntryStatus | 'interrupted'

export type TraceInterruptionReason =
  | 'timeout'
  | 'another-trace-started'
  | 'manually-aborted'
  | 'idle-component-no-longer-idle'

export interface RumTraceRecording<ScopeT extends ScopeBase>
  extends TraceRecordingBase<ScopeT> {
  scope: ScopeT

  // spans that don't exist as separate spans in the DB
  // useful for things like renders, which can repeat tens of times
  // during the same operation
  embeddedEntries: {
    [typeAndName: string]: {
      count: number
      totalDuration: number
      spans: {
        startOffset: number
        duration: number
        error?: true | undefined
      }[]
    }
  }

  // `typeAndName`s of entires that can be used to query
  // & aggregate average start offset and duration
  // 'resource|/apis/tickets/123.json'
  // 'resource|graphql/query/GetTickets'
  // 'component-render|OmniLog'
  // 'error|Something went wrong'
  // 'measure|ticket.fetch'
  nonEmbeddedEntries: string[]
}

export interface TraceRecordingBase<ScopeT extends ScopeBase> {
  // random generated unique value
  id: string

  // name of the trace / operation
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
  attributes: {
    [name: string]: unknown
  }
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
  start: (input: StartTraceInput<ScopeT>) => string

  defineComputedSpan: (
    computedSpanDefinition: ComputedSpanDefinition<ScopeT>,
  ) => void

  defineComputedValue: <MatchersT extends EntryMatchCriteria<ScopeT>[]>(
    computedValueDefinition: ComputedValueDefinition<ScopeT, MatchersT>,
  ) => void
}

export interface TraceDefinition<ScopeT extends ScopeBase> {
  /**
   * The name of the trace.
   */
  name: string

  type: TraceType

  // TODO: implement this with typechecking
  // to ensure we cannot start a trace without the required scope keys
  requiredScopeKeys: keyof ScopeT[]

  requiredToEnd: EntryMatchCriteria<ScopeT>[]
  debounceOn?: EntryMatchCriteria<ScopeT>[]
  interruptOn?: EntryMatchCriteria<ScopeT>[]
}

export interface ComputedSpanDefinition<ScopeT extends ScopeBase> {
  name: string
  startEntry: EntryMatchCriteria<ScopeT>
  endEntry: EntryMatchCriteria<ScopeT>
}

export interface ComputedValueDefinition<
  ScopeT extends ScopeBase,
  MatchersT extends EntryMatchCriteria<ScopeT>[],
> {
  name: string
  matches: [...MatchersT]
  computeValueFromMatches: (
    // as many matches as match of type TraceEntryInput<ScopeT>
    matches: MapTuple<MatchersT, TraceEntry<ScopeT>>,
  ) => number | string | boolean
}

export interface CompleteTraceDefinition<ScopeT extends ScopeBase>
  extends TraceDefinition<ScopeT> {
  computedSpanDefinitions: readonly ComputedSpanDefinition<ScopeT>[]
  computedValueDefinitions: readonly ComputedValueDefinition<
    ScopeT,
    EntryMatchCriteria<ScopeT>[]
  >[]
}

export interface ITraceManager<ScopeT extends ScopeBase> {
  createTracer: (traceDefinition: TraceDefinition<ScopeT>) => Tracer<ScopeT>
  processEntry: (entry: TraceEntry<ScopeT>) => EntryAnnotation
}

export type GetScopeTFromTraceManager<
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  TraceManagerT extends ITraceManager<any>,
> = TraceManagerT extends ITraceManager<infer ScopeT> ? ScopeT : never
