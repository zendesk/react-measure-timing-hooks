/* eslint-disable @typescript-eslint/consistent-indexed-object-style */
import type { NonTerminalTraceStates } from './ActiveTrace'
import type { Span } from './spanTypes'

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
  /**
   * The state the event was recorded in.
   */
  recordedInState: NonTerminalTraceStates
  /**
   * If true, this is the last required span in the operation.
   */
  markedComplete?: boolean
  /**
   * If true, this is the span that marked the operation as interactive.
   */
  markedInteractive?: boolean
}

export interface SpanAnnotationRecord {
  [operationName: string]: SpanAnnotation
}

export interface SpanAndAnnotation<AllPossibleScopesT> {
  span: Span<AllPossibleScopesT>
  annotation: SpanAnnotation
}
