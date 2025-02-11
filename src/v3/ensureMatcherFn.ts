import { fromDefinition, type SpanMatch, type SpanMatcherFn } from './matchSpan'
import type { LabelMatchingFnsRecord, LabelMatchingInputRecord } from './types'
import type { ArrayWithAtLeastOneElement, KeysOfUnion } from './typeUtils'

export function ensureMatcherFn<
  TracerScopeKeysT extends KeysOfUnion<AllPossibleScopesT>,
  AllPossibleScopesT,
  const VariantT extends string,
  MatcherInputT extends SpanMatch<
    TracerScopeKeysT,
    AllPossibleScopesT,
    VariantT
  > = SpanMatch<TracerScopeKeysT, AllPossibleScopesT, VariantT>,
>(
  matcherFnOrDefinition: MatcherInputT,
): SpanMatcherFn<TracerScopeKeysT, AllPossibleScopesT, VariantT> {
  return typeof matcherFnOrDefinition === 'function'
    ? matcherFnOrDefinition
    : fromDefinition<TracerScopeKeysT, AllPossibleScopesT, VariantT>(
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
  const VariantT extends string,
>(
  matchers:
    | readonly SpanMatch<TracerScopeKeysT, AllPossibleScopesT, VariantT>[]
    | undefined,
):
  | ArrayWithAtLeastOneElement<
      SpanMatcherFn<TracerScopeKeysT, AllPossibleScopesT, VariantT>
    >
  | undefined {
  const mapped:
    | SpanMatcherFn<TracerScopeKeysT, AllPossibleScopesT, VariantT>[]
    | undefined = matchers?.map((m) =>
    ensureMatcherFn<TracerScopeKeysT, AllPossibleScopesT, VariantT>(m),
  )
  if (mapped && arrayHasAtLeastOneElement(mapped)) {
    return mapped
  }
  return undefined
}

export function convertLabelMatchersToFns<
  TracerScopeKeysT extends KeysOfUnion<AllPossibleScopesT>,
  AllPossibleScopesT,
  const VariantT extends string,
>(
  definitionLabelMatchers: LabelMatchingInputRecord<
    TracerScopeKeysT,
    AllPossibleScopesT,
    VariantT
  >,
): LabelMatchingFnsRecord<TracerScopeKeysT, AllPossibleScopesT, VariantT> {
  const matchers: LabelMatchingFnsRecord<
    TracerScopeKeysT,
    AllPossibleScopesT,
    VariantT
  > = {}
  for (const key in definitionLabelMatchers) {
    // eslint-disable-next-line no-continue
    if (!definitionLabelMatchers?.[key]) continue
    matchers[key] = ensureMatcherFn<
      TracerScopeKeysT,
      AllPossibleScopesT,
      VariantT
    >(definitionLabelMatchers[key])
  }
  return matchers
}
