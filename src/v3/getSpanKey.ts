import type { Span } from './spanTypes'
import type { ScopeBase } from './types'

export const getSpanKey = <ScopeT extends ScopeBase>(span: Span<ScopeT>) =>
  `${span.type}|${span.name}`
