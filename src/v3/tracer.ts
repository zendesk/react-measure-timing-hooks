import { ActiveTrace, AllPossibleActiveTraces } from './ActiveTrace'
import { ensureMatcherFn } from './ensureMatcherFn'
import { ensureTimestamp } from './ensureTimestamp'
import type { SpanMatchDefinition, SpanMatcherFn } from './matchSpan'
import type { BaseStartTraceConfig, StartTraceConfig } from './spanTypes'
import {
  CompleteTraceDefinition,
  ComputedSpanDefinitionInput,
  ComputedValueDefinition,
  ComputedValueDefinitionInput,
  RelationSchemaValue,
  SelectRelationSchemaByKeysTuple,
  type TraceManagerUtilities,
  TraceModifications,
} from './types'
import type { KeysOfRelationSchemaToTuples } from './typeUtils'

/**
 * Tracer can create draft traces and start traces
 */
export class Tracer<
  const SelectedRelationTupleT extends KeysOfRelationSchemaToTuples<RelationSchemasT>,
  const RelationSchemasT extends {
    [K in keyof RelationSchemasT]: RelationSchemaValue
  },
  const VariantsT extends string,
> {
  definition: CompleteTraceDefinition<
    SelectedRelationTupleT,
    RelationSchemasT,
    VariantsT
  >
  traceUtilities: TraceManagerUtilities<RelationSchemasT>

  constructor(
    definition: CompleteTraceDefinition<
      SelectedRelationTupleT,
      RelationSchemasT,
      VariantsT
    >,
    traceUtilities: TraceManagerUtilities<RelationSchemasT>,
  ) {
    this.definition = definition
    this.traceUtilities = traceUtilities
  }

  /**
   * @returns The ID of the trace.
   */
  start = (
    input: StartTraceConfig<
      SelectRelationSchemaByKeysTuple<SelectedRelationTupleT, RelationSchemasT>,
      VariantsT
    >,
  ): string | undefined => {
    const traceId = this.createDraft(input)
    if (!traceId) return undefined

    this.transitionDraftToActive({ relatedTo: input.relatedTo })
    return traceId
  }

  createDraft = (
    input: BaseStartTraceConfig<VariantsT>,
  ): string | undefined => {
    const id = input.id ?? this.traceUtilities.generateId()

    const activeTrace = new ActiveTrace<
      SelectedRelationTupleT,
      RelationSchemasT,
      VariantsT
    >(
      this.definition,
      {
        ...input,
        // relatedTo will be overwritten later during initialization of the trace
        relatedTo: undefined,
        startTime: ensureTimestamp(input.startTime),
        id,
      },
      this.traceUtilities,
    )

    this.traceUtilities.replaceActiveTrace(
      activeTrace as unknown as AllPossibleActiveTraces<RelationSchemasT>,
    )

    return id
  }

  cancelDraft = () => {
    this.traceUtilities.cancelDraftTrace()
  }

  // can have config changed until we move into active
  // from input: relatedTo (required), attributes (optional, merge into)
  // from definition, can add items to: requiredSpans (additionalRequiredSpans), debounceOnSpans (additionalDebounceOnSpans)
  // documentation: interruption still works and all the other events are buffered
  transitionDraftToActive = (
    inputAndDefinitionModifications: TraceModifications<
      SelectedRelationTupleT,
      RelationSchemasT,
      VariantsT
    >,
  ): void => {
    const activeTrace = this.traceUtilities.getActiveTrace()
    if (!activeTrace) {
      this.traceUtilities.reportErrorFn(
        new Error(
          `No currently active trace when initializing a trace. Call tracer.startTrace(...) or tracer.provisionalStartTrace(...) beforehand.`,
        ),
      )
      return
    }

    // this is an already initialized active trace, do nothing:
    if (!activeTrace.isDraft) {
      this.traceUtilities.reportErrorFn(
        new Error(
          `You are trying to initialize a trace that has already been initialized before (${activeTrace.definition.name}).`,
        ),
      )
      return
    }

    const typedActiveTrace = activeTrace as unknown as ActiveTrace<
      SelectedRelationTupleT,
      RelationSchemasT,
      VariantsT
    >

    typedActiveTrace.transitionDraftToActive(inputAndDefinitionModifications)
  }

  defineComputedSpan = (
    definition: ComputedSpanDefinitionInput<
      SelectedRelationTupleT,
      RelationSchemasT,
      VariantsT
    >,
  ): void => {
    this.definition.computedSpanDefinitions.push({
      ...definition,
      startSpan:
        typeof definition.startSpan === 'string'
          ? definition.startSpan
          : ensureMatcherFn<
              SelectedRelationTupleT,
              RelationSchemasT,
              VariantsT
            >(definition.startSpan),
      endSpan:
        typeof definition.endSpan === 'string'
          ? definition.endSpan
          : ensureMatcherFn<
              SelectedRelationTupleT,
              RelationSchemasT,
              VariantsT
            >(definition.endSpan),
    })
  }

  defineComputedValue = <
    MatchersT extends (
      | SpanMatcherFn<SelectedRelationTupleT, RelationSchemasT, VariantsT>
      | SpanMatchDefinition<SelectedRelationTupleT, RelationSchemasT>
    )[],
  >(
    definition: ComputedValueDefinitionInput<
      SelectedRelationTupleT,
      RelationSchemasT,
      MatchersT,
      VariantsT
    >,
  ): void => {
    this.definition.computedValueDefinitions.push({
      ...definition,
      matches: definition.matches.map<
        SpanMatcherFn<SelectedRelationTupleT, RelationSchemasT, VariantsT>
      >((m) => ensureMatcherFn(m)),
    } as ComputedValueDefinition<SelectedRelationTupleT, RelationSchemasT, VariantsT>)
  }
}
