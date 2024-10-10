// import { Trace } from './Trace'
import type {
  CompleteTraceDefinition,
  ComputedSpanDefinition,
  ComputedValueDefinition,
  EntryAnnotation,
  EntryMatchCriteria,
  EntryType,
  ITraceManager,
  ScopeBase,
  StartTraceInput,
  TraceDefinition,
  TraceEntryInput,
  TraceManagerConfig,
  Tracer,
  TraceRecording,
} from './types'

/**
 * Class representing the centralized trace performance manager.
 */
export class TraceManager<ScopeT extends ScopeBase>
  implements ITraceManager<ScopeT>
{
  private readonly reportFn: (
    trace: TraceRecording<ScopeT>,
    entries: TraceEntryInput<ScopeT>,
  ) => void
  private readonly embeddedEntryTypes: EntryType[]
  private readonly generateId: () => string

  constructor({
    reportFn,
    embeddedEntryTypes,
    generateId,
  }: TraceManagerConfig<ScopeT>) {
    this.embeddedEntryTypes = embeddedEntryTypes
    this.reportFn = reportFn
    this.generateId = generateId
  }

  createTracer(traceDefinition: TraceDefinition<ScopeT>): Tracer<ScopeT> {
    const computedSpanDefinitions: ComputedSpanDefinition<ScopeT>[] = []
    const computedValueDefinitions: ComputedValueDefinition<
      ScopeT,
      EntryMatchCriteria<ScopeT>[]
    >[] = []
    const completeTraceDefiniton: CompleteTraceDefinition<ScopeT> = {
      ...traceDefinition,
      computedSpanDefinitions,
      computedValueDefinitions,
    }

    return {
      defineComputedSpan: (definition) => {
        computedSpanDefinitions.push(definition)
      },
      defineComputedValue: (definition) => {
        computedValueDefinitions.push(
          definition as ComputedValueDefinition<
            ScopeT,
            EntryMatchCriteria<ScopeT>[]
          >,
        )
      },
      start: (input) => this.startTrace(completeTraceDefiniton, input),
    }
  }

  processEntry(entry: TraceEntryInput<ScopeT>): EntryAnnotation {
    return {}
  }

  private startTrace(
    definition: CompleteTraceDefinition<ScopeT>,
    input: StartTraceInput<ScopeT>,
  ): string {
    const id = input.id ?? this.generateId()

    // TODO: implement

    return id
  }
}
