import type {
  ActiveTraceInput,
  CompleteTraceDefinition,
  ScopeBase,
  TraceInterruptionReason,
  TraceRecording,
} from './types'

export class ActiveTrace<ScopeT extends ScopeBase> {
  readonly definition: CompleteTraceDefinition<ScopeT>
  readonly input: ActiveTraceInput<ScopeT>

  currentState: keyof this['stateMachine'] = 'recording'

  stateMachine = {
    recording: {
      onEntry: () => {},
      onInterrupt: () => {},
    },
    debouncing: {
      onEntry: () => {},
      onInterrupt: () => {},
    },
    'waiting-for-interactive': {
      onEntry: () => {},
      onInterrupt: () => {},
    },
    interrupted: {
      //
    },
    complete: {
      // no events handled
    },
  }

  constructor(
    definition: CompleteTraceDefinition<ScopeT>,
    input: ActiveTraceInput<ScopeT>,
  ) {
    this.definition = definition
    this.input = input
  }

  interrupt(reason: TraceInterruptionReason) {
    this.stateMachine[this.currentState].onInterrupt?.(reason)
  }

  onEntry(entry) {
    this.stateMachine[this.currentState].onEntry?.(entry)
  }

  createTraceRecording(): TraceRecording<ScopeT> {
    // TODO
  }
}
