import { Operation, TaskDataEmbeddedInOperation } from '../../2024/types'

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
  ttrData: TaskDataEmbeddedInOperation
  ttiData: TaskDataEmbeddedInOperation
  ttrDuration: number
  ttiDuration: number
  spanEvents: TaskDataEmbeddedInOperation[]
  kinds: Set<string>
  tasks: TaskDataEmbeddedInOperation[]
  includedCommonTaskNames: string[]
}
export const mapTicketActivationData = (
  file: Operation,
  {
    collapseRenders = true,
    collapseAssets = true,
    collapseEmberResources = false,
    collapseIframes = false,
    displayResources = true,
    displayMeasures = true,
  }: {
    collapseRenders?: boolean
    collapseAssets?: boolean
    collapseEmberResources?: boolean
    collapseIframes?: boolean
    displayResources?: boolean
    displayMeasures?: boolean
  } = {},
): MappedOperation | null => {
  const operationData = file.operations['ticket/activation']
  if (!operationData) return null

  const {
    includedCommonTaskNames: _,
    // this function depends on the tasks being sorted by startTime
    tasks: allTasks,
  } = operationData

  const OPERATION_SPAN_NAME = 'performance/ticket/activation'

  // Use helper functions to find the TTR and TTI data.
  const isTTITask = (task: (typeof allTasks)[number]) =>
    task.name.startsWith(OPERATION_SPAN_NAME) && task.name.endsWith('/tti')
  const ttiData = allTasks.find(isTTITask)!

  const isTTRTask = (task: (typeof allTasks)[number]) =>
    task.name.startsWith(OPERATION_SPAN_NAME) && task.name.endsWith('/ttr')
  const ttrData = allTasks.find(isTTRTask)!

  // Extract durations if the tasks were found.
  const ttrDuration = ttrData?.duration
  const ttiDuration = ttiData?.duration

  const tasks = allTasks
    .filter((task) => !isTTITask(task) && !isTTRTask(task) && task.duration > 0)
    .map((task, idx) => {
      let overrideCommonName: string | undefined
      let { kind } = task

      if (task.name.endsWith('.svg')) {
        overrideCommonName =
          overrideCommonName ??
          task.commonName.split('/').at(-1) ??
          task.commonName
        kind = 'asset'
      }
      if (collapseRenders && kind === 'render') {
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
          task.detail?.feature
        ) {
          const { feature } = task.detail
          // match "graphql/local" "resource" with `detail.feature` with next "resource" of the same `metadata.feature`.
          // use commonName of the former.
          const matchingResourceTask = allTasks
            .slice(idx + 1)
            .find(
              (t) => t.metadata?.feature === feature && t.kind === 'resource',
            )
          const resourceUrl = matchingResourceTask?.name
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
          } as const
        }
        return {
          ...task,
          commonName,
          kind: 'resource',
        } as const
      }
      return {
        ...task,
        commonName: overrideCommonName ?? task.commonName,
        kind,
      } as const
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

  const spanEvents = allTasks.filter((task) => task.duration === 0)
  const kinds = new Set(tasks.map((task) => task.kind))

  // regenerate the includedCommonTaskNames
  const includedCommonTaskNames = [
    ...new Set(tasks.map((task) => task.commonName)),
  ]

  // Create a new operation object without the TTR and TTI tasks;
  // this avoids any side effects from modifying tempOperation directly.
  return {
    name: operationData.operationName,
    tasks,
    includedCommonTaskNames,
    ttrData,
    ttiData,
    ttrDuration,
    ttiDuration,
    spanEvents,
    kinds,
  }
}
