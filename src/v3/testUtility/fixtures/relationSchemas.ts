export interface TicketIdRelationSchema {
  readonly ticketId: StringConstructor
}
export interface UserIdRelationSchema {
  readonly userId: StringConstructor
}

export type FixtureAllPossibleRelationSchemas =
  | TicketIdRelationSchema
  | UserIdRelationSchema
