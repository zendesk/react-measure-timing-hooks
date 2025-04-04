import { traceManager } from './traceManager'

export const ticketOperationTracer = traceManager.createTracer({
  name: `ticket-activation`,
  type: 'operation',
  requiredSpans: [
    {
      name: 'TicketView',
      matchingRelations: ['ticketId'],
      type: 'component-render',
      isIdle: true,
    },
  ],
  relationSchemaName: 'ticket',
  variants: {
    click: { timeout: 45_000 },
  },
  // debounceWindow: 1_000,
  debounceOnSpans: [
    {
      name: 'TicketView',
      matchingRelations: ['ticketId'],
    },
  ],
  interruptOnSpans: [
    {
      name: 'TicketView',
      matchingRelations: ['ticketId'],
      type: 'component-unmount',
    },
  ],
  captureInteractive: true,
})
