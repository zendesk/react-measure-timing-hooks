import type { Span } from './spanTypes'

export const getSpanKey = <AllPossibleScopesT>(
  span: Span<AllPossibleScopesT>,
) => `${span.type}|${span.name}`
