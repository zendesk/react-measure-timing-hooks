import type { SpanAndAnnotation } from './spanAnnotationTypes'
import type {
  ActiveTraceContext,
  Attributes,
  SpanStatus,
  SpanType,
} from './spanTypes'
import type { CompleteTraceDefinition } from './types'
import type { KeysOfUnion } from './typeUtils'

export interface SpanMatcherTags {
  isIdle?: boolean
}

export interface Context<TracerScopeT, AllPossibleScopesT> {
  readonly definition: CompleteTraceDefinition<TracerScopeT, AllPossibleScopesT>
  readonly input: ActiveTraceContext<TracerScopeT>
}

/**
 * Function type for matching performance entries.
 */
export type SpanMatcherFn<TracerScopeT, AllPossibleScopesT> = ((
  spanAndAnnotation: SpanAndAnnotation<AllPossibleScopesT>,
  context: Context<TracerScopeT, AllPossibleScopesT>,
) => boolean) &
  SpanMatcherTags

type NameMatcher<AllPossibleScopesT> =
  | string
  | RegExp
  | ((name: string, scope: AllPossibleScopesT) => boolean)

export interface SpanMatchDefinition<TracerScopeT, AllPossibleScopesT> {
  name?: NameMatcher<AllPossibleScopesT>
  performanceEntryName?: NameMatcher<AllPossibleScopesT>
  type?: SpanType
  status?: SpanStatus
  attributes?: Attributes
  matchScopes?: readonly KeysOfUnion<TracerScopeT>[] | boolean
  // IMPLEMENTATION TODO: take in scope as a second parameter
  occurrence?: number | ((occurrence: number) => boolean)
  isIdle?: boolean
}

export type SpanMatch<TracerScopeT, AllPossibleScopesT> =
  | SpanMatcherFn<TracerScopeT, AllPossibleScopesT>
  | SpanMatchDefinition<TracerScopeT, AllPossibleScopesT>

/**
 * The common name of the span to match. Can be a string, RegExp, or function.
 */
export function withName<
  TracerScopeT extends AllPossibleScopesT,
  AllPossibleScopesT,
>(
  value: NameMatcher<AllPossibleScopesT>,
): SpanMatcherFn<TracerScopeT, AllPossibleScopesT> {
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
  TracerScopeT extends AllPossibleScopesT,
  AllPossibleScopesT,
>(
  value: NameMatcher<AllPossibleScopesT>,
): SpanMatcherFn<TracerScopeT, AllPossibleScopesT> {
  return ({ span }, { input: { scope } }) => {
    const entryName = span.performanceEntry?.name
    if (!entryName) return false
    if (typeof value === 'string') return entryName === value
    if (value instanceof RegExp) return value.test(entryName)
    return value(entryName, scope)
  }
}

export function withType<TracerScopeT, AllPossibleScopesT>(
  value: SpanType,
): SpanMatcherFn<TracerScopeT, AllPossibleScopesT> {
  return ({ span }) => span.type === value
}

export function withStatus<TracerScopeT, AllPossibleScopesT>(
  value: SpanStatus,
): SpanMatcherFn<TracerScopeT, AllPossibleScopesT> {
  return ({ span }) => span.status === value
}

/**
 * The subset of attributes (metadata) to match against the span.
 */
export function withAttributes<TracerScopeT, AllPossibleScopesT>(
  attrs: Attributes,
): SpanMatcherFn<TracerScopeT, AllPossibleScopesT> {
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
export function withMatchingScopes<TracerScopeT, AllPossibleScopesT>(
  keys: readonly KeysOfUnion<TracerScopeT>[] | true = true,
): SpanMatcherFn<TracerScopeT, AllPossibleScopesT> {
  return ({ span }, { input: { scope }, definition: { scopes } }) => {
    if (!span.scope) return false
    const resolvedKeys = typeof keys === 'boolean' && keys ? scopes : keys
    if (!resolvedKeys) return false
    return resolvedKeys.every(
      // eslint-disable-next-line @typescript-eslint/no-unsafe-member-access, @typescript-eslint/no-explicit-any
      (key) => key in span.scope! && (span.scope as any)[key] === scope[key],
    )
  }
}

/**
 * The occurrence of the span with the same name within the operation.
 */
export function withOccurrence<TracerScopeT, AllPossibleScopesT>(
  value: number | ((occurrence: number) => boolean),
): SpanMatcherFn<TracerScopeT, AllPossibleScopesT> {
  return ({ annotation }) => {
    if (typeof value === 'number') return annotation.occurrence === value
    return value(annotation.occurrence)
  }
}

export function withComponentRenderCount<TracerScopeT, AllPossibleScopesT>(
  name: string,
  renderCount: number,
): SpanMatcherFn<TracerScopeT, AllPossibleScopesT> {
  return ({ span }) => {
    if (!('renderCount' in span)) return false
    return span.name === name && span.renderCount === renderCount
  }
}

/**
 * only applicable for component-lifecycle entries
 */
export function whenIdle<TracerScopeT, AllPossibleScopesT>(
  value = true,
): SpanMatcherFn<TracerScopeT, AllPossibleScopesT> {
  const matcherFn: SpanMatcherFn<TracerScopeT, AllPossibleScopesT> = ({
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
export function withAllConditions<TracerScopeT, AllPossibleScopesT>(
  ...matchers: SpanMatcherFn<TracerScopeT, AllPossibleScopesT>[]
): SpanMatcherFn<TracerScopeT, AllPossibleScopesT> {
  const tags: SpanMatcherTags = {}
  for (const matcher of matchers) {
    // carry over tags from sub-matchers
    Object.assign(tags, matcher)
  }
  const matcherFn: SpanMatcherFn<TracerScopeT, AllPossibleScopesT> = (
    ...args
  ) => matchers.every((matcher) => matcher(...args))
  return Object.assign(matcherFn, tags)
}

// OR
export function withOneOfConditions<TracerScopeT, AllPossibleScopesT>(
  ...matchers: SpanMatcherFn<TracerScopeT, AllPossibleScopesT>[]
): SpanMatcherFn<TracerScopeT, AllPossibleScopesT> {
  const tags: SpanMatcherTags = {}
  for (const matcher of matchers) {
    // carry over tags from sub-matchers
    Object.assign(tags, matcher)
  }
  const matcherFn: SpanMatcherFn<TracerScopeT, AllPossibleScopesT> = (
    ...args
  ) => matchers.some((matcher) => matcher(...args))
  return Object.assign(matcherFn, tags)
}

export function not<TracerScopeT, AllPossibleScopesT>(
  matcher: SpanMatcherFn<TracerScopeT, AllPossibleScopesT>,
): SpanMatcherFn<TracerScopeT, AllPossibleScopesT> {
  // since not is a negation, we don't carry over tags
  return (...args) => !matcher(...args)
}

export function fromDefinition<
  TracerScopeT extends AllPossibleScopesT,
  AllPossibleScopesT,
>(
  definition: SpanMatchDefinition<TracerScopeT, AllPossibleScopesT>,
): SpanMatcherFn<TracerScopeT, AllPossibleScopesT> {
  const matchers: SpanMatcherFn<TracerScopeT, AllPossibleScopesT>[] = []
  if (definition.name) {
    matchers.push(withName<TracerScopeT, AllPossibleScopesT>(definition.name))
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
