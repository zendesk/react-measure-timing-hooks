import { generateUseBeacon } from '../../v3/hooks'
import { observePerformanceWithTraceManager } from '../../v3/observePerformanceWithTraceManager'
import { TraceManager } from '../../v3/traceManager'

export interface TicketIdScope {
  ticketId: number
  [key: string]: number
}

export const traceManager = new TraceManager<TicketIdScope>({
  reportFn: (trace) => {
    // eslint-disable-next-line no-console
    console.log('# on End', trace, trace.entries, trace.duration)
  },
  // eslint-disable-next-line no-magic-numbers
  generateId: () => Math.random().toString(36).slice(2),
  reportErrorFn: (error) => {
    // eslint-disable-next-line no-console
    console.error(error)
  },
})

observePerformanceWithTraceManager({
  traceManager,
  entryTypes: [
    'element',
    'event',
    'first-input',
    'largest-contentful-paint',
    'layout-shift',
    'long-animation-frame',
    'longtask',
    'mark',
    'measure',
    'navigation',
    'paint',
    'resource',
    'visibility-state',
  ],
})

export const useBeacon = generateUseBeacon(traceManager)
