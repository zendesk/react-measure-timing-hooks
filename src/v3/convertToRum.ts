/* eslint-disable @typescript-eslint/consistent-indexed-object-style */
import {
  ComponentRenderTraceEntry,
  ScopeBase,
  TraceEntry,
  TraceEntryAndAnnotation,
  TraceRecording,
  TraceRecordingBase,
} from './types'

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
  embeddedEntries: {
    [typeAndName: string]: EmbeddedEntry
  }

  // `typeAndName`s of entries that can be used to query
  // & aggregate average start offset and duration
  // 'resource|/apis/tickets/123.json'
  // 'resource|graphql/query/GetTickets'
  // 'component-render|OmniLog'
  // 'error|Something went wrong'
  // 'measure|ticket.fetch'
  nonEmbeddedEntries: string[]
}

function isRenderEntry<ScopeT extends ScopeBase>(
  entry: TraceEntry<ScopeT>,
): entry is ComponentRenderTraceEntry<ScopeT> {
  return (
    entry.type === 'component-render' ||
    entry.type === 'component-render-start' ||
    entry.type === 'component-unmount'
  )
}

function updateEmbeddedEntry<ScopeT extends ScopeBase>(
  embeddedEntry: EmbeddedEntry,
  entryAndAnnotation: TraceEntryAndAnnotation<ScopeT>,
): EmbeddedEntry {
  const { annotation, entry } = entryAndAnnotation
  return {
    count: embeddedEntry.count + 1,
    totalDuration: embeddedEntry.totalDuration + entry.duration,
    spans: [
      ...embeddedEntry.spans,
      {
        startOffset: annotation.operationRelativeStartTime,
        duration: entry.duration,
      },
    ],
  }
}

function createEmbeddedEntry<ScopeT extends ScopeBase>({
  entry,
  annotation,
}: TraceEntryAndAnnotation<ScopeT>): EmbeddedEntry {
  return {
    count: 1,
    totalDuration: entry.duration,
    spans: [
      {
        startOffset: annotation.operationRelativeStartTime,
        duration: entry.duration,
      },
    ],
  }
}

export function convertTraceToRUM<ScopeT extends ScopeBase>(
  traceRecording: TraceRecording<ScopeT>,
): RumTraceRecording<ScopeT> {
  const { entries, ...otherTraceRecordingAttributes } = traceRecording
  const renderEntries = entries.filter(({ entry }) => isRenderEntry(entry))
  const renderEntriesByName: {
    [typeAndName: string]: EmbeddedEntry
  } = {}

  renderEntries.forEach((entryAndAnnotation) => {
    const { entry } = entryAndAnnotation
    const { name, type } = entry
    const typeAndName = `${type}|${name}`
    const existingEmbeddedEntry = renderEntriesByName[typeAndName]

    if (existingEmbeddedEntry) {
      renderEntriesByName[typeAndName] = updateEmbeddedEntry(
        existingEmbeddedEntry,
        entryAndAnnotation,
      )
    } else {
      renderEntriesByName[typeAndName] = createEmbeddedEntry(entryAndAnnotation)
    }
  })

  return {
    ...otherTraceRecordingAttributes,
    embeddedEntries: renderEntriesByName,
    // TODO: get entry string names for nonEmbeddedEntries
    nonEmbeddedEntries: [],
  }
}
