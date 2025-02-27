import type { SpanMatcherFn, SpanMatcherTags } from './matchSpan'
import type { KeysOfRelationSchemaToTuples } from './typeUtils'

export function requiredSpanWithErrorStatus<
  const SelectedRelationTupleT extends KeysOfRelationSchemaToTuples<RelationSchemasT>,
  const RelationSchemasT,
  const VariantsT extends string,
>(): SpanMatcherFn<SelectedRelationTupleT, RelationSchemasT, VariantsT> {
  const matcherFn: SpanMatcherFn<
    SelectedRelationTupleT,
    RelationSchemasT,
    VariantsT
  > = ({ span }) => span.status === 'error'
  return Object.assign(
    matcherFn,
    // add a tag to the function if set to true
    { requiredSpan: true } satisfies SpanMatcherTags,
  )
}
