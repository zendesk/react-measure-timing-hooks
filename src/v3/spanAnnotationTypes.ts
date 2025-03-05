/* eslint-disable @typescript-eslint/consistent-indexed-object-style */
import type { Span } from './spanTypes'
import type { NonTerminalTraceStates } from './Trace'

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
   * If true, this is the first required span after having met all the required span criteria of the operation.
   * e.g. if the operation requires 3 spans, this will be true for that 3rd span.
   */
  markedRequirementsMet?: boolean
  /**
   * After all the required span criteria are met, and we completed debouncing.
   * If true, this is the last span of the operation (before page interactive capturing).
   * This span is used to calculate the duration of the entire trace.
   */
  markedComplete?: boolean
  /**
   * If true, this is the span was used to calculate the point at which the page became interactive.
   */
  markedPageInteractive?: boolean
  /**
   * Labels for the span based on label definitions from the Tracer. Empty if the span didn't match any of the label match definitions.
   */
  labels: string[]
}

export interface SpanAnnotationRecord {
  [operationName: string]: SpanAnnotation
}

export interface SpanAndAnnotation<RelationSchemasT> {
  span: Span<RelationSchemasT>
  annotation: SpanAnnotation
}
