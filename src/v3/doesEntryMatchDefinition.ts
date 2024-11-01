import { ScopeBase, SpanAndAnnotationEntry, SpanMatcher } from './types'

/**
 * Matches criteria against a performance entry event.
 * @param match - The match criteria or function.
 * @param event - The performance entry event.
 * @returns {boolean} `true` if the event matches the criteria, `false` otherwise.
 */
export function doesEntryMatchDefinition<ScopeT extends ScopeBase>(
  { span, annotation }: SpanAndAnnotationEntry<ScopeT>,
  match: SpanMatcher<ScopeT>,
): boolean {
  if (typeof match === 'function') {
    return match(span)
  }
  const {
    name,
    performanceEntryName,
    type,
    status,
    attributes,
    scope,
    occurrence,
  } = match
  const nameMatches =
    !name ||
    (typeof name === 'string'
      ? span.name === name
      : typeof name === 'function'
        ? name(span.name)
        : name.test(span.name))

  const performanceEntryNameMatches =
    !performanceEntryName ||
    span.performanceEntry?.name === performanceEntryName

  const typeMatches = !type || span.type === type

  const statusMatches = !status || span.status === status

  const occurrenceMatches = !occurrence || annotation.occurrence === occurrence

  const attributeMatches =
    !attributes ||
    Boolean(
      span.attributes &&
      Object.entries(attributes).every(
        ([key, value]) => span.attributes?.[key] === value,
      ),
    )

  const matchesScope =
    !scope ||
    Boolean(
      span.scope &&
      Object.entries(scope).every(
        ([key, value]) => span.scope?.[key] === value,
      ),
    )

  const spanIsIdle = 'isIdle' in span ? span.isIdle : false
  const isIdleMatches = !match.isIdle || match.isIdle === spanIsIdle

  return (
    nameMatches &&
    performanceEntryNameMatches &&
    typeMatches &&
    statusMatches &&
    attributeMatches &&
    matchesScope &&
    isIdleMatches &&
    occurrenceMatches
  )
}
