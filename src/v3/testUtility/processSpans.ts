import type { Span } from '../spanTypes'
import { TraceManager } from '../TraceManager'
import type { RelationSchemasBase } from '../types'

export function processSpans<
  const RelationSchemasT extends RelationSchemasBase<RelationSchemasT>,
>(
  spans: Span<RelationSchemasT>[],
  traceManager: TraceManager<RelationSchemasT>,
) {
  spans.forEach((span, i) => {
    traceManager.processSpan(span)
  })
}
