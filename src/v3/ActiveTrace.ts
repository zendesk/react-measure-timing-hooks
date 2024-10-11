/* eslint-disable @typescript-eslint/consistent-indexed-object-style */

/* eslint-disable @typescript-eslint/no-explicit-any */
/* eslint-disable max-classes-per-file */
import type {
  ActiveTraceConfig,
  CompleteTraceDefinition,
  ScopeBase,
  TraceEntry,
  TraceEntryMatcher,
  TraceInterruptionReason,
  TraceRecording,
} from './types'
import type { DistributiveOmit, Prettify } from './typeUtils'

/**
 * Matches criteria against a performance entry event.
 * @param match - The match criteria or function.
 * @param event - The performance entry event.
 * @returns {boolean} `true` if the event matches the criteria, `false` otherwise.
 */
function doesEntryMatchDefinition<ScopeT extends ScopeBase>(
  entry: TraceEntry<ScopeT>,
  match: TraceEntryMatcher<ScopeT>,
): boolean {
  if (typeof match === 'function') {
    return match(entry)
  }
  const { name, attributes, type } = match
  const nameMatches =
    !name ||
    (typeof name === 'string'
      ? entry.name === name
      : typeof name === 'function'
        ? name(entry.name)
        : name.test(entry.name))
  const typeMatches = !type || entry.type === type
  const attributeMatches =
    !attributes ||
    Boolean(
      entry.attributes &&
        Object.entries(attributes).every(
          ([key, value]) => entry.attributes?.[key] === value,
        ),
    )

  if (match.scope) {
    // TODO
  }

  if (match.isIdle) {
    // TODO (only valid for ComponentRenderTraceEntry)
  }

  return nameMatches && typeMatches && attributeMatches
}

interface CreateTraceRecordingConfig {
  previousState: NonTerminalTraceStates
  interruptionReason?: TraceInterruptionReason
}

type InitialTraceState = 'recording'
type NonTerminalTraceStates =
  | InitialTraceState
  | 'debouncing'
  | 'waiting-for-interactive'
type TerminalTraceStates = 'interrupted' | 'complete'
type TraceStates = NonTerminalTraceStates | TerminalTraceStates

interface OnEnterInterrupted {
  nextState: 'interrupted'
  previousState: NonTerminalTraceStates
  interruptionReason: TraceInterruptionReason
}

interface OnEnterComplete {
  nextState: 'complete'
  previousState: NonTerminalTraceStates
  interruptionReason?: TraceInterruptionReason
}

interface OnEnterWaitingForInteractive {
  nextState: 'waiting-for-interactive'
  previousState: NonTerminalTraceStates
}

interface OnEnterDebouncing {
  nextState: 'debouncing'
  previousState: NonTerminalTraceStates
}

type OnEnterStatePayload =
  | OnEnterInterrupted
  | OnEnterComplete
  | OnEnterDebouncing
  | OnEnterWaitingForInteractive

type Transition = DistributiveOmit<OnEnterStatePayload, 'previousState'>

type FinalizeFn = (config: CreateTraceRecordingConfig) => void

interface StateHandlersBase {
  [handler: string]: (payload: any) => void | undefined | Transition
}

type StatesBase = Record<TraceStates, StateHandlersBase>

type States<ScopeT extends ScopeBase> = TraceStateMachine<ScopeT>['states']

type HandlerToPayloadTuples<
  ScopeT extends ScopeBase,
  State extends TraceStates = TraceStates,
> = State extends State
  ? {
      [K in keyof States<ScopeT>[State]]: States<ScopeT>[State][K] extends (
        ...args: infer ArgsT
      ) => unknown
        ? [K, ArgsT[0]]
        : never
    }[keyof States<ScopeT>[State]]
  : never

type TupleToObject<T extends [PropertyKey, any]> = Prettify<{
  [K in T[0]]: T extends [K, infer V] ? V : never
}>

type StateHandlerPayloads<ScopeT extends ScopeBase> = TupleToObject<
  HandlerToPayloadTuples<ScopeT>
>

type MergedStateHandlerMethods<ScopeT extends ScopeBase> = {
  [K in keyof StateHandlerPayloads<ScopeT>]: (
    payload: StateHandlerPayloads<ScopeT>[K],
  ) => undefined | Transition
}

interface TraceStateMachineSideEffectHandlers {
  readonly finalize: FinalizeFn
}

export class TraceStateMachine<ScopeT extends ScopeBase> {
  context: {
    readonly definition: CompleteTraceDefinition<ScopeT>
    readonly input: Omit<ActiveTraceConfig<ScopeT>, 'onEnd'>
    readonly requiredToEndIndexChecklist: Set<number>
  }
  sideEffects: TraceStateMachineSideEffectHandlers
  currentState: TraceStates = 'recording'
  states = {
    recording: {
      onProcessEntry: (entry: TraceEntry<ScopeT>) => {
        // does trace entry satisfy any of the "interruptOn" definitions
        if (this.context.definition.interruptOn) {
          for (const definition of this.context.definition.interruptOn) {
            if (doesEntryMatchDefinition(entry, definition)) {
              return {
                nextState: 'interrupted',
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
          return { nextState: 'debouncing' }
        }
        return undefined
      },
      onInterrupt: (reason: TraceInterruptionReason) => ({
        nextState: 'interrupted',
        interruptionReason: reason,
      }),
      onTimeout: () => ({
        nextState: 'interrupted',
        interruptionReason: 'timeout',
      }),
    },
    debouncing: {
      onEnterState: (payload: OnEnterDebouncing) => {
        // TODO: start debouncing timeout
        //
      },
      onProcessEntry: (entry: TraceEntry<ScopeT>) => {
        for (const definition of this.context.definition.requiredToEnd) {
          if (
            doesEntryMatchDefinition(entry, definition) &&
            definition.isIdle &&
            'isIdle' in entry &&
            entry.isIdle
          ) {
            // check if we regressed on "isIdle", and if so, transition to interrupted with reason
            return {
              nextState: 'interrupted',
              interruptionReason: 'idle-component-no-longer-idle',
            }
          }
        }

        // does trace entry satisfy any of the "debouncedOn" and if so, restart our debounce timer
        if (this.context.definition.debounceOn) {
          for (const definition of this.context.definition.debounceOn) {
            if (doesEntryMatchDefinition(entry, definition)) {
              // TODO: restart debounce timer

              return undefined
            }
          }
        }
        return undefined
      },
      onInterrupt: (reason: TraceInterruptionReason) => ({
        nextState: 'interrupted',
        interruptionReason: reason,
      }),
      onTimeout: () => ({
        nextState: 'interrupted',
        interruptionReason: 'timeout',
      }),
    },
    'waiting-for-interactive': {
      onEnterState: (payload: OnEnterWaitingForInteractive) => {},
      onProcessEntry: (entry: TraceEntry<ScopeT>) => {
        // here we only debounce on longtasks and long-animation-frame
        // if the entry matches any of the interruptOn criteria, transition to interrupted state with the 'matched-on-interrupt'
      },
      onInterrupt: (reason: TraceInterruptionReason) =>
        // there is a still a complete trace, however the interactive data is missing
        ({ nextState: 'complete', interruptionReason: reason }),
      onTimeout: () => ({
        nextState: 'complete',
        interruptionReason: 'timeout',
      }),
    },

    // terminal states:
    interrupted: {
      onEnterState: (payload: OnEnterInterrupted) => {
        this.sideEffects.finalize(payload)
      },
    },
    complete: {
      onEnterState: (payload: OnEnterComplete) => {
        this.sideEffects.finalize(payload)
      },
    },
  } satisfies StatesBase

  emit<EventName extends keyof StateHandlerPayloads<ScopeT>>(
    event: EventName,
    payload: StateHandlerPayloads<ScopeT>[EventName],
  ) {
    const currentStateHandlers = this.states[this.currentState] as Partial<
      MergedStateHandlerMethods<ScopeT>
    >
    const transition = currentStateHandlers[event]?.(payload)
    if (!transition) return

    const onEnterStateEvent = {
      previousState: this.currentState as NonTerminalTraceStates,
      ...transition,
    }
    this.currentState = transition.nextState
    this.emit('onEnterState', onEnterStateEvent)
  }

  constructor({
    definition,
    input,
    sideEffects,
  }: {
    definition: CompleteTraceDefinition<ScopeT>
    input: ActiveTraceConfig<ScopeT>
    sideEffects: TraceStateMachineSideEffectHandlers
  }) {
    this.context = {
      definition,
      input,
      requiredToEndIndexChecklist: new Set(
        definition.requiredToEnd.map((_, i) => i),
      ),
    }
    this.sideEffects = sideEffects
  }
}

export class ActiveTrace<ScopeT extends ScopeBase> {
  readonly definition: CompleteTraceDefinition<ScopeT>
  readonly input: ActiveTraceConfig<ScopeT>

  entries: TraceEntry<ScopeT>[] = []

  stateMachine: TraceStateMachine<ScopeT>

  constructor(
    definition: CompleteTraceDefinition<ScopeT>,
    input: ActiveTraceConfig<ScopeT>,
  ) {
    this.definition = definition
    this.input = input
    this.stateMachine = new TraceStateMachine({
      definition,
      input,
      sideEffects: {
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

  processEntry(entry: TraceEntry<ScopeT>) {
    this.entries.push(entry)
    this.stateMachine.emit('onProcessEntry', entry)
  }

  private createTraceRecording = ({
    previousState,
    interruptionReason,
  }: CreateTraceRecordingConfig): TraceRecording<ScopeT> => {
    const traceRecording: TraceRecording<ScopeT> = {
      // TODO: use this.input, this.definition and this.entries to create the full trace recording
      interruptionReason,
      entries: this.entries,
    }

    return traceRecording
  }
}
