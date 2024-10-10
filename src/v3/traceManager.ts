// import { Trace } from './Trace'
import { ActiveTrace } from './ActiveTrace'
import { ensureTimestamp } from './ensureTimestamp'
import type {
  CompleteTraceDefinition,
  ComputedSpanDefinition,
  ComputedValueDefinition,
  EntryAnnotation,
  EntryMatchCriteria,
  EntryType,
  ITraceManager,
  ReportFn,
  ScopeBase,
  StartTraceInput,
  TraceDefinition,
  TraceEntry,
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
  private readonly reportFn: ReportFn<ScopeT>
  private readonly generateId: () => string
  private activeTrace: ActiveTrace<ScopeT> | undefined = undefined

  constructor({ reportFn, generateId }: TraceManagerConfig<ScopeT>) {
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

  // if no active trace, return or maybe buffer?
  processEntry(entry: TraceEntry<ScopeT>): EntryAnnotation {
    return {}
  }

  private startTrace(
    definition: CompleteTraceDefinition<ScopeT>,
    input: StartTraceInput<ScopeT>,
  ): string {
    const onEnd = (traceRecording: TraceRecording<ScopeT>) => {
      this.activeTrace = undefined
      this.reportFn(traceRecording)
    }

    const id = input.id ?? this.generateId()

    const activeTrace = new ActiveTrace(definition, {
      ...input,
      startTime: ensureTimestamp(input.startTime),
      id,
      onEnd,
    })

    this.activeTrace = activeTrace

    return id
  }
}
