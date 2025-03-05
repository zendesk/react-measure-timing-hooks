import type { Span } from '../spanTypes'
import { TraceManager } from '../TraceManager'
import type { RelationSchemaValue } from '../types'

export function processSpans<
  const RelationSchemasT extends {
    [SchemaNameT in keyof RelationSchemasT]: {
      [K in keyof RelationSchemasT[SchemaNameT]]: RelationSchemaValue
    }
  },
>(
  spans: Span<RelationSchemasT>[],
  traceManager: TraceManager<RelationSchemasT>,
) {
  spans.forEach((span, i) => {
    traceManager.processSpan(span)
  })
}
