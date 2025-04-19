import type { SpanMatcherFn, SpanMatcherTags } from './matchSpan'

// tag matcher with a special, internal matcher tag, and match on span.status === 'error'
export function requiredSpanWithErrorStatus<
  const SelectedRelationNameT extends keyof RelationSchemasT,
  const RelationSchemasT,
  const VariantsT extends string,
>(): SpanMatcherFn<SelectedRelationNameT, RelationSchemasT, VariantsT> {
  const matcherFn: SpanMatcherFn<
    SelectedRelationNameT,
    RelationSchemasT,
    VariantsT
  > = ({ span }) => span.status === 'error'
  return Object.assign(
    matcherFn,
    // add a tag to the function if set to true
    { requiredSpan: true } satisfies SpanMatcherTags,
  )
}
