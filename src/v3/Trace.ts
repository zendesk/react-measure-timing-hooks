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
  createCPUIdleProcessor,
  type PerformanceEntryLike,
} from './firstCPUIdle'
import { getSpanKey } from './getSpanKey'
import { withAllConditions } from './matchSpan'
import { createTraceRecording } from './recordingComputeUtils'
import { requiredSpanWithErrorStatus } from './requiredSpanWithErrorStatus'
import type {
  SpanAndAnnotation,
  SpanAnnotation,
  SpanAnnotationRecord,
} from './spanAnnotationTypes'
import type { ActiveTraceConfig, DraftTraceInput, Span } from './spanTypes'
import type { TraceRecording } from './traceRecordingTypes'
import type {
  CompleteTraceDefinition,
  DraftTraceContext,
  RelationSchemasBase,
  TraceContext,
  TraceDefinitionModifications,
  TraceInterruptionReason,
  TraceInterruptionReasonForInvalidTraces,
  TraceManagerUtilities,
  TraceModifications,
} from './types'
import { INVALID_TRACE_INTERRUPTION_REASONS } from './types'
import type {
  DistributiveOmit,
  MergedStateHandlerMethods,
  StateHandlerPayloads,
} from './typeUtils'

const isInvalidTraceInterruptionReason = (
  reason: TraceInterruptionReason,
): reason is TraceInterruptionReasonForInvalidTraces =>
  (
    INVALID_TRACE_INTERRUPTION_REASONS as readonly TraceInterruptionReason[]
  ).includes(reason)

export interface FinalState<RelationSchemaT> {
  transitionFromState: NonTerminalTraceStates
  interruptionReason?: TraceInterruptionReason
  cpuIdleSpanAndAnnotation?: SpanAndAnnotation<RelationSchemaT>
  completeSpanAndAnnotation?: SpanAndAnnotation<RelationSchemaT>
  lastRequiredSpanAndAnnotation?: SpanAndAnnotation<RelationSchemaT>
}

const INITIAL_STATE = 'draft'
type InitialTraceState = typeof INITIAL_STATE
export type NonTerminalTraceStates =
  | InitialTraceState
  | 'active'
  | 'debouncing'
  | 'waiting-for-interactive'
export const TERMINAL_STATES = ['interrupted', 'complete'] as const
type TerminalTraceStates = (typeof TERMINAL_STATES)[number]
export type TraceStates = NonTerminalTraceStates | TerminalTraceStates

const isTerminalState = (state: TraceStates): state is TerminalTraceStates =>
  (TERMINAL_STATES as readonly TraceStates[]).includes(state)

interface OnEnterActive {
  transitionToState: 'active'
  transitionFromState: NonTerminalTraceStates
}

interface OnEnterInterrupted {
  transitionToState: 'interrupted'
  transitionFromState: NonTerminalTraceStates
  interruptionReason: TraceInterruptionReason
}

interface OnEnterComplete<RelationSchemasT>
  extends FinalState<RelationSchemasT> {
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

type OnEnterStatePayload<RelationSchemasT> =
  | OnEnterActive
  | OnEnterInterrupted
  | OnEnterComplete<RelationSchemasT>
  | OnEnterDebouncing
  | OnEnterWaitingForInteractive

export type Transition<RelationSchemasT> = DistributiveOmit<
  OnEnterStatePayload<RelationSchemasT>,
  'transitionFromState'
>

export type States<
  SelectedRelationNameT extends keyof RelationSchemasT,
  RelationSchemasT,
  VariantsT extends string,
> = TraceStateMachine<
  SelectedRelationNameT,
  RelationSchemasT,
  VariantsT
>['states']

interface StateHandlersBase<RelationSchemasT> {
  [handler: string]: (
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    payload: any,
  ) =>
    | void
    | undefined
    | (Transition<RelationSchemasT> & { transitionFromState?: never })
}

type StatesBase<RelationSchemasT> = Record<
  TraceStates,
  StateHandlersBase<RelationSchemasT>
>

interface TraceStateMachineSideEffectHandlers<RelationSchemasT> {
  readonly addSpanToRecording: (
    spanAndAnnotation: SpanAndAnnotation<RelationSchemasT>,
  ) => void
  readonly prepareAndEmitRecording: (
    options: PrepareAndEmitRecordingOptions<RelationSchemasT>,
  ) => void
}

type EntryType<RelationSchemasT> = PerformanceEntryLike & {
  entry: SpanAndAnnotation<RelationSchemasT>
}

interface StateMachineContext<
  SelectedRelationNameT extends keyof RelationSchemasT,
  RelationSchemasT,
  VariantsT extends string,
> extends DraftTraceContext<
    SelectedRelationNameT,
    RelationSchemasT,
    VariantsT
  > {
  sideEffectFns: TraceStateMachineSideEffectHandlers<RelationSchemasT>
}

type DeadlineType = 'global' | 'debounce' | 'interactive' | 'next-quiet-window'

export class TraceStateMachine<
  SelectedRelationNameT extends keyof RelationSchemasT,
  RelationSchemasT,
  const VariantsT extends string,
> {
  constructor(
    context: StateMachineContext<
      SelectedRelationNameT,
      RelationSchemasT,
      VariantsT
    >,
  ) {
    this.context = context
    this.remainingRequiredSpanIndexes = new Set(
      context.definition.requiredSpans.map((_, i) => i),
    )
    this.emit('onEnterState', undefined)
  }

  readonly remainingRequiredSpanIndexes: Set<number>

  readonly context: StateMachineContext<
    SelectedRelationNameT,
    RelationSchemasT,
    VariantsT
  >
  get sideEffectFns() {
    return this.context.sideEffectFns
  }
  currentState: TraceStates = INITIAL_STATE
  /** the span that ended at the furthest point in time */
  lastRelevant: SpanAndAnnotation<RelationSchemasT> | undefined
  lastRequiredSpan: SpanAndAnnotation<RelationSchemasT> | undefined
  /** it is set once the LRS value is established */
  completeSpan: SpanAndAnnotation<RelationSchemasT> | undefined
  cpuIdleLongTaskProcessor:
    | CPUIdleLongTaskProcessor<EntryType<RelationSchemasT>>
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
  debouncingSpanBuffer: SpanAndAnnotation<RelationSchemasT>[] = []
  #provisionalBuffer: SpanAndAnnotation<RelationSchemasT>[] = []

  // eslint-disable-next-line consistent-return
  #processProvisionalBuffer(): Transition<RelationSchemasT> | void {
    // process items in the buffer (stick the relatedTo in the entries) (if its empty, well we can skip this!)
    let span: SpanAndAnnotation<RelationSchemasT> | undefined
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
            this.context.definition.variants[this.context.input.variant]!
              .timeout,
        )
      },

      onMakeActive: () => ({
        transitionToState: 'active',
      }),

      onProcessSpan: (
        spanAndAnnotation: SpanAndAnnotation<RelationSchemasT>,
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

        // if the entry matches any of the interruptOnSpans criteria,
        // transition to complete state with the 'matched-on-interrupt' interruptionReason
        if (this.context.definition.interruptOnSpans) {
          for (const doesSpanMatch of this.context.definition
            .interruptOnSpans) {
            if (doesSpanMatch(spanAndAnnotation, this.context)) {
              return {
                transitionToState: 'complete',
                interruptionReason: doesSpanMatch.requiredSpan
                  ? 'matched-on-required-span-with-error'
                  : 'matched-on-interrupt',
                lastRequiredSpanAndAnnotation: this.lastRequiredSpan,
                completeSpanAndAnnotation: this.completeSpan,
              }
            }
          }
        }

        // else, add into span buffer
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
        spanAndAnnotation: SpanAndAnnotation<RelationSchemasT>,
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

        // does span satisfy any of the "interruptOnSpans" definitions
        if (this.context.definition.interruptOnSpans) {
          for (const doesSpanMatch of this.context.definition
            .interruptOnSpans) {
            if (doesSpanMatch(spanAndAnnotation, this.context)) {
              return {
                transitionToState: 'interrupted',
                interruptionReason: doesSpanMatch.requiredSpan
                  ? 'matched-on-required-span-with-error'
                  : 'matched-on-interrupt',
              }
            }
          }
        }

        for (let i = 0; i < this.context.definition.requiredSpans.length; i++) {
          if (!this.remainingRequiredSpanIndexes.has(i)) {
            // we previously checked off this index
            // eslint-disable-next-line no-continue
            continue
          }

          const doesSpanMatch = this.context.definition.requiredSpans[i]!
          if (doesSpanMatch(spanAndAnnotation, this.context)) {
            // remove the index of this definition from the list of requiredSpans
            this.remainingRequiredSpanIndexes.delete(i)

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

        if (this.remainingRequiredSpanIndexes.size === 0) {
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

        if (!this.context.definition.debounceOnSpans) {
          return { transitionToState: 'waiting-for-interactive' }
        }
        // set the first debounce deadline
        this.setDeadline(
          'debounce',
          this.lastRelevant.span.startTime.epoch +
            this.lastRelevant.span.duration +
            (this.context.definition.debounceWindow ??
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
        spanAndAnnotation: SpanAndAnnotation<RelationSchemasT>,
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
              doesSpanMatch.idleCheck
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
        if (this.context.definition.debounceOnSpans) {
          for (const doesSpanMatch of this.context.definition.debounceOnSpans) {
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
                    (this.context.definition.debounceWindow ??
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
          EntryType<RelationSchemasT>
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
          ) as Transition<RelationSchemasT> | undefined
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
        spanAndAnnotation: SpanAndAnnotation<RelationSchemasT>,
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

        // if the entry matches any of the interruptOnSpans criteria,
        // transition to complete state with the 'matched-on-interrupt' interruptionReason
        if (this.context.definition.interruptOnSpans) {
          for (const doesSpanMatch of this.context.definition
            .interruptOnSpans) {
            if (doesSpanMatch(spanAndAnnotation, this.context)) {
              return {
                transitionToState: 'complete',
                interruptionReason: doesSpanMatch.requiredSpan
                  ? 'matched-on-required-span-with-error'
                  : 'matched-on-interrupt',
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
        // depending on the reason, if we're coming from draft, we want to flush the provisional buffer:
        if (
          transition.transitionFromState === 'draft' &&
          !isInvalidTraceInterruptionReason(transition.interruptionReason)
        ) {
          let span: SpanAndAnnotation<RelationSchemasT> | undefined
          // eslint-disable-next-line no-cond-assign
          while ((span = this.#provisionalBuffer.shift())) {
            this.sideEffectFns.addSpanToRecording(span)
          }
        }

        // terminal state
        this.clearDeadline()

        if (transition.interruptionReason === 'definition-changed') {
          // do not report if the definition changed
          // this is a special case where the instance is being recreated
          return
        }

        this.sideEffectFns.prepareAndEmitRecording({
          transition,
          lastRelevantSpanAndAnnotation: undefined,
        })
      },
    },

    complete: {
      onEnterState: (transition: OnEnterComplete<RelationSchemasT>) => {
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
  } satisfies StatesBase<RelationSchemasT>

  /**
   * @returns the last OnEnterState event if a transition was made
   */
  emit<
    EventName extends keyof StateHandlerPayloads<
      SelectedRelationNameT,
      RelationSchemasT,
      VariantsT
    >,
  >(
    event: EventName,
    payload: StateHandlerPayloads<
      SelectedRelationNameT,
      RelationSchemasT,
      VariantsT
    >[EventName],
  ): OnEnterStatePayload<RelationSchemasT> | undefined {
    const currentStateHandlers = this.states[this.currentState] as Partial<
      MergedStateHandlerMethods<
        SelectedRelationNameT,
        RelationSchemasT,
        VariantsT
      >
    >
    const transitionPayload = currentStateHandlers[event]?.(payload)
    if (transitionPayload) {
      const transitionFromState = this.currentState as NonTerminalTraceStates
      this.currentState = transitionPayload.transitionToState
      const onEnterStateEvent: OnEnterStatePayload<RelationSchemasT> = {
        ...transitionPayload,
        transitionFromState,
      }
      return this.emit('onEnterState', onEnterStateEvent) ?? onEnterStateEvent
    }
    return undefined
  }
}

interface PrepareAndEmitRecordingOptions<RelationSchemasT> {
  transition: OnEnterStatePayload<RelationSchemasT>
  lastRelevantSpanAndAnnotation: SpanAndAnnotation<RelationSchemasT> | undefined
}

export class Trace<
  const SelectedRelationNameT extends keyof RelationSchemasT,
  const RelationSchemasT extends RelationSchemasBase<RelationSchemasT>,
  const VariantsT extends string,
> implements TraceContext<SelectedRelationNameT, RelationSchemasT, VariantsT>
{
  readonly sourceDefinition: CompleteTraceDefinition<
    SelectedRelationNameT,
    RelationSchemasT,
    VariantsT
  >
  /** the final, mutable definition of this specific trace */
  definition: CompleteTraceDefinition<
    SelectedRelationNameT,
    RelationSchemasT,
    VariantsT
  >
  wasActivated = false
  get activeInput(): ActiveTraceConfig<
    SelectedRelationNameT,
    RelationSchemasT,
    VariantsT
  > {
    if (!this.input.relatedTo) {
      throw new Error(
        "Tried to access trace's activeInput, but the trace was never provided a 'relatedTo' input value",
      )
    }
    return this.input as ActiveTraceConfig<
      SelectedRelationNameT,
      RelationSchemasT,
      VariantsT
    >
  }
  set activeInput(
    value: ActiveTraceConfig<
      SelectedRelationNameT,
      RelationSchemasT,
      VariantsT
    >,
  ) {
    this.input = value
  }

  input: DraftTraceInput<RelationSchemasT[SelectedRelationNameT], VariantsT>
  readonly traceUtilities: TraceManagerUtilities<RelationSchemasT>

  get isDraft() {
    return this.stateMachine.currentState === INITIAL_STATE
  }

  recordedItems: Set<SpanAndAnnotation<RelationSchemasT>> = new Set()
  occurrenceCounters = new Map<string, number>()
  processedPerformanceEntries: WeakMap<
    PerformanceEntry,
    SpanAndAnnotation<RelationSchemasT>
  > = new WeakMap()
  persistedDefinitionModifications: Set<
    TraceDefinitionModifications<
      SelectedRelationNameT,
      RelationSchemasT,
      VariantsT
    >
  > = new Set()
  readonly recordedItemsByLabel: {
    [label: string]: SpanAndAnnotation<RelationSchemasT>[]
  }

  stateMachine: TraceStateMachine<
    SelectedRelationNameT,
    RelationSchemasT,
    VariantsT
  >

  constructor(
    data:
      | {
          definition: CompleteTraceDefinition<
            SelectedRelationNameT,
            RelationSchemasT,
            VariantsT
          >
          input: DraftTraceInput<
            RelationSchemasT[SelectedRelationNameT],
            VariantsT
          >
          traceUtilities: TraceManagerUtilities<RelationSchemasT>
        }
      | {
          definitionModifications: TraceDefinitionModifications<
            SelectedRelationNameT,
            RelationSchemasT,
            VariantsT
          >
          importFrom: Trace<SelectedRelationNameT, RelationSchemasT, VariantsT>
        },
  ) {
    const { input, traceUtilities, definition } =
      'importFrom' in data
        ? {
            input: data.importFrom.input,
            traceUtilities: data.importFrom.traceUtilities,
            definition: data.importFrom.sourceDefinition,
          }
        : data

    this.sourceDefinition = definition

    this.definition = {
      name: definition.name,
      type: definition.type,
      relationSchemaName: definition.relationSchemaName,
      relationSchema: definition.relationSchema,
      variants: definition.variants,
      labelMatching: definition.labelMatching,
      debounceWindow: definition.debounceWindow,

      // below props are potentially mutable elements of the definition, let's make local copies:
      requiredSpans: [...definition.requiredSpans],
      computedSpanDefinitions: { ...definition.computedSpanDefinitions },
      computedValueDefinitions: { ...definition.computedValueDefinitions },

      interruptOnSpans: definition.interruptOnSpans
        ? [...definition.interruptOnSpans]
        : undefined,
      debounceOnSpans: definition.debounceOnSpans
        ? [...definition.debounceOnSpans]
        : undefined,
      captureInteractive: definition.captureInteractive
        ? typeof definition.captureInteractive === 'boolean'
          ? definition.captureInteractive
          : { ...definition.captureInteractive }
        : undefined,
      suppressErrorStatusPropagationOnSpans:
        definition.suppressErrorStatusPropagationOnSpans
          ? [...definition.suppressErrorStatusPropagationOnSpans]
          : undefined,
    }

    // Verify that the variant value is valid
    const variant = definition.variants[input.variant]

    if (variant) {
      this.applyDefinitionModifications(variant)
    } else {
      traceUtilities.reportErrorFn(
        new Error(
          `Invalid variant value: ${
            input.variant
          }. Must be one of: ${Object.keys(definition.variants).join(', ')}`,
        ),
      )
    }

    this.input = {
      ...input,
      startTime: ensureTimestamp(input.startTime),
    }
    this.traceUtilities = traceUtilities

    if ('importFrom' in data) {
      for (const mod of data.importFrom.persistedDefinitionModifications) {
        // re-apply any previously done modifications (in case this isn't the first time we're importing)
        this.applyDefinitionModifications(mod, { persist: true })
      }
      this.applyDefinitionModifications(data.definitionModifications, {
        persist: true,
      })
    }

    // all requiredSpans implicitly interrupt the trace if they error, unless explicitly ignored
    const interruptOnRequiredErrored = this.definition.requiredSpans.flatMap<
      (typeof definition.requiredSpans)[number]
    >((matcher) =>
      matcher.continueWithErrorStatus
        ? []
        : withAllConditions<SelectedRelationNameT, RelationSchemasT, VariantsT>(
            matcher,
            requiredSpanWithErrorStatus<
              SelectedRelationNameT,
              RelationSchemasT,
              VariantsT
            >(),
          ),
    )

    this.definition.interruptOnSpans = [
      ...(this.definition.interruptOnSpans ?? []),
      ...interruptOnRequiredErrored,
    ] as typeof definition.interruptOnSpans

    this.recordedItemsByLabel = Object.fromEntries(
      Object.entries(this.definition.labelMatching ?? {}).map(
        ([label, matcher]) => [
          label,
          [] as SpanAndAnnotation<RelationSchemasT>[],
        ],
      ),
    )

    // definition is now set, we can initialize the state machine
    this.stateMachine = new TraceStateMachine(this)

    if ('importFrom' in data) {
      if (data.importFrom.wasActivated) {
        this.transitionDraftToActive({
          relatedTo: data.importFrom.activeInput.relatedTo,
        })
      }
      // replay the recorded items from the imported trace and copy over cache state
      this.replayItems(data.importFrom.recordedItems)
      this.occurrenceCounters = data.importFrom.occurrenceCounters
      this.processedPerformanceEntries =
        data.importFrom.processedPerformanceEntries
    }
  }

  sideEffectFns: TraceStateMachineSideEffectHandlers<RelationSchemasT> = {
    addSpanToRecording: (spanAndAnnotation) => {
      if (!this.recordedItems.has(spanAndAnnotation)) {
        this.recordedItems.add(spanAndAnnotation)
        for (const label of spanAndAnnotation.annotation.labels) {
          this.recordedItemsByLabel[label]?.push(spanAndAnnotation)
        }
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
            recordedItemsByLabel: this.recordedItemsByLabel,
          },
          transition,
        )
        this.onEnd(traceRecording)

        // memory clean-up in case something retains the Trace instance
        this.recordedItems.clear()
        this.occurrenceCounters.clear()
        this.processedPerformanceEntries = new WeakMap()
        this.traceUtilities.performanceEntryDeduplicationStrategy?.reset()
      }
    },
  }

  onEnd(
    traceRecording: TraceRecording<SelectedRelationNameT, RelationSchemasT>,
  ): void {
    this.traceUtilities.cleanupCurrentTrace(this)
    this.traceUtilities.reportFn(traceRecording, this)
  }

  // this is public API only and should not be called internally
  interrupt(reason: TraceInterruptionReason) {
    this.stateMachine.emit('onInterrupt', reason)
  }

  transitionDraftToActive(
    inputAndDefinitionModifications: TraceModifications<
      SelectedRelationNameT,
      RelationSchemasT,
      VariantsT
    >,
  ) {
    const { attributes } = this.input

    this.activeInput = {
      ...this.input,
      relatedTo: inputAndDefinitionModifications.relatedTo,
      attributes: {
        ...this.input.attributes,
        ...attributes,
      },
    }

    this.applyDefinitionModifications(inputAndDefinitionModifications)

    this.wasActivated = true
    this.stateMachine.emit('onMakeActive', undefined)
  }

  /**
   * The additions to the definition may come from either the variant at transition from draft to active
   * @param definitionModifications
   */
  private applyDefinitionModifications(
    definitionModifications: TraceDefinitionModifications<
      SelectedRelationNameT,
      RelationSchemasT,
      VariantsT
    >,
    { persist = false }: { persist?: boolean } = {},
  ) {
    if (persist) {
      this.persistedDefinitionModifications.add(definitionModifications)
    }

    const { definition } = this
    const additionalRequiredSpans = convertMatchersToFns<
      SelectedRelationNameT,
      RelationSchemasT,
      VariantsT
    >(definitionModifications.additionalRequiredSpans)

    const additionalDebounceOnSpans = convertMatchersToFns<
      SelectedRelationNameT,
      RelationSchemasT,
      VariantsT
    >(definitionModifications.additionalDebounceOnSpans)

    if (additionalRequiredSpans?.length) {
      definition.requiredSpans = [
        ...this.sourceDefinition.requiredSpans,
        ...additionalRequiredSpans,
      ] as (typeof definition)['requiredSpans']
    }
    if (additionalDebounceOnSpans?.length) {
      definition.debounceOnSpans = [
        ...(this.sourceDefinition.debounceOnSpans ?? []),
        ...additionalDebounceOnSpans,
      ] as (typeof definition)['debounceOnSpans']
    }
  }

  /**
   * This is used for importing spans when recreating a Trace from another Trace
   * if the definition was modified
   */
  private replayItems(
    spanAndAnnotations: Set<SpanAndAnnotation<RelationSchemasT>>,
  ) {
    // replay the spans in the order they were processed
    for (const spanAndAnnotation of spanAndAnnotations) {
      const transition = this.stateMachine.emit(
        'onProcessSpan',
        spanAndAnnotation,
      )
      if (transition && isTerminalState(transition.transitionToState)) {
        return
      }
    }
  }

  processSpan(span: Span<RelationSchemasT>): SpanAnnotationRecord | undefined {
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

    let spanAndAnnotation: SpanAndAnnotation<RelationSchemasT>

    if (existingAnnotation) {
      spanAndAnnotation = existingAnnotation
      // update the span in the recording using the strategy's selector
      spanAndAnnotation.span =
        this.traceUtilities.performanceEntryDeduplicationStrategy?.selectPreferredSpan(
          existingAnnotation.span,
          span,
        ) ?? span
    } else {
      const spanKey = getSpanKey(span)
      const occurrence = this.occurrenceCounters.get(spanKey) ?? 1
      this.occurrenceCounters.set(spanKey, occurrence + 1)

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

  private getSpanLabels(span: SpanAndAnnotation<RelationSchemasT>): string[] {
    const labels: string[] = []
    if (!this.definition.labelMatching) return labels

    for (const [label, doesSpanMatch] of Object.entries(
      this.definition.labelMatching,
    )) {
      if (doesSpanMatch(span, this)) {
        labels.push(label)
      }
    }

    return labels
  }
}

export type AllPossibleTraces<
  RelationSchemasT extends RelationSchemasBase<RelationSchemasT>,
> = Trace<
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  any,
  RelationSchemasT,
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  any
>

// TODO: if typescript gets smarter in the future, this would be a better representation of AllPossibleTraces:
// {
//   [SchemaNameT in keyof RelationSchemasT]: Trace<
//     SchemaNameT,
//     RelationSchemasT,
//     VariantsT
//   >
// }[keyof RelationSchemasT]
