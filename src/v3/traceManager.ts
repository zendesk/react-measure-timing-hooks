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
  TraceDefinition,
  TraceManagerConfig,
  Tracer,
  SpanDeduplicationStrategy,
  ScopeValue,
  KeysOfAllPossibleScopes,
  SelectScopeByKey,
} from './types'

/**
 * Class representing the centralized trace performance manager.
 */
export class TraceManager<
  AllPossibleScopesT extends { [K in keyof AllPossibleScopesT]: ScopeValue },
> {
  private readonly reportFn: ReportFn<Partial<AllPossibleScopesT>>
  private readonly generateId: () => string
  private readonly performanceEntryDeduplicationStrategy?: SpanDeduplicationStrategy<
    Partial<AllPossibleScopesT>
  >
  private activeTrace:
    | ActiveTrace<TracerScopeT, AllPossibleScopesT>
    | undefined = undefined

  constructor({
    reportFn,
    generateId,
    performanceEntryDeduplicationStrategy,
  }: TraceManagerConfig<AllPossibleScopesT>) {
    this.reportFn = reportFn
    this.generateId = generateId
    this.performanceEntryDeduplicationStrategy =
      performanceEntryDeduplicationStrategy
  }

  createTracer<
    SingleTracerScopeKeyT extends KeysOfAllPossibleScopes<AllPossibleScopesT>,
  >(
    traceDefinition: TraceDefinition<AllPossibleScopesT, SingleTracerScopeKeyT>,
  ): Tracer<SelectScopeByKey<SingleTracerScopeKeyT, AllPossibleScopesT>> {
    type ThisTraceScope = SelectScopeByKey<
      SingleTracerScopeKeyT,
      AllPossibleScopesT
    >

    const computedSpanDefinitions: ComputedSpanDefinition<ThisTraceScope>[] = []
    const computedValueDefinitions: ComputedValueDefinition<
      ThisTraceScope,
      SpanMatcherFn<ThisTraceScope>[]
    >[] = []

    const requiredToEnd = convertMatchersToFns<ThisTraceScope>(
      traceDefinition.requiredToEnd,
    )

    if (!requiredToEnd) {
      throw new Error(
        'requiredToEnd must be defined, as a trace will never end otherwise',
      )
    }

    const debounceOn = convertMatchersToFns<ThisTraceScope>(
      traceDefinition.debounceOn,
    )
    const interruptOn = convertMatchersToFns<ThisTraceScope>(
      traceDefinition.interruptOn,
    )

    const suppressErrorStatusPropagationOn =
      convertMatchersToFns<ThisTraceScope>(
        traceDefinition.suppressErrorStatusPropagationOn,
      )

    const completeTraceDefinition: CompleteTraceDefinition<ThisTraceScope> = {
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
        } as ComputedValueDefinition<ThisTraceScope, SpanMatcherFn<ThisTraceScope>[]>)
      },
      start: (input) => this.startTrace(completeTraceDefinition, input),
    }
  }

  processSpan(
    span: Span<AllPossibleScopesT>,
  ): SpanAnnotationRecord | undefined {
    return this.activeTrace?.processSpan(span)
  }

  private startTrace<ThisTraceScopeKeysT extends keyof AllPossibleScopesT>(
    definition: CompleteTraceDefinition<
      Pick<AllPossibleScopesT, ThisTraceScopeKeysT>
    >,
    input: StartTraceConfig<Pick<AllPossibleScopesT, ThisTraceScopeKeysT>>,
  ): string {
    if (this.activeTrace) {
      this.activeTrace.interrupt('another-trace-started')
      this.activeTrace = undefined
    }

    const id = input.id ?? this.generateId()

    const onEnd = (
      traceRecording: TraceRecording<
        Pick<AllPossibleScopesT, ThisTraceScopeKeysT>
      >,
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

    this.activeTrace = activeTrace

    return id
  }
}
