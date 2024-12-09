/* eslint-disable @typescript-eslint/consistent-type-definitions */

export type ScopeValue = string | number | boolean

export type LotusTicketScope = {
  ticketId: ScopeValue
}

export type LotusUserScope = {
  userId: ScopeValue
}

export type LotusCustomFieldScope = {
  customFieldId: ScopeValue
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

export interface StartTraceInput {
  scope: AllPossibleScopes
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

interface Tracer {
  start: (input: StartTraceInput) => void
}

export interface TraceManager {
  createTracer: <SingleTracerScopeT extends KeysOfAllPossibleScopes>(
    definition: TraceDefinitionInput<SingleTracerScopeT>,
  ) => Tracer
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

// T extends T: while (true) loop.
// looping only works on a generic
type KeysOfUnion<T> = T extends T ? keyof T : never

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
