import type { TraceDefinition } from '../types'

export interface TicketIdScope {
  ticketId: string
  [key: string]: string
}
const TICKET_DISPOSE_EVENT_NAME = `ticket.dispose`
const TICKET_NAVIGATED_AWAY_EVENT_NAME = `ticket.navigated-away`

export const ticketActivationDefinition: TraceDefinition<TicketIdScope> = {
  name: 'ticket.activation',
  type: 'operation',
  requiredScopeKeys: ['ticketId'],
  timeoutDuration: 60_000,
  captureInteractive: true,
  requiredToEnd: [
    {
      type: 'component-render',
      name: 'OmniLog',
      scopes: ['ticketId'],
      isIdle: true,
    },
  ],
  interruptOn: [
    { type: 'mark', name: TICKET_DISPOSE_EVENT_NAME, scopes: ['ticketId'] },
    {
      type: 'mark',
      name: TICKET_NAVIGATED_AWAY_EVENT_NAME,
      scopes: ['ticketId'],
    },
  ],
  debounceOn: [
    // debounce on anything that has matching ticketId scope:
    { scopes: ['ticketId'] },
    // TODO: { type: 'measure', name: (name, scope) => `ticket/${scope.ticketId}/open` },
    // metric from ember: ticket_workspace.module.js
    ({ span }, scope) =>
      span.type === 'measure' && span.name === `ticket/${scope.ticketId}/open`,
    // debounce on element timing sentinels:
    ({ span }, scope) =>
      span.type === 'element' &&
      span.name === `ticket_workspace/${scope.ticketId}`,
    ({ span }, scope) =>
      span.type === 'element' && span.name === `omnilog/${scope.ticketId}`,
  ],
}
