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

export interface Span {
  name: string
  scopes: AllPossibleScopes
}

type KeysOfAllPossibleScopes = KeysOfUnion<AllPossibleScopes>

// No Infer Diagram: https://excalidraw.com/#room=4345f5a2d159f70f528a,lprwatMKsXuRrF8UUDFtWA
export interface TraceDefinitionInput<TracerScopeT> {
  name: string
  scopes: TracerScopeT[]
  requiredToEnd: MatchDefinition<NoInfer<TracerScopeT>>[]
}

/* 
function TraceDefinitionInput(TracerScopeT) {
  return {
    name: string
    scopes: Array(TracerScopeT),
    requiredToEnd: MatchDefinition({...TracerScopeT})
  }
}
*/

export interface StartTraceInput<SingleTracerScopeT> {
  scope: SingleTracerScopeT
}

export interface MatchDefinition<ParentTracerScopeT> {
  name?: string
  matchingScopes?: ParentTracerScopeT[]
}

// consider generics as a type function generator
//  it would be:
// const matchDefinition = (parentTracerScopeT) => {
//   return {
//     name: String,
//     matchingScopes: Array(parentTracerScopeT)
//   }
// }

export type MatchFn = (span: Span) => boolean

interface Tracer<ThisTracerScopeT> {
  start: (input: StartTraceInput<ThisTracerScopeT>) => void
}

export interface TraceManager {
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

type TicketExample = SelectScopeByKey<'ticketId', AllPossibleScopes>

type PickTicketExample = Prettify<PickFromUnion<AllPossibleScopes, 'ticketId'>>

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
