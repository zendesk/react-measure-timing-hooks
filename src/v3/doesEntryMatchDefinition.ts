import { SpanAndAnnotation } from './spanAnnotationTypes'
import { type SpanMatcherTags, SpanMatcher } from './spanMatchTypes'
import type { Attributes, SpanStatus, SpanType } from './spanTypes'
import { ScopeBase } from './types'

/**
 * The common name of the span to match. Can be a string, RegExp, or function.
 */
export function name<ScopeT extends ScopeBase>(
  value: string | RegExp | ((name: string) => boolean),
): SpanMatcher<ScopeT> {
  return ({ span }) => {
    if (typeof value === 'string') return span.name === value
    if (value instanceof RegExp) return value.test(span.name)
    return value(span.name)
  }
}

/**
 * The PerformanceEntry.name of the entry to match. Can be a string, RegExp, or function.
 */
export function performanceEntryName<ScopeT extends ScopeBase>(
  value: string | RegExp | ((name: string) => boolean),
): SpanMatcher<ScopeT> {
  return ({ span }) => {
    const entryName = span.performanceEntry?.name
    if (!entryName) return false
    if (typeof value === 'string') return entryName === value
    if (value instanceof RegExp) return value.test(entryName)
    return value(entryName)
  }
}

export function type<ScopeT extends ScopeBase>(
  value: SpanType,
): SpanMatcher<ScopeT> {
  return ({ span }) => span.type === value
}

export function status<ScopeT extends ScopeBase>(
  value: SpanStatus,
): SpanMatcher<ScopeT> {
  return ({ span }) => span.status === value
}

/**
 * The subset of attributes (metadata) to match against the span.
 */
export function attributes<ScopeT extends ScopeBase>(
  attrs: Attributes,
): SpanMatcher<ScopeT> {
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
export function scopeKeys<ScopeT extends ScopeBase>(
  keys: (keyof ScopeT)[],
): SpanMatcher<ScopeT> {
  return ({ span }, scope) => {
    if (!span.scope) return false
    return keys.every((key) => span.scope![key] === scope[key])
  }
}

/**
 * The occurrence of the span with the same name within the operation.
 */
export function occurrence<ScopeT extends ScopeBase>(
  value: number | ((occurrence: number) => boolean),
): SpanMatcher<ScopeT> {
  return ({ annotation }) => {
    if (typeof value === 'number') return annotation.occurrence === value
    return value(annotation.occurrence)
  }
}

/**
 * only applicable for component-lifecycle entries
 */
export function isIdle<ScopeT extends ScopeBase>(
  value: boolean,
): SpanMatcher<ScopeT> {
  const matcherFn: SpanMatcher<ScopeT> = ({ span }) =>
    'isIdle' in span ? span.isIdle === value : false
  return Object.assign(
    matcherFn,
    // add a tag to the function if set to true
    value ? { isIdle: value } : {},
  )
}

// logical combinators:
export function all<ScopeT extends ScopeBase>(
  ...matchers: SpanMatcher<ScopeT>[]
): SpanMatcher<ScopeT> {
  const tags: SpanMatcherTags = {}
  for (const matcher of matchers) {
    // carry over tags from sub-matchers
    Object.assign(tags, matcher)
  }
  const matcherFn: SpanMatcher<ScopeT> = (...args) =>
    matchers.every((matcher) => matcher(...args))
  return Object.assign(matcherFn, tags)
}

export function some<ScopeT extends ScopeBase>(
  ...matchers: SpanMatcher<ScopeT>[]
): SpanMatcher<ScopeT> {
  const tags: SpanMatcherTags = {}
  for (const matcher of matchers) {
    // carry over tags from sub-matchers
    Object.assign(tags, matcher)
  }
  const matcherFn: SpanMatcher<ScopeT> = (...args) =>
    matchers.some((matcher) => matcher(...args))
  return Object.assign(matcherFn, tags)
}

export function not<ScopeT extends ScopeBase>(
  matcher: SpanMatcher<ScopeT>,
): SpanMatcher<ScopeT> {
  // since not is a negation, we don't carry over tags
  return (...args) => !matcher(...args)
}

/**
 * Matches criteria against a performance entry event.
 * @param match - The match criteria or function.
 * @param event - The performance entry event.
 * @returns {boolean} `true` if the event matches the criteria, `false` otherwise.
 */
export function doesEntryMatchDefinition<ScopeT extends ScopeBase>(
  spanAndAnnotation: SpanAndAnnotation<ScopeT>,
  match: SpanMatcher<ScopeT>,
  scope: ScopeT,
): boolean {
  return match(spanAndAnnotation, scope)
}
