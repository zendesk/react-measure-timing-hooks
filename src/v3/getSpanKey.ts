import type { Span } from './spanTypes'
import type { ScopeBase } from './types'

export const getSpanKey = <ScopeT extends Partial<ScopeBase<ScopeT>>>(
  span: Span<ScopeT>,
) => `${span.type}|${span.name}`
