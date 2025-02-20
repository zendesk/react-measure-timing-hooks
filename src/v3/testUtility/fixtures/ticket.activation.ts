import type { TraceDefinition } from '../../types'
import type { FixtureAllPossibleRelationSchemas } from './relationSchemas'

const TICKET_DISPOSE_EVENT_NAME = `ticket.dispose`
const TICKET_NAVIGATED_AWAY_EVENT_NAME = `ticket.navigated-away`

export const ticketActivationDefinition: TraceDefinition<
  ['ticketId'],
  FixtureAllPossibleRelationSchemas,
  'cold_boot',
  {}
> = {
  name: 'ticket.activation',
  type: 'operation',
  relations: ['ticketId'],
  variants: {
    cold_boot: { timeout: 60_000 },
  },
  captureInteractive: true,
  requiredSpans: [
    {
      type: 'component-render',
      name: 'OmniLog',
      withTraceRelations: ['ticketId'],
      isIdle: true,
    },
  ],
  interruptOnSpans: [
    {
      type: 'mark',
      name: TICKET_DISPOSE_EVENT_NAME,
      withTraceRelations: ['ticketId'],
    },
    {
      type: 'mark',
      name: TICKET_NAVIGATED_AWAY_EVENT_NAME,
      withTraceRelations: ['ticketId'],
    },
  ],
  debounceOnSpans: [
    // debounce on anything that has matching ticketId relatedTo:
    { withTraceRelations: ['ticketId'] },
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
