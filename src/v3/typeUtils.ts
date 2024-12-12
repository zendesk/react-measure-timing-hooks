/* eslint-disable @typescript-eslint/no-explicit-any */
import type { States, TraceStates } from './ActiveTrace'

export type DistributiveOmit<T, K extends keyof any> = T extends T
  ? Omit<T, K>
  : never

export type Prettify<T> = {
  [K in keyof T]: T[K]
} & {}

export type PickFromUnion<T, Keys extends KeysOfUnion<T>> = T extends Record<
  Keys,
  unknown
>
  ? Pick<T, Keys>
  : never

// T extends T: while (true) loop.
// looping only works on a generic
export type KeysOfUnion<T> = T extends T ? keyof T : never

export type UnionToIntersection<U> = (
  U extends U ? (x: U) => void : never
) extends (x: infer I) => void
  ? I
  : never

type HandlerToPayloadTuples<
  TracerScopeKeysT extends KeysOfUnion<AllPossibleScopesT>,
  AllPossibleScopesT,
  State extends TraceStates = TraceStates,
> = State extends State
  ? {
      [K in keyof States<TracerScopeKeysT, AllPossibleScopesT>[State]]: States<
        TracerScopeKeysT,
        AllPossibleScopesT
      >[State][K] extends (...args: infer ArgsT) => infer ReturnT
        ? [K, ArgsT[0], ReturnT]
        : never
    }[keyof States<TracerScopeKeysT, AllPossibleScopesT>[State]]
  : never

type TupleToObject<T extends [PropertyKey, any, any]> = Prettify<{
  [K in T[0]]: T extends [K, infer V, any] ? V : never
}>

type TupleToObject2<T extends [PropertyKey, any, any]> = Prettify<{
  [K in T[0]]: T extends [K, any, infer V] ? V : never
}>

export type StateHandlerPayloads<
  TracerScopeKeysT extends KeysOfUnion<AllPossibleScopesT>,
  AllPossibleScopesT,
> = TupleToObject<HandlerToPayloadTuples<TracerScopeKeysT, AllPossibleScopesT>>

export type StateHandlerReturnTypes<
  TracerScopeKeysT extends KeysOfUnion<AllPossibleScopesT>,
  AllPossibleScopesT,
> = TupleToObject2<HandlerToPayloadTuples<TracerScopeKeysT, AllPossibleScopesT>>

export type MergedStateHandlerMethods<
  TracerScopeKeysT extends KeysOfUnion<AllPossibleScopesT>,
  AllPossibleScopesT,
> = {
  [K in keyof StateHandlerPayloads<TracerScopeKeysT, AllPossibleScopesT>]: (
    payload: StateHandlerPayloads<TracerScopeKeysT, AllPossibleScopesT>[K],
  ) => StateHandlerReturnTypes<TracerScopeKeysT, AllPossibleScopesT>[K]
}
export type ArrayWithAtLeastOneElement<T> = readonly [T, ...T[]]
export type MapTuple<KeysTuple extends readonly unknown[], MapToValue> = {
  [Index in keyof KeysTuple]: MapToValue // T[KeysTuple[Index]]
}
