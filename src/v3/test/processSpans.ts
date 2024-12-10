import { Span } from '../spanTypes'
import { TraceManager } from '../traceManager'

function processSpans<ScopeT>(
  spans: Span<ScopeT>[],
  traceManager: TraceManager<ScopeT>,
) {
  spans.forEach((span, i) => {
    traceManager.processSpan(span)
  })
}

export default processSpans
