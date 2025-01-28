import { ActiveTrace } from './ActiveTrace'
import {
  convertLabelMatchersToFns,
  convertMatchersToFns,
  ensureMatcherFn,
} from './ensureMatcherFn'
import { ensureTimestamp } from './ensureTimestamp'
import { type SpanMatcherFn } from './matchSpan'
import type { SpanAnnotationRecord } from './spanAnnotationTypes'
import type { BaseStartTraceConfig, Span, StartTraceConfig } from './spanTypes'
import type { TraceRecording } from './traceRecordingTypes'
import type {
  CompleteTraceDefinition,
  ComputedSpanDefinition,
  ComputedValueDefinition,
  DraftTraceContext,
  ReportFn,
  ScopeValue,
  SelectScopeByKey,
  SingleTraceReportFn,
  SpanDeduplicationStrategy,
  TraceDefinition,
  TraceManagerConfig,
  TraceModifications,
  Tracer,
} from './types'
import type { KeysOfUnion } from './typeUtils'

/**
 * Class representing the centralized trace performance manager.
 */
export class TraceManager<
  AllPossibleScopesT extends { [K in keyof AllPossibleScopesT]: ScopeValue },
> {
  private readonly reportFn: ReportFn<
    AllPossibleScopesT,
    AllPossibleScopesT,
    string
  >
  private readonly generateId: () => string
  private readonly performanceEntryDeduplicationStrategy?: SpanDeduplicationStrategy<
    Partial<AllPossibleScopesT>
  >
  private activeTrace:
    | ActiveTrace<KeysOfUnion<AllPossibleScopesT>, AllPossibleScopesT, string>
    | undefined = undefined

  private reportErrorFn: (error: Error) => void

  constructor({
    reportFn,
    reportErrorFn,
    generateId,
    performanceEntryDeduplicationStrategy,
  }: TraceManagerConfig<AllPossibleScopesT, string>) {
    this.reportFn = reportFn
    this.generateId = generateId
    this.performanceEntryDeduplicationStrategy =
      performanceEntryDeduplicationStrategy
    this.reportErrorFn = reportErrorFn
  }

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

    return {
      defineComputedSpan: (definition) => {
        computedSpanDefinitions.push({
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
      },
      defineComputedValue: (definition) => {
        computedValueDefinitions.push({
          ...definition,
          matches: definition.matches.map((m) =>
            ensureMatcherFn<
              TracerScopeKeysT,
              AllPossibleScopesT,
              OriginatedFromT
            >(m),
          ),
        } as ComputedValueDefinition<TracerScopeKeysT, AllPossibleScopesT, OriginatedFromT>)
      },
      start: (input) => this.startTrace(completeTraceDefinition, input),
      createDraft: (input) => this.createDraft(completeTraceDefinition, input),
      transitionDraftToActive: (inputAndDefinitionModifications) =>
        void this.transitionDraftToActive(inputAndDefinitionModifications),
    }
  }

  processSpan(
    span: Span<AllPossibleScopesT>,
  ): SpanAnnotationRecord | undefined {
    return this.activeTrace?.processSpan(span)
  }

  private startTrace<
    const TracerScopeKeysT extends KeysOfUnion<AllPossibleScopesT>,
    const OriginatedFromT extends string,
  >(
    definition: CompleteTraceDefinition<
      TracerScopeKeysT,
      AllPossibleScopesT,
      OriginatedFromT
    >,
    input: StartTraceConfig<
      SelectScopeByKey<TracerScopeKeysT, AllPossibleScopesT>,
      OriginatedFromT
    >,
  ): string | undefined {
    const traceId = this.createDraft(definition, input)
    if (!traceId) return undefined

    this.transitionDraftToActive({ scope: input.scope })
    return traceId
  }

  // can have config changed until we move into active
  // from input: scope (required), attributes (optional, merge into)
  // from definition, can add items to: requiredSpans (additionalRequiredSpans), debounceOn (additionalDebounceOnSpans)
  // documentation: interruption still works and all the other events are buffered
  private transitionDraftToActive<
    TracerScopeKeysT extends KeysOfUnion<AllPossibleScopesT>,
    OriginatedFromT extends string,
  >(
    inputAndDefinitionModifications: TraceModifications<
      TracerScopeKeysT,
      AllPossibleScopesT,
      OriginatedFromT
    >,
  ): void {
    if (!this.activeTrace) {
      this.reportErrorFn(
        new Error(
          `No currently active trace when initializing a trace. Call tracer.startTrace(...) or tracer.provisionalStartTrace(...) beforehand.`,
        ),
      )
      return
    }

    // this is an already initialized active trace, do nothing:
    if (!this.activeTrace.isDraft) {
      this.reportErrorFn(
        new Error(
          `You are trying to initialize a trace that has already been initialized before (${this.activeTrace.definition.name}).`,
        ),
      )
      return
    }

    const { activeTrace } = this

    const onEnd = (
      traceRecording: TraceRecording<TracerScopeKeysT, AllPossibleScopesT>,
    ) => {
      if (traceRecording.id === activeTrace?.input.id) {
        this.activeTrace = undefined
      }
      // needs this cast because TS is confused about the type of this.reportFn due to generic usage
      ;(
        this.reportFn as SingleTraceReportFn<
          TracerScopeKeysT,
          AllPossibleScopesT,
          OriginatedFromT
        >
      )(traceRecording, activeTrace)
    }

    activeTrace.transitionDraftToActive(inputAndDefinitionModifications, onEnd)

    // else, we want to initialize the trace with the scope and other modifications:
    // TODO ...
  }

  private createDraft<
    const TracerScopeKeysT extends KeysOfUnion<AllPossibleScopesT>,
    const OriginatedFromT extends string,
  >(
    definition: CompleteTraceDefinition<
      TracerScopeKeysT,
      AllPossibleScopesT,
      OriginatedFromT
    >,
    input: BaseStartTraceConfig<OriginatedFromT>,
  ): string | undefined {
    if (this.activeTrace) {
      this.activeTrace.interrupt('another-trace-started')
      this.activeTrace = undefined
    }

    const id = input.id ?? this.generateId()

    // Verify that the originatedFrom value is valid and has a corresponding timeout
    if (!(input.originatedFrom in definition.variantsByOriginatedFrom)) {
      this.reportErrorFn(
        new Error(
          `Invalid originatedFrom value: ${
            input.originatedFrom
          }. Must be one of: ${Object.keys(
            definition.variantsByOriginatedFrom,
          ).join(', ')}`,
        ),
      )
      return undefined
    }

    const draftTraceContext: DraftTraceContext<
      TracerScopeKeysT,
      AllPossibleScopesT,
      OriginatedFromT
    > = {
      definition,
      input: {
        ...input,
        // scope will be overwritten later during initialization of the trace
        scope: undefined,
        startTime: ensureTimestamp(input.startTime),
        id,
      },
    }

    const activeTrace = new ActiveTrace<
      TracerScopeKeysT,
      AllPossibleScopesT,
      OriginatedFromT
    >(
      definition,
      draftTraceContext.input,
      this.performanceEntryDeduplicationStrategy,
    )

    this.activeTrace = activeTrace as unknown as ActiveTrace<
      KeysOfUnion<AllPossibleScopesT>,
      AllPossibleScopesT,
      string
    >

    return id
  }
}
