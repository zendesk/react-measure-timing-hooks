/* eslint-disable no-console */

import { type Subscription, Observable, share } from 'rxjs'
import type { AnyPerformanceEntry, PerformanceEntryType } from './globalTypes'
import { sanitizeUrlForTracing } from './sanitizeUrlForTracing'
import type {
  Operation,
  OperationSpanMetadata,
  PerformanceEntryLike,
  SpanKind,
  Task,
  TaskDataEmbeddedInOperation,
} from './types'

interface ProcessedEntry {
  commonName: string
  kind: SpanKind
  extraMetadata: Record<string, unknown>
}

function extractEntryMetadata(
  entry: AnyPerformanceEntry | PerformanceEntryLike,
): ProcessedEntry {
  let commonName: string
  let query: Record<string, string | string[]> | undefined
  let kind: SpanKind = entry.entryType as SpanKind
  const extraMetadata: Record<string, unknown> = {}

  switch (entry.entryType) {
    case 'resource': {
      ;({ commonUrl: commonName, query } = sanitizeUrlForTracing(entry.name))
      const resourceTiming = entry as PerformanceResourceTiming
      extraMetadata.initiatorType = resourceTiming.initiatorType
      extraMetadata.transferSize = resourceTiming.transferSize
      extraMetadata.encodedBodySize = resourceTiming.encodedBodySize
      extraMetadata.query = query
      break
    }
    case 'mark':
    case 'measure': {
      commonName = entry.name
        .replaceAll(/\b\/?\d+\b/g, '')
        .replace('useTiming: ', '')
      if (entry.name.endsWith('/render')) {
        kind = 'render'
      }
      if (entry.name.includes('graphql/')) {
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
      kind = entry.entryType as SpanKind
    }
  }
  return { commonName, kind, extraMetadata }
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
  'mark',
  'measure',
  'visibility-state',
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
  private includedCommonTaskNames = new Set<string>()
  private lastRequiredTask: Task | undefined
  private lastRequiredTaskEndTime: number | undefined
  private subscription: Subscription

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
    if (!(this.lastRequiredTask && this.lastRequiredTaskEndTime)) {
      // not done yet
      return
    }
    activeOperations.delete(this)
    this.subscription.unsubscribe()

    // sort by end time
    this.tasks.sort(
      (a, b) => a.startTime + a.duration - (b.startTime + b.duration),
    )

    const operationMeasure = performance.measure(this.name, {
      start: this.startTime,
      end: this.lastRequiredTask.startTime + this.lastRequiredTask.duration,
      detail: { operationName: this.name },
    }) as Operation

    const embeddedTasksDetails = this.tasks.map(
      (rawTask): TaskDataEmbeddedInOperation => ({
        ...rawTask.operations[this.name]!,
        // eslint-disable-next-line @typescript-eslint/no-unsafe-assignment
        detail:
          typeof rawTask.detail === 'object' && rawTask.detail
            ? { ...rawTask.detail }
            : {},
        duration: rawTask.duration,
      }),
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
    const operationStartOffset = entry.startTime - this.startTime
    if (operationStartOffset < 0) {
      // ignore tasks that started before the operation
      return
    }

    const { commonName, kind, extraMetadata } = extractEntryMetadata(entry)

    // temporary:
    // if (kind === 'render') {
    //   return
    // }

    const occurrence = (this.occurrenceCounts.get(commonName) ?? 0) + 1
    this.occurrenceCounts.set(commonName, occurrence)

    const taskSpanMetadata = {
      kind,
      commonName,
      operationRelativeEndTime: operationStartOffset + entry.duration,
      operationName: this.name,
      operationStartOffset,
      occurrence,
      metadata: { ...extraMetadata, ...metadata, operation: this.metadata },
      operationId: this.id,
    }

    // TODO: consolidation of renders?
    // if (
    //   !lastRequiredTaskEndTime ||
    //   entry.startTime + entry.duration < lastRequiredTaskEndTime
    // ) {

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
