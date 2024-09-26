/* eslint-disable no-continue */
/* eslint-disable no-console */

declare global {
  interface PerformanceEntry {
    detail?: unknown
    operations?: Record<string, SpanMetadata<SpanKind>>
  }
}

export type SpanKind = 'fetch' | 'render' | 'operation' | 'compute'

export interface SpanMetadata<Kind extends SpanKind> {
  kind: Kind
  metadata?: Record<string, unknown>

  /** auto-generated random UUID, Operation injects into Task metadata */
  operationId: string
  /** operation name used to aggregate the children */
  operationName: string
}

export interface TaskSpanMetadata
  extends SpanMetadata<Exclude<SpanKind, 'operation'>> {
  /* string used to aggregate data */
  commonName: string

  /** how many milliseconds after the operation started did this task start */
  operationStartOffset: number

  /** how many milliseconds since the operation started did this task end */
  operationRelativeEndTime: number

  /** if the common name was seen multiple times, which occurrence is this in order */
  occurrence: number
}

export interface OperationSpanMetadata extends SpanMetadata<'operation'> {
  /** measures captured while the operation was ongoing */
  tasks: TaskDataEmbeddedInOperation[]
  includedCommonTaskNames: string[]
}

export interface TaskDataEmbeddedInOperation extends TaskSpanMetadata {
  duration: number
  detail?: Record<string, unknown>
}

export interface Span<Metadata extends SpanMetadata<SpanKind>>
  extends PerformanceEntry {
  duration: number;
  entryType: string;
  name: string;
  startTime: number;
  operations: Record<string, Metadata>
}

/**
 * a Span representing the overall process:
 * starting with a user action event (ex. a click, hover etc.)
 * and ending once the the page settles into the expected user experience
 * (ex. loading the page),
 */
export type Operation = Span<OperationSpanMetadata>

/**
 * a Child Span representing the underlying process that is being tracked
 * e.g. a fetch, rendering a component, computing a value
 */
export type Task = Span<TaskSpanMetadata>

// TODO: interrupt operation when another operation (of the same name / any) starts
// TODO: interrupt operation on any user interaction?
export function startOperation({
  name,
  requiredMeasureNames,
  metadata,
  onEnd,
}: {
  name: string
  requiredMeasureNames: string[]
  metadata?: Record<string, unknown>
  onEnd?: (values: { operationMeasure: Operation; tasks: Task[] }) => void
}) {
  console.log(`Starting operation: ${name}`)
  const operationStartTime = performance.now()
  // eslint-disable-next-line no-magic-numbers
  const id = Math.random().toString(36).slice(2)
  const tasks: Task[] = []
  const remainingRequiredMeasureNames = new Set(requiredMeasureNames)

  const occurrenceCounts = new Map<string, number>()
  let lastRequiredTask: Task | undefined
  let lastRequiredTaskEndTime: number | undefined
  const includedCommonTaskNames = new Set<string>()

  const observer = new PerformanceObserver((list) => {
    for (const entry of list.getEntries()) {
      const operationStartOffset = entry.startTime - operationStartTime
      if (operationStartOffset < 0) {
        // ignore tasks that started before the operation
        continue
      }

      try {
        // console.log(`observed measure: ${name}`, entry);
        const task = entry as unknown as Task
        let commonName: string
        let query: Record<string, string | string[]> | undefined
        let kind: SpanKind
        const extraMetadata: Record<string, unknown> = {}
        if (entry.entryType === 'resource') {
          ;({ commonUrl: commonName, query } = sanitizeUrlForTracing(
            entry.name,
          ))
          kind = 'fetch'
          const resourceTiming = entry as PerformanceResourceTiming
          extraMetadata.initiatorType = resourceTiming.initiatorType
          extraMetadata.transferSize = resourceTiming.transferSize
          extraMetadata.encodedBodySize = resourceTiming.encodedBodySize
          extraMetadata.query = query
        } else {
          commonName = entry.name
            .replaceAll(/\b\/?\d+\b/g, '')
            .replace('useTiming: ', '')
          kind = task.name.endsWith('/render')
            ? 'render'
            : task.name.includes('graphql/')
            ? 'fetch'
            : 'compute'
        }

        // temporary:
        if (kind === 'render') {
          continue
        }

        const occurrence = (occurrenceCounts.get(commonName) ?? 0) + 1
        occurrenceCounts.set(commonName, occurrence)

        const taskSpanMetadata = {
          kind,
          commonName,
          operationRelativeEndTime: operationStartOffset + task.duration,
          operationName: name,
          operationStartOffset,
          occurrence,
          metadata: { ...extraMetadata, ...metadata },
          operationId: id,
        }

        // TODO: consolidation of renders?
        if (
          !lastRequiredTaskEndTime ||
          task.startTime + task.duration < lastRequiredTaskEndTime
        ) {
          task.operations ??= {}
          task.operations[name] = taskSpanMetadata
          tasks.push(task)
          includedCommonTaskNames.add(commonName)
        }

        if (remainingRequiredMeasureNames.has(task.name)) {
          remainingRequiredMeasureNames.delete(task.name)
          if (remainingRequiredMeasureNames.size === 0) {
            lastRequiredTask = task
            lastRequiredTaskEndTime = task.startTime + task.duration
          }
        }
      } catch (error) {
        console.error('error processing operation', error)
      }
    }

    // TODO: add operation timeout: auto-complete after a certain time, or once the another (same-type) user interaction is started
    if (lastRequiredTask && lastRequiredTaskEndTime) {
      tasks.sort(
        (a, b) => a.startTime + a.duration - (b.startTime + b.duration),
      )
      observer.disconnect()

      const measure = performance.measure(name, {
        start: operationStartTime,
        end: lastRequiredTask.startTime + lastRequiredTask.duration,
        detail: { operationName: name },
      }) as Operation

      const embeddedTasksDetails = tasks.map(
        (rawTask): TaskDataEmbeddedInOperation => ({
          ...rawTask.operations[name]!,
          detail:
            typeof rawTask.detail === 'object' && rawTask.detail
              ? { ...rawTask.detail }
              : {},
          duration: rawTask.duration,
        }),
      )
      measure.operations = {
        [name]: {
          kind: 'operation',
          metadata,
          operationId: id,
          operationName: name,
          tasks: embeddedTasksDetails,
          includedCommonTaskNames: [...includedCommonTaskNames],
        } satisfies OperationSpanMetadata,
      }

      console.log(`finished tracking operation: ${name}`, measure)

      onEnd?.({
        operationMeasure: measure,
        tasks,
      })
    }
  })

  observer.observe({ entryTypes: ['measure'] })
}

function sanitizeUrlForTracing(url: string): {
  commonUrl: string
  query: Record<string, string | string[]>
} {
  // Extract query string into a separate variable
  const queryStringIndex = url.indexOf('?')
  const query: Record<string, string | string[]> = {}
  let commonUrl = url
  if (queryStringIndex >= 0) {
    // Split the URL to get the query string part
    commonUrl = url.slice(0, queryStringIndex)
    const queryString = url.slice(queryStringIndex + 1)
    // Parse query string into an object
    queryString
      .split('&')
      .map((param) => param.split('='))
      .forEach(([key, value]) => {
        if (!key) return
        // decode URI components and handle the case for array parameters
        key = decodeURIComponent(key)
        value = value ? decodeURIComponent(value) : ''

        // Check if the key already exists
        const currentValue = query[key]
        if (currentValue) {
          // If it does and it's an array, we push the new value to it
          // If it's not an array, we convert it to an array and then add the new value
          query[key] = Array.isArray(currentValue)
            ? [...currentValue, value]
            : [currentValue, value]
        } else {
          // If it doesn't exist, we simply add the key-value pair
          query[key] = value
        }
      })
  }

  // Remove URL scheme
  // const urlWithoutScheme = commonUrl.replace(/(^\w+:|^)\/\//, '');

  // Replace numeric parts of the ID with $ID
  const sanitizedUrl = commonUrl.replace(/\/\d+/g, '/$ID')

  return {
    commonUrl: sanitizedUrl,
    query,
  }
}
