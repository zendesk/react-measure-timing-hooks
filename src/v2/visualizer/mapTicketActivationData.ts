import type { SupportedSpanTypes } from './constants'
import { type RecordingInputFile, MappedSpanAndAnnotation } from './types'

const order: Record<string, number> = {
  longtask: 0,
  'component-render': 1,
  measure: 2,
  resource: 3,
  'resource-ember': 3,
  asset: 4,
  iframe: 5,
}

export interface MappedOperation {
  name: string
  spanEvents: MappedSpanAndAnnotation[]
  spanTypes: Set<SupportedSpanTypes>
  spansWithDuration: MappedSpanAndAnnotation[]
  uniqueGroups: string[]
  duration: number
}

export const mapTicketActivationData = (
  traceRecording: RecordingInputFile,
  {
    collapseRenders = true,
    collapseAssets = true,
    collapseEmberResources = false,
    collapseIframes = false,
    displayResources = true,
    displayMeasures = true,
  } = {},
): MappedOperation | null => {
  const allEntries = traceRecording.entries
  if (!allEntries || !traceRecording.duration) return null

  const preMappedEntries = allEntries
    .flatMap<MappedSpanAndAnnotation & { overrideGroupName?: string }>(
      (entry, idx) => {
        if (entry.span.type === 'component-render-start') {
          return []
        }
        const mapped: MappedSpanAndAnnotation = {
          span: entry.span,
          annotation: entry.annotation,
          groupName: entry.span.name,
          type: entry.span.type,
        }
        let overrideGroupName: string | undefined
        let { type } = mapped

        if (mapped.span.name.endsWith('.svg')) {
          overrideGroupName =
            overrideGroupName ?? mapped.groupName.split('/').at(-1)
          type = 'asset'
        }
        if (collapseRenders && type === 'component-render') {
          overrideGroupName = 'renders'
        }
        if (collapseAssets && type === 'asset') {
          overrideGroupName = 'assets'
        }
        if (collapseIframes && type === 'iframe') {
          overrideGroupName = 'iframes'
        }
        if (type === 'asset' || type === 'iframe') {
          overrideGroupName =
            overrideGroupName ?? mapped.groupName.split('/').at(-1)
        }
        if (
          type === 'measure' &&
          (entry.span.name.endsWith('/tti') || entry.span.name.endsWith('/ttr'))
        ) {
          // remove suffix from measure name
          overrideGroupName = entry.span.name.split('/').slice(0, -1).join('/')
        }
        if (entry.span.name.startsWith('https://')) {
          const shortenedName = entry.span.name.split('zendesk.com').at(-1)
          if (mapped.span.attributes?.initiatorType === 'xmlhttprequest') {
            overrideGroupName = collapseEmberResources
              ? 'ember-resource'
              : overrideGroupName ?? shortenedName
            type = 'resource-ember'
          }
          if (type === 'resource') {
            overrideGroupName = overrideGroupName ?? shortenedName
          }
        }
        return {
          ...mapped,
          overrideGroupName,
          type,
        }
      },
    )
    .sort((a, b) => {
      const orderA = order[a.type] ?? 100
      const orderB = order[b.type] ?? 100
      return orderA - orderB
    })

  const mappedEntries = preMappedEntries.map<MappedSpanAndAnnotation>(
    (mapped, idx) => {
      if (mapped.groupName.startsWith('graphql/')) {
        const operationName = mapped.groupName.split('/').at(-1)
        const commonName =
          mapped.overrideGroupName ??
          (operationName && `graphql:${operationName}`) ??
          mapped.groupName
        if (
          mapped.groupName.startsWith('graphql/local/') &&
          mapped.span.attributes?.feature
        ) {
          const { feature } = mapped.span.attributes
          const matchingResourceTask = preMappedEntries
            .slice(idx + 1)
            .find(
              (t) =>
                t.span.attributes?.feature === feature && t.type === 'resource',
            )
          if (matchingResourceTask) {
            matchingResourceTask.groupName = commonName
          }
          return {
            ...mapped,
            groupName: commonName,
            type: 'resource',
          }
        }
        return {
          ...mapped,
          groupName: commonName,
          type: 'resource',
        }
      }
      return {
        ...mapped,
        groupName: mapped.overrideGroupName ?? mapped.groupName,
      }
    },
  )

  const spansWithDuration = mappedEntries
    .filter((task) => task.span.duration > 0)
    .filter(
      (task) =>
        (displayResources || task.type !== 'resource') &&
        (displayMeasures || task.type !== 'measure'),
    )

  const spanEvents = mappedEntries.filter((task) => task.span.duration === 0)
  const kinds = new Set(spansWithDuration.map((task) => task.type))

  const uniqueGroups = [
    ...new Set(spansWithDuration.map((task) => task.groupName)),
  ]

  return {
    name: traceRecording.name,
    spansWithDuration,
    uniqueGroups,
    spanEvents,
    spanTypes: kinds,
    duration: traceRecording.duration,
  }
}
