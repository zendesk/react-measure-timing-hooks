import { ActiveTrace, type AllPossibleActiveTraces } from './ActiveTrace'
import { ensureMatcherFn } from './ensureMatcherFn'
import { ensureTimestamp } from './ensureTimestamp'
import type { SpanMatch, SpanMatcherFn } from './matchSpan'
import type { SpanAndAnnotation } from './spanAnnotationTypes'
import type { BaseStartTraceConfig, StartTraceConfig } from './spanTypes'
import {
  type CompleteTraceDefinition,
  type ComputedSpanDefinitionInput,
  type ComputedValueDefinitionInput,
  type RelationSchemaValue,
  type SelectRelationSchemaByKeysTuple,
  type TraceManagerUtilities,
  type TraceModifications,
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

  interrupt = ({ error }: { error?: Error } = {}) => {
    const activeTrace = this.traceUtilities.getActiveTrace() as
      | ActiveTrace<SelectedRelationTupleT, RelationSchemasT, VariantsT>
      | undefined

    if (!activeTrace) {
      this.traceUtilities.reportWarningFn(
        new Error(
          `No currently active trace when canceling a draft. Call tracer.start(...) or tracer.createDraft(...) beforehand.`,
        ),
      )
      return
    }

    // verify that activeTrace is the same definition as the Tracer's definition
    if (activeTrace.sourceDefinition !== this.definition) {
      this.traceUtilities.reportWarningFn(
        new Error(
          `You are trying to cancel a draft that is not the same definition as the Tracer's definition.`,
        ),
      )
      return
    }

    if (error) {
      activeTrace.processSpan({
        name: error.name,
        startTime: ensureTimestamp(),
        // TODO: use a dedicated error type
        type: 'mark',
        attributes: {},
        duration: 0,
        error,
      })
      activeTrace.interrupt('aborted')
      return
    }

    if (activeTrace.isDraft) {
      activeTrace.interrupt('draft-cancelled')
      return
    }

    activeTrace.interrupt('aborted')
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
    const activeTrace = this.traceUtilities.getActiveTrace() as
      | ActiveTrace<SelectedRelationTupleT, RelationSchemasT, VariantsT>
      | undefined

    if (!activeTrace) {
      this.traceUtilities.reportErrorFn(
        new Error(
          `No currently active trace when initializing a trace. Call tracer.start(...) or tracer.createDraft(...) beforehand.`,
        ),
      )
      return
    }

    // this is an already initialized active trace, do nothing:
    if (!activeTrace.isDraft) {
      this.traceUtilities.reportWarningFn(
        new Error(
          `You are trying to initialize a trace that has already been initialized before (${activeTrace.definition.name}).`,
        ),
      )
      return
    }

    // verify that activeTrace is the same definition as the Tracer's definition
    if (activeTrace.sourceDefinition !== this.definition) {
      this.traceUtilities.reportWarningFn(
        new Error(
          `You are trying to initialize a trace that is not the same definition as the Tracer's definition is different.`,
        ),
      )
      return
    }

    activeTrace.transitionDraftToActive(inputAndDefinitionModifications)
  }

  defineComputedSpan = (
    definition: ComputedSpanDefinitionInput<
      SelectedRelationTupleT,
      RelationSchemasT,
      VariantsT
    > & { name: string },
  ): void => {
    this.definition.computedSpanDefinitions[definition.name] = {
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
    }
  }

  defineComputedValue = <
    const MatchersT extends SpanMatch<
      SelectedRelationTupleT,
      RelationSchemasT,
      VariantsT
    >[],
  >(
    definition: ComputedValueDefinitionInput<
      SelectedRelationTupleT,
      RelationSchemasT,
      VariantsT,
      MatchersT
    > & { name: string },
  ): void => {
    const convertedMatches = definition.matches.map<
      SpanMatcherFn<SelectedRelationTupleT, RelationSchemasT, VariantsT>
    >((m) => ensureMatcherFn(m))

    this.definition.computedValueDefinitions[definition.name] = {
      matches: convertedMatches,
      computeValueFromMatches: definition.computeValueFromMatches as (
        ...matches: (readonly SpanAndAnnotation<RelationSchemasT>[])[]
      ) => number | string | boolean | undefined,
    }
  }
}
