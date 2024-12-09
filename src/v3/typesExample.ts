/* eslint-disable @typescript-eslint/no-unused-vars */
/* eslint-disable @typescript-eslint/consistent-type-definitions */

export type ScopeValue = string | number | boolean

export type LotusTicketScope = {
  ticketId: string
}

export type LotusUserScope = {
  userId: string
}

export type LotusCustomFieldScope = {
  customFieldId: string
}

export type AllPossibleScopes =
  | LotusTicketScope
  | LotusUserScope
  | LotusCustomFieldScope

// a span can have any combination of scopes
export type ScopeOnASpan = Prettify<
  UnionToIntersection<Partial<AllPossibleScopes>>
>

export interface Span {
  name: string
  scope: ScopeOnASpan
}

type KeysOfAllPossibleScopes = KeysOfUnion<AllPossibleScopes>

// No Infer Diagram: https://excalidraw.com/#room=4345f5a2d159f70f528a,lprwatMKsXuRrF8UUDFtWA
export interface TraceDefinitionInput<TracerScopeT> {
  name: string
  scopes: TracerScopeT[]
  requiredToEnd: Matcher<NoInfer<TracerScopeT>>[]
}

export interface StartTraceInput<SingleTracerScopeT> {
  scope: SingleTracerScopeT
}

export interface MatchDefinition<ParentTracerScopeT> {
  name?: string
  matchingScopes?: ParentTracerScopeT[]
}

export type MatchFn = (span: Span) => boolean

export type Matcher<TracerScopeT> = MatchDefinition<TracerScopeT> | MatchFn

interface Tracer<ThisTracerScopeT> {
  start: (input: StartTraceInput<ThisTracerScopeT>) => void
}

export interface TraceManager {
  // a tracer will only have one specific scope
  createTracer: <SingleTracerScopeKeyT extends KeysOfAllPossibleScopes>(
    definition: TraceDefinitionInput<SingleTracerScopeKeyT>,
  ) => Tracer<SelectScopeByKey<SingleTracerScopeKeyT, AllPossibleScopes>>
}

export interface BeaconInput {
  name: string
  scopes: AllPossibleScopes
}

export type UseBeacon = (beaconInput: BeaconInput) => void

export function processSpan(span: Span) {}

export declare const useBeacon: UseBeacon
export declare const traceManager: TraceManager

// helpers:

type SelectScopeByKey<SelectScopeKeyT extends PropertyKey, ScopesT> = Prettify<
  ScopesT extends { [AnyKey in SelectScopeKeyT]: ScopeValue } ? ScopesT : never
>

type Prettify<T> = {
  [K in keyof T]: T[K]
} & {}

type PickFromUnion<T, Keys extends KeysOfUnion<T>> = T extends Record<
  Keys,
  unknown
>
  ? Pick<T, Keys>
  : never

// T extends T: while (true) loop.
// looping only works on a generic
type KeysOfUnion<T> = T extends T ? keyof T : never

// steps 1a and 1b must be functions, because TS's infer
type Step1a = (ticketScope: LotusTicketScope) => void
type Step1b = (userScope: LotusUserScope) => void
type Step2 = Step1a | Step1b
type Step3 = Step2 extends (x: infer I) => void ? I : never

type UnionToIntersection<U> = (U extends U ? (x: U) => void : never) extends (
  x: infer I,
) => void
  ? I
  : never

// type T = AllPossibleScopes
// type WontWork = T extends T ? keyof T : never
// type WillWork = KeysOfUnion<T>

// javascript it would be:
// const getKeysOfUnion = (t: any, extending: any, thenStatement: any, elseStatement: any) => {
//   let newUnion = []
//   for (const unionMember of t) {
//     if (extending(unionMember)) {
//       newUnion.push(thenStatement)
//     } else {
//       newUnion.push(elseStatement)
//     }
//   }
//   return newUnion
// }
