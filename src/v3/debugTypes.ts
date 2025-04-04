import type { SpanMatcherFn } from './matchSpan'
import type { SpanAndAnnotation } from './spanAnnotationTypes'
import type { OnEnterStatePayload } from './Trace'
import type { DraftTraceContext, RelationSchemasBase } from './types'

export interface TraceStartEvent<
  SelectedRelationNameT extends keyof RelationSchemasT,
  RelationSchemasT,
  VariantsT extends string,
> {
  traceContext: DraftTraceContext<
    SelectedRelationNameT,
    RelationSchemasT,
    VariantsT
  >
}
export interface StateTransitionEvent<
  SelectedRelationNameT extends keyof RelationSchemasT,
  RelationSchemasT,
  VariantsT extends string,
> {
  traceContext: DraftTraceContext<
    SelectedRelationNameT,
    RelationSchemasT,
    VariantsT
  >
  stateTransition: OnEnterStatePayload<RelationSchemasT>
}
export interface RequiredSpanSeenEvent<
  SelectedRelationNameT extends keyof RelationSchemasT,
  RelationSchemasT,
  VariantsT extends string,
> {
  traceContext: DraftTraceContext<
    SelectedRelationNameT,
    RelationSchemasT,
    VariantsT
  >
  spanAndAnnotation: SpanAndAnnotation<RelationSchemasT>
  matcher: SpanMatcherFn<SelectedRelationNameT, RelationSchemasT, VariantsT>
}

export type AllPossibleTraceStartEvents<
  RelationSchemasT extends RelationSchemasBase<RelationSchemasT>,
> = {
  [SelectedRelationNameT in keyof RelationSchemasT]: TraceStartEvent<
    SelectedRelationNameT,
    RelationSchemasT,
    string
  >
}[keyof RelationSchemasT]

export type AllPossibleStateTransitionEvents<
  RelationSchemasT extends RelationSchemasBase<RelationSchemasT>,
> = {
  [SelectedRelationNameT in keyof RelationSchemasT]: StateTransitionEvent<
    SelectedRelationNameT,
    RelationSchemasT,
    string
  >
}[keyof RelationSchemasT]

export type AllPossibleRequiredSpanSeenEvents<
  RelationSchemasT extends RelationSchemasBase<RelationSchemasT>,
> = {
  [SelectedRelationNameT in keyof RelationSchemasT]: RequiredSpanSeenEvent<
    SelectedRelationNameT,
    RelationSchemasT,
    string
  >
}[keyof RelationSchemasT]

export type DebugEventType =
  | 'trace-start'
  | 'state-transition'
  | 'required-span-seen'
