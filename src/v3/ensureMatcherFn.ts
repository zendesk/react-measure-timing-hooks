import { type SpanMatch, type SpanMatcherFn, fromDefinition } from './matchSpan'
import type { LabelMatchingFnsRecord, LabelMatchingInputRecord } from './types'
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
  TracerScopeKeysT extends KeysOfUnion<AllPossibleScopesT>,
  AllPossibleScopesT,
>(
  definitionLabelMatchers: LabelMatchingInputRecord<
    TracerScopeKeysT,
    AllPossibleScopesT
  >,
): LabelMatchingFnsRecord<TracerScopeKeysT, AllPossibleScopesT> {
  const matchers: LabelMatchingFnsRecord<TracerScopeKeysT, AllPossibleScopesT> =
    {}
  for (const key in definitionLabelMatchers) {
    // eslint-disable-next-line no-continue
    if (!definitionLabelMatchers?.[key]) continue
    matchers[key] = ensureMatcherFn<TracerScopeKeysT, AllPossibleScopesT>(
      definitionLabelMatchers[key],
    )
  }
  return matchers
}
