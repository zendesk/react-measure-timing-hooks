import { AllPossibleActiveTraces } from './ActiveTrace'
import {
  convertLabelMatchersToFns,
  convertMatchersToFns,
} from './ensureMatcherFn'
import { type SpanMatcherFn } from './matchSpan'
import type { SpanAnnotationRecord } from './spanAnnotationTypes'
import type { Span } from './spanTypes'
import { Tracer } from './tracer'
import type {
  CompleteTraceDefinition,
  ComputedSpanDefinition,
  ComputedValueDefinition,
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
  private activeTrace: AllPossibleActiveTraces<RelationSchemasT> | undefined =
    undefined

  get activeTracerContext() {
    if (!this.activeTrace) return undefined
    return {
      definition: this.activeTrace.definition,
      input: this.activeTrace.input,
    }
  }

  constructor(configInput: TraceManagerConfig<RelationSchemasT>) {
    this.utilities = {
      ...configInput,
      replaceActiveTrace: (
        newTrace: AllPossibleActiveTraces<RelationSchemasT>,
      ) => {
        if (this.activeTrace) {
          this.activeTrace.interrupt('another-trace-started')
          this.activeTrace = undefined
        }
        this.activeTrace = newTrace
      },
      cleanupActiveTrace: (
        traceToCleanUp: AllPossibleActiveTraces<RelationSchemasT>,
      ) => {
        if (traceToCleanUp === this.activeTrace) {
          this.activeTrace = undefined
        }
        // warn on miss?
      },
      getActiveTrace: () => this.activeTrace,
      cancelDraftTrace: () => this.activeTrace?.interrupt('draft-cancelled'),
    }
  }

  private utilities: TraceManagerUtilities<RelationSchemasT>

  createTracer<
    const SelectedRelationTupleT extends KeysOfRelationSchemaToTuples<RelationSchemasT>,
    const VariantsT extends string,
  >(
    traceDefinition: TraceDefinition<
      SelectedRelationTupleT,
      RelationSchemasT,
      VariantsT
    >,
  ): Tracer<SelectedRelationTupleT, RelationSchemasT, VariantsT> {
    const computedSpanDefinitions: ComputedSpanDefinition<
      SelectedRelationTupleT,
      RelationSchemasT,
      VariantsT
    >[] = []
    const computedValueDefinitions: ComputedValueDefinition<
      SelectedRelationTupleT,
      RelationSchemasT,
      VariantsT,
      SpanMatcherFn<SelectedRelationTupleT, RelationSchemasT, VariantsT>[]
    >[] = []

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
    const interruptOnSpans = convertMatchersToFns<
      SelectedRelationTupleT,
      RelationSchemasT,
      VariantsT
    >(traceDefinition.interruptOnSpans)

    const suppressErrorStatusPropagationOnSpans = convertMatchersToFns<
      SelectedRelationTupleT,
      RelationSchemasT,
      VariantsT
    >(traceDefinition.suppressErrorStatusPropagationOnSpans)

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
    return this.activeTrace?.processSpan(span)
  }
}
