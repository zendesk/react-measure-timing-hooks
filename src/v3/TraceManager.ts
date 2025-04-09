import {
  convertLabelMatchersToFns,
  convertMatchersToFns,
  ensureMatcherFn,
} from './ensureMatcherFn'
import { type SpanMatch } from './matchSpan'
import type { SpanAnnotationRecord } from './spanAnnotationTypes'
import type { Span } from './spanTypes'
import type { AllPossibleTraces } from './Trace'
import { Tracer } from './Tracer'
import type {
  AllPossibleTraceContexts,
  CompleteTraceDefinition,
  ComputedValueDefinitionInput,
  DraftTraceContext,
  RelationSchemasBase,
  ReportErrorFn,
  SpanDeduplicationStrategy,
  TraceDefinition,
  TraceManagerConfig,
  TraceManagerUtilities,
} from './types'

/**
 * Class representing the centralized trace performance manager.
 */
export class TraceManager<
  const RelationSchemasT extends RelationSchemasBase<RelationSchemasT>,
> {
  readonly performanceEntryDeduplicationStrategy?: SpanDeduplicationStrategy<RelationSchemasT>
  private currentTrace: AllPossibleTraces<RelationSchemasT> | undefined =
    undefined

  get currentTracerContext():
    | AllPossibleTraceContexts<RelationSchemasT, string>
    | undefined {
    if (!this.currentTrace) return undefined
    return this.currentTrace
  }

  constructor(
    configInput: Omit<
      TraceManagerConfig<RelationSchemasT>,
      'reportWarningFn'
    > & { reportWarningFn?: ReportErrorFn<RelationSchemasT> },
  ) {
    this.utilities = {
      // by default noop for warnings
      reportWarningFn: () => {},
      ...configInput,
      replaceCurrentTrace: (newTrace, reason) => {
        if (this.currentTrace) {
          this.currentTrace.interrupt(reason)
        }
        this.currentTrace = newTrace
      },
      onEndTrace: (traceToCleanUp) => {
        if (traceToCleanUp === this.currentTrace) {
          this.currentTrace = undefined
        }
        // warn on miss?
      },
      getCurrentTrace: () => this.currentTrace,
    }
  }

  private utilities: TraceManagerUtilities<RelationSchemasT>

  createTracer<
    const SelectedRelationNameT extends keyof RelationSchemasT,
    const VariantsT extends string,
    const ComputedValueTuplesT extends {
      [K in keyof ComputedValueTuplesT]: SpanMatch<
        NoInfer<SelectedRelationNameT>,
        RelationSchemasT,
        NoInfer<VariantsT>
      >[]
    },
  >(
    traceDefinition: TraceDefinition<
      SelectedRelationNameT,
      RelationSchemasT,
      VariantsT,
      {
        [K in keyof ComputedValueTuplesT]: ComputedValueDefinitionInput<
          NoInfer<SelectedRelationNameT>,
          RelationSchemasT,
          NoInfer<VariantsT>,
          ComputedValueTuplesT[K]
        >
      }
    >,
  ): Tracer<SelectedRelationNameT, RelationSchemasT, VariantsT> {
    const requiredSpans = convertMatchersToFns<
      SelectedRelationNameT,
      RelationSchemasT,
      VariantsT
    >(traceDefinition.requiredSpans)

    const labelMatching = traceDefinition.labelMatching
      ? convertLabelMatchersToFns(traceDefinition.labelMatching)
      : undefined

    const debounceOnSpans = convertMatchersToFns<
      SelectedRelationNameT,
      RelationSchemasT,
      VariantsT
    >(traceDefinition.debounceOnSpans)

    const interruptOnSpans = convertMatchersToFns<
      SelectedRelationNameT,
      RelationSchemasT,
      VariantsT
    >(traceDefinition.interruptOnSpans)

    const suppressErrorStatusPropagationOnSpans = convertMatchersToFns<
      SelectedRelationNameT,
      RelationSchemasT,
      VariantsT
    >(traceDefinition.suppressErrorStatusPropagationOnSpans)

    const computedSpanDefinitions = Object.fromEntries(
      Object.entries(traceDefinition.computedSpanDefinitions ?? {}).map(
        ([name, def]) => [
          name,
          {
            startSpan:
              typeof def.startSpan === 'string'
                ? def.startSpan
                : ensureMatcherFn<
                    SelectedRelationNameT,
                    RelationSchemasT,
                    VariantsT
                  >(def.startSpan),
            endSpan:
              typeof def.endSpan === 'string'
                ? def.endSpan
                : ensureMatcherFn<
                    SelectedRelationNameT,
                    RelationSchemasT,
                    VariantsT
                  >(def.endSpan),
          } as const,
        ],
      ),
    )

    const computedValueDefinitionsInputEntries = Object.entries<
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      ComputedValueDefinitionInput<any, any, any, any>
    >(traceDefinition.computedValueDefinitions ?? {})

    const computedValueDefinitions = Object.fromEntries(
      computedValueDefinitionsInputEntries.map(([name, def]) => [
        name,
        {
          ...def,
          matches: def.matches.map(
            (
              m: SpanMatch<SelectedRelationNameT, RelationSchemasT, VariantsT>,
            ) =>
              ensureMatcherFn<
                SelectedRelationNameT,
                RelationSchemasT,
                VariantsT
              >(m),
          ),
          computeValueFromMatches: def.computeValueFromMatches,
        } as const,
      ]),
    )

    const completeTraceDefinition: CompleteTraceDefinition<
      SelectedRelationNameT,
      RelationSchemasT,
      VariantsT
    > = {
      ...traceDefinition,
      requiredSpans:
        requiredSpans ??
        [
          // lack of requiredSpan is invalid, but we warn about it below
        ],
      debounceOnSpans,
      interruptOnSpans,
      suppressErrorStatusPropagationOnSpans,
      computedSpanDefinitions,
      computedValueDefinitions,
      labelMatching,
      relationSchema:
        this.utilities.relationSchemas[traceDefinition.relationSchemaName],
    }

    if (!requiredSpans) {
      this.utilities.reportErrorFn(
        new Error(
          'requiredSpans must be defined along with the trace, as a trace can only end in an interrupted state otherwise',
        ),
        { definition: completeTraceDefinition } as Partial<
          // eslint-disable-next-line @typescript-eslint/no-explicit-any
          DraftTraceContext<any, RelationSchemasT, any>
        >,
      )
    }

    return new Tracer(completeTraceDefinition, this.utilities)
  }

  processSpan(span: Span<RelationSchemasT>): SpanAnnotationRecord | undefined {
    return this.currentTrace?.processSpan(span)
  }
}
