/* eslint-disable @typescript-eslint/consistent-indexed-object-style */
import { getSpanKey } from './getSpanKey'
import type { SpanMatcherFn } from './matchSpan'
import { SpanAndAnnotation } from './spanAnnotationTypes'
import { ComponentRenderSpan, Span } from './spanTypes'
import { TraceRecording, TraceRecordingBase } from './traceRecordingTypes'
import type { SelectScopeByKey, TraceContext } from './types'
import type { KeysOfUnion } from './typeUtils'

export interface EmbeddedEntry {
  count: number
  totalDuration: number
  spans: {
    startOffset: number
    duration: number
    error?: true | undefined
  }[]
}

export interface SpanSummaryAttributes {
  [typeAndName: string]: {
    [attributeName: string]: unknown
  }
}

export interface RumTraceRecording<TracerScopeT>
  extends TraceRecordingBase<TracerScopeT> {
  scope: TracerScopeT

  // spans that don't exist as separate spans in the DB
  // useful for things like renders, which can repeat tens of times
  // during the same operation
  embeddedSpans: {
    [typeAndName: string]: EmbeddedEntry
  }

  // `typeAndName`s of spans that can be used to query
  // & aggregate average start offset and duration
  // 'resource|/apis/tickets/123.json'
  // 'resource|graphql/query/GetTickets'
  // 'component-render|OmniLog'
  // 'error|Something went wrong'
  // 'measure|ticket.fetch'
  nonEmbeddedSpans: string[]

  /**
   * Merged attributes of the spans with the same type and name.
   * If attributes changed, most recent ones overwrite older ones.
   */
  spanAttributes: SpanSummaryAttributes
}

export function isRenderEntry<ScopeT>(
  entry: Span<ScopeT>,
): entry is ComponentRenderSpan<ScopeT> {
  return (
    entry.type === 'component-render' ||
    entry.type === 'component-render-start' ||
    entry.type === 'component-unmount'
  )
}

function updateEmbeddedEntry<ScopeT>(
  embeddedEntry: EmbeddedEntry,
  spanAndAnnotation: SpanAndAnnotation<ScopeT>,
): EmbeddedEntry {
  const { annotation, span } = spanAndAnnotation
  return {
    count: embeddedEntry.count + 1,
    totalDuration: embeddedEntry.totalDuration + span.duration,
    spans: [
      ...embeddedEntry.spans,
      {
        startOffset: annotation.operationRelativeStartTime,
        duration: span.duration,
      },
    ],
  }
}

function createEmbeddedEntry<ScopeT>({
  span,
  annotation,
}: SpanAndAnnotation<ScopeT>): EmbeddedEntry {
  return {
    count: 1,
    totalDuration: span.duration,
    spans: [
      {
        startOffset: annotation.operationRelativeStartTime,
        duration: span.duration,
      },
    ],
  }
}

export const defaultEmbedSpanSelector = <ScopeT>(
  spanAndAnnotation: SpanAndAnnotation<ScopeT>,
) => {
  const { span } = spanAndAnnotation
  return isRenderEntry(span)
}

export function getSpanSummaryAttributes<AllPossibleScopesT>(
  recordedItems: SpanAndAnnotation<AllPossibleScopesT>[],
): SpanSummaryAttributes {
  // loop through recorded items, create a entry based on the name
  const spanAttributes: SpanSummaryAttributes = {}

  for (const { span } of recordedItems) {
    const { attributes, name } = span
    const existingAttributes = spanAttributes[name] ?? {}
    if (attributes && Object.keys(attributes).length > 0) {
      spanAttributes[name] = {
        ...existingAttributes,
        ...attributes,
      }
    }
  }

  return spanAttributes
}

export function convertTraceToRUM<
  TracerScopeKeysT extends KeysOfUnion<AllPossibleScopesT>,
  AllPossibleScopesT,
>(
  traceRecording: TraceRecording<TracerScopeKeysT, AllPossibleScopesT>,
  context: TraceContext<TracerScopeKeysT, AllPossibleScopesT>,
  embedSpanSelector: SpanMatcherFn<
    TracerScopeKeysT,
    AllPossibleScopesT
  > = defaultEmbedSpanSelector,
): RumTraceRecording<SelectScopeByKey<TracerScopeKeysT, AllPossibleScopesT>> {
  const { entries, ...otherTraceRecordingAttributes } = traceRecording
  const embeddedEntries: SpanAndAnnotation<AllPossibleScopesT>[] = []
  const nonEmbeddedSpans = new Set<string>()
  const spanAttributes = getSpanSummaryAttributes(traceRecording.entries)

  for (const spanAndAnnotation of entries) {
    const isEmbedded = embedSpanSelector(spanAndAnnotation, context)
    if (isEmbedded) {
      embeddedEntries.push(spanAndAnnotation)
    } else {
      nonEmbeddedSpans.add(getSpanKey(spanAndAnnotation.span))
    }
  }
  const embeddedSpans = new Map<string, EmbeddedEntry>()

  for (const spanAndAnnotation of embeddedEntries) {
    const { span } = spanAndAnnotation
    const typeAndName = getSpanKey(span)
    const existingEmbeddedEntry = embeddedSpans.get(typeAndName)

    if (existingEmbeddedEntry) {
      embeddedSpans.set(
        typeAndName,
        updateEmbeddedEntry(existingEmbeddedEntry, spanAndAnnotation),
      )
    } else {
      embeddedSpans.set(typeAndName, createEmbeddedEntry(spanAndAnnotation))
    }
  }

  // Filter out entries with zero duration
  for (const [key, value] of embeddedSpans) {
    if (value.totalDuration === 0) {
      embeddedSpans.delete(key)
    }
  }

  return {
    ...otherTraceRecordingAttributes,
    embeddedSpans: Object.fromEntries(embeddedSpans),
    nonEmbeddedSpans: [...nonEmbeddedSpans],
    spanAttributes,
  }
}
