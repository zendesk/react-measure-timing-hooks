/* eslint-disable @typescript-eslint/consistent-indexed-object-style */
import type { SpanMatcherFn } from './matchSpan'
import type { SpanAndAnnotation } from './spanAnnotationTypes'
import type { Attributes } from './spanTypes'
import type {
  MapTuple,
  ScopeBase,
  TraceInterruptionReason,
  TraceStatus,
  TraceType,
} from './types'

export interface TraceRecordingBase<ScopeT extends ScopeBase> {
  /**
   * random generated unique value or provided by the user at start
   */
  id: string

  /**
   * name of the trace / operation
   */
  name: string

  scope: ScopeT

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
}

export interface TraceRecording<ScopeT extends ScopeBase>
  extends TraceRecordingBase<ScopeT> {
  entries: SpanAndAnnotation<ScopeT>[]
}
/**
 * Definition of custom spans
 */
// IMPLEMENTATION TODO: Create ComputedSpanMatchCriteria
export interface ComputedSpanDefinition<ScopeT extends ScopeBase> {
  name: string
  startSpan: SpanMatcherFn<ScopeT> // TODO: | 'operation-start'
  endSpan: SpanMatcherFn<ScopeT> // TODO: | 'operation-end'
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
    matches: MapTuple<MatchersT, SpanAndAnnotation<ScopeT>>,
  ) => number | string | boolean
}
