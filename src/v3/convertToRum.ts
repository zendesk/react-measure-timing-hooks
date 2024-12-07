/* eslint-disable @typescript-eslint/consistent-indexed-object-style */
import { getSpanKey } from './getSpanKey'
import type { SpanMatcherFn } from './matchSpan'
import { SpanAndAnnotation } from './spanAnnotationTypes'
import { ComponentRenderSpan, Span } from './spanTypes'
import { TraceRecording, TraceRecordingBase } from './traceRecordingTypes'
import { ScopeBase } from './types'

export interface EmbeddedEntry {
  count: number
  totalDuration: number
  spans: {
    startOffset: number
    duration: number
    error?: true | undefined
  }[]
}

export interface RumTraceRecording<ScopeT extends Partial<ScopeBase<ScopeT>>>
  extends TraceRecordingBase<ScopeT> {
  scope: ScopeT

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
}

export function isRenderEntry<ScopeT extends Partial<ScopeBase<ScopeT>>>(
  entry: Span<ScopeT>,
): entry is ComponentRenderSpan<ScopeT> {
  return (
    entry.type === 'component-render' ||
    entry.type === 'component-render-start' ||
    entry.type === 'component-unmount'
  )
}

function updateEmbeddedEntry<ScopeT extends Partial<ScopeBase<ScopeT>>>(
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

function createEmbeddedEntry<ScopeT extends Partial<ScopeBase<ScopeT>>>({
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

export const defaultEmbedSpanSelector = <
  ScopeT extends Partial<ScopeBase<ScopeT>>,
>(
  spanAndAnnotation: SpanAndAnnotation<ScopeT>,
) => {
  const { span } = spanAndAnnotation
  return isRenderEntry(span)
}

export function convertTraceToRUM<ScopeT extends Partial<ScopeBase<ScopeT>>>(
  traceRecording: TraceRecording<ScopeT>,
  embedSpanSelector: SpanMatcherFn<ScopeT> = defaultEmbedSpanSelector,
): RumTraceRecording<ScopeT> {
  const { entries, ...otherTraceRecordingAttributes } = traceRecording
  const embeddedEntries: SpanAndAnnotation<ScopeT>[] = []
  const nonEmbeddedSpans = new Set<string>()

  for (const spanAndAnnotation of entries) {
    const isEmbedded = embedSpanSelector(
      spanAndAnnotation,
      traceRecording.scope,
    )
    if (isEmbedded) {
      embeddedEntries.push(spanAndAnnotation)
    } else {
      nonEmbeddedSpans.add(getSpanKey(spanAndAnnotation.span))
    }
  }
  const embeddedSpans: {
    [typeAndName: string]: EmbeddedEntry
  } = {}

  for (const spanAndAnnotation of embeddedEntries) {
    const { span } = spanAndAnnotation
    const typeAndName = getSpanKey(span)
    const existingEmbeddedEntry = embeddedSpans[typeAndName]

    if (existingEmbeddedEntry) {
      embeddedSpans[typeAndName] = updateEmbeddedEntry(
        existingEmbeddedEntry,
        spanAndAnnotation,
      )
    } else {
      embeddedSpans[typeAndName] = createEmbeddedEntry(spanAndAnnotation)
    }
  }

  return {
    ...otherTraceRecordingAttributes,
    embeddedSpans,
    nonEmbeddedSpans: [...nonEmbeddedSpans],
  }
}
