/* eslint-disable @typescript-eslint/no-use-before-define */
/* eslint-disable no-magic-numbers */
/* eslint-disable no-underscore-dangle */
/* eslint-disable max-classes-per-file */
import type {
  CaptureInteractiveConfig,
  EntryMatchCriteria,
  EntryMatchFunction,
  InstanceOptions,
  ObserveFn,
  OperationDefinition,
  PerformanceApi,
  PerformanceEntryLike,
  TaskSpanMetadata,
} from './types'

const DEFAULT_CAPTURE_INTERACTIVE: Required<CaptureInteractiveConfig> = { timeout: 5_000, debounceLongTasksBy: 500, skipDebounceForLongTasksShorterThan: 0 }
const DEFAULT_GLOBAL_OPERATION_TIMEOUT = 10_000
const OPERATION_START_ENTRY_TYPE = 'operation-start'
const OPERATION_ENTRY_TYPE = 'operation'
const DEFAULT_DEBOUNCE_TIME = 1_000
const identity = <T>(value: T): T => value

type TimeoutRef = ReturnType<typeof setTimeout>

type FinalizationReason =
  | 'completed'
  | 'interrupted'
  | 'timeout'
  | 'interactive-timeout'
type OperationState =
  | 'initial'
  | 'started'
  | 'waiting-for-interactive'
  | FinalizationReason

/**
 * Class representing an operation.
 */
class Operation implements PerformanceEntryLike {
  /**
   * The ID of the operation.
   */
  id: string

  /**
   * The name of the operation.
   */
  name: string

  /**
   * The start time of the operation.
   */
  private _startTime: number | undefined
  get startTime() {
    if (typeof this._startTime === 'undefined') {
      throw new TypeError('Operation has not started yet')
    }
    return this._startTime
  }
  set startTime(value) {
    this._startTime = value
  }

  /**
   * The duration of the operation.
   */
  duration: number

  readonly entryType = 'operation'

  /**
   * Metadata for the operation.
   */
  metadata: Record<string, unknown>
  readonly tasks: TaskSpanMetadata[] = []

  private definition: Omit<OperationDefinition, 'captureInteractive'> & {
    captureInteractive: Required<CaptureInteractiveConfig> | false
  }
  private requiredToStartTrackers: Set<number>
  private requiredToEndTrackers: Set<number>
  // TODO: perhaps state need to be something like getStateAtTime(time: number): State instead?
  // this way we could inject entries with past timestamps
  // introduce the function setState() first, then ask gpt to do getStateAt...
  private _state!: OperationState
  get state() {
    return this._state
  }
  private set state(value) {
    this._state = value
  }

  private lastDebounceDeadline: number
  private debounceCounts: Map<number, number>
  private manager: OperationManager
  private finalizationFn: () => void
  private buffered: boolean
  private operationCreationTime: number

  /**
   * Creates an instance of Operation.
   * @param definition - The definition of the operation.
   * @param manager - The default debounce time for the operation.
   * @param finalizationFn - The function to call when the operation is finalized.
   */
  constructor({
    definition,
    manager,
    finalizationFn,
    buffered = false,
  }: {
    definition: OperationDefinition
    manager: OperationManager
    finalizationFn: () => void
    buffered?: boolean
  }) {
    this.operationCreationTime =
      definition.startTime ?? manager.performance.now()

    this.id = Math.random().toString(36).slice(2)
    this.name = definition.operationName
    this.duration = 0
    this.metadata = {
      kind: 'operation',
      ...definition.metadata,
    }
    const captureInteractive = definition.captureInteractive && manager.supportedEntryTypes.includes('longtask')
      ? typeof definition.captureInteractive === 'object'
        ? { ...DEFAULT_CAPTURE_INTERACTIVE, ...definition.captureInteractive }
        : DEFAULT_CAPTURE_INTERACTIVE
      : false

    this.definition = { ...definition, captureInteractive, track: definition.track.map((track) => ({
      ...track,
      debounceEndWhenSeen: track.debounceEndWhenSeen ?? true,
    }))}
    this.requiredToStartTrackers = new Set()
    this.requiredToEndTrackers = new Set()
    this.state = 'initial'
    this.lastDebounceDeadline = 0
    this.debounceCounts = new Map()
    this.manager = manager
    this.finalizationFn = finalizationFn
    this.buffered = buffered

    this.definition.track.forEach((track, index) => {
      if (track.requiredToStart) {
        this.requiredToStartTrackers.add(index)
      }
      if (track.requiredToEnd) {
        this.requiredToEndTrackers.add(index)
      }
    })

    if (definition.startTime || this.requiredToStartTrackers.size === 0) {
      // If there are no requiredToStart trackers or startTime was provided, mark the operation as started:
      this.markAsStarted(this.operationCreationTime)
    }
  }

  /**
   * Processes a Performance Entry task.
   * @param task - The performance entry task.
   */
  processTask(task: PerformanceEntryLike): void {
    if (this.operationCreationTime > task.startTime) {
      // ignore tasks that started before the operation was created
      // this can happen when processing buffered entries
      // and the operation was created after a new buffer was started
      return
    }

    if (this.buffered) {
      const taskEndTime = task.startTime + task.duration
      this.executeBufferedTimeoutsDue(taskEndTime)
    }

    if (
      this.state === 'completed' ||
      this.state === 'interrupted' ||
      this.state === 'timeout' ||
      this.state === 'interactive-timeout'
    ) {
      // ignore tasks after the operation has completed
      return
    }

    // TODO: add buffering in order to support out-of-order entries
    if (
      this.definition.interruptSelf &&
      (this.state === 'started' || this.state === 'waiting-for-interactive') &&
      task.entryType === OPERATION_START_ENTRY_TYPE &&
      task.name === this.name
    ) {
      this.finalizeOperation('interrupted', task.startTime + task.duration)
      return
    }

    let relevant = false
    let interrupted = false
    /**
     * the maximum time any given tracker has allotted to wait
     * before we wrap up tracking of our operation
     * */
    let debounceBy = 0

    for (
      let trackerIndex = 0;
      trackerIndex < this.definition.track.length;
      trackerIndex++
    ) {
      const trackerDefinition = this.definition.track[trackerIndex]!
      const criteriaMatched = this.matchesCriteria(
        trackerDefinition.match,
        task,
      )

      if (criteriaMatched) {
        relevant = true
        if (trackerDefinition.interruptWhenSeen) {
          interrupted = true
        }
        if (this.state === 'initial' && trackerDefinition.requiredToStart) {
          this.requiredToStartTrackers.delete(trackerIndex)
        }
        if (this.state === 'started') {
          if (trackerDefinition.requiredToEnd) {
            this.requiredToEndTrackers.delete(trackerIndex)
          }
          if (trackerDefinition.debounceEndWhenSeen) {
            debounceBy = Math.max(
              debounceBy,
              this.getDebounceTime(
                trackerIndex,
                trackerDefinition.debounceEndWhenSeen,
              ),
            )
          }
        }
      }
    }

    if (this.state === 'initial' && this.requiredToStartTrackers.size > 0) {
      // we haven't started yet, and we're still waiting for some required tasks
      // end processing here
      return
    }

    const isOperationStartingTask =
      this.state === 'initial' && this.requiredToStartTrackers.size === 0

    const startTime = isOperationStartingTask ? task.startTime : this.startTime

    const taskMetadata: TaskSpanMetadata = {
      ...task,
      duration: task.duration,
      entryType: task.entryType,
      startTime: task.startTime,
      detail: task.detail,
      // kind: 'task',
      // TODO: kind
      kind: 'task',
      operationId: this.id,
      operationName: this.name,
      internalOrder: this.tasks.length + 1,
      name: task.name,
      commonName: task.name,
      operationStartOffset: task.startTime - startTime,
      operationRelativeEndTime: task.startTime - startTime + task.duration,
      // TODO: calculate occurrence during report generation, not here:
      occurrence: 1, // This can be updated as needed
    }

    if (this.definition.keepOnlyExplicitlyTrackedTasks) {
      if (relevant) {
        this.tasks.push(taskMetadata)
      }
    } else {
      this.tasks.push(taskMetadata)
    }

    if (isOperationStartingTask) {
      this.markAsStarted(startTime)
      // no more processing
      return
    }

    if (
      interrupted &&
      (this.state === 'started' || this.state === 'waiting-for-interactive')
    ) {
      this.finalizeOperation('interrupted', task.startTime + task.duration)
      return
    }

    if (
      this.state === 'waiting-for-interactive' &&
      task.entryType !== 'longtask'
    ) {
      // only long tasks are relevant for interactive state tracking
      return
    }

    if (this.state === 'started' && this.requiredToEndTrackers.size === 0) {
      this.maybeFinalizeLater(debounceBy, task.startTime + task.duration)
      return
    }

    if (this.state === 'waiting-for-interactive') {
      this.handleInteractiveTracking(task)
    }
  }

  /**
   * Starts the operation.
   */
  private markAsStarted(startTime: number): void {
    if (!this._startTime) {
      this.startTime = startTime
    }
    this.state = 'started'
    this.setGlobalTimeout()
  }

  /**
   * Returns the debouncing duration.
   * @param trackerIndex - The index of the track that triggered the debounce.
   * @param debounceConfig - The configuration for debouncing.
   */
  private getDebounceTime(
    trackerIndex: number,
    debounceConfig:
      | boolean
      | { debounceBy: number; debounceCountLimit?: number },
  ): number {
    const { debounceBy, debounceCountLimit = Number.POSITIVE_INFINITY } =
      typeof debounceConfig === 'object'
        ? debounceConfig
        : { debounceBy: this.manager.defaultDebounceTime }

    const currentCount = this.debounceCounts.get(trackerIndex) ?? 0

    if (currentCount >= debounceCountLimit) {
      return 0
    }

    this.debounceCounts.set(trackerIndex, currentCount + 1)
    return debounceBy
  }

  private maybeFinalizeLater(debounceBy: number, taskEndTime: number) {
    const newDeadline = Math.max(
      taskEndTime + debounceBy,
      this.lastDebounceDeadline,
    )

    if (debounceBy === 0) {
      this.lastDebounceDeadline = newDeadline
      this.clearTimeout('debounce')
      this.finalizeOperation('completed', taskEndTime)
      return
    }

    if (newDeadline > this.lastDebounceDeadline) {
      this.lastDebounceDeadline = newDeadline

      const onDebounceDue = () => {
        this.clearTimeout('debounce')
        this.finalizeOperation('completed', taskEndTime)
      }

      // we could finalize this synchronously, but we always run this operation async
      // to allow buffered entries to be processed first
      // because buffered entries might further update the debounce deadline
      // TODO: validate this ^^
      this.setTimeout('debounce', onDebounceDue, newDeadline)
    }
  }

  /**
   * In buffered mode, the timeouts are triggered by the next task that is processed.
   * Tasks are assumed to be processed in order.
   */
  enableBufferedMode() {
    this.buffered = true
    Object.values(this.timeoutIds).forEach((id) => {
      if (id) {
        clearTimeout(id)
      }
    })
  }

  /**
   * Disables buffered mode and triggers any timeouts if they are due.
   */
  disableBufferedMode() {
    this.buffered = false
    Object.keys(this.timeouts).forEach((type) => {
      this.ensureTimeout(type as keyof typeof this.timeouts)
    })
  }

  executeBufferedTimeoutsDue(time: number) {
    Object.values(this.timeouts)
      .sort((a, b) => (a?.[0] ?? 0) - (b?.[0] ?? 0))
      .forEach((timeout) => {
        if (!timeout) return
        const [dueTime, callback] = timeout
        if (dueTime <= time) {
          callback()
        }
      })
  }

  timeouts: {
    global: [number, () => void] | undefined
    interactive: [number, () => void] | undefined
    debounce: [number, () => void] | undefined
  } = {
    global: undefined,
    interactive: undefined,
    debounce: undefined,
  }

  timeoutIds: {
    global: TimeoutRef | null
    interactive: TimeoutRef | null
    debounce: TimeoutRef | null
  } = {
    global: null,
    interactive: null,
    debounce: null,
  }

  setTimeout(
    type: 'global' | 'interactive' | 'debounce',
    callback: () => void,
    endTime: number,
    alwaysAsync?: boolean,
  ) {
    this.timeouts[type] = [endTime, callback]
    this.ensureTimeout(type, alwaysAsync)
  }

  ensureTimeout(
    type: 'global' | 'interactive' | 'debounce',
    alwaysAsync?: boolean,
  ) {
    const timeout = this.timeouts[type]
    if (timeout) {
      if (this.buffered) {
        // do nothing, the timeout will be triggered by the next task when it is processed
      } else {
        const [dueTime, callback] = timeout
        const timeoutId = this.timeoutIds[type]
        if (timeoutId) {
          clearTimeout(timeoutId)
          this.timeoutIds[type] = null
        }
        const now = this.manager.performance.now()
        const offsetAdjustedTimeout = Math.max(0, dueTime - now)
        if (offsetAdjustedTimeout === 0 && !alwaysAsync) {
          callback()
        } else {
          this.timeoutIds[type] = setTimeout(() => {
            this.timeoutIds[type] = null
            callback()
          }, offsetAdjustedTimeout)
        }
      }
    }
  }

  clearTimeout(type: 'global' | 'interactive' | 'debounce') {
    const timeoutId = this.timeoutIds[type]
    if (timeoutId) {
      clearTimeout(timeoutId)
      this.timeoutIds[type] = null
      this.timeouts[type] = undefined
    }
    if (type === 'debounce') {
      this.lastDebounceDeadline = 0
    }
  }

  /**
   * Sets a timeout for the operation.
   */
  private setGlobalTimeout(): void {
    const { timeout = DEFAULT_GLOBAL_OPERATION_TIMEOUT } = this.definition
    if (timeout) {
      const timeAtTimeout = this.startTime + timeout
      const globalTimeoutCallback = () => {
        this.clearAllTimeouts()
        this.finalizeOperation('timeout', timeAtTimeout)
      }
      this.setTimeout('global', globalTimeoutCallback, timeAtTimeout)
    }
  }

  /**
   * Clears the operation timeout.
   */
  private clearAllTimeouts(): void {
    this.clearTimeout('global')
    this.clearTimeout('interactive')
    this.clearTimeout('debounce')
  }

  /**
   * Finalizes the operation.
   * @param reason - The reason for finalizing the operation.
   */
  private finalizeOperation(reason: FinalizationReason, endTime: number): void {
    if (this.state === 'started') {
      const captureInteractive =
        reason === 'completed' && this.definition.captureInteractive
      this.state = captureInteractive ? 'waiting-for-interactive' : reason

      this.duration = endTime - this.startTime
      this.clearTimeout('debounce')

      if (this.definition.captureDone) {
        this.emitMeasureEvent()
      }

      // only capture interactive state if the operation is completed:
      if (captureInteractive) {
        // setup timeout waiting for interactivity:
        const interactiveTimeout = captureInteractive.timeout

        const interactiveTimeoutCallback = () => {
          if (this.state === 'waiting-for-interactive') {
            this.clearAllTimeouts()
            this.finalizeOperation(
              'interactive-timeout',
              endTime + interactiveTimeout,
            )
          }
        }
        this.setTimeout(
          'interactive',
          interactiveTimeoutCallback,
          endTime + interactiveTimeout,
        )

        // waiting for long tasks for the duration of the interactive debounce:
        this.maybeFinalizeLater(captureInteractive.debounceLongTasksBy, endTime)
      } else {
        this.clearAllTimeouts()
        this.finalizationFn()
      }
    } else if (this.state === 'waiting-for-interactive') {
      this.state = reason
      this.clearAllTimeouts()
      this.emitInteractiveMeasureEvent(endTime)
      this.finalizationFn()
    }
  }

  /**
   * Handles tracking long tasks while waiting for interactivity.
   * @param task - The performance entry task to track.
   */
  private handleInteractiveTracking(task: PerformanceEntryLike): void {
    if (
      task.entryType !== 'longtask' ||
      this.state !== 'waiting-for-interactive' ||
      !this.definition.captureInteractive ||
      task.duration < this.definition.captureInteractive.skipDebounceForLongTasksShorterThan
    ) {
      return
    }
    const { debounceLongTasksBy } = this.definition.captureInteractive
    this.maybeFinalizeLater(debounceLongTasksBy, task.startTime + task.duration)
  }

  /**
   * Emits a 'measure' event for the operation.
   */
  private emitMeasureEvent(): void {
    this.manager.performance.measure(this.name, {
      start: this.startTime,
      duration: this.duration,
      detail: {
        ...this.metadata,
        id: this.id,
        name: this.name,
        tasks: this.tasks,
        state: this.state,
      },
    })
  }

  /**
   * Emits an 'interactive' measure event for the operation.
   */
  private emitInteractiveMeasureEvent(endTime: number): void {
    this.manager.performance.measure(`${this.name}-interactive`, {
      start: this.startTime,
      duration: endTime - this.startTime,
      detail: {
        ...this.metadata,
        id: this.id,
        name: this.name,
        tasks: this.tasks,
        state: this.state,
        interactive: true,
      },
    })
  }

  /**
   * Matches criteria against a performance entry task.
   * @param match - The match criteria or function.
   * @param task - The performance entry task.
   * @returns True if the task matches the criteria, false otherwise.
   */
  private matchesCriteria(
    match: EntryMatchCriteria | EntryMatchFunction,
    task: PerformanceEntryLike,
  ): boolean {
    if (typeof match === 'function') {
      return match(task)
    }
    const { name, metadata, type } = match
    const nameMatches =
      !name ||
      (typeof name === 'string'
        ? task.name === name
        : typeof name === 'function'
        ? name(task.name)
        : name.test(task.name))
    const typeMatches = !type || task.entryType === type
    const metadataMatches =
      !metadata ||
      Boolean(
        task.metadata &&
          Object.entries(metadata).every(
            ([key, value]) => task.metadata?.[key] === value,
          ),
      )
    return nameMatches && typeMatches && metadataMatches
  }
}

/**
 * Class representing the centralized performance manager.
 */
export class OperationManager {
  static instance: OperationManager
  private operations: Map<string, Operation>
  private observe: ObserveFn
  private observerDisconnect?: () => void
  defaultDebounceTime: number
  performance: PerformanceApi
  private bufferDuration?: number
  private bufferTimeoutId?: TimeoutRef
  private bufferFlushUntil = 0
  private taskBuffer: PerformanceEntryLike[] = []
  private preProcessTask: (task: PerformanceEntryLike) => PerformanceEntryLike
  supportedEntryTypes: readonly string[]

  /**
   * Creates an instance of CentralizedPerformanceManager.
   */
  constructor({
    defaultDebounceTime = DEFAULT_DEBOUNCE_TIME,
    observe = (onEntry) => {
      const observer = new PerformanceObserver((list) => {
        list.getEntries().forEach(onEntry)
      })
      observer.observe({
        entryTypes: ['mark', 'measure', 'resource', 'longtask', 'element', 'long-animation-frame'],
      })
      return () => void observer.disconnect()
    },
    performance: { measure = performance.measure.bind(performance), now = performance.now.bind(performance) } = {},
    bufferDuration,
    preProcessTask = identity,
    supportedEntryTypes = PerformanceObserver.supportedEntryTypes,
  }: InstanceOptions = {}) {
    this.operations = new Map()
    this.defaultDebounceTime = defaultDebounceTime
    this.performance = { measure, now }
    this.observe = observe
    this.bufferDuration = bufferDuration
    this.preProcessTask = preProcessTask
    this.supportedEntryTypes = supportedEntryTypes
  }

  /**
   * Starts a new operation.
   * @param operationDefinition - The definition of the operation to start.
   * @returns The ID of the started operation.
   */
  startOperation(operationDefinition: OperationDefinition): string {
    // Trigger an operation-start event to allow the previous operations to finalize themselves
    if (operationDefinition.interruptSelf) {
      const operationStartEvent = {
        entryType: OPERATION_START_ENTRY_TYPE,
        name: operationDefinition.operationName,
        startTime: operationDefinition.startTime ?? this.performance.now(),
        duration: 0,
      }
      this.scheduleTaskProcessing(operationStartEvent)
    }

    const finalizationFn = () => {
      // process the operation as a task itself
      this.scheduleTaskProcessing({
        startTime: operation.startTime,
        duration: operation.duration,
        entryType: 'operation',
        name: operation.name,
        metadata: {...operation.metadata, tasks: operation.tasks, state: operation.state},
      })
      this.operations.delete(operation.id)
      this.ensureObserver()
      operationDefinition.onDispose?.()
      // TODO: post-process operation data - e.g. send a report or spans
    }

    const operation = new Operation({
      definition: operationDefinition,
      manager: this,
      finalizationFn,
      buffered: Boolean(this.bufferDuration),
    })
    this.operations.set(operation.id, operation)
    this.ensureObserver()

    return operation.id
  }

  scheduleBufferFlushIfNeeded() {
    if (!this.bufferDuration || this.isFlushingBuffer || this.bufferTimeoutId || this.taskBuffer.length === 0) {
      return
    }

    // instead of flushing the whole buffer in one go
    // every half-buffer, we will only flush tasks that ocurred within the first 1/4 of the buffer's duration
    // this allows for new items to still be added *between* the items of the remaining 3/4 of the buffer
    // and guarantees that the entire buffer is processed within the set buffer duration
    // this is a compromise between processing tasks in order,
    // and also not waiting too long to process them
    const now = this.performance.now()
    this.bufferFlushUntil = now + (this.bufferDuration / 4)
    this.bufferTimeoutId = setTimeout(
      () => void this.flushBuffer(),
      this.bufferDuration / 2,
    )
  }

  /**
   * Processes a performance entry task.
   * @param entry - The performance entry task to track.
   */
  scheduleTaskProcessing(entry: PerformanceEntryLike): void {
    const task = this.preProcessTask(entry)

    if (this.bufferDuration && !this.isFlushingBuffer) {
      this.taskBuffer.push(task)
      this.scheduleBufferFlushIfNeeded()
    } else {
      // process immediately
      this.processTask(task)
    }
  }

  private processTask(task: PerformanceEntryLike): void {
    this.operations.forEach((operation) => {
      operation.processTask(task)
    })
  }

  private isFlushingBuffer = false

  /**
   * Flushes the task buffer, sorts the tasks, and processes them sequentially.
   */
  private flushBuffer(): void {
    this.isFlushingBuffer = true

    // Sort the buffer by end time
    this.taskBuffer.sort(
      (a, b) => a.startTime + a.duration - (b.startTime + b.duration),
    )

    const remainingBuffer: PerformanceEntryLike[] = []

    for (const task of this.taskBuffer) {
      const taskEndTime = task.startTime + task.duration
      // Process each task sequentially
      if (taskEndTime <= this.bufferFlushUntil) {
        this.processTask(task)
      } else {
        remainingBuffer.push(task)
      }
    }

    // Update the buffer
    this.taskBuffer = remainingBuffer

    this.bufferTimeoutId = undefined
    this.bufferFlushUntil = 0
    this.isFlushingBuffer = false

    this.scheduleBufferFlushIfNeeded()
  }

  /**
   * Ensures the performance observer is active when there are active operations.
   */
  private ensureObserver(): void {
    const shouldBeObserving = this.operations.size > 0
    const isObserving = Boolean(this.observerDisconnect)
    if (shouldBeObserving && !isObserving) {
      this.observerDisconnect = this.observe(
        (entry) => void this.scheduleTaskProcessing(entry),
      )
    } else if (!shouldBeObserving && isObserving) {
      this.observerDisconnect!()
      this.observerDisconnect = undefined
    }
  }
}
