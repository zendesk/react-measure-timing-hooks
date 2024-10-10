/* eslint-disable @typescript-eslint/consistent-indexed-object-style */

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

export type InternalPerformanceEntryType =
  | 'component-render-start'
  | 'component-render'
  | 'component-unmount'

export type EntryType =
  | NativePerformanceEntryType
  | InternalPerformanceEntryType

export interface TraceEntryInput<ScopeT extends ScopeBase> {
  type: EntryType
  commonName: string

  // performance.now() time
  startTime: number
  // absolute count of ms from epoch
  startTimeEpoch: number

  // if this is just an event, this 0, span will have > 0
  duration: number

  status: 'ok' | 'error'

  scope: ScopeT

  attributes: {
    [name: string]: unknown
  }

  // the complete name of the related event, that's specific to this event
  // e.g. https://domain.zendesk.com/apis/ticket/123.json
  originalName: string

  performanceEntry?: PerformanceEntry
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

export interface Trace {
  // random generated unique value
  id: string

  // name of the trace / operation
  // TODO: define naming convention
  name: string

  type: 'user-operation' | 'process'

  // set to 'error' if any entry with status: 'error' was part of the actual trace
  // (except if it happened while in the waiting-for-interactive state)
  status: 'ok' | 'error' | 'interrupted'

  interruptionReason?:
    | 'timeout'
    | 'another-trace-started'
    | 'manually-aborted'
    | 'idle-component-no-longer-idle'

  // duration from start to satisfied all requiredToEnd + any debounced events
  // start till complete
  duration: number

  startTillInteractive: number
  completeTillInteractive: number

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

  // spans that don't exist as separate spans in the DB
  // useful for things like renders, which can repeat tens of times
  // during the same operation
  embeddedEntries: {
    [commonName: string]: {
      count: number
      totalDuration: number
      spans: { startOffset: number; duration: number }[]
    }
  }

  entryAttributes: {
    [commonName: string]: {
      [attributeName: string]: unknown
    }
  }

  // all common names of entires that can be used to query
  // & aggregate average start offset and duration
  includedEntryNames: string[]

  // all the other spans that did get recorded
  // spans: {
  //   [spanCommonName: string]: {
  //     count: number
  //     totalDuration: number
  //     firstSpanStartOffset: number
  //   }
  // }
}

export interface BeaconConfig<ScopeT extends ScopeBase> {
  componentName: string
  scope: ScopeT
  attributes: {
    [name: string]: unknown
  }
  renderedOutput: 'null' | 'loading' | 'content' | 'error'
  isIdle: boolean
}

export type UseBeacon<ScopeT extends ScopeBase> = (
  beaconConfig: BeaconConfig<ScopeT>,
) => void

export interface TraceManagerConfig {
  reportFn: (trace: Trace) => void
  embeddedEntryTypes: EntryType[]
}

export interface Tracer<ScopeT extends ScopeBase> {
  defineComputedEntry: (
    computedEntryDefinition: ComputedEntryDefinition<ScopeT>,
  ) => void

  defineComputedValue: (
    name: string,
    computedValueDefinition: ComputedValueDefinition<ScopeT>,
  ) => void
}

export interface TraceDefinition<ScopeT extends ScopeBase> {
  //
}

export interface MatchFunction<ScopeT extends ScopeBase> {
  scope: ScopeT
  index?: number
}

export interface ComputedEntryDefinition<ScopeT extends ScopeBase> {
  name: string
  startEntry: MatchFunction<ScopeT>
  endEntry: MatchFunction<ScopeT>
}

// export interface ComputedValueDefinition<ScopeT extends ScopeBase> {
//   name: string
//   match:
// }

export interface TraceManager<ScopeT extends ScopeBase> {
  constructor: (config: TraceManagerConfig) => void

  createTracer: (traceDefinition: TraceDefinition<ScopeT>) => Tracer<ScopeT>
}
