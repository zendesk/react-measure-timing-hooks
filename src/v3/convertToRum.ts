/* eslint-disable @typescript-eslint/consistent-indexed-object-style */
import { getSpanKey } from './getSpanKey'
import type { SpanMatcherFn } from './matchSpan'
import type { SpanAndAnnotation } from './spanAnnotationTypes'
import type { ComponentRenderSpan, Span } from './spanTypes'
import type { TraceRecording, TraceRecordingBase } from './traceRecordingTypes'
import type { SelectRelationSchemaByKeysTuple, TraceContext } from './types'
import type { KeysOfRelationSchemaToTuples } from './typeUtils'

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

export interface RumTraceRecording<RelationSchemaT>
  extends TraceRecordingBase<RelationSchemaT> {
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

  // allow for additional attributes to be added by the consumer
  [key: string]: unknown
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

export function getSpanSummaryAttributes<RelationSchemasT>(
  recordedItems: SpanAndAnnotation<RelationSchemasT>[],
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

type RoundFunction = (x: number) => number

function recursivelyRoundValues<T extends object>(
  obj: T,
  roundFunc: RoundFunction = (x) => Math.round(x),
): T {
  const result: Record<string, unknown> = {}

  for (const [key, value] of Object.entries(obj as object)) {
    if (typeof value === 'number') {
      result[key] = roundFunc(value)
    } else if (Array.isArray(value)) {
      result[key] = value.map((item: number | T) =>
        typeof item === 'number'
          ? roundFunc(item)
          : recursivelyRoundValues(item, roundFunc),
      )
    } else if (value && typeof value === 'object') {
      result[key] = recursivelyRoundValues(value, roundFunc)
    } else {
      result[key] = value
    }
  }

  return result as T
}

export function convertTraceToRUM<
  SelectedRelationTupleT extends KeysOfRelationSchemaToTuples<RelationSchemasT>,
  RelationSchemasT,
  const VariantsT extends string,
>(
  traceRecording: TraceRecording<SelectedRelationTupleT, RelationSchemasT>,
  context: TraceContext<SelectedRelationTupleT, RelationSchemasT, VariantsT>,
  embedSpanSelector: SpanMatcherFn<
    SelectedRelationTupleT,
    RelationSchemasT,
    VariantsT
  > = defaultEmbedSpanSelector,
): RumTraceRecording<
  SelectRelationSchemaByKeysTuple<SelectedRelationTupleT, RelationSchemasT>
> {
  const { entries, ...otherTraceRecordingAttributes } = traceRecording
  const embeddedEntries: SpanAndAnnotation<RelationSchemasT>[] = []
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

  const result: RumTraceRecording<
    SelectRelationSchemaByKeysTuple<SelectedRelationTupleT, RelationSchemasT>
  > = {
    ...otherTraceRecordingAttributes,
    embeddedSpans: Object.fromEntries(embeddedSpans),
    nonEmbeddedSpans: [...nonEmbeddedSpans],
    spanAttributes,
  }

  return recursivelyRoundValues(result)
}
