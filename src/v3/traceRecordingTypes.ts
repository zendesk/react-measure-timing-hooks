/* eslint-disable @typescript-eslint/consistent-indexed-object-style */
import type { SpanAndAnnotation } from './spanAnnotationTypes'
import type { Attributes } from './spanTypes'
import type {
  MapSchemaToTypes,
  Timestamp,
  TraceInterruptionReason,
  TraceStatus,
  TraceType,
} from './types'

export interface ComputedSpan {
  // time relative to beginning of the trace
  // TODO: should this be renamed to operationRelativeStartTime for consistency?
  startOffset: number
  duration: number
}

export interface ComputedRenderSpan {
  /** time relative to beginning of the trace */
  startOffset: number
  /** time from startOffset to the first loading state rendered */
  firstRenderTillLoading: number
  /** time from startOffset to the first moment we are able to start rendering the data */
  firstRenderTillData: number
  /** time from startOffset to first displaying the complete content */
  firstRenderTillContent: number
  renderCount: number
  /** the sum of all render durations */
  sumOfRenderDurations: number
}

export interface TraceRecordingBase<RelationSchemaT> {
  /**
   * random generated unique value or provided by the user at start
   */
  id: string

  /**
   * name of the trace / operation
   */
  name: string

  startTime: Timestamp
  relatedTo: MapSchemaToTypes<RelationSchemaT> | undefined

  type: TraceType

  // if trace was completed:
  // it's set to 'error' if any span with status: 'error' was part
  // of the actual trace (not while waiting-for-interactive, as that's considered the addition).
  // if the trace was interrupted, it's set to 'interrupted'
  // otherwise it's 'ok'
  status: TraceStatus

  variant: string

  // STRICTER TYPE TODO: separate out trace recording into a union of trace recording and interrupted trace recording (fields that will be different: interruption reason,duration, and status)
  interruptionReason?: TraceInterruptionReason
  duration: number | null

  additionalDurations: {
    startTillInteractive: number | null
    startTillRequirementsMet: number | null
    completeTillInteractive: number | null
  }

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
}

export interface TraceRecording<
  SelectedRelationNameT extends keyof RelationSchemasT,
  RelationSchemasT,
> extends TraceRecordingBase<RelationSchemasT[SelectedRelationNameT]> {
  entries: readonly SpanAndAnnotation<RelationSchemasT>[]
}
