import type { Span } from './spanTypes'

export const getSpanKey = <RelationSchemasT>(span: Span<RelationSchemasT>) =>
  `${span.type}|${span.name}`
