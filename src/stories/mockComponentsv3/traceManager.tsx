import { TraceManager } from '../../v3/traceManager'

export interface TicketIdScope {
  ticketId: number
  [key: string]: number
}

export const traceManager = new TraceManager<TicketIdScope>({
  reportFn: (trace) => {
    console.log('# on End', trace, trace.entries, trace.duration)
  },
  generateId: () => Math.random().toString(36).slice(2),
})
