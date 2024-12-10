import { ensureTimestamp } from '../ensureTimestamp'
import { Span, SpanType } from '../spanTypes'
import { TraceManager } from '../traceManager'
import { ScopeBase } from '../types'

function processEntries<ScopeT>(
  entries: PerformanceEntry[],
  traceManager: TraceManager<ScopeT>,
) {
  entries.forEach((entry, i) => {
    if (i > 0) {
      const prevEntry = entries[i - 1]!
      jest.advanceTimersByTime(entry.startTime - prevEntry.startTime)
    }

    traceManager.processSpan({
      name: entry.name,
      duration: entry.duration,
      isIdle: entry.name.includes('idle'),
      renderedOutput: entry.name.includes('idle') ? 'content' : 'loading',
      startTime: ensureTimestamp({ now: entry.startTime }),
      type: entry.entryType as SpanType,
      performanceEntry: entry,
      scope: {},
    } as Span<ScopeT>)
  })
}

export default processEntries
