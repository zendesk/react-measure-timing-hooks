/* eslint-disable @typescript-eslint/consistent-indexed-object-style */
/* eslint-disable max-classes-per-file */
import { doesEntryMatchDefinition } from './doesEntryMatchDefinition'
import { ensureTimestamp } from './ensureTimestamp'
import {
  type CPUIdleLongTaskProcessor,
  type PerformanceEntryLike,
  createCPUIdleProcessor,
} from './firstCPUIdle'
import { createTraceRecording } from './recordingComputeUtils'
import type {
  SpanAndAnnotation,
  SpanAnnotation,
  SpanAnnotationRecord,
} from './spanAnnotationTypes'
import type { ActiveTraceConfig, Span } from './spanTypes'
import type { CompleteTraceDefinition } from './traceRecordingTypes'
import type { ScopeBase, TraceInterruptionReason } from './types'
import type {
  DistributiveOmit,
  MergedStateHandlerMethods,
  StateHandlerPayloads,
} from './typeUtils'

export interface FinalState<ScopeT extends ScopeBase> {
  transitionFromState: NonTerminalTraceStates
  interruptionReason?: TraceInterruptionReason
  cpuIdleSpanAndAnnotation?: SpanAndAnnotation<ScopeT>
  lastRequiredSpanAndAnnotation?: SpanAndAnnotation<ScopeT>
}

type InitialTraceState = 'recording'
export type NonTerminalTraceStates =
  | InitialTraceState
  | 'debouncing'
  | 'waiting-for-interactive'
type TerminalTraceStates = 'interrupted' | 'complete'
export type TraceStates = NonTerminalTraceStates | TerminalTraceStates

interface OnEnterInterrupted {
  transitionToState: 'interrupted'
  transitionFromState: NonTerminalTraceStates
  interruptionReason: TraceInterruptionReason
}

interface OnEnterComplete<ScopeT extends ScopeBase> extends FinalState<ScopeT> {
  transitionToState: 'complete'
}

interface OnEnterWaitingForInteractive {
  transitionToState: 'waiting-for-interactive'
  transitionFromState: NonTerminalTraceStates
}

interface OnEnterDebouncing {
  transitionToState: 'debouncing'
  transitionFromState: NonTerminalTraceStates
}

type OnEnterStatePayload<ScopeT extends ScopeBase> =
  | OnEnterInterrupted
  | OnEnterComplete<ScopeT>
  | OnEnterDebouncing
  | OnEnterWaitingForInteractive

export type Transition<ScopeT extends ScopeBase> = DistributiveOmit<
  OnEnterStatePayload<ScopeT>,
  'transitionFromState'
>

type FinalizeFn<ScopeT extends ScopeBase> = (config: FinalState<ScopeT>) => void

export type States<ScopeT extends ScopeBase> =
  TraceStateMachine<ScopeT>['states']

interface StateHandlersBase<ScopeT extends ScopeBase> {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  [handler: string]: (payload: any) => void | undefined | Transition<ScopeT>
}

type StatesBase<ScopeT extends ScopeBase> = Record<
  TraceStates,
  StateHandlersBase<ScopeT>
>

type TraceStateMachineSideEffectHandlers<ScopeT extends ScopeBase> =
  TraceStateMachine<ScopeT>['sideEffectFns']

const DEFAULT_DEBOUNCE_DURATION = 500
const DEFAULT_TIMEOUT_DURATION = 45_000
const DEFAULT_INTERACTIVE_TIMEOUT_DURATION = 10_000

type EntryType<ScopeT extends ScopeBase> = PerformanceEntryLike & {
  entry: SpanAndAnnotation<ScopeT>
}

export class TraceStateMachine<ScopeT extends ScopeBase> {
  readonly context: {
    readonly definition: CompleteTraceDefinition<ScopeT>
    readonly input: Omit<ActiveTraceConfig<ScopeT>, 'onEnd'>
    readonly requiredToEndIndexChecklist: Set<number>
  }
  readonly sideEffectFns: {
    readonly storeFinalizeState: FinalizeFn<ScopeT>
  }
  currentState: TraceStates = 'recording'
  /** the span that ended at the furthest point in time */
  lastRelevant: SpanAndAnnotation<ScopeT> | undefined
  /** it is set once the LRS value is established */
  lastRequiredSpan: SpanAndAnnotation<ScopeT> | undefined
  cpuIdleLongTaskProcessor:
    | CPUIdleLongTaskProcessor<EntryType<ScopeT>>
    | undefined
  debounceDeadline: number = Number.POSITIVE_INFINITY
  interactiveDeadline: number = Number.POSITIVE_INFINITY
  timeoutDeadline: number = Number.POSITIVE_INFINITY

  // while debouncing, we need to buffer any spans that come in so they can be re-processed
  // once we transition to the 'waiting-for-interactive' state
  // otherwise we might miss out on spans that are relevant to calculating the interactive
  debouncingSpanBuffer: SpanAndAnnotation<ScopeT>[] = []

  readonly states = {
    recording: {
      onEnterState: () => {
        this.timeoutDeadline =
          this.context.input.startTime.epoch +
          (this.context.definition.timeoutDuration ?? DEFAULT_TIMEOUT_DURATION)
      },

      onProcessSpan: (spanAndAnnotation: SpanAndAnnotation<ScopeT>) => {
        const spanEndTimeEpoch =
          spanAndAnnotation.span.startTime.epoch +
          spanAndAnnotation.span.duration

        if (spanEndTimeEpoch > this.timeoutDeadline) {
          // we consider this interrupted, because of the clamping of the total duration of the operation
          // as potential other events could have happened and prolonged the operation
          // we can be a little picky, because we expect to record many operations
          // it's best to compare like-to-like
          return {
            transitionToState: 'interrupted',
            interruptionReason: 'timeout',
          }
        }

        // does span satisfy any of the "interruptOn" definitions
        if (this.context.definition.interruptOn) {
          for (const definition of this.context.definition.interruptOn) {
            if (
              doesEntryMatchDefinition(
                spanAndAnnotation,
                definition,
                this.context.input.scope,
              )
            ) {
              return {
                transitionToState: 'interrupted',
                interruptionReason: 'matched-on-interrupt',
              }
            }
          }
        }

        for (let i = 0; i < this.context.definition.requiredToEnd.length; i++) {
          if (!this.context.requiredToEndIndexChecklist.has(i)) {
            // we previously checked off this index
            // eslint-disable-next-line no-continue
            continue
          }

          const definition = this.context.definition.requiredToEnd[i]!
          if (
            doesEntryMatchDefinition(
              spanAndAnnotation,
              definition,
              this.context.input.scope,
            )
          ) {
            console.log(
              '# got a match!',
              'span',
              spanAndAnnotation,
              'matches',
              definition,
              'remaining items',
              this.context.requiredToEndIndexChecklist,
            )
            // remove the index of this definition from the list of requiredToEnd
            this.context.requiredToEndIndexChecklist.delete(i)

            // Sometimes spans are processed out of order, we update the lastRelevant if this span ends later
            if (
              !this.lastRelevant ||
              spanAndAnnotation.annotation.operationRelativeEndTime >
                (this.lastRelevant?.annotation.operationRelativeEndTime ?? 0)
            ) {
              this.lastRelevant = spanAndAnnotation
            }
          }
        }

        if (this.context.requiredToEndIndexChecklist.size === 0) {
          return { transitionToState: 'debouncing' }
        }
        return undefined
      },

      onInterrupt: (reason: TraceInterruptionReason) => ({
        transitionToState: 'interrupted',
        interruptionReason: reason,
      }),
    },

    // we enter the debouncing state once all requiredToEnd entries have been seen
    // it is necessary due to the nature of React rendering,
    // as even once we reach the visually complete state of a component,
    // the component might continue to re-render
    // and change the final visual output of the component
    // we want to ensure the end of the operation captures
    // the final, settled state of the component
    debouncing: {
      onEnterState: (payload: OnEnterDebouncing) => {
        if (!this.lastRelevant) {
          // this should never happen
          return {
            transitionToState: 'interrupted',
            interruptionReason: 'invalid-state-transition',
          }
        }
        if (!this.context.definition.debounceOn) {
          return { transitionToState: 'waiting-for-interactive' }
        }
        // set the first debounce deadline
        this.debounceDeadline =
          this.lastRelevant.span.startTime.epoch +
          this.lastRelevant.span.duration +
          (this.context.definition.debounceDuration ??
            DEFAULT_DEBOUNCE_DURATION)

        return undefined
      },

      onProcessSpan: (spanAndAnnotation: SpanAndAnnotation<ScopeT>) => {
        const spanEndTimeEpoch =
          spanAndAnnotation.span.startTime.epoch +
          spanAndAnnotation.span.duration
        if (spanEndTimeEpoch > this.timeoutDeadline) {
          // we consider this interrupted, because of the clamping of the total duration of the operation
          // as potential other events could have happened and prolonged the operation
          // we can be a little picky, because we expect to record many operations
          // it's best to compare like-to-like
          return {
            transitionToState: 'interrupted',
            interruptionReason: 'timeout',
          }
        }

        this.debouncingSpanBuffer.push(spanAndAnnotation)

        if (spanEndTimeEpoch > this.debounceDeadline) {
          // done debouncing
          return { transitionToState: 'waiting-for-interactive' }
        }

        for (const matcher of this.context.definition.requiredToEnd) {
          const { span } = spanAndAnnotation
          if (
            doesEntryMatchDefinition(
              spanAndAnnotation,
              matcher,
              this.context.input.scope,
            ) &&
            matcher.isIdle &&
            'isIdle' in span &&
            span.isIdle
          ) {
            // check if we regressed on "isIdle", and if so, transition to interrupted with reason
            return {
              transitionToState: 'interrupted',
              interruptionReason: 'idle-component-no-longer-idle',
            }
          }
        }

        // does span satisfy any of the "debouncedOn" and if so, restart our debounce timer
        if (this.context.definition.debounceOn) {
          for (const matcher of this.context.definition.debounceOn) {
            if (
              doesEntryMatchDefinition(
                spanAndAnnotation,
                matcher,
                this.context.input.scope,
              )
            ) {
              // Sometimes spans are processed out of order, we update the lastRelevant if this span ends later
              if (
                spanAndAnnotation.annotation.operationRelativeEndTime >
                (this.lastRelevant?.annotation.operationRelativeEndTime ?? 0)
              ) {
                this.lastRelevant = spanAndAnnotation

                // update the debounce timer relative from the time of the span end
                // (not from the time of processing of the event, because it may be asynchronous)
                this.debounceDeadline =
                  this.lastRelevant.span.startTime.epoch +
                  this.lastRelevant.span.duration +
                  (this.context.definition.debounceDuration ??
                    DEFAULT_DEBOUNCE_DURATION)
              }

              return undefined
            }
          }
        }
        return undefined
      },

      onInterrupt: (reason: TraceInterruptionReason) => ({
        transitionToState: 'interrupted',
        interruptionReason: reason,
      }),
    },

    'waiting-for-interactive': {
      onEnterState: (payload: OnEnterWaitingForInteractive) => {
        if (!this.lastRelevant) {
          // this should never happen
          return {
            transitionToState: 'interrupted',
            interruptionReason: 'invalid-state-transition',
          }
        }

        this.lastRequiredSpan = this.lastRelevant
        const interactiveConfig = this.context.definition.captureInteractive
        if (!interactiveConfig) {
          // nothing to do in this state, move to 'complete'
          return {
            transitionToState: 'complete',
            lastRequiredSpanAndAnnotation: this.lastRequiredSpan,
          }
        }

        this.interactiveDeadline =
          this.lastRequiredSpan.span.startTime.epoch +
          this.lastRequiredSpan.span.duration +
          ((typeof interactiveConfig === 'object' &&
            interactiveConfig.timeout) ||
            DEFAULT_INTERACTIVE_TIMEOUT_DURATION)

        this.cpuIdleLongTaskProcessor = createCPUIdleProcessor<
          EntryType<ScopeT>
        >(
          {
            entryType: this.lastRequiredSpan.span.type,
            startTime: this.lastRequiredSpan.span.startTime.now,
            duration: this.lastRequiredSpan.span.duration,
            entry: this.lastRequiredSpan,
          },
          typeof interactiveConfig === 'object' ? interactiveConfig : {},
        )

        // sort the buffer before processing
        // DECISION TODO: do we want to sort by end time or start time?
        this.debouncingSpanBuffer.sort(
          (a, b) =>
            a.span.startTime.now +
            a.span.duration -
            (b.span.startTime.now + b.span.duration),
        )

        // process any spans that were buffered during the debouncing phase
        while (this.debouncingSpanBuffer.length > 0) {
          const span = this.debouncingSpanBuffer.shift()!
          const transition = this.emit(
            'onProcessSpan',
            span,
            // below cast is necessary due to circular type reference
          ) as Transition<ScopeT> | undefined
          if (transition) {
            return transition
          }
        }

        return undefined
      },

      onProcessSpan: (spanAndAnnotation: SpanAndAnnotation<ScopeT>) => {
        const spanEndTimeEpoch =
          spanAndAnnotation.span.startTime.epoch +
          spanAndAnnotation.span.duration
        if (spanEndTimeEpoch > this.timeoutDeadline) {
          // we consider this complete, because we have a complete trace
          // it's just missing the bonus data from when the browser became "interactive"
          return {
            transitionToState: 'complete',
            interruptionReason: 'timeout',
            lastRequiredSpanAndAnnotation: this.lastRequiredSpan,
          }
        }

        if (spanEndTimeEpoch > this.interactiveDeadline) {
          // we consider this complete, because we have a complete trace
          // it's just missing the bonus data from when the browser became "interactive"
          return {
            transitionToState: 'complete',
            interruptionReason: 'waiting-for-interactive-timeout',
            lastRequiredSpanAndAnnotation: this.lastRequiredSpan,
          }
        }

        const cpuIdleMatch = this.cpuIdleLongTaskProcessor?.({
          entryType: spanAndAnnotation.span.type,
          startTime: spanAndAnnotation.span.startTime.now,
          duration: spanAndAnnotation.span.duration,
          entry: spanAndAnnotation,
        })

        if (cpuIdleMatch !== undefined) {
          // if we match the interactive criteria, transition to complete
          // reference https://docs.google.com/document/d/1GGiI9-7KeY3TPqS3YT271upUVimo-XiL5mwWorDUD4c/edit
          return {
            transitionToState: 'complete',
            lastRequiredSpanAndAnnotation: this.lastRequiredSpan,
            cpuIdleSpanAndAnnotation: cpuIdleMatch.entry,
          }
        }

        // if the entry matches any of the interruptOn criteria,
        // transition to complete state with the 'matched-on-interrupt' interruptionReason
        if (this.context.definition.interruptOn) {
          for (const matcher of this.context.definition.interruptOn) {
            if (
              doesEntryMatchDefinition(
                spanAndAnnotation,
                matcher,
                this.context.input.scope,
              )
            ) {
              return {
                transitionToState: 'complete',
                interruptionReason: 'matched-on-interrupt',
                lastRequiredSpanAndAnnotation: this.lastRequiredSpan,
              }
            }
          }
        }

        return undefined
      },

      onInterrupt: (reason: TraceInterruptionReason) =>
        // we captured a complete trace, however the interactive data is missing
        ({
          transitionToState: 'complete',
          interruptionReason: reason,
          lastRequiredSpanAndAnnotation: this.lastRequiredSpan,
        }),
    },

    // terminal states:
    interrupted: {
      onEnterState: (_payload: OnEnterInterrupted) => {
        // terminal state, but we reuse the payload for generating the report in ActiveTrace
      },
    },

    complete: {
      onEnterState: (_payload: OnEnterComplete<ScopeT>) => {
        // terminal state, but we reuse the payload for generating the report in ActiveTrace
      },
    },
  } satisfies StatesBase<ScopeT>

  constructor({
    definition,
    input,
    sideEffectFns,
  }: {
    definition: CompleteTraceDefinition<ScopeT>
    input: ActiveTraceConfig<ScopeT>
    sideEffectFns: TraceStateMachineSideEffectHandlers<ScopeT>
  }) {
    this.context = {
      definition,
      input,
      requiredToEndIndexChecklist: new Set(
        definition.requiredToEnd.map((_, i) => i),
      ),
    }
    this.sideEffectFns = sideEffectFns
    this.emit('onEnterState', undefined)
  }

  /**
   * @returns the last OnEnterState event if a transition was made
   */
  emit<EventName extends keyof StateHandlerPayloads<ScopeT>>(
    event: EventName,
    payload: StateHandlerPayloads<ScopeT>[EventName],
  ): OnEnterStatePayload<ScopeT> | undefined {
    const currentStateHandlers = this.states[this.currentState] as Partial<
      MergedStateHandlerMethods<ScopeT>
    >
    const transitionPayload = currentStateHandlers[event]?.(payload)
    if (transitionPayload) {
      const transitionFromState = this.currentState as NonTerminalTraceStates
      this.currentState = transitionPayload.transitionToState
      const onEnterStateEvent: OnEnterStatePayload<ScopeT> = {
        transitionFromState,
        ...transitionPayload,
      }
      return this.emit('onEnterState', onEnterStateEvent) ?? onEnterStateEvent
    }
    return undefined
  }
}

export class ActiveTrace<ScopeT extends ScopeBase> {
  readonly definition: CompleteTraceDefinition<ScopeT>
  readonly input: ActiveTraceConfig<ScopeT>

  recordedItems: SpanAndAnnotation<ScopeT>[] = []
  stateMachine: TraceStateMachine<ScopeT>
  occurrenceCounters = new Map<string, number>()

  processedPerformanceEntries: WeakMap<
    PerformanceEntry,
    SpanAndAnnotation<ScopeT>
  > = new WeakMap()

  finalState: FinalState<ScopeT> | undefined

  constructor(
    definition: CompleteTraceDefinition<ScopeT>,
    input: ActiveTraceConfig<ScopeT>,
  ) {
    this.definition = definition
    this.input = {
      ...input,
      startTime: ensureTimestamp(input.startTime),
    }
    this.stateMachine = new TraceStateMachine({
      definition,
      input,
      sideEffectFns: {
        storeFinalizeState: this.storeFinalizeState,
      },
    })
  }

  storeFinalizeState = (config: FinalState<ScopeT>) => {
    this.finalState = config
  }

  // this is public API only and should not be called internally
  interrupt(reason: TraceInterruptionReason) {
    const transition = this.stateMachine.emit('onInterrupt', reason)

    const traceRecording = createTraceRecording(
      {
        definition: this.definition,
        // only keep items captured until the endOfOperationSpan
        recordedItems: this.recordedItems,
        input: this.input,
      },
      transition
    )

    this.input.onEnd(traceRecording)
  }

  processSpan(span: Span<ScopeT>): SpanAnnotationRecord | undefined {
    // check if valid for this trace:
    if (span.startTime.now < this.input.startTime.now) {
      return undefined
    }

    // check if the performanceEntry has already been processed
    // a single performanceEntry can have Spans created from it multiple times
    // we allow this in case the Span comes from different contexts
    // currently the version of the Span wins,
    // but we could consider creating some customizable logic
    // re-processing the same span should be safe
    const existingAnnotation =
      span.performanceEntry &&
      this.processedPerformanceEntries.get(span.performanceEntry)

    let spanAndAnnotation: SpanAndAnnotation<ScopeT>

    if (existingAnnotation) {
      spanAndAnnotation = existingAnnotation
      // update the span in the recording
      spanAndAnnotation.span = span
    } else {
      const occurrence = this.occurrenceCounters.get(span.name) ?? 1
      this.occurrenceCounters.set(span.name, occurrence + 1)

      const annotation: SpanAnnotation = {
        id: this.input.id,
        operationRelativeStartTime:
          span.startTime.now - this.input.startTime.now,
        operationRelativeEndTime:
          span.startTime.now - this.input.startTime.now + span.duration,
        occurrence,
        recordedInState: this.stateMachine
          .currentState as NonTerminalTraceStates,
      }

      spanAndAnnotation = {
        span,
        annotation,
      }

      if (span.performanceEntry) {
        this.processedPerformanceEntries.set(
          span.performanceEntry,
          spanAndAnnotation,
        )
      }
    }

    const transition = this.stateMachine.emit(
      'onProcessSpan',
      spanAndAnnotation,
    )

    // Tag the span annotations:
    if (transition?.transitionToState === 'complete') {
      if (transition.lastRequiredSpanAndAnnotation) {
        // mutate the annotation to mark the span as complete
        transition.lastRequiredSpanAndAnnotation.annotation.markedComplete =
          true
      }
      if (transition.cpuIdleSpanAndAnnotation) {
        // mutate the annotation to mark the span as interactive
        transition.cpuIdleSpanAndAnnotation.annotation.markedInteractive = true
      }
    }

    const shouldRecord =
      !existingAnnotation &&
      (!transition || transition.transitionToState !== 'interrupted')

    console.log(
      `# processed span ${spanAndAnnotation.span.type} ${spanAndAnnotation.span.name} ${spanAndAnnotation.annotation.occurrence}`,
      spanAndAnnotation,
      'shouldRecord?',
      shouldRecord,
      'transition?',
      transition,
    )

    // DECISION: if the final state is interrupted, we should not record the entry nor annotate it externally
    if (shouldRecord) {
      this.recordedItems.push(spanAndAnnotation)
    }

    if (
      transition?.transitionToState === 'interrupted' ||
      transition?.transitionToState === 'complete'
    ) {
      const endOfOperationSpan =
        (transition?.transitionToState === 'complete' &&
          (transition.cpuIdleSpanAndAnnotation ??
            transition.lastRequiredSpanAndAnnotation)) ||
        spanAndAnnotation
      const traceRecording = createTraceRecording(
        {
          definition: this.definition,
          // only keep items captured until the endOfOperationSpan
          recordedItems: this.recordedItems.filter(
            (item) =>
              item.span.startTime.now + item.span.duration <=
              endOfOperationSpan.span.startTime.now +
                endOfOperationSpan.span.duration,
          ),
          input: this.input,
        },
        transition,
      )
      this.input.onEnd(traceRecording)
    }

    if (shouldRecord) {
      // the return value is used for reporting the annotation externally (e.g. to the RUM agent)
      return {
        [this.definition.name]: spanAndAnnotation.annotation,
      }
    }

    return undefined
  }
}
