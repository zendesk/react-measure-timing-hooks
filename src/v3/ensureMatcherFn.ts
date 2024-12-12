import { type SpanMatch, type SpanMatcherFn, fromDefinition } from './matchSpan'
import type { ArrayWithAtLeastOneElement, KeysOfUnion } from './typeUtils'

export function ensureMatcherFn<
  TracerScopeKeysT extends KeysOfUnion<AllPossibleScopesT>,
  AllPossibleScopesT,
  MatcherInputT extends SpanMatch<
    TracerScopeKeysT,
    AllPossibleScopesT
  > = SpanMatch<TracerScopeKeysT, AllPossibleScopesT>,
>(
  matcherFnOrDefinition: MatcherInputT,
): SpanMatcherFn<TracerScopeKeysT, AllPossibleScopesT> {
  return typeof matcherFnOrDefinition === 'function'
    ? matcherFnOrDefinition
    : fromDefinition<TracerScopeKeysT, AllPossibleScopesT>(
        matcherFnOrDefinition,
      )
}

function arrayHasAtLeastOneElement<T>(
  arr: readonly T[],
): arr is ArrayWithAtLeastOneElement<T> {
  return arr.length > 0
}

export function convertMatchersToFns<
  TracerScopeKeysT extends KeysOfUnion<AllPossibleScopesT>,
  AllPossibleScopesT,
>(
  matchers:
    | readonly SpanMatch<TracerScopeKeysT, AllPossibleScopesT>[]
    | undefined,
):
  | ArrayWithAtLeastOneElement<
      SpanMatcherFn<TracerScopeKeysT, AllPossibleScopesT>
    >
  | undefined {
  const mapped:
    | SpanMatcherFn<TracerScopeKeysT, AllPossibleScopesT>[]
    | undefined = matchers?.map((m) =>
    ensureMatcherFn<TracerScopeKeysT, AllPossibleScopesT>(m),
  )
  if (mapped && arrayHasAtLeastOneElement(mapped)) {
    return mapped
  }
  return undefined
}

export function convertLabelMatchersToFns<
  TracerScopeT extends AllPossibleScopesT,
  AllPossibleScopesT,
>(
  definitionLabelMatchers: Record<
    string,
    SpanMatch<TracerScopeT, AllPossibleScopesT>
  >,
): Record<string, SpanMatcherFn<TracerScopeT, AllPossibleScopesT>> {
  return Object.keys(definitionLabelMatchers).reduce<
    Record<string, SpanMatcherFn<TracerScopeT, AllPossibleScopesT>>
  >((acc, key) => {
    if (!definitionLabelMatchers?.[key]) return acc
    const matchFn = convertMatchersToFns([definitionLabelMatchers[key]])
    if (matchFn) {
      acc[key] = matchFn[0]
    }
    return acc
  }, {})
}
