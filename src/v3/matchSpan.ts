import type { SpanAndAnnotation } from './spanAnnotationTypes'
import type {
  ActiveTraceContext,
  Attributes,
  SpanStatus,
  SpanType,
} from './spanTypes'
import type { CompleteTraceDefinition, SelectScopeByKey } from './types'
import type { KeysOfUnion } from './typeUtils'

export interface SpanMatcherTags {
  isIdle?: boolean
}

export interface Context<
  TracerScopeKeysT extends KeysOfUnion<AllPossibleScopesT>,
  AllPossibleScopesT,
> {
  readonly definition: CompleteTraceDefinition<
    TracerScopeKeysT,
    AllPossibleScopesT
  >
  readonly input: ActiveTraceContext<
    SelectScopeByKey<TracerScopeKeysT, AllPossibleScopesT>
  >
}

/**
 * Function type for matching performance entries.
 */
export interface SpanMatcherFn<
  TracerScopeKeysT extends KeysOfUnion<AllPossibleScopesT>,
  AllPossibleScopesT,
> extends SpanMatcherTags {
  (
    spanAndAnnotation: SpanAndAnnotation<AllPossibleScopesT>,
    context: Context<TracerScopeKeysT, AllPossibleScopesT>,
  ): boolean
}

type NameMatcher<TracerScopeT> =
  | string
  | RegExp
  | ((name: string, scope: TracerScopeT) => boolean)

export interface SpanMatchDefinition<
  TracerScopeKeysT extends KeysOfUnion<AllPossibleScopesT>,
  AllPossibleScopesT,
> {
  // TODO name matcher should be specific to the scope
  name?: NameMatcher<AllPossibleScopesT>
  performanceEntryName?: NameMatcher<AllPossibleScopesT>
  type?: SpanType
  status?: SpanStatus
  attributes?: Attributes
  matchScopes?: readonly TracerScopeKeysT[] | boolean
  // IMPLEMENTATION TODO: take in scope as a second parameter
  occurrence?: number | ((occurrence: number) => boolean)
  isIdle?: boolean
}

export type SpanMatch<
  TracerScopeKeysT extends KeysOfUnion<AllPossibleScopesT>,
  AllPossibleScopesT,
> =
  | SpanMatcherFn<TracerScopeKeysT, AllPossibleScopesT>
  | SpanMatchDefinition<TracerScopeKeysT, AllPossibleScopesT>

/**
 * The common name of the span to match. Can be a string, RegExp, or function.
 */
export function withName<
  const TracerScopeKeysT extends KeysOfUnion<AllPossibleScopesT>,
  const AllPossibleScopesT,
>(
  value: NameMatcher<SelectScopeByKey<TracerScopeKeysT, AllPossibleScopesT>>,
): SpanMatcherFn<TracerScopeKeysT, AllPossibleScopesT> {
  return ({ span }, { input: { scope } }) => {
    if (typeof value === 'string') return span.name === value
    if (value instanceof RegExp) return value.test(span.name)
    return value(span.name, scope)
  }
}

/**
 * The PerformanceEntry.name of the entry to match. Can be a string, RegExp, or function.
 */
export function withPerformanceEntryName<
  TracerScopeKeysT extends KeysOfUnion<AllPossibleScopesT>,
  AllPossibleScopesT,
>(
  value: NameMatcher<AllPossibleScopesT>,
): SpanMatcherFn<TracerScopeKeysT, AllPossibleScopesT> {
  return ({ span }, { input: { scope } }) => {
    const entryName = span.performanceEntry?.name
    if (!entryName) return false
    if (typeof value === 'string') return entryName === value
    if (value instanceof RegExp) return value.test(entryName)
    return value(entryName, scope)
  }
}

export function withType<
  TracerScopeKeysT extends KeysOfUnion<AllPossibleScopesT>,
  AllPossibleScopesT,
>(value: SpanType): SpanMatcherFn<TracerScopeKeysT, AllPossibleScopesT> {
  return ({ span }) => span.type === value
}

export function withStatus<
  TracerScopeKeysT extends KeysOfUnion<AllPossibleScopesT>,
  AllPossibleScopesT,
>(value: SpanStatus): SpanMatcherFn<TracerScopeKeysT, AllPossibleScopesT> {
  return ({ span }) => span.status === value
}

/**
 * The subset of attributes (metadata) to match against the span.
 */
export function withAttributes<
  TracerScopeKeysT extends KeysOfUnion<AllPossibleScopesT>,
  AllPossibleScopesT,
>(attrs: Attributes): SpanMatcherFn<TracerScopeKeysT, AllPossibleScopesT> {
  return ({ span }) => {
    if (!span.attributes) return false
    return Object.entries(attrs).every(
      ([key, value]) => span.attributes![key] === value,
    )
  }
}

/**
 * A list of scope keys to match against the span.
 */
export function withMatchingScopes<
  const TracerScopeKeysT extends KeysOfUnion<AllPossibleScopesT>,
  const AllPossibleScopesT,
>(
  keys: readonly NoInfer<TracerScopeKeysT>[] | true = true,
): SpanMatcherFn<
  TracerScopeKeysT & KeysOfUnion<AllPossibleScopesT>,
  AllPossibleScopesT
> {
  return ({ span }, { input: { scope }, definition: { scopes } }) => {
    if (!span.scope) return false
    const spanScope = span.scope as AllPossibleScopesT & object
    const resolvedKeys = typeof keys === 'boolean' && keys ? scopes : keys
    if (!resolvedKeys) return false
    return resolvedKeys.every(
      (key) => key in spanScope && spanScope[key] === scope[key],
    )
  }
}

/**
 * The occurrence of the span with the same name within the operation.
 */
export function withOccurrence<
  TracerScopeKeysT extends KeysOfUnion<AllPossibleScopesT>,
  AllPossibleScopesT,
>(
  value: number | ((occurrence: number) => boolean),
): SpanMatcherFn<TracerScopeKeysT, AllPossibleScopesT> {
  return ({ annotation }) => {
    if (typeof value === 'number') return annotation.occurrence === value
    return value(annotation.occurrence)
  }
}

export function withComponentRenderCount<
  TracerScopeKeysT extends KeysOfUnion<AllPossibleScopesT>,
  AllPossibleScopesT,
>(
  name: string,
  renderCount: number,
): SpanMatcherFn<TracerScopeKeysT, AllPossibleScopesT> {
  return ({ span }) => {
    if (!('renderCount' in span)) return false
    return span.name === name && span.renderCount === renderCount
  }
}

/**
 * only applicable for component-lifecycle entries
 */
export function whenIdle<
  TracerScopeKeysT extends KeysOfUnion<AllPossibleScopesT>,
  AllPossibleScopesT,
>(value = true): SpanMatcherFn<TracerScopeKeysT, AllPossibleScopesT> {
  const matcherFn: SpanMatcherFn<TracerScopeKeysT, AllPossibleScopesT> = ({
    span,
  }) => ('isIdle' in span ? span.isIdle === value : false)
  return Object.assign(
    matcherFn,
    // add a tag to the function if set to true
    value ? { isIdle: value } : {},
  )
}

// logical combinators:
// AND
export function withAllConditions<
  TracerScopeKeysT extends KeysOfUnion<AllPossibleScopesT>,
  AllPossibleScopesT,
>(
  ...matchers: SpanMatcherFn<TracerScopeKeysT, AllPossibleScopesT>[]
): SpanMatcherFn<TracerScopeKeysT, AllPossibleScopesT> {
  const tags: SpanMatcherTags = {}
  for (const matcher of matchers) {
    // carry over tags from sub-matchers
    Object.assign(tags, matcher)
  }
  const matcherFn: SpanMatcherFn<TracerScopeKeysT, AllPossibleScopesT> = (
    ...args
  ) => matchers.every((matcher) => matcher(...args))
  return Object.assign(matcherFn, tags)
}

// OR
export function withOneOfConditions<
  TracerScopeKeysT extends KeysOfUnion<AllPossibleScopesT>,
  AllPossibleScopesT,
>(
  ...matchers: SpanMatcherFn<TracerScopeKeysT, AllPossibleScopesT>[]
): SpanMatcherFn<TracerScopeKeysT, AllPossibleScopesT> {
  const tags: SpanMatcherTags = {}
  for (const matcher of matchers) {
    // carry over tags from sub-matchers
    Object.assign(tags, matcher)
  }
  const matcherFn: SpanMatcherFn<TracerScopeKeysT, AllPossibleScopesT> = (
    ...args
  ) => matchers.some((matcher) => matcher(...args))
  return Object.assign(matcherFn, tags)
}

export function not<
  TracerScopeKeysT extends KeysOfUnion<AllPossibleScopesT>,
  AllPossibleScopesT,
>(
  matcher: SpanMatcherFn<TracerScopeKeysT, AllPossibleScopesT>,
): SpanMatcherFn<TracerScopeKeysT, AllPossibleScopesT> {
  // since not is a negation, we don't carry over tags
  return (...args) => !matcher(...args)
}

export function fromDefinition<
  TracerScopeKeysT extends KeysOfUnion<AllPossibleScopesT>,
  AllPossibleScopesT,
>(
  definition: SpanMatchDefinition<TracerScopeKeysT, AllPossibleScopesT>,
): SpanMatcherFn<TracerScopeKeysT, AllPossibleScopesT> {
  const matchers: SpanMatcherFn<TracerScopeKeysT, AllPossibleScopesT>[] = []
  if (definition.name) {
    matchers.push(
      withName<TracerScopeKeysT, AllPossibleScopesT>(definition.name),
    )
  }
  if (definition.performanceEntryName) {
    matchers.push(withPerformanceEntryName(definition.performanceEntryName))
  }
  if (definition.type) {
    matchers.push(withType(definition.type))
  }
  if (definition.status) {
    matchers.push(withStatus(definition.status))
  }
  if (definition.attributes) {
    matchers.push(withAttributes(definition.attributes))
  }
  if (definition.matchScopes) {
    matchers.push(withMatchingScopes(definition.matchScopes))
  }
  if (definition.occurrence) {
    matchers.push(withOccurrence(definition.occurrence))
  }
  if (definition.isIdle) {
    matchers.push(whenIdle(definition.isIdle))
  }
  return withAllConditions(...matchers)
}
