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
  MatcherInputT extends
    | SpanMatcherFn<ScopeT>
    | SpanMatchDefinition<ScopeT>
    | string,
>(
  matcherFnOrDefinition: MatcherInputT,
): MatcherInputT extends string ? MatcherInputT : SpanMatcherFn<ScopeT> {
  return (
    typeof matcherFnOrDefinition === 'function' ||
    typeof matcherFnOrDefinition === 'string'
      ? matcherFnOrDefinition
      : fromDefinition(matcherFnOrDefinition)
  ) as MatcherInputT extends string ? MatcherInputT : SpanMatcherFn<ScopeT>
}

export function convertMatchersToFns<ScopeT extends ScopeBase>(
  matchers: SpanMatch<ScopeT>[] | undefined,
): ArrayWithAtLeastOneElement<SpanMatcherFn<ScopeT>> | undefined {
  return matchers && matchers.length > 0
    ? (matchers.map((m) => ensureMatcherFn(m)) as ArrayWithAtLeastOneElement<
        SpanMatcherFn<ScopeT>
      >)
    : undefined
}
