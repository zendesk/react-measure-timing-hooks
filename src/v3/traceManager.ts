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
  ScopeValue,
  SpanDeduplicationStrategy,
  TraceDefinition,
  TraceManagerConfig,
  TraceManagerUtilities,
} from './types'
import type { KeysOfUnion } from './typeUtils'

/**
 * Class representing the centralized trace performance manager.
 */
export class TraceManager<
  AllPossibleScopesT extends { [K in keyof AllPossibleScopesT]: ScopeValue },
> {
  readonly performanceEntryDeduplicationStrategy?: SpanDeduplicationStrategy<AllPossibleScopesT>
  private activeTrace: AllPossibleActiveTraces<AllPossibleScopesT> | undefined =
    undefined

  get activeTracerContext() {
    if (!this.activeTrace) return undefined
    return {
      definition: this.activeTrace.definition,
      input: this.activeTrace.input,
    }
  }

  constructor(configInput: TraceManagerConfig<AllPossibleScopesT>) {
    this.utilities = {
      ...configInput,
      replaceActiveTrace: (
        newTrace: AllPossibleActiveTraces<AllPossibleScopesT>,
      ) => {
        if (this.activeTrace) {
          this.activeTrace.interrupt('another-trace-started')
          this.activeTrace = undefined
        }
        this.activeTrace = newTrace
      },
      cleanupActiveTrace: (
        traceToCleanUp: AllPossibleActiveTraces<AllPossibleScopesT>,
      ) => {
        if (traceToCleanUp === this.activeTrace) {
          this.activeTrace = undefined
        }
        // warn on miss?
      },
      getActiveTrace: () => this.activeTrace,
    }
  }

  private utilities: TraceManagerUtilities<AllPossibleScopesT>

  createTracer<
    const TracerScopeKeysT extends KeysOfUnion<AllPossibleScopesT>,
    const OriginatedFromT extends string,
  >(
    traceDefinition: TraceDefinition<
      TracerScopeKeysT,
      AllPossibleScopesT,
      OriginatedFromT
    >,
  ): Tracer<TracerScopeKeysT, AllPossibleScopesT, OriginatedFromT> {
    const computedSpanDefinitions: ComputedSpanDefinition<
      TracerScopeKeysT,
      AllPossibleScopesT,
      OriginatedFromT
    >[] = []
    const computedValueDefinitions: ComputedValueDefinition<
      TracerScopeKeysT,
      AllPossibleScopesT,
      OriginatedFromT,
      SpanMatcherFn<TracerScopeKeysT, AllPossibleScopesT, OriginatedFromT>[]
    >[] = []

    const requiredSpans = convertMatchersToFns<
      TracerScopeKeysT,
      AllPossibleScopesT,
      OriginatedFromT
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
      AllPossibleScopesT,
      OriginatedFromT
    >(traceDefinition.debounceOn)
    const interruptOn = convertMatchersToFns<
      TracerScopeKeysT,
      AllPossibleScopesT,
      OriginatedFromT
    >(traceDefinition.interruptOn)

    const suppressErrorStatusPropagationOn = convertMatchersToFns<
      TracerScopeKeysT,
      AllPossibleScopesT,
      OriginatedFromT
    >(traceDefinition.suppressErrorStatusPropagationOn)

    const completeTraceDefinition: CompleteTraceDefinition<
      TracerScopeKeysT,
      AllPossibleScopesT,
      OriginatedFromT
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

    return new Tracer(completeTraceDefinition, this.utilities)
  }

  processSpan(
    span: Span<AllPossibleScopesT>,
  ): SpanAnnotationRecord | undefined {
    return this.activeTrace?.processSpan(span)
  }
}
