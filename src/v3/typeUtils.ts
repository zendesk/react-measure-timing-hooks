/* eslint-disable @typescript-eslint/no-explicit-any */
import type { States, TraceStates } from './Trace'

export type DistributiveOmit<T, K extends keyof any> = T extends T
  ? Omit<T, K>
  : never

export type Prettify<T> = {
  [K in keyof T]: T[K]
} & {}

/**
 * For each object type T in union U, produce a union of
 * *every possible permutation* of its keys as a tuple.
 * Adds an empty tuple and handles the case of records with a string index signature.
 */
export type KeysOfRelationSchemaToTuples<T> =
  | (T extends unknown
      ? PropertyKey extends T
        ? readonly [string]
        : string extends keyof T
        ? readonly string[]
        : UnionToTuplePermutations<keyof RemoveAllUndefinedProperties<T>>
      : never)
  | readonly []

// type Example = KeysOfRelationSchemaToTuples<{ a: string; b: number; c: number } | { a: number }>;
// type TestAbove = KeysOfRelationSchemaToTuples<{}>

export type RemoveAllUndefinedProperties<T> = Prettify<{
  [K in keyof T as T[K] extends undefined ? never : K]: T[K]
}>

// type TestAbove = RemoveAllUndefinedProperties<{ a?: boolean; b: undefined }>

/**
 * Extract the set of keys in T whose type is not exactly `undefined`.
 * If T[P] is `? undefined`, we treat that key as "unused."
 */
type NonUndefinedKeys<T> = {
  [P in keyof T]-?: T[P] extends undefined ? never : P
}[keyof T]

// type TestAbove = NonUndefinedKeys<{ a: string; b?: number; c: undefined }>

type ExactKeySet<T, K extends PropertyKey> = [NonUndefinedKeys<T>] extends [K] // is T's key-set a subset of K?
  ? [K] extends [NonUndefinedKeys<T>] // is K a subset of T's key-set?
    ? true
    : false
  : false

/**
 * Picks from U those members whose *non-undefined* keys
 * are exactly the set K.
 */
export type SelectByAllKeys<K extends PropertyKey, U> = U extends unknown
  ? ExactKeySet<U, K> extends true
    ? U
    : never
  : never

/**
 * Picks from U those members that have at least one
 * non-undefined key from K.
 */
export type SelectBySomeKeys<K extends PropertyKey, U> = U extends unknown
  ? Extract<NonUndefinedKeys<U>, K> extends never
    ? never
    : U
  : never

/**
 * For T, check if NonUndefinedKeys<T> is exactly equal to the set of keys in K.
 * "Exactly equal" means the two sets are mutual subsets of each other.
 */
type HasExactKeys<
  T,
  K extends readonly PropertyKey[],
> = NonUndefinedKeys<T> extends K[number] // T's keys ⊆ K
  ? K[number] extends NonUndefinedKeys<T> // K ⊆ T's keys
    ? true
    : false
  : false

// type TestAboveTrue = HasExactKeys<{ a: string; b?: number }, ['b', 'a']>
// type TestAboveTrue2 = HasExactKeys<{ a: string; b?: undefined}, ['a']>
// type TestAboveFalse = HasExactKeys<{ a: string; b: number }, ['a']>
// type TestAboveFalse2 = HasExactKeys<{ a: string; b?: undefined}, ['b', 'a']>
// type TestAboveFalse3 = HasExactKeys<{ a: string; b?: number | undefined}, ['a']>

/**
 * For T, check if it has at least one key from K as non-undefined.
 */
type HasSomeKeys<T, K extends readonly PropertyKey[]> =
  // We see if NonUndefinedKeys<T> intersects with K[number] is non-empty
  Extract<NonUndefinedKeys<T>, K[number]> extends never ? false : true

// type TestAboveTrue = HasSomeKeys<{ a: string; b?: number }, ['b', 'a']>
// type TestAboveTrue2 = HasSomeKeys<{ a: string; b?: number }, ['a']>
// type TestAboveFalse = HasSomeKeys<{ a: string; b?: number; c: undefined }, ['c']>

/**
 * From a union of object types U, pick those whose non-undefined keys
 * are *exactly* the set of keys in K (ignoring order).
 */
export type SelectByAllKeysUnion<
  K extends readonly PropertyKey[],
  U,
> = U extends unknown ? (HasExactKeys<U, K> extends true ? U : never) : never

// type TestAboveOk = SelectByAllKeysUnion<['a', 'b'], { a: string; b: number } | { a: string; c: number }>
// type TestAboveOk2 = SelectByAllKeysUnion<['c', 'a'], { a: string; b: number } | { a: string; c: number }>
// type TestAboveNever = SelectByAllKeysUnion<['c'], { a: string; b: number } | { a: string; c: number }>;
// type TestAboveNever2 = SelectByAllKeysUnion<['a'], { a: string; b: number } | { a: string; c: number }>;

/**
 * From a union of object types U, pick those that have at least one
 * non-undefined key from K.
 */
export type SelectBySomeKeysUnion<
  K extends readonly PropertyKey[],
  U,
> = U extends unknown ? (HasSomeKeys<U, K> extends true ? U : never) : never

// type TestAbove = SelectBySomeKeysUnion<['a'], { a: string; b: number } | { a: string; c: number }>;
// type TestAbove2 = SelectBySomeKeysUnion<['b'], { a: string; b: number } | { a: string; c: number }>;

/**
 * Permutations<U> returns a union of *all* possible permutations
 * of the keys in U as tuples.
 *
 * Example:
 *   Permutations<"a" | "b">  // => ["a","b"] | ["b","a"]
 *   Permutations<"a">        // => ["a"]
 *   Permutations<never>      // => [] (empty array)
 */
type UnionToTuplePermutations<U extends PropertyKey> = [U] extends [never]
  ? []
  : {
      [K in U]: readonly [K, ...UnionToTuplePermutations<Exclude<U, K>>]
    }[U]

export type UnionToIntersection<U> = (
  U extends U ? (x: U) => void : never
) extends (x: infer I) => void
  ? I
  : never

type HandlerToPayloadTuples<
  SelectedRelationTupleT extends KeysOfRelationSchemaToTuples<RelationSchemasT>,
  RelationSchemasT,
  VariantsT extends string,
  State extends TraceStates = TraceStates,
> = State extends State
  ? {
      [K in keyof States<
        SelectedRelationTupleT,
        RelationSchemasT,
        VariantsT
      >[State]]: States<
        SelectedRelationTupleT,
        RelationSchemasT,
        VariantsT
      >[State][K] extends (...args: infer ArgsT) => infer ReturnT
        ? [K, ArgsT[0], ReturnT]
        : never
    }[keyof States<SelectedRelationTupleT, RelationSchemasT, VariantsT>[State]]
  : never

type TupleToObject<T extends [PropertyKey, any, any]> = Prettify<{
  [K in T[0]]: T extends [K, infer V, any] ? V : never
}>

type TupleToObject2<T extends [PropertyKey, any, any]> = Prettify<{
  [K in T[0]]: T extends [K, any, infer V] ? V : never
}>

export type StateHandlerPayloads<
  SelectedRelationTupleT extends KeysOfRelationSchemaToTuples<RelationSchemasT>,
  RelationSchemasT,
  VariantsT extends string,
> = TupleToObject<
  HandlerToPayloadTuples<SelectedRelationTupleT, RelationSchemasT, VariantsT>
>

export type StateHandlerReturnTypes<
  SelectedRelationTupleT extends KeysOfRelationSchemaToTuples<RelationSchemasT>,
  RelationSchemasT,
  VariantsT extends string,
> = TupleToObject2<
  HandlerToPayloadTuples<SelectedRelationTupleT, RelationSchemasT, VariantsT>
>

export type MergedStateHandlerMethods<
  SelectedRelationTupleT extends KeysOfRelationSchemaToTuples<RelationSchemasT>,
  RelationSchemasT,
  VariantsT extends string,
> = {
  [K in keyof StateHandlerPayloads<
    SelectedRelationTupleT,
    RelationSchemasT,
    VariantsT
  >]: (
    payload: StateHandlerPayloads<
      SelectedRelationTupleT,
      RelationSchemasT,
      VariantsT
    >[K],
  ) => StateHandlerReturnTypes<
    SelectedRelationTupleT,
    RelationSchemasT,
    VariantsT
  >[K]
}
export type ArrayWithAtLeastOneElement<T> = readonly [T, ...T[]]
export type MapTuple<KeysTuple extends readonly unknown[], MapToValue> = {
  [Index in keyof KeysTuple]: MapToValue
}

/** Convert a union of values U into a single tuple type (in an arbitrary order). */
type UnionToTuple<U, R extends any[] = []> = [U] extends [never]
  ? R
  : UnionToTuple<Exclude<U, LastOf<U>>, [LastOf<U>, ...R]>

type LastOf<U> = UnionToIntersection<
  U extends any ? (x: U) => void : never
> extends (x: infer L) => void
  ? L
  : never

/**
 * Reverse of MapSchemaToTypes:
 *   - boolean => BooleanConstructor
 *   - string => StringConstructor (if it's the wide string)
 *   - number => NumberConstructor (if it's the wide number)
 *   - union of string/number *literals* => a readonly tuple of those literals
 *   - otherwise => never
 */
export type MapTypesToSchema<T> = {
  [K in keyof T]: T[K] extends boolean // 1) If it's (wide) boolean or effectively boolean => BooleanConstructor
    ? BooleanConstructor
    : T[K] extends string | number | boolean
    ? string extends T[K]
      ? StringConstructor
      : number extends T[K]
      ? NumberConstructor
      : boolean extends T[K]
      ? BooleanConstructor
      : readonly [...UnionToTuple<T[K]>]
    : never
}
