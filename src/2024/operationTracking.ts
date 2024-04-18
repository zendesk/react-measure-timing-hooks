/* eslint-disable no-console */
export type SpanKind = 'fetch' | 'render' | 'operation' | 'compute'

declare global {
  interface PerformanceEntry {
    detail?: unknown
  }
}

interface SpanDetail<Kind extends SpanKind> {
  kind: Kind
  // holds ticket id, whatever we want!
  metadata?: Record<string, unknown>

  /** auto-generated random UUID, Operation injects into Task metadata */
  operationId: string
  /** operation name used to aggregate the children */
  operationName: string
}

interface TaskSpanDetail extends SpanDetail<Exclude<SpanKind, 'operation'>> {
  /* string used to aggregate data */
  commonName: string

  /** how many milliseconds after the operation started did this task start */
  operationStartOffset: number

  /** if the common name was seen multiple times, which occurrence is this in order */
  occurrence: number
}

interface OperationSpanDetail extends SpanDetail<'operation'> {
  /** measures captured while the operation was ongoing */
  tasks: TaskDataEmbeddedInOperation[]
  includedCommonTaskNames: string[]
}

interface TaskDataEmbeddedInOperation extends TaskSpanDetail {
  duration: number
}

export interface Span<Detail extends SpanDetail<SpanKind>> {
  duration: number
  entryType: 'measure'
  name: string
  startTime: number

  detail: Detail
}

/**
 * a Span representing the overall process:
 * starting with a user action event (ex. a click, hover etc.)
 * and ending once the the page settles into the expected user experience
 * (ex. loading the page),
 */
export interface Operation extends Span<OperationSpanDetail> {}

/**
 * a Child Span representing the underlying process that is being tracked
 * e.g. a fetch, rendering a component, computing a value
 */
export interface Task extends Span<TaskSpanDetail> {}

export function startOperation({
  name,
  requiredMeasureNames,
  metadata,
}: {
  name: string
  requiredMeasureNames: string[]
  metadata?: Record<string, unknown>
}) {
  console.log(`Starting operation: ${name}`)
  const operationStartTime = performance.now()
  // eslint-disable-next-line no-magic-numbers
  const operationId = Math.random().toString(36).slice(2)
  const tasks: Task[] = []
  const remainingRequiredMeasureNames = new Set(requiredMeasureNames)

  const occurrenceCounts = new Map<string, number>()

  const observer = new PerformanceObserver((list) => {
    list.getEntries().forEach((entry) => {
      console.log(`observed measure: ${name}`, entry)
      const task = entry as Task
      const commonName = entry.name
        .replaceAll(/\b\/?\d+\b/g, '')
        .replace('useTiming: ', '')
      const occurrence = (occurrenceCounts.get(commonName) ?? 0) + 1
      occurrenceCounts.set(commonName, occurrence)

      const detail = {
        ...(typeof task.detail === 'object' ? task.detail : {}),
        operationStartOffset: task.startTime - operationStartTime,
        kind: task.name.endsWith('/render')
          ? 'render'
          : task.name.includes('graphql/')
          ? 'fetch'
          : 'compute',
        operationId,
        operationName: name,
        commonName,
        occurrence,
      } satisfies TaskSpanDetail

      Object.assign(task.detail, detail)

      // Object.defineProperty(task, 'detail', { value: detail })

      // TODO: consolidation of renders?

      // task.detail
      tasks.push(task)

      const embeddedTasksDetails = tasks.map(
        (rawTask): TaskDataEmbeddedInOperation => ({
          ...rawTask.detail,
          duration: rawTask.duration,
        }),
      )

      if (remainingRequiredMeasureNames.has(task.name)) {
        remainingRequiredMeasureNames.delete(task.name)
        if (remainingRequiredMeasureNames.size === 0) {
          observer.disconnect()
          const measure = performance.measure(name, {
            start: operationStartTime,
            end: task.startTime + task.duration,
            detail: {
              kind: 'operation',
              metadata,
              operationId,
              operationName: name,
              tasks: embeddedTasksDetails,
              includedCommonTaskNames: [
                ...new Set(tasks.map(({ detail: d }) => d.commonName)),
              ],
            } satisfies OperationSpanDetail,
          })

          console.log(`finished tracking operation: ${name}`, measure)
        }
      }
    })
  })

  observer.observe({ entryTypes: ['measure'] })
}

export function startTicketActivationOperation(ticketId: string) {
  startOperation({
    name: 'ticket.activation',
    requiredMeasureNames: [
      `useTiming: performance/ticket/activation/${ticketId}/tti`,
    ],
    metadata: {
      ticketId,
    },
  })
}
