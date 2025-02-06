import { SpanMatchDefinition, SpanMatcherFn } from './matchSpan'
import type { StartTraceConfig } from './spanTypes'
import type {
  ComputedSpanDefinitionInput,
  ComputedValueDefinitionInput,
  ScopeValue,
  SelectScopeByKey,
  TraceModifications,
} from './types'
import type { KeysOfUnion } from './typeUtils'

export interface TracerType<
  TracerScopeKeysT extends KeysOfUnion<AllPossibleScopesT>,
  AllPossibleScopesT extends { [K in keyof AllPossibleScopesT]: ScopeValue },
  OriginatedFromT extends string = string,
> {
  /**
   * Starts a trace with provided configuration
   * @returns The ID of the trace
   */
  start: (
    input: StartTraceConfig<
      SelectScopeByKey<TracerScopeKeysT, AllPossibleScopesT>,
      OriginatedFromT
    >,
  ) => string | undefined

  /**
   * Creates a draft trace without starting it
   */
  createDraft: (
    input: Omit<
      StartTraceConfig<
        SelectScopeByKey<TracerScopeKeysT, AllPossibleScopesT>,
        OriginatedFromT
      >,
      'scope'
    >,
  ) => string | undefined

  /**
   * Transitions a draft trace to active state
   */
  transitionDraftToActive: (
    modifications: TraceModifications<
      TracerScopeKeysT,
      AllPossibleScopesT,
      OriginatedFromT
    >,
  ) => void

  defineComputedSpan: (
    definition: ComputedSpanDefinitionInput<
      TracerScopeKeysT,
      AllPossibleScopesT,
      OriginatedFromT
    >,
  ) => void

  defineComputedValue: <
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
  ) => void
}
