import { fromDefinition, type SpanMatch, type SpanMatcherFn } from './matchSpan'
import type { LabelMatchingFnsRecord, LabelMatchingInputRecord } from './types'
import type { ArrayWithAtLeastOneElement } from './typeUtils'

export function ensureMatcherFn<
  const SelectedRelationKeyT extends keyof RelationSchemasT,
  const RelationSchemasT,
  const VariantsT extends string,
  const MatcherInputT extends SpanMatch<
    SelectedRelationKeyT,
    RelationSchemasT,
    VariantsT
  > = SpanMatch<SelectedRelationKeyT, RelationSchemasT, VariantsT>,
>(
  matcherFnOrDefinition: MatcherInputT,
): SpanMatcherFn<SelectedRelationKeyT, RelationSchemasT, VariantsT> {
  return typeof matcherFnOrDefinition === 'function'
    ? matcherFnOrDefinition
    : fromDefinition<SelectedRelationKeyT, RelationSchemasT, VariantsT>(
        matcherFnOrDefinition,
      )
}

function arrayHasAtLeastOneElement<T>(
  arr: readonly T[],
): arr is ArrayWithAtLeastOneElement<T> {
  return arr.length > 0
}

export function convertMatchersToFns<
  const SelectedRelationKeyT extends keyof RelationSchemasT,
  const RelationSchemasT,
  const VariantsT extends string,
>(
  matchers:
    | readonly SpanMatch<SelectedRelationKeyT, RelationSchemasT, VariantsT>[]
    | undefined,
):
  | ArrayWithAtLeastOneElement<
      SpanMatcherFn<SelectedRelationKeyT, RelationSchemasT, VariantsT>
    >
  | undefined {
  const mapped = matchers?.map<
    SpanMatcherFn<SelectedRelationKeyT, RelationSchemasT, VariantsT>
  >((m) => ensureMatcherFn(m))

  if (mapped && arrayHasAtLeastOneElement(mapped)) {
    return mapped
  }
  return undefined
}

export function convertLabelMatchersToFns<
  const SelectedRelationKeyT extends keyof RelationSchemasT,
  const RelationSchemasT,
  const VariantsT extends string,
>(
  definitionLabelMatchers: LabelMatchingInputRecord<
    SelectedRelationKeyT,
    RelationSchemasT,
    VariantsT
  >,
): LabelMatchingFnsRecord<SelectedRelationKeyT, RelationSchemasT, VariantsT> {
  const matchers: LabelMatchingFnsRecord<
    SelectedRelationKeyT,
    RelationSchemasT,
    VariantsT
  > = {}
  for (const key in definitionLabelMatchers) {
    // eslint-disable-next-line no-continue
    if (!definitionLabelMatchers?.[key]) continue
    matchers[key] = ensureMatcherFn<
      SelectedRelationKeyT,
      RelationSchemasT,
      VariantsT
    >(definitionLabelMatchers[key])
  }
  return matchers
}
