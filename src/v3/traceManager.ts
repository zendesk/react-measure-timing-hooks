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
  ScopeValue,
  SpanDeduplicationStrategy,
  TraceDefinition,
  TraceManagerConfig,
  Tracer,
} from './types'

/**
 * Class representing the centralized trace performance manager.
 */
export class TraceManager<
  AllPossibleScopesT extends { [K in keyof AllPossibleScopesT]: ScopeValue },
> {
  private readonly reportFn: ReportFn<AllPossibleScopesT, AllPossibleScopesT>
  private readonly generateId: () => string
  private readonly performanceEntryDeduplicationStrategy?: SpanDeduplicationStrategy<
    Partial<AllPossibleScopesT>
  >
  private activeTrace:
    | ActiveTrace<AllPossibleScopesT, AllPossibleScopesT>
    | undefined = undefined

  constructor({
    reportFn,
    generateId,
    performanceEntryDeduplicationStrategy,
  }: TraceManagerConfig<AllPossibleScopesT, AllPossibleScopesT>) {
    this.reportFn = reportFn
    this.generateId = generateId
    this.performanceEntryDeduplicationStrategy =
      performanceEntryDeduplicationStrategy
  }

  createTracer<TracerScopeT extends AllPossibleScopesT>(
    traceDefinition: TraceDefinition<TracerScopeT, AllPossibleScopesT>,
  ): Tracer<TracerScopeT, AllPossibleScopesT> {
    const computedSpanDefinitions: ComputedSpanDefinition<
      TracerScopeT,
      AllPossibleScopesT
    >[] = []
    const computedValueDefinitions: ComputedValueDefinition<
      TracerScopeT,
      AllPossibleScopesT,
      SpanMatcherFn<TracerScopeT, AllPossibleScopesT>[]
    >[] = []

    const requiredToEnd = convertMatchersToFns<
      TracerScopeT,
      AllPossibleScopesT
    >(traceDefinition.requiredToEnd)

    if (!requiredToEnd) {
      throw new Error(
        'requiredToEnd must be defined, as a trace will never end otherwise',
      )
    }

    const debounceOn = convertMatchersToFns<TracerScopeT, AllPossibleScopesT>(
      traceDefinition.debounceOn,
    )
    const interruptOn = convertMatchersToFns<TracerScopeT, AllPossibleScopesT>(
      traceDefinition.interruptOn,
    )

    const suppressErrorStatusPropagationOn = convertMatchersToFns<
      TracerScopeT,
      AllPossibleScopesT
    >(traceDefinition.suppressErrorStatusPropagationOn)

    const completeTraceDefinition: CompleteTraceDefinition<
      TracerScopeT,
      AllPossibleScopesT
    > = {
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
          startSpan:
            typeof definition.startSpan === 'string'
              ? definition.startSpan
              : ensureMatcherFn(definition.startSpan),
          endSpan:
            typeof definition.endSpan === 'string'
              ? definition.endSpan
              : ensureMatcherFn(definition.endSpan),
        })
      },
      defineComputedValue: (definition) => {
        computedValueDefinitions.push({
          ...definition,
          matches: definition.matches.map((m) => ensureMatcherFn(m)),
        } as ComputedValueDefinition<TracerScopeT, AllPossibleScopesT, SpanMatcherFn<TracerScopeT, AllPossibleScopesT>[]>)
      },
      start: (input) => this.startTrace(completeTraceDefinition, input),
    }
  }

  processSpan(
    span: Span<AllPossibleScopesT>,
  ): SpanAnnotationRecord | undefined {
    return this.activeTrace?.processSpan(span)
  }

  private startTrace<TracerScopeT extends AllPossibleScopesT>(
    definition: CompleteTraceDefinition<TracerScopeT, AllPossibleScopesT>,
    input: StartTraceConfig<TracerScopeT>,
  ): string {
    if (this.activeTrace) {
      this.activeTrace.interrupt('another-trace-started')
      this.activeTrace = undefined
    }

    const id = input.id ?? this.generateId()

    const onEnd = (
      traceRecording: TraceRecording<TracerScopeT, AllPossibleScopesT>,
    ) => {
      if (id === this.activeTrace?.input.id) {
        this.activeTrace = undefined
      }
      this.reportFn(traceRecording)
    }

    const activeTrace = new ActiveTrace(
      definition,
      {
        ...input,
        startTime: ensureTimestamp(input.startTime),
        id,
        onEnd,
      },
      this.performanceEntryDeduplicationStrategy,
    )

    this.activeTrace = activeTrace as unknown as ActiveTrace<
      AllPossibleScopesT,
      AllPossibleScopesT
    >

    return id
  }
}
