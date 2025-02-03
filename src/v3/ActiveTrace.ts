/* eslint-disable @typescript-eslint/consistent-indexed-object-style */
/* eslint-disable max-classes-per-file */
import {
  DEADLINE_BUFFER,
  DEFAULT_DEBOUNCE_DURATION,
  DEFAULT_INTERACTIVE_TIMEOUT_DURATION,
} from './constants'
import { convertMatchersToFns } from './ensureMatcherFn'
import { ensureTimestamp } from './ensureTimestamp'
import {
  type CPUIdleLongTaskProcessor,
  type PerformanceEntryLike,
  createCPUIdleProcessor,
} from './firstCPUIdle'
import { getSpanKey } from './getSpanKey'
import { createTraceRecording } from './recordingComputeUtils'
import type {
  SpanAndAnnotation,
  SpanAnnotation,
  SpanAnnotationRecord,
} from './spanAnnotationTypes'
import type { ActiveTraceConfig, DraftTraceInput, Span } from './spanTypes'
import type { TraceRecording } from './traceRecordingTypes'
import type {
  CompleteTraceDefinition,
  SelectScopeByKey,
  SingleTraceReportFn,
  TraceInterruptionReason,
  TraceManagerUtilities,
  TraceModifications,
} from './types'
import { DraftTraceContext } from './types'
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
  completeSpanAndAnnotation?: SpanAndAnnotation<TracerScopeT>
  lastRequiredSpanAndAnnotation?: SpanAndAnnotation<TracerScopeT>
}

const INITIAL_STATE = 'draft'
type InitialTraceState = typeof INITIAL_STATE
export type NonTerminalTraceStates =
  | InitialTraceState
  | 'active'
  | 'debouncing'
  | 'waiting-for-interactive'
type TerminalTraceStates = 'interrupted' | 'complete'
export type TraceStates = NonTerminalTraceStates | TerminalTraceStates

interface OnEnterActive {
  transitionToState: 'active'
  transitionFromState: NonTerminalTraceStates
}

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
  | OnEnterActive
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
  OriginatedFromT extends string,
> = TraceStateMachine<
  TracerScopeKeysT,
  AllPossibleScopesT,
  OriginatedFromT
>['states']

interface StateHandlersBase<AllPossibleScopesT> {
  [handler: string]: (
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    payload: any,
  ) =>
    | void
    | undefined
    | (Transition<AllPossibleScopesT> & { transitionFromState?: never })
}

type StatesBase<AllPossibleScopesT> = Record<
  TraceStates,
  StateHandlersBase<AllPossibleScopesT>
>

interface TraceStateMachineSideEffectHandlers<
  TracerScopeKeysT extends KeysOfUnion<AllPossibleScopesT>,
  AllPossibleScopesT,
> {
  readonly storeFinalizeState: FinalizeFn<
    SelectScopeByKey<TracerScopeKeysT, AllPossibleScopesT>
  >
  readonly addSpanToRecording: (
    spanAndAnnotation: SpanAndAnnotation<AllPossibleScopesT>,
  ) => void
  readonly prepareAndEmitRecording: (
    options: PrepareAndEmitRecordingOptions<AllPossibleScopesT>,
  ) => void
}

type EntryType<AllPossibleScopesT> = PerformanceEntryLike & {
  entry: SpanAndAnnotation<AllPossibleScopesT>
}

interface StateMachineContext<
  TracerScopeKeysT extends KeysOfUnion<AllPossibleScopesT>,
  AllPossibleScopesT,
  OriginatedFromT extends string,
> extends DraftTraceContext<
    TracerScopeKeysT,
    AllPossibleScopesT,
    OriginatedFromT
  > {
  sideEffectFns: TraceStateMachineSideEffectHandlers<
    TracerScopeKeysT,
    AllPossibleScopesT
  >
}

type DeadlineType = 'global' | 'debounce' | 'interactive' | 'next-quiet-window'

export class TraceStateMachine<
  TracerScopeKeysT extends KeysOfUnion<AllPossibleScopesT>,
  AllPossibleScopesT,
  const OriginatedFromT extends string,
> {
  constructor(
    context: StateMachineContext<
      TracerScopeKeysT,
      AllPossibleScopesT,
      OriginatedFromT
    >,
  ) {
    this.context = context
    this.requiredSpansIndexChecklist = new Set(
      context.definition.requiredSpans.map((_, i) => i),
    )
    this.emit('onEnterState', undefined)
  }

  readonly requiredSpansIndexChecklist: Set<number>

  readonly context: StateMachineContext<
    TracerScopeKeysT,
    AllPossibleScopesT,
    OriginatedFromT
  >
  get sideEffectFns() {
    return this.context.sideEffectFns
  }
  currentState: TraceStates = INITIAL_STATE
  /** the span that ended at the furthest point in time */
  lastRelevant: SpanAndAnnotation<AllPossibleScopesT> | undefined
  lastRequiredSpan: SpanAndAnnotation<AllPossibleScopesT> | undefined
  /** it is set once the LRS value is established */
  completeSpan: SpanAndAnnotation<AllPossibleScopesT> | undefined
  cpuIdleLongTaskProcessor:
    | CPUIdleLongTaskProcessor<EntryType<AllPossibleScopesT>>
    | undefined
  #debounceDeadline: number = Number.POSITIVE_INFINITY
  #interactiveDeadline: number = Number.POSITIVE_INFINITY
  #timeoutDeadline: number = Number.POSITIVE_INFINITY

  nextDeadlineRef: ReturnType<typeof setTimeout> | undefined

  setDeadline(
    deadlineType: Exclude<DeadlineType, 'global'>,
    deadlineEpoch: number,
  ) {
    if (deadlineType === 'debounce') {
      this.#debounceDeadline = deadlineEpoch
    } else if (deadlineType === 'interactive') {
      this.#interactiveDeadline = deadlineEpoch
    }

    // which type of deadline is the closest and what kind is it?
    const closestDeadline =
      deadlineEpoch > this.#timeoutDeadline
        ? 'global'
        : deadlineType === 'next-quiet-window' &&
          deadlineEpoch > this.#interactiveDeadline
        ? 'interactive'
        : deadlineType

    const rightNowEpoch = Date.now()
    const timeToDeadlinePlusBuffer =
      deadlineEpoch - rightNowEpoch + DEADLINE_BUFFER

    if (this.nextDeadlineRef) {
      clearTimeout(this.nextDeadlineRef)
    }

    this.nextDeadlineRef = setTimeout(() => {
      this.emit('onDeadline', closestDeadline)
    }, Math.max(timeToDeadlinePlusBuffer, 0))
  }

  setGlobalDeadline(deadline: number) {
    this.#timeoutDeadline = deadline

    const rightNowEpoch = Date.now()
    const timeToDeadlinePlusBuffer = deadline - rightNowEpoch + DEADLINE_BUFFER

    if (!this.nextDeadlineRef) {
      // this should never happen
      this.nextDeadlineRef = setTimeout(() => {
        this.emit('onDeadline', 'global')
      }, Math.max(timeToDeadlinePlusBuffer, 0))
    }
  }

  clearDeadline() {
    if (this.nextDeadlineRef) {
      clearTimeout(this.nextDeadlineRef)
      this.nextDeadlineRef = undefined
    }
  }

  /**
   * while debouncing, we need to buffer any spans that come in so they can be re-processed
   * once we transition to the 'waiting-for-interactive' state
   * otherwise we might miss out on spans that are relevant to calculating the interactive
   *
   * if we have long tasks before FMP, we want to use them as a potential grouping post FMP.
   */
  debouncingSpanBuffer: SpanAndAnnotation<AllPossibleScopesT>[] = []
  #provisionalBuffer: SpanAndAnnotation<AllPossibleScopesT>[] = []

  // eslint-disable-next-line consistent-return
  #processProvisionalBuffer(): Transition<AllPossibleScopesT> | void {
    // process items in the buffer (stick the scope in the entries) (if its empty, well we can skip this!)
    let span: SpanAndAnnotation<AllPossibleScopesT> | undefined
    // eslint-disable-next-line no-cond-assign
    while ((span = this.#provisionalBuffer.shift())) {
      const transition = this.emit('onProcessSpan', span)
      if (transition) return transition
    }
  }

  readonly states = {
    draft: {
      onEnterState: () => {
        this.setGlobalDeadline(
          this.context.input.startTime.epoch +
            this.context.definition.variantsByOriginatedFrom[
              this.context.input.originatedFrom
            ]!.timeoutDuration,
        )
      },

      onActive: () => ({
        transitionToState: 'active',
      }),

      onProcessSpan: (
        spanAndAnnotation: SpanAndAnnotation<AllPossibleScopesT>,
      ) => {
        const spanEndTimeEpoch =
          spanAndAnnotation.span.startTime.epoch +
          spanAndAnnotation.span.duration

        if (spanEndTimeEpoch > this.#timeoutDeadline) {
          // we consider this interrupted, because of the clamping of the total duration of the operation
          // as potential other events could have happened and prolonged the operation
          // we can be a little picky, because we expect to record many operations
          // it's best to compare like-to-like
          return {
            transitionToState: 'interrupted',
            interruptionReason: 'timeout',
          }
        }

        // if the entry matches any of the interruptOn criteria,
        // transition to complete state with the 'matched-on-interrupt' interruptionReason
        if (this.context.definition.interruptOn) {
          for (const doesSpanMatch of this.context.definition.interruptOn) {
            if (doesSpanMatch(spanAndAnnotation, this.context)) {
              return {
                transitionToState: 'complete',
                interruptionReason: 'matched-on-interrupt',
                lastRequiredSpanAndAnnotation: this.lastRequiredSpan,
                completeSpanAndAnnotation: this.completeSpan,
              }
            }
          }
        }

        // else, add into array buffer
        this.#provisionalBuffer.push(spanAndAnnotation)
        return undefined
      },

      onInterrupt: (reason: TraceInterruptionReason) => ({
        transitionToState: 'interrupted',
        interruptionReason: reason,
      }),

      onDeadline: (deadlineType: DeadlineType) => {
        if (deadlineType === 'global') {
          return {
            transitionToState: 'interrupted',
            interruptionReason: 'timeout',
          }
        }
        // other cases should never happen
        return undefined
      },
    },
    active: {
      onEnterState: (_transition: OnEnterActive) => {
        const nextTransition = this.#processProvisionalBuffer()
        if (nextTransition) return nextTransition

        return undefined
      },

      onProcessSpan: (
        spanAndAnnotation: SpanAndAnnotation<AllPossibleScopesT>,
      ) => {
        const spanEndTimeEpoch =
          spanAndAnnotation.span.startTime.epoch +
          spanAndAnnotation.span.duration

        if (spanEndTimeEpoch > this.#timeoutDeadline) {
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

        for (let i = 0; i < this.context.definition.requiredSpans.length; i++) {
          if (!this.requiredSpansIndexChecklist.has(i)) {
            // we previously checked off this index
            // eslint-disable-next-line no-continue
            continue
          }

          const doesSpanMatch = this.context.definition.requiredSpans[i]!
          if (doesSpanMatch(spanAndAnnotation, this.context)) {
            // remove the index of this definition from the list of requiredSpans
            this.requiredSpansIndexChecklist.delete(i)

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

        this.sideEffectFns.addSpanToRecording(spanAndAnnotation)

        if (this.requiredSpansIndexChecklist.size === 0) {
          return { transitionToState: 'debouncing' }
        }
        return undefined
      },

      onInterrupt: (reason: TraceInterruptionReason) => ({
        transitionToState: 'interrupted',
        interruptionReason: reason,
      }),

      onDeadline: (deadlineType: DeadlineType) => {
        if (deadlineType === 'global') {
          return {
            transitionToState: 'interrupted',
            interruptionReason: 'timeout',
          }
        }
        // other cases should never happen
        return undefined
      },
    },

    // we enter the debouncing state once all requiredSpans entries have been seen
    // it is necessary due to the nature of React rendering,
    // as even once we reach the visually complete state of a component,
    // the component might continue to re-render
    // and change the final visual output of the component
    // we want to ensure the end of the operation captures
    // the final, settled state of the component
    debouncing: {
      onEnterState: (_payload: OnEnterDebouncing) => {
        if (!this.lastRelevant) {
          // this should never happen
          return {
            transitionToState: 'interrupted',
            interruptionReason: 'invalid-state-transition',
          }
        }

        this.lastRequiredSpan = this.lastRelevant
        this.lastRequiredSpan.annotation.markedRequirementsMet = true

        if (!this.context.definition.debounceOn) {
          return { transitionToState: 'waiting-for-interactive' }
        }
        // set the first debounce deadline
        this.setDeadline(
          'debounce',
          this.lastRelevant.span.startTime.epoch +
            this.lastRelevant.span.duration +
            (this.context.definition.debounceDuration ??
              DEFAULT_DEBOUNCE_DURATION),
        )

        return undefined
      },

      onDeadline: (deadlineType: DeadlineType) => {
        if (deadlineType === 'global') {
          return {
            transitionToState: 'interrupted',
            interruptionReason: 'timeout',
          }
        }
        if (deadlineType === 'debounce') {
          return {
            transitionToState: 'waiting-for-interactive',
          }
        }
        // other cases should never happen
        return undefined
      },

      onProcessSpan: (
        spanAndAnnotation: SpanAndAnnotation<AllPossibleScopesT>,
      ) => {
        const spanEndTimeEpoch =
          spanAndAnnotation.span.startTime.epoch +
          spanAndAnnotation.span.duration
        if (spanEndTimeEpoch > this.#timeoutDeadline) {
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

        if (spanEndTimeEpoch > this.#debounceDeadline) {
          // done debouncing
          this.sideEffectFns.addSpanToRecording(spanAndAnnotation)
          return { transitionToState: 'waiting-for-interactive' }
        }

        const { span } = spanAndAnnotation

        // even though we satisfied all the requiredSpans conditions in the recording state,
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
          for (const doesSpanMatch of this.context.definition.requiredSpans) {
            if (
              doesSpanMatch(idleRegressionCheckSpan, this.context) &&
              doesSpanMatch.isIdle
            ) {
              // check if we regressed on "isIdle", and if so, transition to interrupted with reason
              return {
                transitionToState: 'interrupted',
                interruptionReason: 'idle-component-no-longer-idle',
              }
            }
          }
        }

        this.sideEffectFns.addSpanToRecording(spanAndAnnotation)

        // does span satisfy any of the "debouncedOn" and if so, restart our debounce timer
        if (this.context.definition.debounceOn) {
          for (const doesSpanMatch of this.context.definition.debounceOn) {
            if (doesSpanMatch(spanAndAnnotation, this.context)) {
              // Sometimes spans are processed out of order, we update the lastRelevant if this span ends later
              if (
                spanAndAnnotation.annotation.operationRelativeEndTime >
                (this.lastRelevant?.annotation.operationRelativeEndTime ?? 0)
              ) {
                this.lastRelevant = spanAndAnnotation

                // update the debounce timer relative from the time of the span end
                // (not from the time of processing of the event, because it may be asynchronous)
                this.setDeadline(
                  'debounce',
                  this.lastRelevant.span.startTime.epoch +
                    this.lastRelevant.span.duration +
                    (this.context.definition.debounceDuration ??
                      DEFAULT_DEBOUNCE_DURATION),
                )
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
      onEnterState: (_payload: OnEnterWaitingForInteractive) => {
        if (!this.lastRelevant) {
          // this should never happen
          return {
            transitionToState: 'interrupted',
            interruptionReason: 'invalid-state-transition',
          }
        }

        this.completeSpan = this.lastRelevant
        const interactiveConfig = this.context.definition.captureInteractive
        if (!interactiveConfig) {
          // nothing to do in this state, move to 'complete'
          return {
            transitionToState: 'complete',
            completeSpanAndAnnotation: this.completeSpan,
            lastRequiredSpanAndAnnotation: this.lastRequiredSpan,
          }
        }

        const interruptMillisecondsAfterLastRequiredSpan =
          (typeof interactiveConfig === 'object' &&
            interactiveConfig.timeout) ||
          DEFAULT_INTERACTIVE_TIMEOUT_DURATION

        const lastRequiredSpanEndTimeEpoch =
          this.completeSpan.span.startTime.epoch +
          this.completeSpan.span.duration
        this.setDeadline(
          'interactive',
          lastRequiredSpanEndTimeEpoch +
            interruptMillisecondsAfterLastRequiredSpan,
        )

        this.cpuIdleLongTaskProcessor = createCPUIdleProcessor<
          EntryType<AllPossibleScopesT>
        >(
          {
            entryType: this.completeSpan.span.type,
            startTime: this.completeSpan.span.startTime.now,
            duration: this.completeSpan.span.duration,
            entry: this.completeSpan,
          },
          typeof interactiveConfig === 'object' ? interactiveConfig : {},
        )

        // DECISION: sort the buffer before processing. sorted by end time (spans that end first should be processed first)
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

      onDeadline: (deadlineType: DeadlineType) => {
        if (deadlineType === 'global') {
          return {
            transitionToState: 'complete',
            interruptionReason: 'timeout',
            completeSpanAndAnnotation: this.completeSpan,
            lastRequiredSpanAndAnnotation: this.lastRequiredSpan,
          }
        }
        if (
          deadlineType === 'interactive' ||
          deadlineType === 'next-quiet-window'
        ) {
          const quietWindowCheck =
            this.cpuIdleLongTaskProcessor!.checkIfQuietWindowPassed(
              performance.now(),
            )

          const cpuIdleMatch =
            'firstCpuIdle' in quietWindowCheck && quietWindowCheck.firstCpuIdle

          const cpuIdleTimestamp =
            cpuIdleMatch &&
            cpuIdleMatch.entry.span.startTime.epoch +
              cpuIdleMatch.entry.span.duration

          if (cpuIdleTimestamp && cpuIdleTimestamp <= this.#timeoutDeadline) {
            // if we match the interactive criteria, transition to complete
            // reference https://docs.google.com/document/d/1GGiI9-7KeY3TPqS3YT271upUVimo-XiL5mwWorDUD4c/edit
            return {
              transitionToState: 'complete',
              lastRequiredSpanAndAnnotation: this.lastRequiredSpan,
              completeSpanAndAnnotation: this.completeSpan,
              cpuIdleSpanAndAnnotation: cpuIdleMatch.entry,
            }
          }
          if (deadlineType === 'interactive') {
            // we consider this complete, because we have a complete trace
            // it's just missing the bonus data from when the browser became "interactive"
            return {
              interruptionReason: 'timeout',
              transitionToState: 'complete',
              lastRequiredSpanAndAnnotation: this.lastRequiredSpan,
              completeSpanAndAnnotation: this.completeSpan,
            }
          }

          if ('nextCheck' in quietWindowCheck) {
            // check in the next quiet window
            const nextCheckIn = quietWindowCheck.nextCheck - performance.now()
            this.setDeadline('next-quiet-window', Date.now() + nextCheckIn)
          }
        }
        // other cases should never happen
        return undefined
      },

      onProcessSpan: (
        spanAndAnnotation: SpanAndAnnotation<AllPossibleScopesT>,
      ) => {
        this.sideEffectFns.addSpanToRecording(spanAndAnnotation)

        const quietWindowCheck =
          this.cpuIdleLongTaskProcessor!.processPerformanceEntry({
            entryType: spanAndAnnotation.span.type,
            startTime: spanAndAnnotation.span.startTime.now,
            duration: spanAndAnnotation.span.duration,
            entry: spanAndAnnotation,
          })

        const cpuIdleMatch =
          'firstCpuIdle' in quietWindowCheck && quietWindowCheck.firstCpuIdle

        const cpuIdleTimestamp =
          cpuIdleMatch &&
          cpuIdleMatch.entry.span.startTime.epoch +
            cpuIdleMatch.entry.span.duration

        if (cpuIdleTimestamp && cpuIdleTimestamp <= this.#timeoutDeadline) {
          // if we match the interactive criteria, transition to complete
          // reference https://docs.google.com/document/d/1GGiI9-7KeY3TPqS3YT271upUVimo-XiL5mwWorDUD4c/edit
          return {
            transitionToState: 'complete',
            lastRequiredSpanAndAnnotation: this.lastRequiredSpan,
            completeSpanAndAnnotation: this.completeSpan,
            cpuIdleSpanAndAnnotation: cpuIdleMatch.entry,
          }
        }

        const spanEndTimeEpoch =
          spanAndAnnotation.span.startTime.epoch +
          spanAndAnnotation.span.duration
        if (spanEndTimeEpoch > this.#timeoutDeadline) {
          // we consider this complete, because we have a complete trace
          // it's just missing the bonus data from when the browser became "interactive"
          return {
            transitionToState: 'complete',
            interruptionReason: 'timeout',
            lastRequiredSpanAndAnnotation: this.lastRequiredSpan,
            completeSpanAndAnnotation: this.completeSpan,
          }
        }

        if (spanEndTimeEpoch > this.#interactiveDeadline) {
          // we consider this complete, because we have a complete trace
          // it's just missing the bonus data from when the browser became "interactive"
          return {
            transitionToState: 'complete',
            interruptionReason: 'waiting-for-interactive-timeout',
            lastRequiredSpanAndAnnotation: this.lastRequiredSpan,
            completeSpanAndAnnotation: this.completeSpan,
          }
        }

        // if the entry matches any of the interruptOn criteria,
        // transition to complete state with the 'matched-on-interrupt' interruptionReason
        if (this.context.definition.interruptOn) {
          for (const doesSpanMatch of this.context.definition.interruptOn) {
            if (doesSpanMatch(spanAndAnnotation, this.context)) {
              return {
                transitionToState: 'complete',
                interruptionReason: 'matched-on-interrupt',
                lastRequiredSpanAndAnnotation: this.lastRequiredSpan,
                completeSpanAndAnnotation: this.completeSpan,
              }
            }
          }
        }

        if ('nextCheck' in quietWindowCheck) {
          // check in the next quiet window
          const nextCheckIn = quietWindowCheck.nextCheck - performance.now()
          this.setDeadline('next-quiet-window', Date.now() + nextCheckIn)
        }

        return undefined
      },

      onInterrupt: (reason: TraceInterruptionReason) =>
        // we captured a complete trace, however the interactive data is missing
        ({
          transitionToState: 'complete',
          interruptionReason: reason,
          lastRequiredSpanAndAnnotation: this.lastRequiredSpan,
          completeSpanAndAnnotation: this.completeSpan,
        }),
    },

    // terminal states:
    interrupted: {
      onEnterState: (transition: OnEnterInterrupted) => {
        // terminal state
        this.clearDeadline()
        this.sideEffectFns.prepareAndEmitRecording({
          transition,
          lastRelevantSpanAndAnnotation: undefined,
        })
      },
    },

    complete: {
      onEnterState: (transition: OnEnterComplete<AllPossibleScopesT>) => {
        // terminal state

        this.clearDeadline()

        const { completeSpanAndAnnotation, cpuIdleSpanAndAnnotation } =
          transition

        // Tag the span annotations:
        if (completeSpanAndAnnotation) {
          // mutate the annotation to mark the span as complete
          completeSpanAndAnnotation.annotation.markedComplete = true
        }
        if (cpuIdleSpanAndAnnotation) {
          // mutate the annotation to mark the span as interactive
          cpuIdleSpanAndAnnotation.annotation.markedPageInteractive = true
        }

        this.sideEffectFns.prepareAndEmitRecording({
          transition,
          lastRelevantSpanAndAnnotation: this.lastRelevant,
        })
      },
    },
  } satisfies StatesBase<AllPossibleScopesT>

  /**
   * @returns the last OnEnterState event if a transition was made
   */
  emit<
    EventName extends keyof StateHandlerPayloads<
      TracerScopeKeysT,
      AllPossibleScopesT,
      OriginatedFromT
    >,
  >(
    event: EventName,
    payload: StateHandlerPayloads<
      TracerScopeKeysT,
      AllPossibleScopesT,
      OriginatedFromT
    >[EventName],
  ): OnEnterStatePayload<AllPossibleScopesT> | undefined {
    const currentStateHandlers = this.states[this.currentState] as Partial<
      MergedStateHandlerMethods<
        TracerScopeKeysT,
        AllPossibleScopesT,
        OriginatedFromT
      >
    >
    const transitionPayload = currentStateHandlers[event]?.(payload)
    if (transitionPayload) {
      const transitionFromState = this.currentState as NonTerminalTraceStates
      this.currentState = transitionPayload.transitionToState
      const onEnterStateEvent: OnEnterStatePayload<AllPossibleScopesT> = {
        ...transitionPayload,
        transitionFromState,
      }
      return this.emit('onEnterState', onEnterStateEvent) ?? onEnterStateEvent
    }
    return undefined
  }
}

interface PrepareAndEmitRecordingOptions<AllPossibleScopesT> {
  transition: OnEnterStatePayload<AllPossibleScopesT>
  lastRelevantSpanAndAnnotation:
    | SpanAndAnnotation<AllPossibleScopesT>
    | undefined
}

export class ActiveTrace<
  TracerScopeKeysT extends KeysOfUnion<AllPossibleScopesT>,
  AllPossibleScopesT,
  const OriginatedFromT extends string,
> {
  readonly sourceDefinition: CompleteTraceDefinition<
    TracerScopeKeysT,
    AllPossibleScopesT,
    OriginatedFromT
  >
  /** the mutable definition */
  definition: CompleteTraceDefinition<
    TracerScopeKeysT,
    AllPossibleScopesT,
    OriginatedFromT
  >
  get activeInput(): ActiveTraceConfig<
    TracerScopeKeysT,
    AllPossibleScopesT,
    OriginatedFromT
  > {
    if (!this.input.scope) {
      throw new Error('tried to access input without scope')
    }
    return this.input as ActiveTraceConfig<
      TracerScopeKeysT,
      AllPossibleScopesT,
      OriginatedFromT
    >
  }
  set activeInput(
    value: ActiveTraceConfig<
      TracerScopeKeysT,
      AllPossibleScopesT,
      OriginatedFromT
    >,
  ) {
    this.input = value
  }

  input: DraftTraceInput<
    SelectScopeByKey<TracerScopeKeysT, AllPossibleScopesT>,
    OriginatedFromT
  >
  private readonly traceUtilities: TraceManagerUtilities<AllPossibleScopesT>

  get isDraft() {
    return this.stateMachine.currentState === INITIAL_STATE
  }

  recordedItems: Set<SpanAndAnnotation<AllPossibleScopesT>> = new Set()
  stateMachine: TraceStateMachine<
    TracerScopeKeysT,
    AllPossibleScopesT,
    OriginatedFromT
  >
  occurrenceCounters = new Map<string, number>()
  processedPerformanceEntries: WeakMap<
    PerformanceEntry,
    SpanAndAnnotation<AllPossibleScopesT>
  > = new WeakMap()

  finalState:
    | FinalState<SelectScopeByKey<TracerScopeKeysT, AllPossibleScopesT>>
    | undefined

  constructor(
    definition: CompleteTraceDefinition<
      TracerScopeKeysT,
      AllPossibleScopesT,
      OriginatedFromT
    >,
    input: DraftTraceInput<
      SelectScopeByKey<TracerScopeKeysT, AllPossibleScopesT>,
      OriginatedFromT
    >,
    traceUtilities: TraceManagerUtilities<AllPossibleScopesT>,
  ) {
    this.sourceDefinition = definition
    this.definition = {
      name: definition.name,
      type: definition.type,
      scopes: [...definition.scopes],
      variantsByOriginatedFrom: { ...definition.variantsByOriginatedFrom },

      labelMatching: { ...definition.labelMatching },

      requiredSpans: [...definition.requiredSpans],
      computedSpanDefinitions: [...definition.computedSpanDefinitions],
      computedValueDefinitions: [...definition.computedValueDefinitions],

      interruptOn: definition.interruptOn
        ? [...definition.interruptOn]
        : undefined,
      debounceOn: definition.debounceOn
        ? [...definition.debounceOn]
        : undefined,
      debounceDuration: definition.debounceDuration,
      captureInteractive: definition.captureInteractive
        ? typeof definition.captureInteractive === 'boolean'
          ? definition.captureInteractive
          : { ...definition.captureInteractive }
        : undefined,
      suppressErrorStatusPropagationOn:
        definition.suppressErrorStatusPropagationOn
          ? [...definition.suppressErrorStatusPropagationOn]
          : undefined,
    }
    this.input = {
      ...input,
      startTime: ensureTimestamp(input.startTime),
    }
    this.traceUtilities = traceUtilities
    this.stateMachine = new TraceStateMachine(this)
  }

  sideEffectFns: TraceStateMachineSideEffectHandlers<
    TracerScopeKeysT,
    AllPossibleScopesT
  > = {
    storeFinalizeState: (config) => {
      this.finalState = config
    },
    addSpanToRecording: (spanAndAnnotation) => {
      if (!this.recordedItems.has(spanAndAnnotation)) {
        this.recordedItems.add(spanAndAnnotation)
      }
    },
    prepareAndEmitRecording: ({
      transition,
      lastRelevantSpanAndAnnotation,
    }) => {
      if (
        transition.transitionToState === 'interrupted' ||
        transition.transitionToState === 'complete'
      ) {
        const endOfOperationSpan =
          (transition.transitionToState === 'complete' &&
            (transition.cpuIdleSpanAndAnnotation ??
              transition.completeSpanAndAnnotation)) ||
          lastRelevantSpanAndAnnotation

        const traceRecording = createTraceRecording(
          {
            definition: this.definition,
            // only keep items captured until the endOfOperationSpan
            recordedItems: endOfOperationSpan
              ? [...this.recordedItems].filter(
                  (item) =>
                    item.span.startTime.now + item.span.duration <=
                    endOfOperationSpan.span.startTime.now +
                      endOfOperationSpan.span.duration,
                )
              : [...this.recordedItems],
            input: this.input,
          },
          transition,
        )
        this.onEnd(traceRecording)

        // memory clean-up in case something retains the ActiveTrace instance
        this.recordedItems.clear()
        this.occurrenceCounters.clear()
        this.processedPerformanceEntries = new WeakMap()
        this.traceUtilities.performanceEntryDeduplicationStrategy?.reset()
      }
    },
  }

  onEnd(
    traceRecording: TraceRecording<TracerScopeKeysT, AllPossibleScopesT>,
  ): void {
    // @ts-expect-error TS isn't smart enough to disambiguate this situation yet; maybe in the future this will work OOTB
    this.traceUtilities.cleanupActiveTrace(this)
    ;(
      this.traceUtilities.reportFn as SingleTraceReportFn<
        TracerScopeKeysT,
        AllPossibleScopesT,
        OriginatedFromT
      >
    )(traceRecording, this)
  }

  // this is public API only and should not be called internally
  interrupt(reason: TraceInterruptionReason) {
    this.stateMachine.emit('onInterrupt', reason)
  }

  transitionDraftToActive(
    inputAndDefinitionModifications: TraceModifications<
      TracerScopeKeysT,
      AllPossibleScopesT,
      OriginatedFromT
    >,
  ) {
    const { attributes } = this.input

    this.activeInput = {
      ...this.input,
      scope: inputAndDefinitionModifications.scope,
      attributes: {
        ...this.input.attributes,
        ...attributes,
      },
    }

    const additionalRequiredSpans = convertMatchersToFns<
      TracerScopeKeysT,
      AllPossibleScopesT,
      OriginatedFromT
    >(inputAndDefinitionModifications.additionalRequiredSpans)

    const additionalDebounceOnSpans = convertMatchersToFns<
      TracerScopeKeysT,
      AllPossibleScopesT,
      OriginatedFromT
    >(inputAndDefinitionModifications.additionalDebounceOnSpans)

    const { definition } = this
    if (additionalRequiredSpans?.length) {
      definition.requiredSpans = [
        ...this.sourceDefinition.requiredSpans,
        ...additionalRequiredSpans,
      ] as (typeof definition)['requiredSpans']
    }
    if (additionalDebounceOnSpans?.length) {
      definition.debounceOn = [
        ...(this.sourceDefinition.debounceOn ?? []),
        ...additionalDebounceOnSpans,
      ] as (typeof definition)['debounceOn']
    }

    this.stateMachine.emit('onActive', undefined)
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
    // TODO: also ignore events that started a long long time before the trace started

    // check if the performanceEntry has already been processed
    // a single performanceEntry can have Spans created from it multiple times
    // we allow this in case the Span comes from different contexts
    // currently the version of the Span wins,
    // but we could consider creating some customizable logic
    // re-processing the same span should be safe
    const existingAnnotation =
      (span.performanceEntry &&
        this.processedPerformanceEntries.get(span.performanceEntry)) ??
      this.traceUtilities.performanceEntryDeduplicationStrategy?.findDuplicate(
        span,
        this.recordedItems,
      )

    let spanAndAnnotation: SpanAndAnnotation<AllPossibleScopesT>

    if (existingAnnotation) {
      spanAndAnnotation = existingAnnotation
      // update the span in the recording using the strategy's selector
      spanAndAnnotation.span =
        this.traceUtilities.performanceEntryDeduplicationStrategy?.selectPreferredSpan(
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
        labels: [],
      }

      spanAndAnnotation = {
        span,
        annotation,
      }

      this.traceUtilities.performanceEntryDeduplicationStrategy?.recordSpan(
        span,
        spanAndAnnotation,
      )
    }

    // make sure the labels are up-to-date
    spanAndAnnotation.annotation.labels = this.getSpanLabels(spanAndAnnotation)

    const transition = this.stateMachine.emit(
      'onProcessSpan',
      spanAndAnnotation,
    )

    const shouldRecord =
      !transition || transition.transitionToState !== 'interrupted'

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
      ([label, doesSpanMatch]) => {
        if (doesSpanMatch(span, context)) {
          labels.push(label)
        }
      },
    )

    return labels
  }
}

export type AllPossibleActiveTraces<
  ForEachPossibleScopeT,
  AllPossibleScopesT = ForEachPossibleScopeT,
> = ForEachPossibleScopeT extends ForEachPossibleScopeT
  ? ActiveTrace<
      KeysOfUnion<ForEachPossibleScopeT> & KeysOfUnion<AllPossibleScopesT>,
      AllPossibleScopesT,
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      any
    >
  : never
