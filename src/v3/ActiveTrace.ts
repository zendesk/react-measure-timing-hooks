import type {
  ActiveTraceInput,
  CompleteTraceDefinition,
  ComponentRenderEntryInput,
  EntryMatchCriteria,
  EntryMatcher,
  ScopeBase,
  TraceEntry,
  TraceInterruptionReason,
  TraceRecording,
} from './types'

export class ActiveTrace<ScopeT extends ScopeBase> {
  readonly definition: CompleteTraceDefinition<ScopeT>
  readonly input: ActiveTraceInput<ScopeT>

  currentState: keyof this['stateMachine'] = 'recording'

  stateMachine = {
    recording: {
      onEntry: (
        entry: TraceEntry<ScopeT> | ComponentRenderEntryInput<ScopeT>,
      ) => {
        // does it satisfy any of the "interruptOn"
        if (this.definition.interruptOn) {
          this.definition.interruptOn.forEach((interruptDefinition) => {
            if (this.doesEntryMatchDefinition(entry, interruptDefinition)) {
              // go to interrupted
            }
          })
        }

        // does it satisfy any of the "requiredToEnd"
        this.definition.requiredToEnd.forEach((endDefinition) => {
          if (this.doesEntryMatchDefinition(entry, endDefinition)) {
            // check this definition of the ending list
          }
        })
      },
      onInterrupt: (reason: TraceInterruptionReason) => {
        this.currentState = 'interrupted'
        this.input.onEnd(this.createTraceRecording(this.currentState, reason))
      },
    },
    debouncing: {
      onEntry: (
        entry: TraceEntry<ScopeT> | ComponentRenderEntryInput<ScopeT>,
      ) => {
        // does it satisfy any of the "debouncedOn"
      },
      onInterrupt: () => {},
    },
    'waiting-for-interactive': {
      onEntry: () => {},
      onInterrupt: () => {},
    },
    interrupted: {
      // no events handled
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

  onEntry(entry: TraceEntry<ScopeT>) {
    this.stateMachine[this.currentState].onEntry?.(entry)
  }

  createTraceRecording(
    currentState: keyof this['stateMachine'],
    reason: TraceInterruptionReason,
  ): TraceRecording<ScopeT> {
    // TODO
    const traceRecording: TraceRecording<ScopeT> = {}

    if (reason) traceRecording.interruptionReason = reason

    return traceRecording
  }

  /**
   * Matches criteria against a performance entry event.
   * @param match - The match criteria or function.
   * @param event - The performance entry event.
   * @returns True if the event matches the criteria, false otherwise.
   */
  private doesEntryMatchDefinition(
    entry: TraceEntry<ScopeT> | ComponentRenderEntryInput<ScopeT>,
    match: EntryMatcher<ScopeT>,
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
      // for key, val in Object.entries(matchCriteria.scope)
      // if entry.scope[key] !== val return false
    }

    return nameMatches && typeMatches && attributeMatches
  }
}
