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
  ScopeValue,
  SelectScopeByKey,
  type TraceManagerUtilities,
  TraceModifications,
} from './types'
import type { KeysOfUnion } from './typeUtils'

/**
 * Tracer can create draft traces and start traces
 */
export class Tracer<
  TracerScopeKeysT extends KeysOfUnion<AllPossibleScopesT>,
  AllPossibleScopesT extends { [K in keyof AllPossibleScopesT]: ScopeValue },
  OriginatedFromT extends string,
> {
  definition: CompleteTraceDefinition<
    TracerScopeKeysT,
    AllPossibleScopesT,
    OriginatedFromT
  >
  traceUtilities: TraceManagerUtilities<AllPossibleScopesT>

  constructor(
    definition: CompleteTraceDefinition<
      TracerScopeKeysT,
      AllPossibleScopesT,
      OriginatedFromT
    >,
    traceUtilities: TraceManagerUtilities<AllPossibleScopesT>,
  ) {
    this.definition = definition
    this.traceUtilities = traceUtilities
  }

  /**
   * @returns The ID of the trace.
   */
  start(
    input: StartTraceConfig<
      SelectScopeByKey<TracerScopeKeysT, AllPossibleScopesT>,
      OriginatedFromT
    >,
  ): string | undefined {
    const traceId = this.createDraft(input)
    if (!traceId) return undefined

    this.transitionDraftToActive({ scope: input.scope })
    return traceId
  }

  createDraft(
    input: BaseStartTraceConfig<OriginatedFromT>,
  ): string | undefined {
    const id = input.id ?? this.traceUtilities.generateId()

    // Verify that the originatedFrom value is valid and has a corresponding timeout
    if (!(input.originatedFrom in this.definition.variantsByOriginatedFrom)) {
      this.traceUtilities.reportErrorFn(
        new Error(
          `Invalid originatedFrom value: ${
            input.originatedFrom
          }. Must be one of: ${Object.keys(
            this.definition.variantsByOriginatedFrom,
          ).join(', ')}`,
        ),
      )
      return undefined
    }

    const activeTrace = new ActiveTrace<
      TracerScopeKeysT,
      AllPossibleScopesT,
      OriginatedFromT
    >(
      this.definition,
      {
        ...input,
        // scope will be overwritten later during initialization of the trace
        scope: undefined,
        startTime: ensureTimestamp(input.startTime),
        id,
      },
      this.traceUtilities,
    )

    this.traceUtilities.replaceActiveTrace(
      activeTrace as unknown as AllPossibleActiveTraces<AllPossibleScopesT>,
    )

    return id
  }

  // can have config changed until we move into active
  // from input: scope (required), attributes (optional, merge into)
  // from definition, can add items to: requiredSpans (additionalRequiredSpans), debounceOn (additionalDebounceOnSpans)
  // documentation: interruption still works and all the other events are buffered
  transitionDraftToActive(
    inputAndDefinitionModifications: TraceModifications<
      TracerScopeKeysT,
      AllPossibleScopesT,
      OriginatedFromT
    >,
  ): void {
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
      TracerScopeKeysT,
      AllPossibleScopesT,
      OriginatedFromT
    >

    typedActiveTrace.transitionDraftToActive(inputAndDefinitionModifications)
  }

  defineComputedSpan(
    definition: ComputedSpanDefinitionInput<
      TracerScopeKeysT,
      AllPossibleScopesT,
      OriginatedFromT
    >,
  ): void {
    this.definition.computedSpanDefinitions.push({
      ...definition,
      startSpan:
        typeof definition.startSpan === 'string'
          ? definition.startSpan
          : ensureMatcherFn<
              TracerScopeKeysT,
              AllPossibleScopesT,
              OriginatedFromT
            >(definition.startSpan),
      endSpan:
        typeof definition.endSpan === 'string'
          ? definition.endSpan
          : ensureMatcherFn<
              TracerScopeKeysT,
              AllPossibleScopesT,
              OriginatedFromT
            >(definition.endSpan),
    })
  }

  defineComputedValue<
    MatchersT extends (
      | SpanMatcherFn<TracerScopeKeysT, AllPossibleScopesT, OriginatedFromT>
      | SpanMatchDefinition<TracerScopeKeysT, AllPossibleScopesT>
    )[],
  >(
    definition: ComputedValueDefinitionInput<
      TracerScopeKeysT,
      AllPossibleScopesT,
      MatchersT,
      OriginatedFromT
    >,
  ): void {
    this.definition.computedValueDefinitions.push({
      ...definition,
      matches: definition.matches.map((m) =>
        ensureMatcherFn<TracerScopeKeysT, AllPossibleScopesT, OriginatedFromT>(
          m,
        ),
      ),
    } as ComputedValueDefinition<TracerScopeKeysT, AllPossibleScopesT, OriginatedFromT>)
  }
}
