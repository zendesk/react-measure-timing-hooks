/* eslint-disable @typescript-eslint/consistent-indexed-object-style */
/* eslint-disable max-classes-per-file */
import {
  DEFAULT_DEBOUNCE_DURATION,
  DEFAULT_INTERACTIVE_TIMEOUT_DURATION,
  DEFAULT_TIMEOUT_DURATION,
} from './constants'
import { ensureTimestamp } from './ensureTimestamp'
import {
  type CPUIdleLongTaskProcessor,
  type PerformanceEntryLike,
  createCPUIdleProcessor,
} from './firstCPUIdle'
import { getSpanKey } from './getSpanKey'
import { Context } from './matchSpan'
import { createTraceRecording } from './recordingComputeUtils'
import type {
  SpanAndAnnotation,
  SpanAnnotation,
  SpanAnnotationRecord,
} from './spanAnnotationTypes'
import type { ActiveTraceConfig, Span } from './spanTypes'
import type {
  CompleteTraceDefinition,
  SelectScopeByKey,
  SpanDeduplicationStrategy,
  TraceInterruptionReason,
} from './types'
import type {
  DistributiveOmit,
  KeysOfUnion,
  MergedStateHandlerMethods,
  StateHandlerPayloads,
} from './typeUtils'

export interface FinalState<TracerScopeT> {
  transitionFromState: NonTerminalTraceStates
  interruptionReason?: TraceInterruptionReason
  cpuIdleSpanAndAnnotation?: SpanAndAnnotation<TracerScopeT>
  lastRequiredSpanAndAnnotation?: SpanAndAnnotation<TracerScopeT>
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

interface OnEnterComplete<AllPossibleScopesT>
  extends FinalState<AllPossibleScopesT> {
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

type OnEnterStatePayload<AllPossibleScopesT> =
  | OnEnterInterrupted
  | OnEnterComplete<AllPossibleScopesT>
  | OnEnterDebouncing
  | OnEnterWaitingForInteractive

export type Transition<AllPossibleScopesT> = DistributiveOmit<
  OnEnterStatePayload<AllPossibleScopesT>,
  'transitionFromState'
>

type FinalizeFn<TracerScopeT> = (config: FinalState<TracerScopeT>) => void

export type States<
  TracerScopeKeysT extends KeysOfUnion<AllPossibleScopesT>,
  AllPossibleScopesT,
> = TraceStateMachine<TracerScopeKeysT, AllPossibleScopesT>['states']

interface StateHandlersBase<AllPossibleScopesT> {
  [handler: string]: (
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    payload: any,
  ) => void | undefined | Transition<AllPossibleScopesT>
}

type StatesBase<AllPossibleScopesT> = Record<
  TraceStates,
  StateHandlersBase<AllPossibleScopesT>
>

type TraceStateMachineSideEffectHandlers<
  TracerScopeKeysT extends KeysOfUnion<AllPossibleScopesT>,
  AllPossibleScopesT,
> = TraceStateMachine<TracerScopeKeysT, AllPossibleScopesT>['sideEffectFns']

type EntryType<AllPossibleScopesT> = PerformanceEntryLike & {
  entry: SpanAndAnnotation<AllPossibleScopesT>
}

interface StateMachineContext<
  TracerScopeKeysT extends KeysOfUnion<AllPossibleScopesT>,
  AllPossibleScopesT,
> extends Context<TracerScopeKeysT, AllPossibleScopesT> {
  readonly requiredToEndIndexChecklist: Set<number>
}

export class TraceStateMachine<
  TracerScopeKeysT extends KeysOfUnion<AllPossibleScopesT>,
  AllPossibleScopesT,
> {
  readonly context: StateMachineContext<TracerScopeKeysT, AllPossibleScopesT>
  readonly sideEffectFns: {
    readonly storeFinalizeState: FinalizeFn<
      SelectScopeByKey<TracerScopeKeysT, AllPossibleScopesT>
    >
  }
  currentState: TraceStates = 'recording'
  /** the span that ended at the furthest point in time */
  lastRelevant: SpanAndAnnotation<AllPossibleScopesT> | undefined
  /** it is set once the LRS value is established */
  lastRequiredSpan: SpanAndAnnotation<AllPossibleScopesT> | undefined
  cpuIdleLongTaskProcessor:
    | CPUIdleLongTaskProcessor<EntryType<AllPossibleScopesT>>
    | undefined
  debounceDeadline: number = Number.POSITIVE_INFINITY
  interactiveDeadline: number = Number.POSITIVE_INFINITY
  timeoutDeadline: number = Number.POSITIVE_INFINITY

  /**
   * while debouncing, we need to buffer any spans that come in so they can be re-processed
   * once we transition to the 'waiting-for-interactive' state
   * otherwise we might miss out on spans that are relevant to calculating the interactive
   *
   * if we have long tasks before FMP, we want to use them as a potential grouping post FMP.
   */
  debouncingSpanBuffer: SpanAndAnnotation<AllPossibleScopesT>[] = []

  readonly states = {
    recording: {
      onEnterState: () => {
        this.timeoutDeadline =
          this.context.input.startTime.epoch +
          (this.context.definition.timeoutDuration ?? DEFAULT_TIMEOUT_DURATION)
      },

      onProcessSpan: (
        spanAndAnnotation: SpanAndAnnotation<AllPossibleScopesT>,
      ) => {
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
          for (const match of this.context.definition.interruptOn) {
            if (match(spanAndAnnotation, this.context)) {
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

          const matcher = this.context.definition.requiredToEnd[i]!
          if (matcher(spanAndAnnotation, this.context)) {
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

      onProcessSpan: (
        spanAndAnnotation: SpanAndAnnotation<AllPossibleScopesT>,
      ) => {
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

        const { span } = spanAndAnnotation

        // even though we satisfied all the requiredToEnd conditions in the recording state,
        // if we see a previously required render span that was requested to be idle, but is no longer idle,
        // our trace is deemed invalid and should be interrupted
        const isSpanNonIdleRender = 'isIdle' in span && !span.isIdle
        // we want to match on all the conditions except for the "isIdle: true"
        // for this reason we have to pretend to the matcher about "isIdle" or else our matcher condition would never evaluate to true
        const idleRegressionCheckSpan = isSpanNonIdleRender && {
          ...spanAndAnnotation,
          span: { ...span, isIdle: true },
        }
        if (idleRegressionCheckSpan) {
          for (const matcher of this.context.definition.requiredToEnd) {
            if (
              // TODO: rename matcher in the whole file to 'doesSpanMatch'
              matcher(idleRegressionCheckSpan, this.context) &&
              matcher.isIdle
            ) {
              // check if we regressed on "isIdle", and if so, transition to interrupted with reason
              return {
                transitionToState: 'interrupted',
                interruptionReason: 'idle-component-no-longer-idle',
              }
            }
          }
        }

        // does span satisfy any of the "debouncedOn" and if so, restart our debounce timer
        if (this.context.definition.debounceOn) {
          for (const matcher of this.context.definition.debounceOn) {
            if (matcher(spanAndAnnotation, this.context)) {
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

        const interruptMillisecondsAfterLastRequiredSpan =
          (typeof interactiveConfig === 'object' &&
            interactiveConfig.timeout) ||
          DEFAULT_INTERACTIVE_TIMEOUT_DURATION

        const lastRequiredSpanEndTimeEpoch =
          this.lastRequiredSpan.span.startTime.epoch +
          this.lastRequiredSpan.span.duration
        this.interactiveDeadline =
          lastRequiredSpanEndTimeEpoch +
          interruptMillisecondsAfterLastRequiredSpan

        this.cpuIdleLongTaskProcessor = createCPUIdleProcessor<
          EntryType<AllPossibleScopesT>
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
          ) as Transition<AllPossibleScopesT> | undefined
          if (transition) {
            return transition
          }
        }

        return undefined
      },

      onProcessSpan: (
        spanAndAnnotation: SpanAndAnnotation<AllPossibleScopesT>,
      ) => {
        const cpuIdleMatch = this.cpuIdleLongTaskProcessor?.({
          entryType: spanAndAnnotation.span.type,
          startTime: spanAndAnnotation.span.startTime.now,
          duration: spanAndAnnotation.span.duration,
          entry: spanAndAnnotation,
        })

        const cpuIdleTimestamp =
          cpuIdleMatch !== undefined &&
          cpuIdleMatch.entry.span.startTime.epoch +
            cpuIdleMatch.entry.span.duration

        // TODO (DECISION): should we also check whether (cpuIdleTimestamp <= this.interactiveDeadline)?
        // it's technically more correct, but on the other hand if we crossed the interactive deadline
        // and at the same time found out the real CpuIdle, it's probably fine to keep it
        // as long as we don't cross the 'timeoutDeadline' it's probably ok.

        if (cpuIdleTimestamp && cpuIdleTimestamp <= this.timeoutDeadline) {
          // if we match the interactive criteria, transition to complete
          // reference https://docs.google.com/document/d/1GGiI9-7KeY3TPqS3YT271upUVimo-XiL5mwWorDUD4c/edit
          return {
            transitionToState: 'complete',
            lastRequiredSpanAndAnnotation: this.lastRequiredSpan,
            cpuIdleSpanAndAnnotation: cpuIdleMatch.entry,
          }
        }

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

        // if the entry matches any of the interruptOn criteria,
        // transition to complete state with the 'matched-on-interrupt' interruptionReason
        if (this.context.definition.interruptOn) {
          for (const matcher of this.context.definition.interruptOn) {
            if (matcher(spanAndAnnotation, this.context)) {
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
      onEnterState: (_payload: OnEnterComplete<AllPossibleScopesT>) => {
        // terminal state, but we reuse the payload for generating the report in ActiveTrace
      },
    },
  } satisfies StatesBase<AllPossibleScopesT>

  constructor({
    definition,
    input,
    sideEffectFns,
  }: {
    definition: CompleteTraceDefinition<TracerScopeKeysT, AllPossibleScopesT>
    input: ActiveTraceConfig<TracerScopeKeysT, AllPossibleScopesT>
    sideEffectFns: TraceStateMachineSideEffectHandlers<
      TracerScopeKeysT,
      AllPossibleScopesT
    >
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
  emit<
    EventName extends keyof StateHandlerPayloads<
      TracerScopeKeysT,
      AllPossibleScopesT
    >,
  >(
    event: EventName,
    payload: StateHandlerPayloads<
      TracerScopeKeysT,
      AllPossibleScopesT
    >[EventName],
  ): OnEnterStatePayload<AllPossibleScopesT> | undefined {
    const currentStateHandlers = this.states[this.currentState] as Partial<
      MergedStateHandlerMethods<TracerScopeKeysT, AllPossibleScopesT>
    >
    const transitionPayload = currentStateHandlers[event]?.(payload)
    if (transitionPayload) {
      const transitionFromState = this.currentState as NonTerminalTraceStates
      this.currentState = transitionPayload.transitionToState
      const onEnterStateEvent: OnEnterStatePayload<AllPossibleScopesT> = {
        transitionFromState,
        ...transitionPayload,
      }
      return this.emit('onEnterState', onEnterStateEvent) ?? onEnterStateEvent
    }
    return undefined
  }
}

export class ActiveTrace<
  TracerScopeKeysT extends KeysOfUnion<AllPossibleScopesT>,
  AllPossibleScopesT,
> {
  readonly definition: CompleteTraceDefinition<
    TracerScopeKeysT,
    AllPossibleScopesT
  >
  readonly input: ActiveTraceConfig<TracerScopeKeysT, AllPossibleScopesT>
  private readonly deduplicationStrategy?: SpanDeduplicationStrategy<AllPossibleScopesT>

  recordedItems: SpanAndAnnotation<AllPossibleScopesT>[] = []
  stateMachine: TraceStateMachine<TracerScopeKeysT, AllPossibleScopesT>
  occurrenceCounters = new Map<string, number>()
  processedPerformanceEntries: WeakMap<
    PerformanceEntry,
    SpanAndAnnotation<AllPossibleScopesT>
  > = new WeakMap()

  finalState:
    | FinalState<SelectScopeByKey<TracerScopeKeysT, AllPossibleScopesT>>
    | undefined

  constructor(
    definition: CompleteTraceDefinition<TracerScopeKeysT, AllPossibleScopesT>,
    input: ActiveTraceConfig<TracerScopeKeysT, AllPossibleScopesT>,
    deduplicationStrategy?: SpanDeduplicationStrategy<AllPossibleScopesT>,
  ) {
    this.definition = definition
    this.input = {
      ...input,
      startTime: ensureTimestamp(input.startTime),
    }
    this.deduplicationStrategy = deduplicationStrategy
    this.stateMachine = new TraceStateMachine({
      definition,
      input,
      sideEffectFns: {
        storeFinalizeState: this.storeFinalizeState,
      },
    })
  }

  storeFinalizeState: FinalizeFn<
    SelectScopeByKey<TracerScopeKeysT, AllPossibleScopesT>
  > = (config) => {
    this.finalState = config
  }

  // this is public API only and should not be called internally
  interrupt(reason: TraceInterruptionReason) {
    const transition = this.stateMachine.emit('onInterrupt', reason)
    if (!transition) return

    this.prepareAndEmitRecording({
      transition,
      lastRelevantSpanAndAnnotation: undefined,
    })
  }

  processSpan(
    span: Span<AllPossibleScopesT>,
  ): SpanAnnotationRecord | undefined {
    const spanEndTime = span.startTime.now + span.duration
    // check if valid for this trace:
    if (spanEndTime < this.input.startTime.now) {
      // TODO: maybe we should actually keep events that happened right before the trace started, e.g. 'event' spans for clicks?
      // console.log(
      //   `# span ${span.type} ${span.name} is ignored because it started before the trace started at ${this.input.startTime.now}`,
      // )
      return undefined
    }

    // check if the performanceEntry has already been processed
    // a single performanceEntry can have Spans created from it multiple times
    // we allow this in case the Span comes from different contexts
    // currently the version of the Span wins,
    // but we could consider creating some customizable logic
    // re-processing the same span should be safe
    const existingAnnotation =
      (span.performanceEntry &&
        this.processedPerformanceEntries.get(span.performanceEntry)) ??
      this.deduplicationStrategy?.findDuplicate(span, this.recordedItems)

    let spanAndAnnotation: SpanAndAnnotation<AllPossibleScopesT>

    if (existingAnnotation) {
      spanAndAnnotation = existingAnnotation
      // update the span in the recording using the strategy's selector
      spanAndAnnotation.span =
        this.deduplicationStrategy?.selectPreferredSpan(
          existingAnnotation.span,
          span,
        ) ?? span
    } else {
      const spanId = getSpanKey(span)
      const occurrence = this.occurrenceCounters.get(spanId) ?? 1
      this.occurrenceCounters.set(spanId, occurrence + 1)

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

      const labels = this.getSpanLabels({
        span,
        annotation,
      })

      spanAndAnnotation = {
        span,
        annotation: {
          ...annotation,
          labels,
        },
      }

      this.deduplicationStrategy?.recordSpan(span, spanAndAnnotation)
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
      !transition || transition.transitionToState !== 'interrupted'

    // if the final state is interrupted, we should not record the entry nor annotate it externally
    if (shouldRecord && !existingAnnotation) {
      this.recordedItems.push(spanAndAnnotation)
    }

    if (transition) {
      this.prepareAndEmitRecording({
        transition,
        lastRelevantSpanAndAnnotation: spanAndAnnotation,
      })
    }

    if (shouldRecord) {
      // the return value is used for reporting the annotation externally (e.g. to the RUM agent)
      return {
        [this.definition.name]: spanAndAnnotation.annotation,
      }
    }

    return undefined
  }

  private getSpanLabels(span: SpanAndAnnotation<AllPossibleScopesT>): string[] {
    const labels: string[] = []
    const context = { definition: this.definition, input: this.input }
    if (!this.definition.labelMatching) return labels

    Object.entries(this.definition.labelMatching).forEach(
      ([label, matcher]) => {
        if (matcher(span, context)) {
          labels.push(label)
        }
      },
    )

    return labels
  }

  private prepareAndEmitRecording({
    transition,
    lastRelevantSpanAndAnnotation,
  }: {
    transition: OnEnterStatePayload<AllPossibleScopesT>
    lastRelevantSpanAndAnnotation:
      | SpanAndAnnotation<AllPossibleScopesT>
      | undefined
  }) {
    if (
      transition.transitionToState === 'interrupted' ||
      transition.transitionToState === 'complete'
    ) {
      const endOfOperationSpan =
        (transition.transitionToState === 'complete' &&
          (transition.cpuIdleSpanAndAnnotation ??
            transition.lastRequiredSpanAndAnnotation)) ||
        lastRelevantSpanAndAnnotation

      const traceRecording = createTraceRecording(
        {
          definition: this.definition,
          // only keep items captured until the endOfOperationSpan
          recordedItems: endOfOperationSpan
            ? this.recordedItems.filter(
                (item) =>
                  item.span.startTime.now + item.span.duration <=
                  endOfOperationSpan.span.startTime.now +
                    endOfOperationSpan.span.duration,
              )
            : this.recordedItems,
          input: this.input,
        },
        transition,
      )
      this.input.onEnd(traceRecording)

      // memory clean-up in case something retains the ActiveTrace instance
      this.recordedItems = []
      this.occurrenceCounters.clear()
      this.processedPerformanceEntries = new WeakMap()
      this.deduplicationStrategy?.reset()
    }
  }
}
