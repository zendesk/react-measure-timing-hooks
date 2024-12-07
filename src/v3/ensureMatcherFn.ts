import {
  type SpanMatch,
  type SpanMatchDefinition,
  type SpanMatcherFn,
  fromDefinition,
} from './matchSpan'
import type { ScopeBase } from './types'
import type { ArrayWithAtLeastOneElement } from './typeUtils'

export function ensureMatcherFn<
  ScopeT extends ScopeBase,
  MatcherInputT extends SpanMatcherFn<ScopeT> | SpanMatchDefinition<ScopeT> =
    | SpanMatcherFn<ScopeT>
    | SpanMatchDefinition<ScopeT>,
>(matcherFnOrDefinition: MatcherInputT): SpanMatcherFn<ScopeT> {
  return typeof matcherFnOrDefinition === 'function'
    ? matcherFnOrDefinition
    : fromDefinition(matcherFnOrDefinition)
}

function arrayHasAtLeastOneElement<T>(
  arr: readonly T[],
): arr is ArrayWithAtLeastOneElement<T> {
  return arr.length > 0
}

export function convertMatchersToFns<ScopeT extends Partial<ScopeBase<ScopeT>>>(
  matchers: readonly SpanMatch<ScopeT>[] | undefined,
): ArrayWithAtLeastOneElement<SpanMatcherFn<ScopeT>> | undefined {
  const mapped: SpanMatcherFn<ScopeT>[] | undefined = matchers?.map((m) =>
    ensureMatcherFn<ScopeT>(m),
  )
  if (mapped && arrayHasAtLeastOneElement(mapped)) {
    return mapped
  }
  return undefined
}
