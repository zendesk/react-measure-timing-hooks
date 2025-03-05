import { ensureMatcherFn } from './ensureMatcherFn'
import { ensureTimestamp } from './ensureTimestamp'
import type { SpanMatch, SpanMatcherFn } from './matchSpan'
import type { SpanAndAnnotation } from './spanAnnotationTypes'
import type { BaseStartTraceConfig, StartTraceConfig } from './spanTypes'
import { type AllPossibleTraces, Trace } from './Trace'
import {
  type CompleteTraceDefinition,
  type ComputedSpanDefinitionInput,
  type ComputedValueDefinitionInput,
  type RelationSchemaValue,
  type TraceManagerUtilities,
  type TraceModifications,
} from './types'

/**
 * Tracer can create draft traces and start traces
 */
export class Tracer<
  const SelectedRelationKeyT extends keyof RelationSchemasT,
  const RelationSchemasT extends {
    [SchemaNameT in keyof RelationSchemasT]: {
      [K in keyof RelationSchemasT[SchemaNameT]]: RelationSchemaValue
    }
  },
  const VariantsT extends string,
> {
  definition: CompleteTraceDefinition<
    SelectedRelationKeyT,
    RelationSchemasT,
    VariantsT
  >
  traceUtilities: TraceManagerUtilities<RelationSchemasT>

  constructor(
    definition: CompleteTraceDefinition<
      SelectedRelationKeyT,
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
    input: StartTraceConfig<RelationSchemasT[SelectedRelationKeyT], VariantsT>,
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

    const trace = new Trace<SelectedRelationKeyT, RelationSchemasT, VariantsT>(
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

    this.traceUtilities.replaceCurrentTrace(
      trace as unknown as AllPossibleTraces<RelationSchemasT>,
    )

    return id
  }

  interrupt = ({ error }: { error?: Error } = {}) => {
    const trace = this.traceUtilities.getCurrentTrace() as
      | Trace<SelectedRelationKeyT, RelationSchemasT, VariantsT>
      | undefined

    if (!trace) {
      this.traceUtilities.reportWarningFn(
        new Error(
          `No currently active trace when canceling a draft. Call tracer.start(...) or tracer.createDraft(...) beforehand.`,
        ),
      )
      return
    }

    // verify that trace is the same definition as the Tracer's definition
    if (trace.sourceDefinition !== this.definition) {
      this.traceUtilities.reportWarningFn(
        new Error(
          `You are trying to cancel a draft that is not the same definition as the Tracer's definition.`,
        ),
      )
      return
    }

    if (error) {
      trace.processSpan({
        name: error.name,
        startTime: ensureTimestamp(),
        // TODO: use a dedicated error type
        type: 'mark',
        attributes: {},
        duration: 0,
        error,
      })
      trace.interrupt('aborted')
      return
    }

    if (trace.isDraft) {
      trace.interrupt('draft-cancelled')
      return
    }

    trace.interrupt('aborted')
  }

  // can have config changed until we move into active
  // from input: relatedTo (required), attributes (optional, merge into)
  // from definition, can add items to: requiredSpans (additionalRequiredSpans), debounceOnSpans (additionalDebounceOnSpans)
  // documentation: interruption still works and all the other events are buffered
  transitionDraftToActive = (
    inputAndDefinitionModifications: TraceModifications<
      SelectedRelationKeyT,
      RelationSchemasT,
      VariantsT
    >,
  ): void => {
    const trace = this.traceUtilities.getCurrentTrace() as
      | Trace<SelectedRelationKeyT, RelationSchemasT, VariantsT>
      | undefined

    if (!trace) {
      this.traceUtilities.reportErrorFn(
        new Error(
          `No currently active trace when initializing a trace. Call tracer.start(...) or tracer.createDraft(...) beforehand.`,
        ),
      )
      return
    }

    // this is an already initialized active trace, do nothing:
    if (!trace.isDraft) {
      this.traceUtilities.reportWarningFn(
        new Error(
          `You are trying to initialize a trace that has already been initialized before (${trace.definition.name}).`,
        ),
      )
      return
    }

    // verify that trace is the same definition as the Tracer's definition
    if (trace.sourceDefinition !== this.definition) {
      this.traceUtilities.reportWarningFn(
        new Error(
          `You are trying to initialize a trace that is not the same definition as the Tracer's definition is different.`,
        ),
      )
      return
    }

    trace.transitionDraftToActive(inputAndDefinitionModifications)
  }

  defineComputedSpan = (
    definition: ComputedSpanDefinitionInput<
      SelectedRelationKeyT,
      RelationSchemasT,
      VariantsT
    > & { name: string },
  ): void => {
    this.definition.computedSpanDefinitions[definition.name] = {
      startSpan:
        typeof definition.startSpan === 'string'
          ? definition.startSpan
          : ensureMatcherFn<SelectedRelationKeyT, RelationSchemasT, VariantsT>(
              definition.startSpan,
            ),
      endSpan:
        typeof definition.endSpan === 'string'
          ? definition.endSpan
          : ensureMatcherFn<SelectedRelationKeyT, RelationSchemasT, VariantsT>(
              definition.endSpan,
            ),
    }
  }

  defineComputedValue = <
    const MatchersT extends SpanMatch<
      SelectedRelationKeyT,
      RelationSchemasT,
      VariantsT
    >[],
  >(
    definition: ComputedValueDefinitionInput<
      SelectedRelationKeyT,
      RelationSchemasT,
      VariantsT,
      MatchersT
    > & { name: string },
  ): void => {
    const convertedMatches = definition.matches.map<
      SpanMatcherFn<SelectedRelationKeyT, RelationSchemasT, VariantsT>
    >((m) => ensureMatcherFn(m))

    this.definition.computedValueDefinitions[definition.name] = {
      matches: convertedMatches,
      computeValueFromMatches: definition.computeValueFromMatches as (
        ...matches: (readonly SpanAndAnnotation<RelationSchemasT>[])[]
      ) => number | string | boolean | undefined,
    }
  }
}
