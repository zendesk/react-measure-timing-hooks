import { type SpanMatch, type SpanMatcherFn, fromDefinition } from './matchSpan'
import type { LabelMatchingFnsRecord, LabelMatchingInputRecord } from './types'
import type { ArrayWithAtLeastOneElement, KeysOfUnion } from './typeUtils'

export function ensureMatcherFn<
  TracerScopeKeysT extends KeysOfUnion<AllPossibleScopesT>,
  AllPossibleScopesT,
  const OriginatedFromT extends string,
  MatcherInputT extends SpanMatch<
    TracerScopeKeysT,
    AllPossibleScopesT,
    OriginatedFromT
  > = SpanMatch<TracerScopeKeysT, AllPossibleScopesT, OriginatedFromT>,
>(
  matcherFnOrDefinition: MatcherInputT,
): SpanMatcherFn<TracerScopeKeysT, AllPossibleScopesT, OriginatedFromT> {
  return typeof matcherFnOrDefinition === 'function'
    ? matcherFnOrDefinition
    : fromDefinition<TracerScopeKeysT, AllPossibleScopesT, OriginatedFromT>(
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
  const OriginatedFromT extends string,
>(
  matchers:
    | readonly SpanMatch<
        TracerScopeKeysT,
        AllPossibleScopesT,
        OriginatedFromT
      >[]
    | undefined,
):
  | ArrayWithAtLeastOneElement<
      SpanMatcherFn<TracerScopeKeysT, AllPossibleScopesT, OriginatedFromT>
    >
  | undefined {
  const mapped:
    | SpanMatcherFn<TracerScopeKeysT, AllPossibleScopesT, OriginatedFromT>[]
    | undefined = matchers?.map((m) =>
    ensureMatcherFn<TracerScopeKeysT, AllPossibleScopesT, OriginatedFromT>(m),
  )
  if (mapped && arrayHasAtLeastOneElement(mapped)) {
    return mapped
  }
  return undefined
}

export function convertLabelMatchersToFns<
  TracerScopeKeysT extends KeysOfUnion<AllPossibleScopesT>,
  AllPossibleScopesT,
  const OriginatedFromT extends string,
>(
  definitionLabelMatchers: LabelMatchingInputRecord<
    TracerScopeKeysT,
    AllPossibleScopesT,
    OriginatedFromT
  >,
): LabelMatchingFnsRecord<
  TracerScopeKeysT,
  AllPossibleScopesT,
  OriginatedFromT
> {
  const matchers: LabelMatchingFnsRecord<
    TracerScopeKeysT,
    AllPossibleScopesT,
    OriginatedFromT
  > = {}
  for (const key in definitionLabelMatchers) {
    // eslint-disable-next-line no-continue
    if (!definitionLabelMatchers?.[key]) continue
    matchers[key] = ensureMatcherFn<
      TracerScopeKeysT,
      AllPossibleScopesT,
      OriginatedFromT
    >(definitionLabelMatchers[key])
  }
  return matchers
}
