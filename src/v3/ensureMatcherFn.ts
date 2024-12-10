import { type SpanMatch, type SpanMatcherFn, fromDefinition } from './matchSpan'
import type { ArrayWithAtLeastOneElement } from './typeUtils'

export function ensureMatcherFn<
  TracerScopeT extends AllPossibleScopesT,
  AllPossibleScopesT,
  MatcherInputT extends SpanMatch<TracerScopeT, AllPossibleScopesT> = SpanMatch<
    TracerScopeT,
    AllPossibleScopesT
  >,
>(
  matcherFnOrDefinition: MatcherInputT,
): SpanMatcherFn<TracerScopeT, AllPossibleScopesT> {
  return typeof matcherFnOrDefinition === 'function'
    ? matcherFnOrDefinition
    : fromDefinition<TracerScopeT, AllPossibleScopesT>(matcherFnOrDefinition)
}

function arrayHasAtLeastOneElement<T>(
  arr: readonly T[],
): arr is ArrayWithAtLeastOneElement<T> {
  return arr.length > 0
}

export function convertMatchersToFns<
  TracerScopeT extends AllPossibleScopesT,
  AllPossibleScopesT,
>(
  matchers: readonly SpanMatch<TracerScopeT, AllPossibleScopesT>[] | undefined,
):
  | ArrayWithAtLeastOneElement<SpanMatcherFn<TracerScopeT, AllPossibleScopesT>>
  | undefined {
  const mapped: SpanMatcherFn<TracerScopeT, AllPossibleScopesT>[] | undefined =
    matchers?.map((m) => ensureMatcherFn<TracerScopeT, AllPossibleScopesT>(m))
  if (mapped && arrayHasAtLeastOneElement(mapped)) {
    return mapped
  }
  return undefined
}
