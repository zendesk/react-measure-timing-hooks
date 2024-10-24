// import { Trace } from './Trace'
import { ActiveTrace } from './ActiveTrace'
import { ensureTimestamp } from './ensureTimestamp'
import type {
  CompleteTraceDefinition,
  ComputedSpanDefinition,
  ComputedValueDefinition,
  ReportFn,
  ScopeBase,
  StartTraceConfig,
  TraceDefinition,
  TraceEntry,
  TraceEntryAnnotationRecord,
  TraceEntryMatchCriteria,
  TraceManagerConfig,
  Tracer,
  TraceRecording,
} from './types'

/**
 * Class representing the centralized trace performance manager.
 */
export class TraceManager<ScopeT extends ScopeBase> {
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
      TraceEntryMatchCriteria<ScopeT>[]
    >[] = []
    const completeTraceDefinition: CompleteTraceDefinition<ScopeT> = {
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
            TraceEntryMatchCriteria<ScopeT>[]
          >,
        )
      },
      start: (input) => this.startTrace(completeTraceDefinition, input),
    }
  }

  // if no active trace, return or maybe buffer?
  processEntry(
    // TODO: figure out where to call mapPerformanceEntryToTraceEntry
    entry: TraceEntry<ScopeT>
  ): TraceEntryAnnotationRecord | undefined {
    return this.activeTrace?.processEntry(entry)
  }

  private startTrace(
    definition: CompleteTraceDefinition<ScopeT>,
    input: StartTraceConfig<ScopeT>,
  ): string {
    if (this.activeTrace) {
      this.activeTrace.interrupt('another-trace-started')
      this.activeTrace = undefined
    }

    const id = input.id ?? this.generateId()

    const onEnd = (traceRecording: TraceRecording<ScopeT>) => {
      if (id === this.activeTrace?.input.id) {
        this.activeTrace = undefined
      }
      this.reportFn(traceRecording)
    }

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
