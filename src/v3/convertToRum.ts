/* eslint-disable @typescript-eslint/consistent-indexed-object-style */
import { ComponentRenderSpan, Span } from './spanTypes'
import { TraceRecording, TraceRecordingBase } from './traceRecordingTypes'
import { ScopeBase, SpanAndAnnotation } from './types'

export interface EmbeddedEntry {
  count: number
  totalDuration: number
  spans: {
    startOffset: number
    duration: number
    error?: true | undefined
  }[]
}

export interface RumTraceRecording<ScopeT extends ScopeBase>
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

function isRenderEntry<ScopeT extends ScopeBase>(
  entry: Span<ScopeT>,
): entry is ComponentRenderSpan<ScopeT> {
  return (
    entry.type === 'component-render' ||
    entry.type === 'component-render-start' ||
    entry.type === 'component-unmount'
  )
}

function updateEmbeddedEntry<ScopeT extends ScopeBase>(
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

function createEmbeddedEntry<ScopeT extends ScopeBase>({
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

export function convertTraceToRUM<ScopeT extends ScopeBase>(
  traceRecording: TraceRecording<ScopeT>,
): RumTraceRecording<ScopeT> {
  const { entries, ...otherTraceRecordingAttributes } = traceRecording
  const renderEntries = entries.filter(({ span }) => isRenderEntry(span))
  const renderEntriesByName: {
    [typeAndName: string]: EmbeddedEntry
  } = {}

  renderEntries.forEach((spanAndAnnotation) => {
    const { span } = spanAndAnnotation
    const { name, type } = span
    const typeAndName = `${type}|${name}`
    const existingEmbeddedEntry = renderEntriesByName[typeAndName]

    if (existingEmbeddedEntry) {
      renderEntriesByName[typeAndName] = updateEmbeddedEntry(
        existingEmbeddedEntry,
        spanAndAnnotation,
      )
    } else {
      renderEntriesByName[typeAndName] = createEmbeddedEntry(spanAndAnnotation)
    }
  })

  return {
    ...otherTraceRecordingAttributes,
    embeddedSpans: renderEntriesByName,
    // IMPLEMENTATION TODO: get span string names for nonEmbeddedEntries
    nonEmbeddedSpans: [],
  }
}
