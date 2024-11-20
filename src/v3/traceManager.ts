import { ActiveTrace } from './ActiveTrace'
import { ensureTimestamp } from './ensureTimestamp'
import { type SpanMatcherFn, fromDefinition } from './matchSpan'
import type { SpanAnnotationRecord } from './spanAnnotationTypes'
import type { Span, StartTraceConfig } from './spanTypes'
import type {
  ComputedSpanDefinition,
  ComputedValueDefinition,
  TraceRecording,
} from './traceRecordingTypes'
import type {
  CompleteTraceDefinition,
  ReportFn,
  ScopeBase,
  TraceDefinition,
  TraceManagerConfig,
  Tracer,
} from './types'
import type { ArrayWithAtLeastOneElement } from './typeUtils'

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
      SpanMatcherFn<ScopeT>[]
    >[] = []
    const requiredToEnd = traceDefinition.requiredToEnd.map(
      (matcherFnOrDefinition) =>
        typeof matcherFnOrDefinition === 'function'
          ? matcherFnOrDefinition
          : fromDefinition(matcherFnOrDefinition),
    ) as ArrayWithAtLeastOneElement<SpanMatcherFn<ScopeT>>
    const debounceOn = traceDefinition.debounceOn?.map(
      (matcherFnOrDefinition) =>
        typeof matcherFnOrDefinition === 'function'
          ? matcherFnOrDefinition
          : fromDefinition(matcherFnOrDefinition),
    ) as ArrayWithAtLeastOneElement<SpanMatcherFn<ScopeT>> | undefined
    const interruptOn = traceDefinition.interruptOn?.map(
      (matcherFnOrDefinition) =>
        typeof matcherFnOrDefinition === 'function'
          ? matcherFnOrDefinition
          : fromDefinition(matcherFnOrDefinition),
    ) as ArrayWithAtLeastOneElement<SpanMatcherFn<ScopeT>> | undefined

    const completeTraceDefinition: CompleteTraceDefinition<ScopeT> = {
      ...traceDefinition,
      requiredToEnd,
      debounceOn,
      interruptOn,
      computedSpanDefinitions,
      computedValueDefinitions,
    }

    // TESTING TODO: Add tests for define computed span and define computed value
    return {
      defineComputedSpan: (definition) => {
        computedSpanDefinitions.push(definition)
      },
      defineComputedValue: (definition) => {
        computedValueDefinitions.push(
          definition as ComputedValueDefinition<
            ScopeT,
            SpanMatcherFn<ScopeT>[]
          >,
        )
      },
      start: (input) => this.startTrace(completeTraceDefinition, input),
    }
  }

  processSpan(span: Span<ScopeT>): SpanAnnotationRecord | undefined {
    return this.activeTrace?.processSpan(span)
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
