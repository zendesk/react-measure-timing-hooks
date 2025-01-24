import type { TraceDefinition } from '../../types'

export interface TicketIdScope {
  ticketId: string
}
export interface UserIdScope {
  userId: string
}

export type FixtureAllPossibleScopes = TicketIdScope | UserIdScope

const TICKET_DISPOSE_EVENT_NAME = `ticket.dispose`
const TICKET_NAVIGATED_AWAY_EVENT_NAME = `ticket.navigated-away`

export const ticketActivationDefinition: TraceDefinition<
  'ticketId',
  FixtureAllPossibleScopes,
  'cold_boot'
> = {
  name: 'ticket.activation',
  type: 'operation',
  scopes: ['ticketId'],
  variantsByOriginatedFrom: {
    cold_boot: { timeoutDuration: 60_000 },
  },
  captureInteractive: true,
  requiredSpans: [
    {
      type: 'component-render',
      name: 'OmniLog',
      matchScopes: ['ticketId'],
      isIdle: true,
    },
  ],
  interruptOn: [
    {
      type: 'mark',
      name: TICKET_DISPOSE_EVENT_NAME,
      matchScopes: ['ticketId'],
    },
    {
      type: 'mark',
      name: TICKET_NAVIGATED_AWAY_EVENT_NAME,
      matchScopes: ['ticketId'],
    },
  ],
  debounceOn: [
    // debounce on anything that has matching ticketId scope:
    { matchScopes: ['ticketId'] },
    // TODO: { type: 'measure', name: (name, scope) => `ticket/${scope.ticketId}/open` },
    // metric from ember: ticket_workspace.module.js
    ({ span }) =>
      span.type === 'measure' &&
      span.name === `ticket/${span.scope?.ticketId}/open`,
    // debounce on element timing sentinels:
    ({ span }) =>
      span.type === 'element' &&
      span.name === `ticket_workspace/${span.scope?.ticketId}`,
    ({ span }) =>
      span.type === 'element' &&
      span.name === `omnilog/${span.scope?.ticketId}`,
  ],
}
