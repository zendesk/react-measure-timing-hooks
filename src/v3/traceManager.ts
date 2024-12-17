import { ActiveTrace } from './ActiveTrace'
import {
  convertLabelMatchersToFns,
  convertMatchersToFns,
  ensureMatcherFn,
} from './ensureMatcherFn'
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
  SelectScopeByKey,
  SingleTraceReportFn,
  SpanDeduplicationStrategy,
  TraceContext,
  TraceDefinition,
  TraceManagerConfig,
  Tracer,
} from './types'
import type { KeysOfUnion } from './typeUtils'

/**
 * Class representing the centralized trace performance manager.
 */
export class TraceManager<
  AllPossibleScopesT extends { [K in keyof AllPossibleScopesT]: ScopeValue },
> {
  private readonly reportFn: ReportFn<AllPossibleScopesT>
  private readonly generateId: () => string
  private readonly performanceEntryDeduplicationStrategy?: SpanDeduplicationStrategy<
    Partial<AllPossibleScopesT>
  >
  private activeTrace:
    | ActiveTrace<KeysOfUnion<AllPossibleScopesT>, AllPossibleScopesT>
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

  createTracer<const TracerScopeKeysT extends KeysOfUnion<AllPossibleScopesT>>(
    traceDefinition: TraceDefinition<TracerScopeKeysT, AllPossibleScopesT>,
  ): Tracer<TracerScopeKeysT, AllPossibleScopesT> {
    const computedSpanDefinitions: ComputedSpanDefinition<
      TracerScopeKeysT,
      AllPossibleScopesT
    >[] = []
    const computedValueDefinitions: ComputedValueDefinition<
      TracerScopeKeysT,
      AllPossibleScopesT,
      SpanMatcherFn<TracerScopeKeysT, AllPossibleScopesT>[]
    >[] = []

    const requiredSpans = convertMatchersToFns<
      TracerScopeKeysT,
      AllPossibleScopesT
    >(traceDefinition.requiredSpans)

    if (!requiredSpans) {
      throw new Error(
        'requiredSpans must be defined, as a trace will never end otherwise',
      )
    }

    const labelMatching = traceDefinition.labelMatching
      ? convertLabelMatchersToFns(traceDefinition.labelMatching)
      : undefined

    const debounceOn = convertMatchersToFns<
      TracerScopeKeysT,
      AllPossibleScopesT
    >(traceDefinition.debounceOn)
    const interruptOn = convertMatchersToFns<
      TracerScopeKeysT,
      AllPossibleScopesT
    >(traceDefinition.interruptOn)

    const suppressErrorStatusPropagationOn = convertMatchersToFns<
      TracerScopeKeysT,
      AllPossibleScopesT
    >(traceDefinition.suppressErrorStatusPropagationOn)

    const completeTraceDefinition: CompleteTraceDefinition<
      TracerScopeKeysT,
      AllPossibleScopesT
    > = {
      ...traceDefinition,
      requiredSpans,
      debounceOn,
      interruptOn,
      suppressErrorStatusPropagationOn,
      computedSpanDefinitions,
      computedValueDefinitions,
      labelMatching,
    }

    return {
      defineComputedSpan: (definition) => {
        computedSpanDefinitions.push({
          ...definition,
          startSpan:
            typeof definition.startSpan === 'string'
              ? definition.startSpan
              : ensureMatcherFn<TracerScopeKeysT, AllPossibleScopesT>(
                  definition.startSpan,
                ),
          endSpan:
            typeof definition.endSpan === 'string'
              ? definition.endSpan
              : ensureMatcherFn<TracerScopeKeysT, AllPossibleScopesT>(
                  definition.endSpan,
                ),
        })
      },
      defineComputedValue: (definition) => {
        computedValueDefinitions.push({
          ...definition,
          matches: definition.matches.map((m) =>
            ensureMatcherFn<TracerScopeKeysT, AllPossibleScopesT>(m),
          ),
        } as ComputedValueDefinition<TracerScopeKeysT, AllPossibleScopesT>)
      },
      start: (input) => this.startTrace(completeTraceDefinition, input),
    }
  }

  processSpan(
    span: Span<AllPossibleScopesT>,
  ): SpanAnnotationRecord | undefined {
    return this.activeTrace?.processSpan(span)
  }

  private startTrace<
    const TracerScopeKeysT extends KeysOfUnion<AllPossibleScopesT>,
  >(
    definition: CompleteTraceDefinition<TracerScopeKeysT, AllPossibleScopesT>,
    input: StartTraceConfig<
      SelectScopeByKey<TracerScopeKeysT, AllPossibleScopesT>
    >,
  ): string {
    if (this.activeTrace) {
      this.activeTrace.interrupt('another-trace-started')
      this.activeTrace = undefined
    }

    const id = input.id ?? this.generateId()

    const activeTraceContext: TraceContext<
      TracerScopeKeysT,
      AllPossibleScopesT
    > = {
      definition,
      input: {
        ...input,
        startTime: ensureTimestamp(input.startTime),
        id,
      },
    }

    const onEnd = (
      traceRecording: TraceRecording<TracerScopeKeysT, AllPossibleScopesT>,
    ) => {
      if (id === this.activeTrace?.input.id) {
        this.activeTrace = undefined
      }
      // needs this cast because TS is confused about the type of this.reportFn due to generic usage
      ;(
        this.reportFn as SingleTraceReportFn<
          TracerScopeKeysT,
          AllPossibleScopesT
        >
      )(traceRecording, activeTraceContext)
    }

    const activeTrace = new ActiveTrace<TracerScopeKeysT, AllPossibleScopesT>(
      definition,
      { ...activeTraceContext.input, onEnd },
      this.performanceEntryDeduplicationStrategy,
    )

    this.activeTrace = activeTrace as unknown as ActiveTrace<
      KeysOfUnion<AllPossibleScopesT>,
      AllPossibleScopesT
    >

    return id
  }
}
