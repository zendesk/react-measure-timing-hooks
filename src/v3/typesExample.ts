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

type KeysOfPossibleScopes = KeysOfUnion<AllPossibleScopes>

export interface TraceDefinitionInput {
  name: string
  scopes: KeysOfPossibleScopes[]
  requiredToEnd: MatchDefinition[]
}

export interface StartTraceInput {
  scope: AllPossibleScopes
}

export interface MatchDefinition {
  name?: string
  matchingScopes?: KeysOfPossibleScopes[]
}

interface Tracer {
  start: (input: StartTraceInput) => void
}

export interface TraceManager {
  createTracer: (definition: TraceDefinitionInput) => Tracer
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
