import {
  convertLabelMatchersToFns,
  convertMatchersToFns,
  ensureMatcherFn,
} from './ensureMatcherFn'
import { type SpanMatch, withAllConditions } from './matchSpan'
import { requiredSpanWithErrorStatus } from './requiredSpanWithErrorStatus'
import type { SpanAnnotationRecord } from './spanAnnotationTypes'
import type { Span } from './spanTypes'
import type { AllPossibleTraces } from './Trace'
import { Tracer } from './Tracer'
import type {
  CompleteTraceDefinition,
  ComputedValueDefinitionInput,
  RelationSchemaValue,
  SpanDeduplicationStrategy,
  TraceDefinition,
  TraceManagerConfig,
  TraceManagerUtilities,
} from './types'
import type { KeysOfRelationSchemaToTuples } from './typeUtils'

/**
 * Class representing the centralized trace performance manager.
 */
export class TraceManager<
  const RelationSchemasT extends {
    [K in keyof RelationSchemasT]: RelationSchemaValue
  },
> {
  readonly performanceEntryDeduplicationStrategy?: SpanDeduplicationStrategy<RelationSchemasT>
  private currentTrace: AllPossibleTraces<RelationSchemasT> | undefined =
    undefined

  get currentTracerContext() {
    if (!this.currentTrace) return undefined
    return {
      definition: this.currentTrace.definition,
      input: this.currentTrace.input,
    }
  }

  constructor(
    configInput: Omit<
      TraceManagerConfig<RelationSchemasT>,
      'reportWarningFn'
    > & { reportWarningFn?: (warning: Error) => void },
  ) {
    this.utilities = {
      // by default noop for warnings
      reportWarningFn: () => {},
      ...configInput,
      replaceCurrentTrace: (newTrace: AllPossibleTraces<RelationSchemasT>) => {
        if (this.currentTrace) {
          this.currentTrace.interrupt('another-trace-started')
          this.currentTrace = undefined
        }
        this.currentTrace = newTrace
      },
      cleanupCurrentTrace: (
        traceToCleanUp: AllPossibleTraces<RelationSchemasT>,
      ) => {
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
    const SelectedRelationTupleT extends KeysOfRelationSchemaToTuples<RelationSchemasT>,
    const VariantsT extends string,
    const ComputedValueTuplesT extends {
      [K in keyof ComputedValueTuplesT]: SpanMatch<
        NoInfer<SelectedRelationTupleT>,
        RelationSchemasT,
        NoInfer<VariantsT>
      >[]
    },
  >(
    traceDefinition: TraceDefinition<
      SelectedRelationTupleT,
      RelationSchemasT,
      VariantsT,
      {
        [K in keyof ComputedValueTuplesT]: ComputedValueDefinitionInput<
          NoInfer<SelectedRelationTupleT>,
          RelationSchemasT,
          NoInfer<VariantsT>,
          ComputedValueTuplesT[K]
        >
      }
    >,
  ): Tracer<SelectedRelationTupleT, RelationSchemasT, VariantsT> {
    const requiredSpans = convertMatchersToFns<
      SelectedRelationTupleT,
      RelationSchemasT,
      VariantsT
    >(traceDefinition.requiredSpans)

    if (!requiredSpans) {
      throw new Error(
        'requiredSpans must be defined, as a trace will never end otherwise',
      )
    }

    const labelMatching = traceDefinition.labelMatching
      ? convertLabelMatchersToFns(traceDefinition.labelMatching)
      : undefined

    const debounceOnSpans = convertMatchersToFns<
      SelectedRelationTupleT,
      RelationSchemasT,
      VariantsT
    >(traceDefinition.debounceOnSpans)

    const manuallyDefinedInterruptOnSpans = convertMatchersToFns<
      SelectedRelationTupleT,
      RelationSchemasT,
      VariantsT
    >(traceDefinition.interruptOnSpans)

    // all requiredSpans implicitly interrupt the trace if they error, unless explicitly ignored
    const interruptOnRequiredErrored = requiredSpans.flatMap<
      (typeof requiredSpans)[number]
    >((matcher) =>
      matcher.continueWithErrorStatus
        ? []
        : withAllConditions<
            SelectedRelationTupleT,
            RelationSchemasT,
            VariantsT
          >(
            matcher,
            requiredSpanWithErrorStatus<
              SelectedRelationTupleT,
              RelationSchemasT,
              VariantsT
            >(),
          ),
    )

    const interruptOnSpans = [
      ...(manuallyDefinedInterruptOnSpans ?? []),
      ...interruptOnRequiredErrored,
    ] as typeof manuallyDefinedInterruptOnSpans

    const suppressErrorStatusPropagationOnSpans = convertMatchersToFns<
      SelectedRelationTupleT,
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
                    SelectedRelationTupleT,
                    RelationSchemasT,
                    VariantsT
                  >(def.startSpan),
            endSpan:
              typeof def.endSpan === 'string'
                ? def.endSpan
                : ensureMatcherFn<
                    SelectedRelationTupleT,
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
              m: SpanMatch<SelectedRelationTupleT, RelationSchemasT, VariantsT>,
            ) =>
              ensureMatcherFn<
                SelectedRelationTupleT,
                RelationSchemasT,
                VariantsT
              >(m),
          ),
          computeValueFromMatches: def.computeValueFromMatches,
        } as const,
      ]),
    )

    const completeTraceDefinition: CompleteTraceDefinition<
      SelectedRelationTupleT,
      RelationSchemasT,
      VariantsT
    > = {
      ...traceDefinition,
      requiredSpans,
      debounceOnSpans,
      interruptOnSpans,
      suppressErrorStatusPropagationOnSpans,
      computedSpanDefinitions,
      computedValueDefinitions,
      labelMatching,
    }

    return new Tracer(completeTraceDefinition, this.utilities)
  }

  processSpan(span: Span<RelationSchemasT>): SpanAnnotationRecord | undefined {
    return this.currentTrace?.processSpan(span)
  }
}
