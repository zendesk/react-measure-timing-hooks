import { Span } from '../spanTypes'
import { TraceManager } from '../traceManager'
import { ScopeValue } from '../types'

function processSpans<
  AllPossibleScopeT extends { [K in keyof AllPossibleScopeT]: ScopeValue },
>(
  spans: Span<AllPossibleScopeT>[],
  traceManager: TraceManager<AllPossibleScopeT>,
) {
  spans.forEach((span, i) => {
    traceManager.processSpan(span)
  })
}

export default processSpans
