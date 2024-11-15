/* eslint-disable @typescript-eslint/consistent-indexed-object-style */
/* eslint-disable max-classes-per-file */
import { doesEntryMatchDefinition } from './doesEntryMatchDefinition'
import { ensureTimestamp } from './ensureTimestamp'
import {
  type CPUIdleLongTaskProcessor,
  type PerformanceEntryLike,
  createCPUIdleProcessor,
} from './firstCPUIdle'
import type { ActiveTraceConfig, Span } from './spanTypes'
import type {
  CompleteTraceDefinition,
  TraceRecording,
} from './traceRecordingTypes'
import type {
  ScopeBase,
  SpanAndAnnotationEntry as SpanAndAnnotation,
  SpanAnnotation,
  SpanAnnotationRecord,
  Timestamp,
  TraceInterruptionReason,
} from './types'
import type {
  DistributiveOmit,
  MergedStateHandlerMethods,
  StateHandlerPayloads,
} from './typeUtils'

interface CreateTraceRecordingConfig<ScopeT extends ScopeBase> {
  transitionFromState: NonTerminalTraceStates
  interruptionReason?: TraceInterruptionReason
  cpuIdleSpanAndAnnotation?: SpanAndAnnotation<ScopeT>
  lastRequiredSpanAndAnnotation?: SpanAndAnnotation<ScopeT>
}

type InitialTraceState = 'recording'
type NonTerminalTraceStates =
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

interface OnEnterComplete<ScopeT extends ScopeBase>
  extends CreateTraceRecordingConfig<ScopeT> {
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

type FinalizeFn<ScopeT extends ScopeBase> = (
  config: CreateTraceRecordingConfig<ScopeT>,
) => void

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
    readonly finalize: FinalizeFn<ScopeT>
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
          const definition = this.context.definition.requiredToEnd[i]!
          if (
            doesEntryMatchDefinition(
              spanAndAnnotation,
              definition,
              this.context.input.scope,
            )
          ) {
            // remove the index of this definition from the list of requiredToEnd
            this.context.requiredToEndIndexChecklist.delete(i)

            // Sometimes spans are processed out of order, we update the lastRelevant if this span ends later
            if (
              spanAndAnnotation.annotation.operationRelativeEndTime >
              (this.lastRelevant?.annotation.operationRelativeEndTime ?? 0)
            ) {
              this.lastRelevant = spanAndAnnotation
            }
          }
        }

        console.log(
          '# requiredToEndIndexChecklist',
          this.context.requiredToEndIndexChecklist,
          spanAndAnnotation,
        )
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
        if (!this.context.definition.debounceOn) {
          return { transitionToState: 'waiting-for-interactive' }
        }
        if (this.lastRelevant) {
          // set the first debounce deadline
          this.debounceDeadline =
            this.lastRelevant.span.startTime.epoch +
            this.lastRelevant.span.duration +
            (this.context.definition.debounceDuration ??
              DEFAULT_DEBOUNCE_DURATION)
        }
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
        if (spanEndTimeEpoch > this.debounceDeadline) {
          // done debouncing
          return { transitionToState: 'waiting-for-interactive' }
        }

        for (const definition of this.context.definition.requiredToEnd) {
          const { span } = spanAndAnnotation
          if (
            doesEntryMatchDefinition(
              spanAndAnnotation,
              definition,
              this.context.input.scope,
            ) &&
            definition.isIdle &&
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
          for (const definition of this.context.definition.debounceOn) {
            if (
              doesEntryMatchDefinition(
                spanAndAnnotation,
                definition,
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
        this.lastRequiredSpan = this.lastRelevant
        const interactiveConfig = this.context.definition.captureInteractive
        if (!interactiveConfig) {
          // nothing to do in this state, move to 'complete'
          return {
            transitionToState: 'complete',
            lastRequiredSpanAndAnnotation: this.lastRequiredSpan,
          }
        }

        if (this.lastRequiredSpan) {
          this.interactiveDeadline =
            this.lastRequiredSpan.span.startTime.epoch +
            this.lastRequiredSpan.span.duration +
            ((typeof interactiveConfig === 'object' &&
              interactiveConfig.timeout) ||
              DEFAULT_INTERACTIVE_TIMEOUT_DURATION)
        } else {
          // TODO: do we want an error state? will this condition every be true?
          return { transitionToState: 'complete' }
        }

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

        // TODO: start the timer for tti debouncing
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
          for (const definition of this.context.definition.interruptOn) {
            if (
              doesEntryMatchDefinition(
                spanAndAnnotation,
                definition,
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
      onEnterState: (payload: OnEnterInterrupted) => {
        this.sideEffectFns.finalize(payload)
      },
    },

    complete: {
      onEnterState: (payload: OnEnterComplete<ScopeT>) => {
        console.log('# complete payload', payload)
        this.sideEffectFns.finalize(payload)
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
  startTime: Timestamp
  occurrenceCounters = new Map<string, number>()

  processedPerformanceEntries: WeakMap<
    PerformanceEntry,
    SpanAndAnnotation<ScopeT>
  > = new WeakMap()

  constructor(
    definition: CompleteTraceDefinition<ScopeT>,
    input: ActiveTraceConfig<ScopeT>,
  ) {
    this.definition = definition
    this.input = input
    this.startTime = ensureTimestamp(input.startTime)
    this.stateMachine = new TraceStateMachine({
      definition,
      input,
      sideEffectFns: {
        finalize: this.finalize,
      },
    })
  }

  finalize = (config: CreateTraceRecordingConfig<ScopeT>) => {
    const traceRecording = this.createTraceRecording(config)
    console.log('# recording?', traceRecording)
    this.input.onEnd(traceRecording)
  }

  // this is public API only and should not be called internally
  interrupt(reason: TraceInterruptionReason) {
    this.stateMachine.emit('onInterrupt', reason)
  }

  processSpan(span: Span<ScopeT>): SpanAnnotationRecord | undefined {
    // check if valid for this trace:
    if (span.startTime.now < this.startTime.now) {
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

    if (!existingAnnotation) {
      const occurrence = this.occurrenceCounters.get(span.name) ?? 1
      this.occurrenceCounters.set(span.name, occurrence + 1)

      const annotation: SpanAnnotation = {
        id: this.input.id,
        operationRelativeStartTime: span.startTime.now - this.startTime.now,
        operationRelativeEndTime:
          span.startTime.now - this.startTime.now + span.duration,
        occurrence,
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
    } else {
      spanAndAnnotation = existingAnnotation
      // update the span in the recording
      spanAndAnnotation.span = span
    }

    const transitionPayload = this.stateMachine.emit(
      'onProcessSpan',
      spanAndAnnotation,
    )
    // console.log('transitionPayload', transitionPayload)
    // if the final state is interrupted,
    // we decided that we should not record the entry nor annotate it externally
    // TODO: this if statement needs to be validated/rethought
    if (
      !existingAnnotation &&
      (!transitionPayload ||
        transitionPayload.transitionToState === 'complete' ||
        // TODO: this condition doesn't make sense
        transitionPayload.transitionToState !== 'interrupted')
    ) {
      console.log('# PUSH INTO RECORDED ITEMS', spanAndAnnotation)
      this.recordedItems.push(spanAndAnnotation)
      return {
        [this.definition.name]: spanAndAnnotation.annotation,
      }
    }

    return undefined
  }

  private get computedValues(): TraceRecording<ScopeT>['computedValues'] {
    const computedValues: TraceRecording<ScopeT>['computedValues'] = {}

    this.definition.computedValueDefinitions.forEach((definition) => {
      const { name, matches, computeValueFromMatches } = definition

      const matchingRecordedEntries = this.recordedItems.filter(
        (spanAndAnnotation) =>
          matches.some((matchCriteria) =>
            doesEntryMatchDefinition(
              spanAndAnnotation,
              matchCriteria,
              this.input.scope,
            ),
          ),
      )

      computedValues[name] = computeValueFromMatches(matchingRecordedEntries)
    })

    return computedValues
  }

  // TODO: What if want to have a computed span that is just the offset duration from the start to one event?
  private get computedSpans(): TraceRecording<ScopeT>['computedSpans'] {
    // loop through the computed span definitions, check for entries that match in recorded items. calculate the startoffset and duration
    const computedSpans: TraceRecording<ScopeT>['computedSpans'] = {}

    this.definition.computedSpanDefinitions.forEach((definition) => {
      const { startSpan, endSpan, name } = definition
      const matchingStartEntry = this.recordedItems.find((spanAndAnnotation) =>
        doesEntryMatchDefinition(
          spanAndAnnotation,
          startSpan,
          this.input.scope,
        ),
      )
      const matchingEndEntry = this.recordedItems.find((spanAndAnnotation) =>
        doesEntryMatchDefinition(spanAndAnnotation, endSpan, this.input.scope),
      )

      if (matchingStartEntry && matchingEndEntry) {
        // TODO: is starttime.now correct or should it use epoch? when is each case useful?
        const duration =
          matchingEndEntry.span.startTime.now -
          matchingStartEntry.span.startTime.now

        computedSpans[name] = {
          duration,
          // TODO: might need to consider this as which event happened first and not which one was assumed to be the "start"
          startOffset:
            matchingStartEntry.span.startTime.now - this.startTime.now,
        }
      }
    })

    return computedSpans
  }

  // TODO: Not that useful in its current form
  private get spanAttributes(): TraceRecording<ScopeT>['spanAttributes'] {
    // loop through recorded items, create a entry based on the name
    const spanAttributes: TraceRecording<ScopeT>['spanAttributes'] = {}

    this.recordedItems.forEach(({ span }) => {
      const { attributes, name } = span
      const existingAttributes = spanAttributes[name] ?? {}
      spanAttributes[name] = {
        ...existingAttributes,
        ...attributes,
      }
    })

    return spanAttributes
  }

  // TODO: implementation of gathering Trace level attributes
  private get attributes(): TraceRecording<ScopeT>['attributes'] {
    return {}
  }

  private createTraceRecording = ({
    transitionFromState,
    interruptionReason,
  }: CreateTraceRecordingConfig<ScopeT>): TraceRecording<ScopeT> => {
    const { id, scope } = this.input
    const { name } = this.definition
    const { computedSpans, computedValues, spanAttributes, attributes } = this

    const lastEntry = this.recordedItems.at(-1)
    const anyErrors = this.recordedItems.some(
      ({ span }) => span.status === 'error',
    )
    // TODO: this wont work. we need to keep an end time that is set during the debounce state. Then calc the duration from the diff of that and the start time
    const duration = lastEntry
      ? lastEntry.span.startTime.now - this.startTime.now
      : 0
    return {
      id,
      name,
      scope,
      type: 'operation',
      duration,
      // TODO: TTI times are figured out by logic in state machine and then stored on the class somewhere?
      startTillInteractive: 0, // duration + tti time
      // last entry until the tti?
      completeTillInteractive: 0,
      // ?: If we have any error entries then should we mark the status as 'error'
      status:
        interruptionReason && transitionFromState !== 'waiting-for-interactive'
          ? 'interrupted'
          : anyErrors
            ? 'error'
            : 'ok',
      computedSpans,
      computedValues,
      attributes,
      spanAttributes,
      interruptionReason,
      // TODO: remove render entries (I forgot why this TODO was here... why do we remove the render entries at this point?)
      entries: this.recordedItems.map(({ span }) => span),
    }
  }
}
