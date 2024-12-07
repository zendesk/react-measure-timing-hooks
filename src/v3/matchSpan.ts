import type { SpanAndAnnotation } from './spanAnnotationTypes'
import type {
  ActiveTraceConfig,
  Attributes,
  SpanStatus,
  SpanType,
} from './spanTypes'
import { CompleteTraceDefinition, ScopeBase } from './types'

export interface SpanMatcherTags {
  isIdle?: boolean
}

export interface Context<
  AllScopesT extends ScopeBase<AllScopesT>,
  ThisTraceScopeKeysT extends keyof AllScopesT,
> {
  readonly definition: CompleteTraceDefinition<AllScopesT, ThisTraceScopeKeysT>
  readonly input: Omit<
    ActiveTraceConfig<Pick<AllScopesT, ThisTraceScopeKeysT>>,
    'onEnd'
  >
}

/**
 * Function type for matching performance entries.
 */
export type SpanMatcherFn<
  AllScopesT extends ScopeBase<AllScopesT>,
  ThisTraceScopeKeysT extends keyof AllScopesT,
> = ((
  spanAndAnnotation: SpanAndAnnotation<Partial<AllScopesT>>,
  context: Context<AllScopesT, ThisTraceScopeKeysT>,
) => boolean) &
  SpanMatcherTags

type NameMatcher<ScopeT extends Partial<ScopeBase<ScopeT>>> =
  | string
  | RegExp
  | ((name: string, scope: ScopeT) => boolean)

export interface SpanMatchDefinition<
  AllScopesT extends ScopeBase<AllScopesT>,
  ThisTraceScopeKeysT extends keyof AllScopesT,
> {
  name?: NameMatcher<Pick<AllScopesT, ThisTraceScopeKeysT>>
  performanceEntryName?: NameMatcher<Pick<AllScopesT, ThisTraceScopeKeysT>>
  type?: SpanType
  status?: SpanStatus
  attributes?: Attributes
  matchScopes?: readonly ThisTraceScopeKeysT[] | boolean
  // IMPLEMENTATION TODO: take in scope as a second parameter
  occurrence?: number | ((occurrence: number) => boolean)
  isIdle?: boolean
}

export type SpanMatch<
  AllScopesT extends ScopeBase<AllScopesT>,
  ThisTraceScopeKeysT extends keyof AllScopesT,
> =
  | SpanMatcherFn<AllScopesT, ThisTraceScopeKeysT>
  | SpanMatchDefinition<AllScopesT, ThisTraceScopeKeysT>

/**
 * The common name of the span to match. Can be a string, RegExp, or function.
 */
export function withName<ScopeT extends Partial<ScopeBase<ScopeT>>>(
  value: NameMatcher<ScopeT>,
): SpanMatcherFn<ScopeT> {
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
  ScopeT extends Partial<ScopeBase<ScopeT>>,
>(value: NameMatcher<ScopeT>): SpanMatcherFn<ScopeT> {
  return ({ span }, { input: { scope } }) => {
    const entryName = span.performanceEntry?.name
    if (!entryName) return false
    if (typeof value === 'string') return entryName === value
    if (value instanceof RegExp) return value.test(entryName)
    return value(entryName, scope)
  }
}

export function withType<ScopeT extends Partial<ScopeBase<ScopeT>>>(
  value: SpanType,
): SpanMatcherFn<ScopeT> {
  return ({ span }) => span.type === value
}

export function withStatus<ScopeT extends Partial<ScopeBase<ScopeT>>>(
  value: SpanStatus,
): SpanMatcherFn<ScopeT> {
  return ({ span }) => span.status === value
}

/**
 * The subset of attributes (metadata) to match against the span.
 */
export function withAttributes<ScopeT extends Partial<ScopeBase<ScopeT>>>(
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
export function withMatchingScopes<ScopeT extends Partial<ScopeBase<ScopeT>>>(
  keys: (keyof ScopeT)[] | true,
): SpanMatcherFn<ScopeT> {
  return (
    { span },
    { input: { scope }, definition: { requiredScopeKeys } },
  ) => {
    if (!span.scope) return false
    const resolvedKeys =
      typeof keys === 'boolean' && keys ? requiredScopeKeys : keys
    if (!resolvedKeys) return false
    return resolvedKeys.every((key) => span.scope![key] === scope[key])
  }
}

/**
 * The occurrence of the span with the same name within the operation.
 */
export function withOccurrence<ScopeT extends Partial<ScopeBase<ScopeT>>>(
  value: number | ((occurrence: number) => boolean),
): SpanMatcherFn<ScopeT> {
  return ({ annotation }) => {
    if (typeof value === 'number') return annotation.occurrence === value
    return value(annotation.occurrence)
  }
}

export function withComponentRenderCount<
  ScopeT extends Partial<ScopeBase<ScopeT>>,
>(name: string, renderCount: number): SpanMatcherFn<ScopeT> {
  return ({ span }) => {
    if (!('renderCount' in span)) return false
    return span.name === name && span.renderCount === renderCount
  }
}

/**
 * only applicable for component-lifecycle entries
 */
export function whenIdle<ScopeT extends Partial<ScopeBase<ScopeT>>>(
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
// AND
export function withAllConditions<ScopeT extends Partial<ScopeBase<ScopeT>>>(
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

// OR
export function withOneOfConditions<ScopeT extends Partial<ScopeBase<ScopeT>>>(
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

export function not<ScopeT extends Partial<ScopeBase<ScopeT>>>(
  matcher: SpanMatcherFn<ScopeT>,
): SpanMatcherFn<ScopeT> {
  // since not is a negation, we don't carry over tags
  return (...args) => !matcher(...args)
}

export function fromDefinition<ScopeT extends Partial<ScopeBase<ScopeT>>>(
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
