// import { Trace } from './Trace'
import { ActiveTrace } from './ActiveTrace'
import { ensureTimestamp } from './ensureTimestamp'
import { getSpanFromPerformanceEntry } from './getSpanFromPerformanceEntry'
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

/**
 * The function creates an instance of PerformanceObserver that integrates with a TraceManager to automatically observe 
 * and map specified types of performance entries from the browser's Performance API to trace entries. 
 *
 * @template ScopeT - A generic type that extends ScopeBase, allowing for 
 *                    flexible scope definitions in the TraceManager.
 *
 * @param {TraceManager<ScopeT>} traceManager - An instance of TraceManager 
 *                                               that will handle the processing 
 *                                               of mapped performance entries.
 * @param {string[]} entryTypes - An array of strings specifying the types of 
 *                                performance entries to observe (e.g., 
 *                                ["resource", "navigation"]).
 * 
 * @returns {() => void} A cleanup function that, when called, disconnects the 
 *                       PerformanceObserver, stopping the observation of 
 *                       performance entries.
 */
const observePerformanceWithTraceManager = <ScopeT extends ScopeBase>(traceManager: TraceManager<ScopeT>, entryTypes: string[]) => {

  const observer = new PerformanceObserver((entryList) => {
    entryList.getEntries().forEach((entry) => {
      const traceEntry = getSpanFromPerformanceEntry<ScopeT>(entry)
      if (traceEntry !== undefined) {
        traceManager.processEntry(traceEntry)
      }
    })
  })

  observer.observe({ entryTypes })

  return () => void observer.disconnect()
}

