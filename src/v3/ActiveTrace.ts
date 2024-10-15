/* eslint-disable @typescript-eslint/consistent-indexed-object-style */
/* eslint-disable max-classes-per-file */
import { doesEntryMatchDefinition } from './doesEntryMatchDefinition'
import { ensureTimestamp } from './ensureTimestamp'
import type {
  ActiveTraceConfig,
  CompleteTraceDefinition,
  ScopeBase,
  Timestamp,
  TraceEntry,
  TraceEntryAndAnnotation,
  TraceEntryAnnotation,
  TraceEntryAnnotationRecord,
  TraceInterruptionReason,
  TraceRecording,
} from './types'
import type {
  DistributiveOmit,
  MergedStateHandlerMethods,
  StateHandlerPayloads,
} from './typeUtils'

interface CreateTraceRecordingConfig {
  transitionFromState: NonTerminalTraceStates
  interruptionReason?: TraceInterruptionReason
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

interface OnEnterComplete {
  transitionToState: 'complete'
  transitionFromState: NonTerminalTraceStates
  interruptionReason?: TraceInterruptionReason
}

interface OnEnterWaitingForInteractive {
  transitionToState: 'waiting-for-interactive'
  transitionFromState: NonTerminalTraceStates
}

interface OnEnterDebouncing {
  transitionToState: 'debouncing'
  transitionFromState: NonTerminalTraceStates
}

type OnEnterStatePayload =
  | OnEnterInterrupted
  | OnEnterComplete
  | OnEnterDebouncing
  | OnEnterWaitingForInteractive

export type Transition = DistributiveOmit<
  OnEnterStatePayload,
  'transitionFromState'
>

type FinalizeFn = (config: CreateTraceRecordingConfig) => void

export type States<ScopeT extends ScopeBase> =
  TraceStateMachine<ScopeT>['states']

interface StateHandlersBase {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  [handler: string]: (payload: any) => void | undefined | Transition
}

type StatesBase = Record<TraceStates, StateHandlersBase>

type TraceStateMachineSideEffectHandlers =
  TraceStateMachine<ScopeBase>['sideEffectFns']

export class TraceStateMachine<ScopeT extends ScopeBase> {
  readonly context: {
    readonly definition: CompleteTraceDefinition<ScopeT>
    readonly input: Omit<ActiveTraceConfig<ScopeT>, 'onEnd'>
    readonly requiredToEndIndexChecklist: Set<number>
  }
  readonly sideEffectFns: {
    readonly finalize: FinalizeFn
  }
  currentState: TraceStates = 'recording'
  readonly states = {
    recording: {
      onProcessEntry: ({
        entry,
        annotation,
      }: TraceEntryAndAnnotation<ScopeT>) => {
        // does trace entry satisfy any of the "interruptOn" definitions
        if (this.context.definition.interruptOn) {
          for (const definition of this.context.definition.interruptOn) {
            if (doesEntryMatchDefinition(entry, definition)) {
              // TODO: should we somehow nullify the annotation?
              // I'm thinking the interrupted-on events should not be annotated
              return {
                transitionToState: 'interrupted',
                interruptionReason: 'matched-on-interrupt',
              }
            }
          }
        }

        for (let i = 0; i < this.context.definition.requiredToEnd.length; i++) {
          const definition = this.context.definition.requiredToEnd[i]!
          if (doesEntryMatchDefinition(entry, definition)) {
            // remove the index of this definition from the list of requiredToEnd
            this.context.requiredToEndIndexChecklist.delete(i)
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

      onTimeout: () => ({
        transitionToState: 'interrupted',
        interruptionReason: 'timeout',
      }),
    },

    debouncing: {
      onEnterState: (payload: OnEnterDebouncing) => {
        // TODO: start debouncing timeout
        //
      },

      onProcessEntry: (entryAndAnnotation: TraceEntryAndAnnotation<ScopeT>) => {
        for (const definition of this.context.definition.requiredToEnd) {
          const { entry } = entryAndAnnotation
          if (
            doesEntryMatchDefinition(entryAndAnnotation, definition) &&
            definition.isIdle &&
            'isIdle' in entry &&
            entry.isIdle
          ) {
            // check if we regressed on "isIdle", and if so, transition to interrupted with reason
            return {
              transitionToState: 'interrupted',
              interruptionReason: 'idle-component-no-longer-idle',
            }
          }
        }

        // does trace entry satisfy any of the "debouncedOn" and if so, restart our debounce timer
        if (this.context.definition.debounceOn) {
          for (const definition of this.context.definition.debounceOn) {
            if (doesEntryMatchDefinition(entryAndAnnotation, definition)) {
              // TODO: (re)start debounce timer

              return undefined
            }
          }
        }
        return undefined
      },

      onTimerExpired: () => {
        if (this.context.definition.captureInteractive) {
          return { transitionToState: 'waiting-for-interactive' }
        }
        return { transitionToState: 'complete' }
      },

      onInterrupt: (reason: TraceInterruptionReason) => ({
        transitionToState: 'interrupted',
        interruptionReason: reason,
      }),

      onTimeout: () => ({
        transitionToState: 'interrupted',
        interruptionReason: 'timeout',
      }),
    },

    'waiting-for-interactive': {
      onEnterState: (payload: OnEnterWaitingForInteractive) => {},

      onProcessEntry: (entryAndAnnotation: TraceEntryAndAnnotation<ScopeT>) => {
        // here we only debounce on longtasks and long-animation-frame
        // if the entry matches any of the interruptOn criteria, transition to interrupted state with the 'matched-on-interrupt'
      },

      onTimerExpired: () =>
        // no more long tasks or long animation frames, transition to complete
        ({ transitionToState: 'complete' }),

      onInterrupt: (reason: TraceInterruptionReason) =>
        // we captured a complete trace, however the interactive data is missing
        ({ transitionToState: 'complete', interruptionReason: reason }),

      onTimeout: () => ({
        transitionToState: 'complete',
        interruptionReason: 'timeout',
      }),
    },

    // terminal states:
    interrupted: {
      onEnterState: (payload: OnEnterInterrupted) => {
        this.sideEffectFns.finalize(payload)
      },
    },

    complete: {
      onEnterState: (payload: OnEnterComplete) => {
        this.sideEffectFns.finalize(payload)
      },
    },
  } satisfies StatesBase

  constructor({
    definition,
    input,
    sideEffectFns,
  }: {
    definition: CompleteTraceDefinition<ScopeT>
    input: ActiveTraceConfig<ScopeT>
    sideEffectFns: TraceStateMachineSideEffectHandlers
  }) {
    this.context = {
      definition,
      input,
      requiredToEndIndexChecklist: new Set(
        definition.requiredToEnd.map((_, i) => i),
      ),
    }
    this.sideEffectFns = sideEffectFns
  }

  /**
   * @returns the last OnEnterState event if a transition was made
   */
  emit<EventName extends keyof StateHandlerPayloads<ScopeT>>(
    event: EventName,
    payload: StateHandlerPayloads<ScopeT>[EventName],
  ): OnEnterStatePayload | undefined {
    const currentStateHandlers = this.states[this.currentState] as Partial<
      MergedStateHandlerMethods<ScopeT>
    >
    const transitionPayload = currentStateHandlers[event]?.(payload)
    if (transitionPayload) {
      const transitionFromState = this.currentState as NonTerminalTraceStates
      this.currentState = transitionPayload.transitionToState
      const onEnterStateEvent: OnEnterStatePayload = {
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

  recordedItems: TraceEntryAndAnnotation<ScopeT>[] = []
  stateMachine: TraceStateMachine<ScopeT>
  startTime: Timestamp
  occurrenceCounters = new Map<string, number>()

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

  finalize = (config: CreateTraceRecordingConfig) => {
    const traceRecording = this.createTraceRecording(config)
    this.input.onEnd(traceRecording)
  }

  // this is public API only and should not be called internally
  interrupt(reason: TraceInterruptionReason) {
    this.stateMachine.emit('onInterrupt', reason)
  }

  processEntry(
    entry: TraceEntry<ScopeT>,
  ): TraceEntryAnnotationRecord | undefined {
    // check if valid for this trace:
    if (entry.startTime.now < this.startTime.now) {
      return undefined
    }
    const occurrence = this.occurrenceCounters.get(entry.name) ?? 1
    this.occurrenceCounters.set(entry.name, occurrence + 1)

    const annotation: TraceEntryAnnotation = {
      id: this.input.id,
      operationRelativeStartTime: entry.startTime.now - this.startTime.now,
      operationRelativeEndTime:
        entry.startTime.now - this.startTime.now + entry.duration,
      occurrence,
    }

    const entryAndAnnotation: TraceEntryAndAnnotation<ScopeT> = {
      entry,
      annotation,
    }

    const lastState = this.stateMachine.emit(
      'onProcessEntry',
      entryAndAnnotation,
    )

    if (lastState?.transitionToState !== 'interrupted') {
      // only record the entry if it was not an interrupting event
      // TODO: think if this is the right place for this logic
      this.recordedItems.push(entryAndAnnotation)

      return {
        [this.definition.name]: annotation,
      }
    }

    return undefined
  }

  private createTraceRecording = ({
    transitionFromState,
    interruptionReason,
  }: CreateTraceRecordingConfig): TraceRecording<ScopeT> => {
    const traceRecording: TraceRecording<ScopeT> = {
      // TODO: use this.input, this.definition and this.entries to create the full trace recording
      interruptionReason,
      // TODO: remove render entries
      entries: this.recordedItems.map(({ entry }) => entry),
    }

    return traceRecording
  }
}

/**
 * Remainder:
 * - finish create trace recording
 * - finish doesEntryMatchDefinition
 * - fill in rest of state machine
 *    - debouncing
 *    -
 * - add testing (we can take a look at v2 tests)
 */
