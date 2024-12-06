import { ActiveTrace } from './ActiveTrace'
import { convertMatchersToFns, ensureMatcherFn } from './ensureMatcherFn'
import { ensureTimestamp } from './ensureTimestamp'
import { type SpanMatcherFn } from './matchSpan'
import type { SpanAnnotationRecord } from './spanAnnotationTypes'
import type { Span, StartTraceConfig } from './spanTypes'
import type { TraceRecording } from './traceRecordingTypes'
import type {
  CompleteTraceDefinition,
  ComputedSpanDefinition,
  ComputedValueDefinition,
  ReportFn,
  ScopeBase,
  TraceDefinition,
  TraceManagerConfig,
  Tracer,
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
      SpanMatcherFn<ScopeT>[]
    >[] = []

    const requiredToEnd = convertMatchersToFns<ScopeT>(
      traceDefinition.requiredToEnd,
    )

    if (!requiredToEnd) {
      throw new Error(
        'requiredToEnd must be defined, as a trace will never end otherwise',
      )
    }

    const debounceOn = convertMatchersToFns<ScopeT>(traceDefinition.debounceOn)
    const interruptOn = convertMatchersToFns<ScopeT>(
      traceDefinition.interruptOn,
    )

    const suppressErrorStatusPropagationOn = convertMatchersToFns<ScopeT>(
      traceDefinition.suppressErrorStatusPropagationOn,
    )

    const completeTraceDefinition: CompleteTraceDefinition<ScopeT> = {
      ...traceDefinition,
      requiredToEnd,
      debounceOn,
      interruptOn,
      suppressErrorStatusPropagationOn,
      computedSpanDefinitions,
      computedValueDefinitions,
    }

    return {
      defineComputedSpan: (definition) => {
        computedSpanDefinitions.push({
          ...definition,
          startSpan: ensureMatcherFn(definition.startSpan),
          endSpan: ensureMatcherFn(definition.endSpan),
        })
      },
      defineComputedValue: (definition) => {
        computedValueDefinitions.push({
          ...definition,
          matches: definition.matches.map((m) => ensureMatcherFn(m)),
        } as ComputedValueDefinition<ScopeT, SpanMatcherFn<ScopeT>[]>)
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
