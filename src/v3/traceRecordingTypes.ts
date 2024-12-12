/* eslint-disable @typescript-eslint/consistent-indexed-object-style */
import type { SpanAndAnnotation } from './spanAnnotationTypes'
import type { Attributes } from './spanTypes'
import type {
  SelectScopeByKey,
  Timestamp,
  TraceInterruptionReason,
  TraceStatus,
  TraceType,
} from './types'
import type { KeysOfUnion } from './typeUtils'

export interface ComputedSpan {
  // time relative to beginning of the trace
  startOffset: number
  duration: number
}

export interface ComputedRenderSpan {
  /** time relative to beginning of the trace */
  startOffset: number
  /** time from startOffset to the first moment we are able to start rendering the data */
  timeToData: number
  /** time from startOffset to the first loading state rendered */
  timeToLoading: number
  /** time from startOffset to fully displaying the content */
  timeToContent: number
  renderCount: number
  /** the sum of all render durations */
  sumOfDurations: number
}

export interface TraceRecordingBase<TracerScopeT> {
  /**
   * random generated unique value or provided by the user at start
   */
  id: string

  /**
   * name of the trace / operation
   */
  name: string

  startTime: Timestamp
  scope: TracerScopeT

  type: TraceType

  // set to 'error' if any span with status: 'error' was part of the actual trace
  // (except if it happened while in the waiting-for-interactive state)
  status: TraceStatus

  // STRICTER TYPE TODO: separate out trace recording into a union of trace recording and interrupted trace recording (fields that will be different: interruption reason,duration, and status)
  interruptionReason?: TraceInterruptionReason
  duration: number | null

  // TODO: should we call this durationTillInteractive for consistency?
  startTillInteractive: number | null
  completeTillInteractive: number | null

  // feature flags, etc.
  attributes: Attributes

  // these are manually defined and have to be unique
  computedSpans: {
    [spanName: string]: ComputedSpan
  }

  /**
   * For each render beacon, the time from the first render start until the last render end *and idle*.
   */
  computedRenderBeaconSpans: {
    [spanName: string]: ComputedRenderSpan
  }

  computedValues: {
    [valueName: string]: number | string | boolean
  }

  // TODO: should this get moved to convertToRum?
  /**
   * Merged attributes of the spans with the same type and name.
   * If attributes changed, most recent ones overwrite older ones.
   */
  spanAttributes: {
    [typeAndName: string]: {
      [attributeName: string]: unknown
    }
  }
}

export interface TraceRecording<
  TracerScopeKeysT extends KeysOfUnion<AllPossibleScopesT>,
  AllPossibleScopesT,
> extends TraceRecordingBase<
    SelectScopeByKey<TracerScopeKeysT, AllPossibleScopesT>
  > {
  entries: SpanAndAnnotation<AllPossibleScopesT>[]
}
