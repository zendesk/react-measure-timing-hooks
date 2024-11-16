import type { SpanAndAnnotation } from './spanAnnotationTypes'
import type { Attributes, SpanStatus, SpanType } from './spanTypes'
import { ScopeBase } from './types'

export interface SpanMatcherTags {
  isIdle?: boolean
}

/**
 * Function type for matching performance entries.
 */
export type SpanMatcherFn<ScopeT extends ScopeBase> = ((
  spanAndAnnotation: SpanAndAnnotation<ScopeT>,
  scope: ScopeT,
) => boolean) &
  SpanMatcherTags

export interface SpanMatchDefinition<ScopeT extends ScopeBase> {
  name?: string | RegExp | ((name: string) => boolean)
  performanceEntryName?: string | RegExp | ((name: string) => boolean)
  type?: SpanType
  status?: SpanStatus
  attributes?: Attributes
  scopes?: (keyof ScopeT)[]
  occurrence?: number | ((occurrence: number) => boolean)
  isIdle?: boolean
}

export type SpanMatch<ScopeT extends ScopeBase> =
  | SpanMatcherFn<ScopeT>
  | SpanMatchDefinition<ScopeT>

/**
 * The common name of the span to match. Can be a string, RegExp, or function.
 */
export function withName<ScopeT extends ScopeBase>(
  value: string | RegExp | ((name: string) => boolean),
): SpanMatcherFn<ScopeT> {
  return ({ span }) => {
    if (typeof value === 'string') return span.name === value
    if (value instanceof RegExp) return value.test(span.name)
    return value(span.name)
  }
}

/**
 * The PerformanceEntry.name of the entry to match. Can be a string, RegExp, or function.
 */
export function withPerformanceEntryName<ScopeT extends ScopeBase>(
  value: string | RegExp | ((name: string) => boolean),
): SpanMatcherFn<ScopeT> {
  return ({ span }) => {
    const entryName = span.performanceEntry?.name
    if (!entryName) return false
    if (typeof value === 'string') return entryName === value
    if (value instanceof RegExp) return value.test(entryName)
    return value(entryName)
  }
}

export function withType<ScopeT extends ScopeBase>(
  value: SpanType,
): SpanMatcherFn<ScopeT> {
  return ({ span }) => span.type === value
}

export function withStatus<ScopeT extends ScopeBase>(
  value: SpanStatus,
): SpanMatcherFn<ScopeT> {
  return ({ span }) => span.status === value
}

/**
 * The subset of attributes (metadata) to match against the span.
 */
export function withAttributes<ScopeT extends ScopeBase>(
  attrs: Attributes,
): SpanMatcherFn<ScopeT> {
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
export function withMatchingScopes<ScopeT extends ScopeBase>(
  keys: (keyof ScopeT)[],
): SpanMatcherFn<ScopeT> {
  return ({ span }, scope) => {
    if (!span.scope) return false
    return keys.every((key) => span.scope![key] === scope[key])
  }
}

/**
 * The occurrence of the span with the same name within the operation.
 */
export function withOccurrence<ScopeT extends ScopeBase>(
  value: number | ((occurrence: number) => boolean),
): SpanMatcherFn<ScopeT> {
  return ({ annotation }) => {
    if (typeof value === 'number') return annotation.occurrence === value
    return value(annotation.occurrence)
  }
}

/**
 * only applicable for component-lifecycle entries
 */
export function whenIdle<ScopeT extends ScopeBase>(
  value = true,
): SpanMatcherFn<ScopeT> {
  const matcherFn: SpanMatcherFn<ScopeT> = ({ span }) =>
    'isIdle' in span ? span.isIdle === value : false
  return Object.assign(
    matcherFn,
    // add a tag to the function if set to true
    value ? { isIdle: value } : {},
  )
}

// logical combinators:
export function withAllConditions<ScopeT extends ScopeBase>(
  ...matchers: SpanMatcherFn<ScopeT>[]
): SpanMatcherFn<ScopeT> {
  const tags: SpanMatcherTags = {}
  for (const matcher of matchers) {
    // carry over tags from sub-matchers
    Object.assign(tags, matcher)
  }
  const matcherFn: SpanMatcherFn<ScopeT> = (...args) =>
    matchers.every((matcher) => matcher(...args))
  return Object.assign(matcherFn, tags)
}

export function withOneOfConditions<ScopeT extends ScopeBase>(
  ...matchers: SpanMatcherFn<ScopeT>[]
): SpanMatcherFn<ScopeT> {
  const tags: SpanMatcherTags = {}
  for (const matcher of matchers) {
    // carry over tags from sub-matchers
    Object.assign(tags, matcher)
  }
  const matcherFn: SpanMatcherFn<ScopeT> = (...args) =>
    matchers.some((matcher) => matcher(...args))
  return Object.assign(matcherFn, tags)
}

export function not<ScopeT extends ScopeBase>(
  matcher: SpanMatcherFn<ScopeT>,
): SpanMatcherFn<ScopeT> {
  // since not is a negation, we don't carry over tags
  return (...args) => !matcher(...args)
}

export function fromDefinition<ScopeT extends ScopeBase>(
  definition: SpanMatchDefinition<ScopeT>,
): SpanMatcherFn<ScopeT> {
  const matchers: SpanMatcherFn<ScopeT>[] = []
  if (definition.name) matchers.push(withName(definition.name))
  if (definition.performanceEntryName)
    matchers.push(withPerformanceEntryName(definition.performanceEntryName))
  if (definition.type) matchers.push(withType(definition.type))
  if (definition.status) matchers.push(withStatus(definition.status))
  if (definition.attributes)
    matchers.push(withAttributes(definition.attributes))
  if (definition.scopes) matchers.push(withMatchingScopes(definition.scopes))
  if (definition.occurrence)
    matchers.push(withOccurrence(definition.occurrence))
  if (definition.isIdle) matchers.push(whenIdle(definition.isIdle))
  return withAllConditions(...matchers)
}
