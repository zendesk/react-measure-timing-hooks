import type { SpanAndAnnotation } from './spanAnnotationTypes'
import type { Attributes, SpanStatus, SpanType } from './spanTypes'
import type { DraftTraceContext, MapSchemaToTypes } from './types'
import type { UnionToIntersection } from './typeUtils'

export interface SpanMatcherTags {
  idleCheck?: boolean
  continueWithErrorStatus?: boolean
  requiredSpan?: boolean
}

/**
 * Function type for matching performance entries.
 */
export interface SpanMatcherFn<
  SelectedRelationKeyT extends keyof RelationSchemasT,
  RelationSchemasT,
  VariantsT extends string,
> extends SpanMatcherTags {
  (
    spanAndAnnotation: SpanAndAnnotation<RelationSchemasT>,
    context: DraftTraceContext<
      SelectedRelationKeyT,
      RelationSchemasT,
      VariantsT
    >,
  ): boolean
}

export type NameMatcher<RelationSchemaT> =
  | string
  | RegExp
  | ((
      name: string,
      inputRelation: MapSchemaToTypes<RelationSchemaT> | undefined,
    ) => boolean)

export interface SpanMatchDefinition<
  SelectedRelationKeyT extends keyof RelationSchemasT,
  RelationSchemasT,
> {
  name?: NameMatcher<RelationSchemasT[SelectedRelationKeyT]>
  performanceEntryName?: NameMatcher<RelationSchemasT[SelectedRelationKeyT]>
  type?: SpanType
  status?: SpanStatus
  attributes?: Attributes
  withTraceRelations?:
    | (keyof UnionToIntersection<RelationSchemasT[SelectedRelationKeyT]>)[]
    | boolean
  occurrence?: number | ((occurrence: number) => boolean)
  isIdle?: boolean
  label?: string
}

export type SpanMatch<
  SelectedRelationKeyT extends keyof RelationSchemasT,
  RelationSchemasT,
  VariantsT extends string,
> =
  | SpanMatcherFn<SelectedRelationKeyT, RelationSchemasT, VariantsT>
  | SpanMatchDefinition<SelectedRelationKeyT, RelationSchemasT>

// Span<RelationSchemasT>

/**
 * The common name of the span to match. Can be a string, RegExp, or function.
 */
export function withName<
  const SelectedRelationKeyT extends keyof RelationSchemasT,
  const RelationSchemasT,
  const VariantsT extends string,
>(
  value: NameMatcher<RelationSchemasT[SelectedRelationKeyT]>,
): SpanMatcherFn<SelectedRelationKeyT, RelationSchemasT, VariantsT> {
  return ({ span }, { input: { relatedTo } }) => {
    if (typeof value === 'string') return span.name === value
    if (value instanceof RegExp) return value.test(span.name)
    return value(span.name, relatedTo)
  }
}

// DRAFT TODO: make test case if one doesnt exist yet
// withName((name, relatedTo) => !relatedTo ? false : name === `OmniLog/${relatedTo.ticketId}`)

export function withLabel<
  const SelectedRelationKeyT extends keyof RelationSchemasT,
  const RelationSchemasT,
  const VariantsT extends string,
>(
  value: string,
): SpanMatcherFn<SelectedRelationKeyT, RelationSchemasT, VariantsT> {
  return ({ annotation }) => annotation.labels?.includes(value) ?? false
}

/**
 * The PerformanceEntry.name of the entry to match. Can be a string, RegExp, or function.
 */
export function withPerformanceEntryName<
  const SelectedRelationKeyT extends keyof RelationSchemasT,
  const RelationSchemasT,
  const VariantsT extends string,
>(
  value: NameMatcher<RelationSchemasT[SelectedRelationKeyT]>,
): SpanMatcherFn<SelectedRelationKeyT, RelationSchemasT, VariantsT> {
  return ({ span }, { input: { relatedTo } }) => {
    const entryName = span.performanceEntry?.name
    if (!entryName) return false
    if (typeof value === 'string') return entryName === value
    if (value instanceof RegExp) return value.test(entryName)
    return value(entryName, relatedTo)
  }
}

export function withType<
  const SelectedRelationKeyT extends keyof RelationSchemasT,
  const RelationSchemasT,
  const VariantsT extends string,
>(
  value: SpanType,
): SpanMatcherFn<SelectedRelationKeyT, RelationSchemasT, VariantsT> {
  return ({ span }) => span.type === value
}

export function withStatus<
  const SelectedRelationKeyT extends keyof RelationSchemasT,
  const RelationSchemasT,
  const VariantsT extends string,
>(
  value: SpanStatus,
): SpanMatcherFn<SelectedRelationKeyT, RelationSchemasT, VariantsT> {
  return ({ span }) => span.status === value
}

/**
 * The subset of attributes (metadata) to match against the span.
 */
export function withAttributes<
  SelectedRelationKeyT extends keyof RelationSchemasT,
  RelationSchemasT,
  const VariantsT extends string,
>(
  attrs: Attributes,
): SpanMatcherFn<SelectedRelationKeyT, RelationSchemasT, VariantsT> {
  return ({ span }) => {
    if (!span.attributes) return false
    return Object.entries(attrs).every(
      ([key, value]) => span.attributes![key] === value,
    )
  }
}

/**
 * A list of relatedTo keys to match against the span.
 */
export function withTraceRelations<
  const SelectedRelationKeyT extends keyof RelationSchemasT,
  const RelationSchemasT,
  const VariantsT extends string,
>(
  keys:
    | NoInfer<
        keyof UnionToIntersection<RelationSchemasT[SelectedRelationKeyT]>
      >[]
    | true = true,
): SpanMatcherFn<SelectedRelationKeyT, RelationSchemasT, VariantsT> {
  return (
    { span },
    { input: { relatedTo: r }, definition: { selectedRelationSchema } },
  ) => {
    // DRAFT TODO: add test case when relatedTo is missing
    // if the relatedTo isn't set on the trace yet, we can't match against it, so we return early
    // similarly, if the span doesn't have any relatedTo set
    const relatedToInput: Record<string, unknown> | undefined = r
    if (!span.relatedTo || !relatedToInput) return false
    const spanScope: Record<string, unknown> = span.relatedTo
    const resolvedKeys =
      typeof keys === 'boolean' && keys
        ? Object.keys(selectedRelationSchema as object)
        : (keys as string[])

    if (!resolvedKeys) return false
    return resolvedKeys.every(
      (key) => key in spanScope && spanScope[key] === relatedToInput[key],
    )
  }
}

/**
 * The occurrence of the span with the same name within the operation.
 */
export function withOccurrence<
  const SelectedRelationKeyT extends keyof RelationSchemasT,
  const RelationSchemasT,
  const VariantsT extends string,
>(
  value: number | ((occurrence: number) => boolean),
): SpanMatcherFn<SelectedRelationKeyT, RelationSchemasT, VariantsT> {
  return ({ annotation }) => {
    if (typeof value === 'number') return annotation.occurrence === value
    return value(annotation.occurrence)
  }
}

export function withComponentRenderCount<
  const SelectedRelationKeyT extends keyof RelationSchemasT,
  const RelationSchemasT,
  const VariantsT extends string,
>(
  name: string,
  renderCount: number,
): SpanMatcherFn<SelectedRelationKeyT, RelationSchemasT, VariantsT> {
  return ({ span }) => {
    if (!('renderCount' in span)) return false
    return span.name === name && span.renderCount === renderCount
  }
}

/**
 * only applicable for component-lifecycle entries
 */
export function whenIdle<
  const SelectedRelationKeyT extends keyof RelationSchemasT,
  const RelationSchemasT,
  const VariantsT extends string,
>(
  value = true,
): SpanMatcherFn<SelectedRelationKeyT, RelationSchemasT, VariantsT> {
  const matcherFn: SpanMatcherFn<
    SelectedRelationKeyT,
    RelationSchemasT,
    VariantsT
  > = ({ span }) => ('isIdle' in span ? span.isIdle === value : false)
  return Object.assign(
    matcherFn,
    // add a tag to the function if set to true
    value ? ({ idleCheck: value } satisfies SpanMatcherTags) : {},
  )
}

/**
 * Only applicable for 'requiredSpans' list: it will opt-out of the default behavior,
 * which interrupts the trace if the requiredSpan has an error status.
 */
export function continueWithErrorStatus<
  const SelectedRelationKeyT extends keyof RelationSchemasT,
  const RelationSchemasT,
  const VariantsT extends string,
>(): SpanMatcherFn<SelectedRelationKeyT, RelationSchemasT, VariantsT> {
  return Object.assign(
    () => true,
    // add a tag to the function if set to true
    { continueWithErrorStatus: true } satisfies SpanMatcherTags,
  )
}

// logical combinators:
// AND
export function withAllConditions<
  const SelectedRelationKeyT extends keyof RelationSchemasT,
  const RelationSchemasT,
  const VariantsT extends string,
>(
  ...matchers: SpanMatcherFn<
    SelectedRelationKeyT,
    RelationSchemasT,
    VariantsT
  >[]
): SpanMatcherFn<SelectedRelationKeyT, RelationSchemasT, VariantsT> {
  const tags: SpanMatcherTags = {}
  for (const matcher of matchers) {
    // carry over tags from sub-matchers
    Object.assign(tags, matcher)
  }
  const matcherFn: SpanMatcherFn<
    SelectedRelationKeyT,
    RelationSchemasT,
    VariantsT
  > = (...args) => matchers.every((matcher) => matcher(...args))
  return Object.assign(matcherFn, tags)
}

// OR
export function withOneOfConditions<
  const SelectedRelationKeyT extends keyof RelationSchemasT,
  const RelationSchemasT,
  const VariantsT extends string,
>(
  ...matchers: SpanMatcherFn<
    SelectedRelationKeyT,
    RelationSchemasT,
    VariantsT
  >[]
): SpanMatcherFn<SelectedRelationKeyT, RelationSchemasT, VariantsT> {
  const tags: SpanMatcherTags = {}
  for (const matcher of matchers) {
    // carry over tags from sub-matchers
    Object.assign(tags, matcher)
  }
  const matcherFn: SpanMatcherFn<
    SelectedRelationKeyT,
    RelationSchemasT,
    VariantsT
  > = (...args) => matchers.some((matcher) => matcher(...args))
  return Object.assign(matcherFn, tags)
}

export function not<
  const SelectedRelationKeyT extends keyof RelationSchemasT,
  const RelationSchemasT,
  const VariantsT extends string,
>(
  matcher: SpanMatcherFn<SelectedRelationKeyT, RelationSchemasT, VariantsT>,
): SpanMatcherFn<SelectedRelationKeyT, RelationSchemasT, VariantsT> {
  // since not is a negation, we don't carry over tags
  return (...args) => !matcher(...args)
}

export function fromDefinition<
  const SelectedRelationKeyT extends keyof RelationSchemasT,
  const RelationSchemasT,
  const VariantsT extends string,
>(
  definition: SpanMatchDefinition<SelectedRelationKeyT, RelationSchemasT>,
): SpanMatcherFn<SelectedRelationKeyT, RelationSchemasT, VariantsT> {
  const matchers: SpanMatcherFn<
    SelectedRelationKeyT,
    RelationSchemasT,
    VariantsT
  >[] = []
  if (definition.name) {
    matchers.push(
      withName<SelectedRelationKeyT, RelationSchemasT, VariantsT>(
        definition.name,
      ),
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
  if (definition.withTraceRelations) {
    matchers.push(withTraceRelations(definition.withTraceRelations))
  }
  if (definition.occurrence) {
    matchers.push(withOccurrence(definition.occurrence))
  }
  if (definition.isIdle) {
    matchers.push(whenIdle(definition.isIdle))
  }

  if (definition.label) {
    matchers.push(withLabel(definition.label))
  }

  return withAllConditions(...matchers)
}
