import type { SpanAndAnnotation } from './spanAnnotationTypes'
import type { DraftTraceContext } from './types'

// Helper to check if error is suppressed
export function isSuppressedError<RelationSchemasT>(
  trace: DraftTraceContext<keyof RelationSchemasT, RelationSchemasT, string>,
  spanAndAnnotation: SpanAndAnnotation<RelationSchemasT>,
) {
  return !!trace.definition.suppressErrorStatusPropagationOnSpans?.some((fn) =>
    fn(spanAndAnnotation, trace),
  )
}
