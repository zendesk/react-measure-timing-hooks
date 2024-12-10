/* eslint-disable @typescript-eslint/no-explicit-any */
import type { States, TraceStates } from './ActiveTrace'
import type { ScopeBase } from './types'

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
  ScopeT extends ScopeBase,
  State extends TraceStates = TraceStates,
> = State extends State
  ? {
      [K in keyof States<ScopeT>[State]]: States<ScopeT>[State][K] extends (
        ...args: infer ArgsT
      ) => infer ReturnT
        ? [K, ArgsT[0], ReturnT]
        : never
    }[keyof States<ScopeT>[State]]
  : never

type TupleToObject<T extends [PropertyKey, any, any]> = Prettify<{
  [K in T[0]]: T extends [K, infer V, any] ? V : never
}>

type TupleToObject2<T extends [PropertyKey, any, any]> = Prettify<{
  [K in T[0]]: T extends [K, any, infer V] ? V : never
}>

export type StateHandlerPayloads<ScopeT extends Partial<ScopeBase<ScopeT>>> =
  TupleToObject<HandlerToPayloadTuples<ScopeT>>

export type StateHandlerReturnTypes<ScopeT extends Partial<ScopeBase<ScopeT>>> =
  TupleToObject2<HandlerToPayloadTuples<ScopeT>>

export type MergedStateHandlerMethods<
  ScopeT extends Partial<ScopeBase<ScopeT>>,
> = {
  [K in keyof StateHandlerPayloads<ScopeT>]: (
    payload: StateHandlerPayloads<ScopeT>[K],
  ) => StateHandlerReturnTypes<ScopeT>[K]
}
export type ArrayWithAtLeastOneElement<T> = readonly [T, ...T[]]
export type MapTuple<KeysTuple extends readonly unknown[], MapToValue> = {
  [Index in keyof KeysTuple]: MapToValue // T[KeysTuple[Index]]
}
