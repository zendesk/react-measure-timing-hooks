/* eslint-disable no-console */

import { type Subscription, Observable, share } from 'rxjs'
import type { AnyPerformanceEntry, PerformanceEntryType } from './globalTypes'
import { sanitizeUrlForTracing } from '../v2/sanitizeUrlForTracing'
import type {
  Operation,
  OperationSpanMetadata,
  PerformanceEntryLike,
  Task,
  TaskDataEmbeddedInOperation,
  TaskSpanKind,
  TaskSpanMetadata,
} from './types'

interface ProcessedEntry {
  commonName: string
  fullName: string
  kind: TaskSpanKind
  extraMetadata: Record<string, unknown>
  occurrenceCountPrefix: string
}

function extractEntryMetadata(
  entry: AnyPerformanceEntry | PerformanceEntryLike,
  metadata?: Record<string, unknown>,
): ProcessedEntry {
  /** a short name used for grouping entries into a single lane */
  let commonName: string
  /** a fuller descriptive name */
  let fullName = entry.name
  let query: Record<string, string | string[]> | undefined
  let kind: TaskSpanKind = entry.entryType as TaskSpanKind
  const extraMetadata: Record<string, unknown> = {}
  let occurrenceCountPrefix = ''

  switch (entry.entryType) {
    case 'resource': {
      ;({ commonUrl: commonName, query } = sanitizeUrlForTracing(entry.name))
      const resourceTiming = entry as PerformanceResourceTiming
      extraMetadata.initiatorType = resourceTiming.initiatorType
      extraMetadata.transferSize = resourceTiming.transferSize
      extraMetadata.encodedBodySize = resourceTiming.encodedBodySize
      extraMetadata.query = query
      const resourceType =
        metadata?.resource &&
        typeof metadata?.resource === 'object' &&
        'type' in metadata.resource &&
        metadata.resource?.type
      // this is better handled in the operation displaying code
      if (resourceType !== 'xhr' && resourceType !== 'fetch') {
        kind = 'asset'
      }
      if (resourceTiming.initiatorType === 'iframe') {
        kind = 'iframe'
      }
      break
    }
    case 'mark':
    case 'measure': {
      fullName = entry.name.replace('useTiming: ', '')
      commonName = fullName.replaceAll(/\b\/?\d+\b/g, '')
      if (entry.name.endsWith('/render')) {
        kind = 'render'
        const parts = commonName.split('/')
        commonName = parts.slice(-2)[0]!
        const metricId = parts.slice(0, -2).join('/')
        extraMetadata.metricId = metricId
        occurrenceCountPrefix = `${metricId}/`
      }
      if (entry.name.endsWith('/tti') || entry.name.endsWith('/ttr')) {
        const parts = commonName.split('/')
        const metricId = parts.slice(0, -1).join('/')
        commonName = metricId
        extraMetadata.metricId = metricId
      }
      if (entry.entryType === 'measure' && entry.name.includes('-till-')) {
        const parts = commonName.split('/')
        const stageChange = parts.at(-1)!
        const componentName = parts.at(-2)!
        const metricId = parts.slice(0, -2).join('/')
        extraMetadata.metricId = metricId
        extraMetadata.stageChange = stageChange
        extraMetadata.componentName = componentName
        // merge all stage changes under the same commonName as tti and ttr
        commonName = metricId
        fullName = `${metricId}/${stageChange}`
        occurrenceCountPrefix = `${stageChange}/`
      }
      if (entry.name.startsWith('graphql/')) {
        kind = 'resource'
      }
      break
    }
    default: {
      commonName = `${entry.entryType}${
        entry.name &&
        entry.name !== 'unknown' &&
        entry.name.length > 0 &&
        entry.entryType !== entry.name
          ? `/${entry.name}`
          : ''
      }`
      fullName = commonName
      kind = entry.entryType as TaskSpanKind
      if ('toJSON' in entry) {
        Object.assign(extraMetadata, entry.toJSON())
      }
    }
  }

  if (typeof metadata?.commonName === 'string') {
    // eslint-disable-next-line prefer-destructuring
    commonName = metadata.commonName
  }

  return { commonName, fullName, kind, extraMetadata, occurrenceCountPrefix }
}

const getPerformanceEntryObservable = <Type extends PerformanceEntryType>(
  entryTypes: Type[],
) =>
  new Observable<
    (Type extends 'element'
      ? PerformanceElementTiming
      : Type extends 'event'
      ? PerformanceEventTiming
      : Type extends 'first-input'
      ? PerformanceEventTiming
      : Type extends 'largest-contentful-paint'
      ? LargestContentfulPaint
      : Type extends 'layout-shift'
      ? LayoutShift
      : Type extends 'longtask'
      ? PerformanceLongTaskTiming
      : Type extends 'mark'
      ? PerformanceMark
      : Type extends 'measure'
      ? PerformanceMeasure
      : Type extends 'navigation'
      ? PerformanceNavigationTiming
      : Type extends 'paint'
      ? PerformancePaintTiming
      : Type extends 'resource'
      ? PerformanceResourceTiming
      : Type extends 'taskattribution'
      ? TaskAttributionTiming
      : Type extends 'visibility-state'
      ? VisibilityStateEntry
      : never)[]
  >((subscriber) => {
    const observer = new PerformanceObserver((list) => {
      // eslint-disable-next-line @typescript-eslint/no-unsafe-argument, @typescript-eslint/no-explicit-any
      subscriber.next(list.getEntries() as any)
    })

    observer.observe({ entryTypes })

    return () => {
      observer.disconnect()
    }
  })

const performanceEntries$ = getPerformanceEntryObservable([
  'element',
  'event',
  'visibility-state',
  'mark',
  'measure',
  // get these from RUM and modify them to include the operation metadata:
  // 'longtask',
  // 'resource',
  // for the rest, emit custom 'resources'
]).pipe(share())

const activeOperations = new Set<ActiveOperation>()

export const processCustomEntry = (
  entry: PerformanceEntryLike,
  metadata: Record<string, unknown> = {},
) => {
  // perhaps return both modified Task and an operation Metadata object (that gets assigned to RUM context?)
  for (const activeOperation of activeOperations) {
    activeOperation.processOneEntry(entry, metadata)
  }
}

const FINALIZATION_WAIT = 5_000
const TRAILING_END_TASK_THRESHOLD = 1_000

class ActiveOperation {
  private startTime: number
  private name: string
  private metadata?: Record<string, unknown>
  private onEnd?: (values: {
    operationMeasure: Operation
    tasks: Task[]
  }) => void
  private id: string
  private tasks: Task[] = []
  private remainingRequiredMeasureNames: Set<string>
  private occurrenceCounts = new Map<string, number>()
  private globalOccurrenceCounts = new Map<string, number>()
  private includedCommonTaskNames = new Set<string>()
  private lastRequiredTask: Task | undefined
  private lastRequiredTaskEndTime: number | undefined
  private subscription: Subscription
  private finalizing = false

  constructor({
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
    this.name = name
    this.metadata = metadata
    this.onEnd = onEnd
    this.startTime = performance.now()
    // eslint-disable-next-line no-magic-numbers
    this.id = Math.random().toString(36).slice(2)
    this.remainingRequiredMeasureNames = new Set(requiredMeasureNames)

    this.subscription = performanceEntries$.subscribe(this.processEntryBatch)
    activeOperations.add(this)
  }

  private onProcessed = () => {
    // TODO: add operation timeout: auto-complete after a certain time, or once the another (same-type) user interaction is started
    if (this.finalizing) {
      // already finalizing
      return
    }
    if (!this.lastRequiredTask) {
      // more tasks to come
      return
    }

    console.log('finalizing operation:', this.name)
    this.finalizing = true

    // wait a few more seconds for any entries that might came late, then finalize
    setTimeout(() => {
      activeOperations.delete(this)
      this.subscription.unsubscribe()

      this.tasks.sort(
        // sort by start time
        (a, b) => a.startTime - b.startTime,
        // sort by end time
        // (a, b) => a.startTime + a.duration - (b.startTime + b.duration),
      )

      const operationMeasure = performance.measure(this.name, {
        start: this.startTime,
        end: this.lastRequiredTask!.startTime + this.lastRequiredTask!.duration,
        detail: { operationName: this.name },
      }) as Operation

      const embeddedTasksDetails = this.tasks.map(
        (rawTask): TaskDataEmbeddedInOperation => {
          const { metadata, operationId, operationName, ...operation } =
            rawTask.operations[this.name]!
          const embeddedTask = {
            ...operation,
            metadata: { ...metadata },
            // eslint-disable-next-line @typescript-eslint/no-unsafe-assignment
            detail:
              typeof rawTask.detail === 'object' && rawTask.detail
                ? { ...rawTask.detail }
                : {},
            duration: rawTask.duration,
          }
          // don't embed operation metadata into the task metadata, as it's already part of the operation
          delete embeddedTask.metadata?.operation
          return embeddedTask
        },
      )
      operationMeasure.operations = {
        [this.name]: {
          kind: 'operation',
          metadata: this.metadata,
          operationId: this.id,
          operationName: this.name,
          tasks: embeddedTasksDetails,
          includedCommonTaskNames: [...this.includedCommonTaskNames],
        } satisfies OperationSpanMetadata,
      }

      console.log(`finished tracking operation: ${this.name}`, operationMeasure)

      this.onEnd?.({
        operationMeasure,
        tasks: this.tasks,
      })
    }, FINALIZATION_WAIT)
  }

  /**
   * process a PerformanceEntry-like object, by mutating it with operation metadata
   * and adding it to the operation's tasks
   */
  processOneEntry = (
    entry: PerformanceEntryLike,
    metadata?: Record<string, unknown>,
  ) => {
    this.#processEntry(entry, metadata)
    this.onProcessed()
  }

  /**
   * internal logic of entry processing, without the finalization step
   */
  #processEntry = (
    entry: PerformanceEntryLike,
    metadata?: Record<string, unknown>,
  ) => {
    try {
      if (
        entry.entryType === 'mark' &&
        (entry.name.startsWith('--') || entry.name.startsWith('useTiming: '))
      ) {
        // react debugging profiler, ignore:
        return
      }

      const operationStartOffset = entry.startTime - this.startTime
      // ignore tasks that started before the operation
      if (operationStartOffset < 0) {
        return
      }

      if (this.lastRequiredTaskEndTime) {
        // ignore tasks that started after the operation
        if (entry.startTime > this.lastRequiredTaskEndTime) {
          return
        }
        // ignore tasks that ended long after the operation ended
        if (
          entry.startTime + entry.duration >
          this.lastRequiredTaskEndTime + TRAILING_END_TASK_THRESHOLD
        ) {
          return
        }
      }

      const {
        commonName,
        fullName,
        kind,
        extraMetadata,
        occurrenceCountPrefix,
      } = extractEntryMetadata(entry, metadata) // maybe: metadata ?? entry.detail

      const commonNameWithOccurrence = `${occurrenceCountPrefix}${commonName}`
      const occurrence =
        (this.occurrenceCounts.get(commonNameWithOccurrence) ?? 0) + 1
      this.occurrenceCounts.set(commonNameWithOccurrence, occurrence)

      const globalOccurrence =
        (this.globalOccurrenceCounts.get(commonName) ?? 0) + 1
      this.globalOccurrenceCounts.set(commonName, globalOccurrence)
      if (globalOccurrence !== occurrence && kind === 'render') {
        // deal with duplicates from multiple useTiming hooks placed in the same component
        // skip since we already have a task with the same name and occurrence
        return
      }

      const taskSpanMetadata: TaskSpanMetadata = {
        kind,
        name: fullName,
        commonName,
        operationRelativeEndTime: operationStartOffset + entry.duration,
        operationName: this.name,
        operationStartOffset,
        occurrence,
        metadata: { ...extraMetadata, ...metadata, operation: this.metadata },
        operationId: this.id,
        internalOrder: this.tasks.length,
      }

      // TODO: consolidation of renders?

      // assignment on purpose:
      // eslint-disable-next-line no-param-reassign
      entry.operations ??= {}
      // eslint-disable-next-line no-param-reassign
      entry.operations[this.name] = taskSpanMetadata

      const task = entry as Task

      this.tasks.push(task)
      this.includedCommonTaskNames.add(commonName)

      if (this.remainingRequiredMeasureNames.has(entry.name)) {
        this.remainingRequiredMeasureNames.delete(entry.name)
        if (this.remainingRequiredMeasureNames.size === 0) {
          this.lastRequiredTask = task
          this.lastRequiredTaskEndTime = task.startTime + task.duration
        }
      }
    } catch (error) {
      console.error(
        `error while processing operation ${this.name} entry:`,
        error,
        entry,
        metadata,
      )
    }
  }

  processEntryBatch = (entries: PerformanceEntryLike[]) => {
    for (const entry of entries) {
      this.#processEntry(entry)
    }
    this.onProcessed()
  }
}

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
  return new ActiveOperation({ name, requiredMeasureNames, metadata, onEnd })
}
