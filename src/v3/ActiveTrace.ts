import type {
  ActiveTraceInput,
  CompleteTraceDefinition,
  ScopeBase,
  TraceRecording,
} from './types'

export class ActiveTrace<ScopeT extends ScopeBase> {
  private definition: CompleteTraceDefinition<ScopeT>
  private input: ActiveTraceInput<ScopeT>

  currentState: keyof this['stateMachine'] = 'recording'

  stateMachine = {
    recording: {
      onEvent: () => {},
    },
    debouncing: {},
    'waiting-for-interactive': {},
    interrupted: {},
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

  createTraceRecording(): TraceRecording<ScopeT> {
    // TODO
  }
}
