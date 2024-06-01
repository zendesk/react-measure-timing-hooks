/* eslint-disable @typescript-eslint/no-use-before-define */
/* eslint-disable no-magic-numbers */
/* eslint-disable no-underscore-dangle */
/* eslint-disable max-classes-per-file */
import {
  BLOCKING_TASK_ENTRY_TYPES,
  FINAL_STATES,
  DEFAULT_CAPTURE_INTERACTIVE,
  OPERATION_START_ENTRY_TYPE,
  OPERATION_ENTRY_TYPE,
  DEFAULT_GLOBAL_OPERATION_TIMEOUT,
  OPERATION_INTERACTIVE_ENTRY_TYPE,
  DEFAULT_DEBOUNCE_TIME,
  DEFAULT_OBSERVED_ENTRY_TYPES,
} from './constants'
import { OperationState, FinalizationReason } from './types'
import {
  type CaptureInteractiveConfig,
  type EventMatchCriteria,
  type EventMatchFunction,
  type InputEvent,
  type InstanceOptions,
  type ObserveFn,
  type OperationDefinition,
  type PerformanceApi,
  type PerformanceEntryLike,
  type Event,
  type EventStatus,
} from './types'
import { SKIP_PROCESSING } from './constants'
import { defaultEventProcessor } from './defaultEventProcessor'

/** returns the best supported blocking task type or undefined if none */
export const bestBlockingTaskType = (supportedEntryTypes: readonly string[]) =>
  BLOCKING_TASK_ENTRY_TYPES.find((type) => supportedEntryTypes.includes(type))

type TimeoutRef = ReturnType<typeof setTimeout>

/**
 * Class representing an operation.
 */
export class Operation implements PerformanceEntryLike {
  /**
   * The ID of the operation.
   */
  public readonly id: string

  /**
   * The name of the operation.
   */
  public readonly name: string

  /**
   * The start time of the operation.
   */
  private _startTime: number | undefined
  public get startTime() {
    if (typeof this._startTime === 'undefined') {
      throw new TypeError('Operation has not started yet')
    }
    return this._startTime
  }
  private set startTime(value) {
    this._startTime = value
  }

  /**
   * The duration from the start of the operation until all trackers were satisfied.
   */
  public duration: number

  /**
   * The duration of the operation + the time it took the page to become interactive or until a timeout was reached.
   * Might be 0 if no interactive tracking was configured.
   */
  public durationTillInteractive: number

  readonly entryType = 'operation'

  /**
   * Metadata for the operation.
   */
  public metadata: Record<string, unknown>

  private readonly events: Event[] = []
  public getEvents() {
    return this.isInFinalState ? this.events : [...this.events]
  }
  public get eventCount() {
    return this.events.length
  }

  private definition: Omit<OperationDefinition, 'captureInteractive'> & {
    captureInteractive: Required<CaptureInteractiveConfig> | false
  }
  private requiredToStartTrackers: Set<number>
  private requiredToEndTrackers: Set<number>

  private _state!: OperationState
  public get state() {
    return this._state
  }
  private set state(value) {
    this._state = value
  }
  public get isInFinalState() {
    return FINAL_STATES.includes(this.state)
  }
  public get status(): EventStatus {
    return this.state === 'timeout' ||
      this.state === 'interactive-timeout' ||
      this.state === 'interrupted'
      ? 'aborted'
      : 'ok'
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
    this.durationTillInteractive = 0
    this.metadata = definition.metadata ?? {}
    const captureInteractive =
      definition.waitUntilInteractive &&
      bestBlockingTaskType(manager.supportedEntryTypes)
        ? typeof definition.waitUntilInteractive === 'object'
          ? {
              ...DEFAULT_CAPTURE_INTERACTIVE,
              ...definition.waitUntilInteractive,
            }
          : DEFAULT_CAPTURE_INTERACTIVE
        : false

    this.definition = {
      ...definition,
      captureInteractive,
      track: definition.track.map((track) => ({
        ...track,
        debounceEndWhenSeen:
          track.debounceEndWhenSeen ?? !track.interruptWhenSeen,
      })),
    }
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
   * Processes a Performance Entry event.
   * @param event - The performance entry event.
   * @returns the event meta if it was processed, false otherwise.
   */
  processEvent(event: Event): Event | false {
    if (this.buffered) {
      const eventEndTime = event.startTime + event.duration
      this.executeBufferedTimeoutsDue(eventEndTime)
    }

    if (event.startTime < this.operationCreationTime) {
      // ignore events that started before the operation was created
      // this can happen when processing buffered entries
      // and the operation was created after a new buffer was started
      return false
    }

    if (this.isInFinalState) {
      // ignore events after the operation has completed
      return false
    }

    if (
      this.definition.interruptSelf &&
      (this.state === 'started' || this.state === 'waiting-for-interactive') &&
      event.entryType === OPERATION_START_ENTRY_TYPE &&
      event.name === this.name
    ) {
      this.finalizeOperation('interrupted', event.startTime + event.duration)
      return false
    }

    if (
      (this.state === 'started' || this.state === 'waiting-for-interactive') &&
      event.entryType === OPERATION_ENTRY_TYPE &&
      event.name === this.name
    ) {
      // ignore event of self
      // TODO: maybe keep this after all?
      return false
    }

    let tracked = false
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
        event,
      )

      if (criteriaMatched) {
        tracked = true
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
      // we haven't started yet, and we're still waiting for some required events
      // end processing here
      return false
    }

    const isOperationStartingEvent =
      this.state === 'initial' && this.requiredToStartTrackers.size === 0

    const startTime = isOperationStartingEvent
      ? event.startTime
      : this.startTime
    // TODO: calculate occurrence count during report generation

    if (this.definition.keepOnlyExplicitlyTrackedEvents) {
      if (tracked) {
        this.events.push(event)
      }
    } else {
      this.events.push(event)
    }

    if (isOperationStartingEvent) {
      this.markAsStarted(startTime)
      // no more processing
      return event
    }

    if (
      interrupted &&
      (this.state === 'started' || this.state === 'waiting-for-interactive')
    ) {
      this.finalizeOperation('interrupted', event.startTime + event.duration)
      return event
    }

    if (
      this.state === 'waiting-for-interactive' &&
      !BLOCKING_TASK_ENTRY_TYPES.includes(event.entryType)
    ) {
      // only events demarking blocking should be handled further for interactive state tracking
      return event
    }

    if (this.state === 'started' && this.requiredToEndTrackers.size === 0) {
      this.maybeFinalizeLater(debounceBy, event.startTime + event.duration)
      return event
    }

    if (this.state === 'waiting-for-interactive') {
      this.handleInteractiveTracking(event)
    }

    return event
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

  private maybeFinalizeLater(debounceBy: number, eventEndTime: number) {
    const newDeadline = Math.max(
      eventEndTime + debounceBy,
      this.lastDebounceDeadline,
    )

    if (debounceBy === 0) {
      this.lastDebounceDeadline = newDeadline
      this.clearTimeout('debounce')
      this.finalizeOperation('completed', eventEndTime)
      return
    }

    if (newDeadline > this.lastDebounceDeadline) {
      this.lastDebounceDeadline = newDeadline

      const onDebounceDue = () => {
        this.clearTimeout('debounce')
        this.finalizeOperation('completed', eventEndTime)
      }

      // we could finalize this synchronously, but we always run this operation async
      // to allow buffered entries to be processed first
      // because buffered entries might further update the debounce deadline
      // TODO: validate this ^^
      this.setTimeout('debounce', onDebounceDue, newDeadline)
    }
  }

  /**
   * In buffered mode, the timeouts are triggered by the next event that is processed.
   * Events are assumed to be processed in order.
   */
  private enableBufferedMode() {
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
  private disableBufferedMode() {
    this.buffered = false
    Object.keys(this.timeouts).forEach((type) => {
      this.ensureTimeout(type as keyof typeof this.timeouts)
    })
  }

  private executeBufferedTimeoutsDue(time: number) {
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

  private timeouts: {
    global: [number, () => void] | undefined
    interactive: [number, () => void] | undefined
    debounce: [number, () => void] | undefined
  } = {
    global: undefined,
    interactive: undefined,
    debounce: undefined,
  }

  private timeoutIds: {
    global: TimeoutRef | null
    interactive: TimeoutRef | null
    debounce: TimeoutRef | null
  } = {
    global: null,
    interactive: null,
    debounce: null,
  }

  private setTimeout(
    type: 'global' | 'interactive' | 'debounce',
    callback: () => void,
    endTime: number,
    alwaysAsync?: boolean,
  ) {
    this.timeouts[type] = [endTime, callback]
    this.ensureTimeout(type, alwaysAsync)
  }

  private ensureTimeout(
    type: 'global' | 'interactive' | 'debounce',
    alwaysAsync?: boolean,
  ) {
    const timeout = this.timeouts[type]
    if (timeout) {
      if (this.buffered) {
        // do nothing, the timeout will be triggered by the next event when it is processed
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

  private clearTimeout(type: 'global' | 'interactive' | 'debounce') {
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

      this.onTracked()

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

        // waiting for long events for the duration of the interactive debounce:
        this.maybeFinalizeLater(captureInteractive.debounceLongTasksBy, endTime)
      } else {
        this.finalize()
      }
    } else if (this.state === 'waiting-for-interactive') {
      this.state = reason
      this.durationTillInteractive = endTime - this.startTime
      this.finalize()
    }
  }

  private finalize() {
    this.clearAllTimeouts()
    this.onEnd()
    this.finalizationFn()
  }

  /**
   * Handles tracking long events while waiting for interactivity.
   * @param event - The performance entry event to track.
   */
  private handleInteractiveTracking(event: PerformanceEntryLike): void {
    if (
      !BLOCKING_TASK_ENTRY_TYPES.includes(event.entryType) ||
      this.state !== 'waiting-for-interactive' ||
      !this.definition.captureInteractive ||
      event.duration <
        this.definition.captureInteractive.skipDebounceForLongEventsShorterThan
    ) {
      return
    }
    const { debounceLongTasksBy } = this.definition.captureInteractive
    this.maybeFinalizeLater(
      debounceLongTasksBy,
      event.startTime + event.duration,
    )
  }

  private onTracked(): void {
    // process the operation as a event itself:
    this.manager.scheduleEventProcessing({
      entryType: OPERATION_ENTRY_TYPE,
      name: this.name,
      startTime: this.startTime,
      duration: this.duration,
      metadata: this.metadata,
      event: {
        commonName: this.name,
        kind: OPERATION_ENTRY_TYPE,
        status: this.status,
      },
    })

    this.definition.onTracked?.(this)
  }

  private onEnd(): void {
    // process the operation as a event itself:
    if (this.durationTillInteractive) {
      this.manager.scheduleEventProcessing({
        entryType: OPERATION_INTERACTIVE_ENTRY_TYPE,
        name: this.name,
        startTime: this.startTime,
        duration: this.durationTillInteractive,
        metadata: this.metadata,
        event: {
          commonName: this.name,
          kind: OPERATION_INTERACTIVE_ENTRY_TYPE,
          status: this.status,
        },
      })
    }
    this.definition.onEnd?.(this)
  }

  /**
   * Matches criteria against a performance entry event.
   * @param match - The match criteria or function.
   * @param event - The performance entry event.
   * @returns True if the event matches the criteria, false otherwise.
   */
  private matchesCriteria(
    match: EventMatchCriteria | EventMatchFunction,
    event: Event,
  ): boolean {
    if (typeof match === 'function') {
      return match(event)
    }
    const { name, metadata, type } = match
    const nameMatches =
      !name ||
      (typeof name === 'string'
        ? event.name === name
        : typeof name === 'function'
          ? name(event.name)
          : name.test(event.name))
    const typeMatches = !type || event.entryType === type
    const metadataMatches =
      !metadata ||
      Boolean(
        event.metadata &&
          Object.entries(metadata).every(
            ([key, value]) => event.metadata?.[key] === value,
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
  private eventBuffer: Event[] = []
  /**
   * The function to preprocess a PerformanceEntry-like object into an Event object.
   * The resulting Event should have an 'operations' property record,
   * which will be updated by the manager with metadata related to the operations that have processed it.
   * This will happen synchronously when running in unbuffered mode, and asynchronously when running in buffered mode.
   */
  private preprocessEvent: (event: PerformanceEntryLike | InputEvent) => Event
  supportedEntryTypes: readonly string[]
  bestBlockingTaskType: string | undefined

  /**
   * Creates an instance of CentralizedPerformanceManager.
   */
  constructor({
    defaultDebounceTime = DEFAULT_DEBOUNCE_TIME,
    preprocessEvent = defaultEventProcessor,
    observe,
    performance: {
      measure = performance.measure.bind(performance),
      now = performance.now.bind(performance),
    } = {},
    bufferDuration,
    supportedEntryTypes = PerformanceObserver.supportedEntryTypes,
  }: InstanceOptions = {}) {
    this.operations = new Map()
    this.defaultDebounceTime = defaultDebounceTime
    this.performance = { measure, now }
    this.supportedEntryTypes = supportedEntryTypes
    this.bestBlockingTaskType = bestBlockingTaskType(supportedEntryTypes)
    this.bufferDuration = bufferDuration
    this.preprocessEvent = preprocessEvent
    const entryTypes = this.bestBlockingTaskType
      ? [...DEFAULT_OBSERVED_ENTRY_TYPES, this.bestBlockingTaskType]
      : DEFAULT_OBSERVED_ENTRY_TYPES

    this.observe =
      observe ??
      ((onEntry) => {
        const observer = new PerformanceObserver((list) => {
          list.getEntries().forEach(onEntry)
        })
        observer.observe({ entryTypes })
        return () => void observer.disconnect()
      })
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
      this.scheduleEventProcessing(operationStartEvent)
    }

    const finalizationFn = () => {
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
    if (
      !this.bufferDuration ||
      this.isFlushingBuffer ||
      this.bufferTimeoutId ||
      this.eventBuffer.length === 0
    ) {
      return
    }

    // instead of flushing the whole buffer in one go
    // every half-buffer, we will only flush events that ocurred within the first 1/4 of the buffer's duration
    // this allows for new items to still be added *between* the items of the remaining 3/4 of the buffer
    // and guarantees that the entire buffer is processed within the set buffer duration
    // this is a compromise between processing events in order,
    // and also not waiting too long to process them
    const now = this.performance.now()
    this.bufferFlushUntil = now + this.bufferDuration / 4
    this.bufferTimeoutId = setTimeout(
      () => void this.flushBuffer(),
      this.bufferDuration / 2,
    )
  }

  /**
   * Processes a performance entry event.
   * @param entry - The performance entry event to track.
   */
  scheduleEventProcessing(
    entry: PerformanceEntryLike | InputEvent,
  ): undefined | readonly Event[] {
    if (
      typeof entry.detail === 'object' &&
      entry.detail &&
      SKIP_PROCESSING in entry.detail
    ) {
      return undefined
    }

    const event = this.preprocessEvent(entry)

    if (this.bufferDuration && !this.isFlushingBuffer) {
      this.eventBuffer.push(event)
      this.scheduleBufferFlushIfNeeded()
      // asynchronous processing
      return undefined
    } else {
      // process immediately
      return this.processEvent(event)
    }
  }

  private processEvent(event: Event): readonly Event[] {
    const processedEvents: Event[] = []
    for (const operation of this.operations.values()) {
      const processedEvent = operation.processEvent(event)
      if (processedEvent) {
        event.operations[operation.name] = {
          id: operation.id,
          operationRelativeStartTime: event.startTime - operation.startTime,
          operationRelativeEndTime:
            event.startTime - operation.startTime + event.duration,
          internalOrder: operation.eventCount,
        }
        processedEvents.push(processedEvent)
      }
    }
    return processedEvents
  }

  private isFlushingBuffer = false

  /**
   * Flushes the event buffer, sorts the events, and processes them sequentially.
   */
  private flushBuffer(): void {
    this.isFlushingBuffer = true

    // Sort the buffer by end time
    this.eventBuffer.sort(
      (a, b) => a.startTime + a.duration - (b.startTime + b.duration),
    )

    const remainingBuffer: Event[] = []

    for (const event of this.eventBuffer) {
      const eventEndTime = event.startTime + event.duration
      // Process each event sequentially
      if (eventEndTime <= this.bufferFlushUntil) {
        this.processEvent(event)
      } else {
        remainingBuffer.push(event)
      }
    }

    // Update the buffer
    this.eventBuffer = remainingBuffer

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
        (entry) => void this.scheduleEventProcessing(entry),
      )
    } else if (!shouldBeObserving && isObserving) {
      this.observerDisconnect!()
      this.observerDisconnect = undefined
    }
  }
}
