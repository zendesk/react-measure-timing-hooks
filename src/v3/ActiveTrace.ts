import type {
  ActiveTraceConfig,
  CompleteTraceDefinition,
  ComponentRenderTraceEntry,
  ScopeBase,
  TraceEntry,
  TraceEntryMatchCriteria,
  TraceEntryMatcher,
  TraceInterruptionReason,
  TraceRecording,
} from './types'

// type OnEntryHandler<ScopeT extends ScopeBase> = (
//   entry: TraceEntry<ScopeT>,
// ) => void
// type OnInterruptHandler = (reason: TraceInterruptionReason) => void
// interface StateWithEventHandlers<ScopeT extends ScopeBase> {
//   onProcessEntry: OnEntryHandler<ScopeT>
//   onInterrupt: OnInterruptHandler
//   onTimeout: () => void
// }

// interface TraceStateMachine<ScopeT extends ScopeBase> {
//   recording: StateWithEventHandlers<ScopeT>
//   debouncing: StateWithEventHandlers<ScopeT>
//   'waiting-for-interactive': StateWithEventHandlers<ScopeT>
//   interrupted: object
//   complete: object
// }

type DistributiveOmit<T, K extends keyof any> = T extends any
  ? Omit<T, K>
  : never

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
  interruptReason: TraceInterruptionReason
}

interface OnEnterComplete {
  nextState: 'complete'
  previousState: NonTerminalTraceStates
  interruptReason?: TraceInterruptionReason
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

type NonInitialStates = Exclude<TraceStates, InitialTraceState>

type StateMachine = ActiveTrace<ScopeBase>['stateMachine']

type UnionToIntersection<U> = (U extends any ? (x: U) => void : never) extends (
  x: infer I,
) => void
  ? I
  : never

type MergedHandlers = UnionToIntersection<StateMachine[TraceStates]>

type AcceptedEvents = Omit<MergedHandlers, never>

type GetFunctionForEvent<EventName extends keyof AcceptedEvents> =
  StateMachine[keyof StateMachine] extends Record<
    EventName,
    (payload: infer Payload) => any
  >
    ? Payload
    : never

type PayloadForOnEnterState = GetFunctionForEvent<'onEnterState'>

type GetEventFunctionTypes<EventName extends keyof AcceptedEvents> =
  AcceptedEvents[EventName]

type FunctionForOnEnterState = GetEventFunctionTypes<'onEnterState'>

type PayloadForEvent<EventName extends keyof AcceptedEvents> = Parameters<
  GetEventFunctionTypes<EventName>
>[0]

type FunctionForEvent<EventName extends keyof AcceptedEvents> = (
  arg: Parameters<GetEventFunctionTypes<EventName>>[0],
) => void

export class ActiveTrace<ScopeT extends ScopeBase> {
  readonly definition: CompleteTraceDefinition<ScopeT>
  readonly input: ActiveTraceConfig<ScopeT>

  currentState: TraceStates = 'recording'
  entries: TraceEntry<ScopeT>[]
  private requiredToEndChecklist: Set<number>

  stateMachine = {
    recording: {
      onProcessEntry: (entry: TraceEntry<ScopeT>) => {
        // does trace entry satisfy any of the "interruptOn" definitions
        if (this.definition.interruptOn) {
          for (const definition of this.definition.interruptOn) {
            if (this.doesEntryMatchDefinition(entry, definition)) {
              this.interrupt('matched-on-interrupt')
              // this.transition({
              //   nextState: 'interrupted',
              //   interruptReason: 'matched-on-interrupt',
              // })
              return
            }
          }
        }

        // should this be satifies ALL (rather than any) of the required to end definitions?
        // does trace entry satisfy any of the "requiredToEnd" definitions
        if (this.definition.requiredToEnd) {
          for (const definition of this.definition.requiredToEnd) {
            if (this.doesEntryMatchDefinition(entry, definition)) {
              //
            }
          }
        }
      },
      onInterrupt: (reason: TraceInterruptionReason) => {
        this.transition({ nextState: 'interrupted', interruptReason: reason })
      },
      onTimeout: () => {
        this.transition({
          nextState: 'interrupted',
          interruptReason: 'timeout',
        })
      },
    },
    debouncing: {
      onEnterState: (payload: OnEnterDebouncing) => {
        // TODO: start debouncing timeout
        //
        this.startDebounceTimer()
      },
      onProcessEntry: (entry: TraceEntry<ScopeT>) => {
        // does trace entry satisfy any of the "debouncedOn" and if so, restart our debounce timer
        if (this.definition.debounceOn) {
          for (const definition of this.definition.debounceOn) {
            if (this.doesEntryMatchDefinition(entry, definition)) {
              this.resetDebounceTimer()
              return
            }
          }
        }

        // checked if we regressed on of the "requiredToEnd", and if so, ______? (are we restarting the debouce timer?)
      },
      onInterrupt: (reason: TraceInterruptionReason) => {
        this.transition({ nextState: 'interrupted', interruptReason: reason })
      },
      onTimeout: () => {
        this.interrupt('timeout')
        // this.transition({
        //   nextState: 'interrupted',
        //   interruptReason: 'timeout',
        // })
      },
    },
    'waiting-for-interactive': {
      onEnterState: (payload: OnEnterWaitingForInteractive) => {},
      onProcessEntry: (entry: TraceEntry<ScopeT>) => {
        // here we only debounce on longtasks and long-animation-frame
        // if the entry matches any of the interruptOn criteria, transition to interrupted state with the 'matched-on-interrupt'
      },
      onInterrupt: (reason: TraceInterruptionReason) => {
        // there is a still a complete trace, however the interactive data is missing
        this.transition({ nextState: 'complete', interruptReason: reason })
      },
      onTimeout: () => {
        this.transition({ nextState: 'complete', interruptReason: 'timeout' })
      },
    },

    // terminal states:
    interrupted: {
      onEnterState: ({
        previousState,
        interruptReason,
      }: OnEnterInterrupted) => {
        // TODO: tiny naming discrepancy here with interruptReason
        this.input.onEnd(
          this.createTraceRecording({
            previousState,
            interruptionReason: interruptReason,
          }),
        )
      },
    },
    complete: {
      onEnterState: ({ previousState }: OnEnterComplete) => {
        this.input.onEnd(this.createTraceRecording({ previousState }))
      },
    },
  }

  constructor(
    definition: CompleteTraceDefinition<ScopeT>,
    input: ActiveTraceConfig<ScopeT>,
  ) {
    this.definition = definition
    this.input = input
    this.entries = []
    this.requiredToEndChecklist = new Set(
      definition.requiredToEnd.map((_, i) => i),
    )
  }

  getCurrentState() {
    return this.stateMachine[this.currentState]
  }

  private interrupt(reason: TraceInterruptionReason) {
    const state = this.getCurrentState()
    if ('onInterrupt' in state) {
      state.onInterrupt?.(reason)
    }
  }

  private processEntry(entry: TraceEntry<ScopeT>) {
    const state = this.getCurrentState()
    if ('onProcessEntry' in state) {
      state.onProcessEntry?.(entry)
    }
  }

  // private transition<NextStateT extends NonInitialStates>(
  //   nextState: NextStateT,
  //   payload: Omit<
  //     Extract<
  //       OnEnterStatePayload,
  //       {
  //         nextState: NextStateT
  //       }
  //     >,
  //     'nextState' | 'previousState'
  //   >,
  // ) {

  private transition(
    payload: DistributiveOmit<OnEnterStatePayload, 'previousState'>,
  ) {
    const { nextState } = payload
    if (nextState === this.currentState) return
    const nextStateObj = this.stateMachine[nextState] as AcceptedEvents
    const previousState = this.currentState as NonTerminalTraceStates
    this.currentState = nextState

    const x: FunctionForEvent<'onEnterState'> = (a) => {
      a.interruptReason
    }

    if ('onEnterState' in nextStateObj) {
      ;(nextStateObj.onEnterState as FunctionForEvent<'onEnterState'>)({
        ...payload,
        previousState,
      })
    }
  }

  private createTraceRecording({
    previousState,
    interruptionReason,
  }: {
    previousState: NonTerminalTraceStates
    interruptionReason?: TraceInterruptionReason
  }): TraceRecording<ScopeT> {
    const traceRecording: TraceRecording<ScopeT> = {
      // TODO
      interruptionReason,
      entries: this.entries,
    }

    return traceRecording
  }

  /**
   * Matches criteria against a performance entry event.
   * @param match - The match criteria or function.
   * @param event - The performance entry event.
   * @returns True if the event matches the criteria, false otherwise.
   */
  private doesEntryMatchDefinition(
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
}
