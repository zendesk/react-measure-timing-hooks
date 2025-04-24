import { traceManager } from './traceManager'

export const ticketOperationTracer = traceManager.createTracer({
  name: `ticket-activation`,
  type: 'operation',
  requiredSpans: [
    {
      name: 'TicketView',
      matchingRelations: true,
      type: 'component-render',
      isIdle: true,
    },
  ],
  relationSchemaName: 'ticket',
  variants: {
    click: { timeout: 15_000 },
  },
  debounceOnSpans: [
    {
      name: 'TicketView',
      matchingRelations: true,
    },
  ],
  interruptOnSpans: [
    {
      name: 'TicketView',
      matchingRelations: true,
      type: 'component-unmount',
    },
  ],
  captureInteractive: true,
})
