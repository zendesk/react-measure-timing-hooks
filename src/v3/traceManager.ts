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
  SpanDeduplicationStrategy,
} from './types'

/**
 * Class representing the centralized trace performance manager.
 */
export class TraceManager<AllScopesT extends ScopeBase<AllScopesT>> {
  private readonly reportFn: ReportFn<Partial<AllScopesT>>
  private readonly generateId: () => string
  private readonly performanceEntryDeduplicationStrategy?: SpanDeduplicationStrategy<
    Partial<AllScopesT>
  >
  private activeTrace: ActiveTrace<Partial<AllScopesT>> | undefined = undefined

  constructor({
    reportFn,
    generateId,
    performanceEntryDeduplicationStrategy,
  }: TraceManagerConfig<AllScopesT>) {
    this.reportFn = reportFn
    this.generateId = generateId
    this.performanceEntryDeduplicationStrategy =
      performanceEntryDeduplicationStrategy
  }

  createTracer<ThisTraceScopeKeysT extends keyof AllScopesT>(
    traceDefinition: TraceDefinition<AllScopesT, ThisTraceScopeKeysT>,
  ): Tracer<Pick<AllScopesT, ThisTraceScopeKeysT>> {
    type ThisTraceScope = Pick<AllScopesT, ThisTraceScopeKeysT>

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

  processSpan(span: Span<AllScopesT>): SpanAnnotationRecord | undefined {
    return this.activeTrace?.processSpan(span)
  }

  private startTrace<ThisTraceScopeKeysT extends keyof AllScopesT>(
    definition: CompleteTraceDefinition<Pick<AllScopesT, ThisTraceScopeKeysT>>,
    input: StartTraceConfig<Pick<AllScopesT, ThisTraceScopeKeysT>>,
  ): string {
    if (this.activeTrace) {
      this.activeTrace.interrupt('another-trace-started')
      this.activeTrace = undefined
    }

    const id = input.id ?? this.generateId()

    const onEnd = (
      traceRecording: TraceRecording<Pick<AllScopesT, ThisTraceScopeKeysT>>,
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
