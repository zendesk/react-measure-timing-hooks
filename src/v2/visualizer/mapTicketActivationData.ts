import { TraceRecording } from '../../v3/traceRecordingTypes'
import type { SupportedSpanTypes } from './constants'
import { MappedSpanAndAnnotation } from './types'

const order: Record<string, number> = {
  longtask: 0,
  render: 1,
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
  traceRecording: TraceRecording<any, any>,
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

  const mappedEntries = allEntries
    .flatMap<MappedSpanAndAnnotation>((entry, idx) => {
      if (entry.span.type === 'component-render-start') {
        return []
      }
      const mapped: MappedSpanAndAnnotation = {
        span: entry.span,
        annotation: entry.annotation,
        groupName: entry.span.name,
        type: entry.span.type,
      }
      let overrideCommonName: string | undefined
      let { type } = mapped

      if (mapped.span.name.endsWith('.svg')) {
        overrideCommonName =
          overrideCommonName ??
          mapped.groupName.split('/').at(-1) ??
          mapped.groupName
        type = 'asset'
      }
      if (collapseRenders && type === 'component-render') {
        overrideCommonName = 'renders'
      }
      if (collapseAssets && type === 'asset') {
        overrideCommonName = 'assets'
      }
      if (collapseIframes && type === 'iframe') {
        overrideCommonName = 'iframes'
      }
      if (type === 'asset' || type === 'iframe') {
        overrideCommonName =
          overrideCommonName ??
          mapped.groupName.split('/').at(-1) ??
          mapped.groupName
      }
      if (mapped.groupName.startsWith('https://')) {
        const shortenedName = mapped.groupName.split('zendesk.com').at(-1)
        if (mapped.span.attributes?.initiatorType === 'xmlhttprequest') {
          overrideCommonName = collapseEmberResources
            ? 'ember-resource'
            : overrideCommonName ?? shortenedName ?? mapped.groupName
          type = 'resource-ember'
        }
        if (type === 'resource') {
          overrideCommonName =
            overrideCommonName ?? shortenedName ?? mapped.groupName
        }
      }
      if (mapped.groupName.startsWith('graphql/')) {
        const operationName = mapped.groupName.split('/').at(-1)
        const commonName =
          overrideCommonName ||
          (operationName && `graphql:${operationName}`) ||
          mapped.groupName
        if (
          mapped.groupName.startsWith('graphql/local/') &&
          mapped.span.attributes?.feature
        ) {
          const { feature } = mapped.span.attributes
          const matchingResourceTask = mappedEntries
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
        groupName: overrideCommonName ?? mapped.groupName,
        type,
      }
    })
    .sort((a, b) => {
      const orderA = order[a.type] ?? 100
      const orderB = order[b.type] ?? 100
      return orderA - orderB
    })

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
