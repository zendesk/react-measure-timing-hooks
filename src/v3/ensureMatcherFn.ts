import { fromDefinition, type SpanMatch, type SpanMatcherFn } from './matchSpan'
import type { LabelMatchingFnsRecord, LabelMatchingInputRecord } from './types'
import type {
  ArrayWithAtLeastOneElement,
  KeysOfRelationSchemaToTuples,
} from './typeUtils'

export function ensureMatcherFn<
  const SelectedRelationTupleT extends KeysOfRelationSchemaToTuples<RelationSchemasT>,
  const RelationSchemasT,
  const VariantsT extends string,
  const MatcherInputT extends SpanMatch<
    SelectedRelationTupleT,
    RelationSchemasT,
    VariantsT
  > = SpanMatch<SelectedRelationTupleT, RelationSchemasT, VariantsT>,
>(
  matcherFnOrDefinition: MatcherInputT,
): SpanMatcherFn<SelectedRelationTupleT, RelationSchemasT, VariantsT> {
  return typeof matcherFnOrDefinition === 'function'
    ? matcherFnOrDefinition
    : fromDefinition<SelectedRelationTupleT, RelationSchemasT, VariantsT>(
        matcherFnOrDefinition,
      )
}

function arrayHasAtLeastOneElement<T>(
  arr: readonly T[],
): arr is ArrayWithAtLeastOneElement<T> {
  return arr.length > 0
}

export function convertMatchersToFns<
  const SelectedRelationTupleT extends KeysOfRelationSchemaToTuples<RelationSchemasT>,
  const RelationSchemasT,
  const VariantsT extends string,
>(
  matchers:
    | readonly SpanMatch<SelectedRelationTupleT, RelationSchemasT, VariantsT>[]
    | undefined,
):
  | ArrayWithAtLeastOneElement<
      SpanMatcherFn<SelectedRelationTupleT, RelationSchemasT, VariantsT>
    >
  | undefined {
  const mapped = matchers?.map<
    SpanMatcherFn<SelectedRelationTupleT, RelationSchemasT, VariantsT>
  >((m) => ensureMatcherFn(m))

  if (mapped && arrayHasAtLeastOneElement(mapped)) {
    return mapped
  }
  return undefined
}

export function convertLabelMatchersToFns<
  const SelectedRelationTupleT extends KeysOfRelationSchemaToTuples<RelationSchemasT>,
  const RelationSchemasT,
  const VariantsT extends string,
>(
  definitionLabelMatchers: LabelMatchingInputRecord<
    SelectedRelationTupleT,
    RelationSchemasT,
    VariantsT
  >,
): LabelMatchingFnsRecord<SelectedRelationTupleT, RelationSchemasT, VariantsT> {
  const matchers: LabelMatchingFnsRecord<
    SelectedRelationTupleT,
    RelationSchemasT,
    VariantsT
  > = {}
  for (const key in definitionLabelMatchers) {
    // eslint-disable-next-line no-continue
    if (!definitionLabelMatchers?.[key]) continue
    matchers[key] = ensureMatcherFn<
      SelectedRelationTupleT,
      RelationSchemasT,
      VariantsT
    >(definitionLabelMatchers[key])
  }
  return matchers
}
