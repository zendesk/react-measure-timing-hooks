import { SpanAnnotation } from '../../v3/spanAnnotationTypes'
import { Span } from '../../v3/spanTypes'
import { TraceRecording } from '../../v3/traceRecordingTypes'
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
  kinds: Set<string>
  tasks: MappedSpanAndAnnotation[]
  includedCommonTaskNames: string[]
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

  const allTasks = allEntries.flatMap((entry, idx) => {
    if (entry.span.type === 'component-render-start') {
      return []
    }
    const task: MappedSpanAndAnnotation = {
      span: entry.span,
      annotation: entry.annotation,
      commonName: entry.span.name,
      kind: entry.span.type,
      metadata: entry.span.performanceEntry
        ? { ...entry.span.performanceEntry }
        : undefined,
    }
    return task
  })

  const tasks = allTasks
    .filter((task) => task.span.duration > 0)
    .map((task, idx) => {
      let overrideCommonName: string | undefined
      let { kind } = task

      if (task.span.name.endsWith('.svg')) {
        overrideCommonName =
          overrideCommonName ??
          task.commonName.split('/').at(-1) ??
          task.commonName
        kind = 'asset'
      }
      if (collapseRenders && kind === 'component-render') {
        overrideCommonName = 'renders'
      }
      if (collapseAssets && kind === 'asset') {
        overrideCommonName = 'assets'
      }
      if (collapseIframes && kind === 'iframe') {
        overrideCommonName = 'iframes'
      }
      if (kind === 'asset' || kind === 'iframe') {
        overrideCommonName =
          overrideCommonName ??
          task.commonName.split('/').at(-1) ??
          task.commonName
      }
      if (task.commonName.startsWith('https://')) {
        const shortenedName = task.commonName.split('zendesk.com').at(-1)
        if (task.metadata?.initiatorType === 'xmlhttprequest') {
          overrideCommonName = collapseEmberResources
            ? 'ember-resource'
            : overrideCommonName ?? shortenedName ?? task.commonName
          kind = 'resource-ember'
        }
        if (kind === 'resource') {
          overrideCommonName =
            overrideCommonName ?? shortenedName ?? task.commonName
        }
      }
      if (task.commonName.startsWith('graphql/')) {
        const operationName = task.commonName.split('/').at(-1)
        const commonName =
          overrideCommonName ||
          (operationName && `graphql:${operationName}`) ||
          task.commonName
        if (
          task.commonName.startsWith('graphql/local/') &&
          task.span.attributes?.feature
        ) {
          const { feature } = task.span.attributes
          const matchingResourceTask = allTasks
            .slice(idx + 1)
            .find(
              (t) =>
                t.span.attributes?.feature === feature && t.kind === 'resource',
            )
          const resourceUrl = matchingResourceTask?.span.name
          if (matchingResourceTask) {
            matchingResourceTask.commonName = commonName
          }
          return {
            ...task,
            commonName,
            kind: 'resource',
            metadata: {
              ...task.metadata,
              resourceUrl,
            },
          }
        }
        return {
          ...task,
          commonName,
          kind: 'resource',
        }
      }
      return {
        ...task,
        commonName: overrideCommonName ?? task.commonName,
        kind,
      }
    })
    .filter(
      (task) =>
        (displayResources || task.kind !== 'resource') &&
        (displayMeasures || task.kind !== 'measure'),
    )
    .sort((a, b) => {
      const orderA = order[a.kind] ?? 100
      const orderB = order[b.kind] ?? 100
      return orderA - orderB
    })

  const spanEvents = allTasks.filter((task) => task.span.duration === 0)
  const kinds = new Set(tasks.map((task) => task.kind))

  const includedCommonTaskNames = [
    ...new Set(tasks.map((task) => task.commonName)),
  ]

  return {
    name: traceRecording.name,
    tasks,
    includedCommonTaskNames,
    spanEvents,
    kinds,
    duration: traceRecording.duration,
  }
}
