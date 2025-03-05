import type { TraceDefinition } from '../../types'
import type { TicketAndUserAndGlobalRelationSchemasFixture } from './relationSchemas'

const TICKET_DISPOSE_EVENT_NAME = `ticket.dispose`
const TICKET_NAVIGATED_AWAY_EVENT_NAME = `ticket.navigated-away`

export const ticketActivationDefinition: TraceDefinition<
  'ticket',
  TicketAndUserAndGlobalRelationSchemasFixture,
  'cold_boot',
  {}
> = {
  name: 'ticket.activation',
  type: 'operation',
  relationSchemaName: 'ticket',
  variants: {
    cold_boot: { timeout: 60_000 },
  },
  captureInteractive: true,
  requiredSpans: [
    {
      type: 'component-render',
      name: 'OmniLog',
      matchingRelations: ['ticketId'],
      isIdle: true,
    },
  ],
  interruptOnSpans: [
    {
      type: 'mark',
      name: TICKET_DISPOSE_EVENT_NAME,
      matchingRelations: ['ticketId'],
    },
    {
      type: 'mark',
      name: TICKET_NAVIGATED_AWAY_EVENT_NAME,
      matchingRelations: ['ticketId'],
    },
  ],
  debounceOnSpans: [
    // debounce on anything that has matching ticketId relatedTo:
    { matchingRelations: ['ticketId'] },
    // TODO: { type: 'measure', name: (name, relatedTo) => `ticket/${relatedTo.ticketId}/open` },
    // metric from ember: ticket_workspace.module.js
    ({ span }) =>
      span.type === 'measure' &&
      span.name === `ticket/${span.relatedTo?.ticketId}/open`,
    // debounce on element timing sentinels:
    ({ span }) =>
      span.type === 'element' &&
      span.name === `ticket_workspace/${span.relatedTo?.ticketId}`,
    ({ span }) =>
      span.type === 'element' &&
      span.name === `omnilog/${span.relatedTo?.ticketId}`,
  ],
}
