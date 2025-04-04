import React, { useEffect, useState } from 'react'
import type { SpanAndAnnotation } from './spanAnnotationTypes'
import { type AllPossibleTraces, isTerminalState } from './Trace'
import type { TraceManager } from './TraceManager'
import type { RelationSchemasBase, TraceInterruptionReason } from './types'

interface TraceInfo<RelationSchemasT> {
  traceId: string
  traceName: string
  variant: string
  state: string
  timestamp: number
  inputs?: Record<string, unknown>
  requiredSpans: {
    name: string
    isMatched: boolean
  }[]
  lastRequiredSpanOffset?: number
  completeSpanOffset?: number
  cpuIdleSpanOffset?: number
  interruptionReason?: TraceInterruptionReason
  startTime: number
}

const styles = {
  container: {
    fontFamily: 'system-ui, -apple-system, BlinkMacSystemFont, sans-serif',
    maxWidth: '800px',
    margin: '20px auto',
    padding: '15px',
    border: '1px solid #ddd',
    borderRadius: '8px',
    boxShadow: '0 2px 8px rgba(0, 0, 0, 0.1)',
    backgroundColor: '#f9f9f9',
  },
  header: {
    borderBottom: '1px solid #eee',
    paddingBottom: '10px',
    marginBottom: '15px',
    display: 'flex',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  title: {
    margin: '0',
    fontSize: '18px',
    fontWeight: 'bold',
    color: '#333',
  },
  activeTrace: {
    padding: '15px',
    backgroundColor: '#fff',
    borderRadius: '6px',
    marginBottom: '15px',
    border: '1px solid #e0e0e0',
  },
  section: {
    marginBottom: '10px',
  },
  sectionTitle: {
    fontWeight: 'bold',
    marginBottom: '5px',
    fontSize: '14px',
    color: '#555',
  },
  statusTag: {
    display: 'inline-block',
    padding: '3px 8px',
    borderRadius: '12px',
    fontSize: '12px',
    fontWeight: '500',
    marginLeft: '8px',
  },
  activeTag: {
    backgroundColor: '#e3f2fd',
    color: '#1565c0',
  },
  completedTag: {
    backgroundColor: '#e8f5e9',
    color: '#2e7d32',
  },
  interruptedTag: {
    backgroundColor: '#ffebee',
    color: '#c62828',
  },
  draftTag: {
    backgroundColor: '#f5f5f5',
    color: '#616161',
  },
  listItem: {
    padding: '8px 12px',
    backgroundColor: '#f5f5f5',
    borderRadius: '4px',
    marginBottom: '6px',
    fontSize: '13px',
  },
  requiredSpan: {
    display: 'flex',
    justifyContent: 'space-between',
    alignItems: 'center',
    padding: '6px 12px',
    backgroundColor: '#f5f5f5',
    borderRadius: '4px',
    marginBottom: '6px',
    fontSize: '13px',
  },
  matched: {
    borderLeft: '3px solid #2e7d32',
  },
  unmatched: {
    borderLeft: '3px solid #757575',
  },
  matchedIndicator: {
    display: 'inline-block',
    width: '10px',
    height: '10px',
    borderRadius: '50%',
    marginRight: '8px',
  },
  matchedDot: {
    backgroundColor: '#2e7d32',
  },
  unmatchedDot: {
    backgroundColor: '#bdbdbd',
  },
  noTrace: {
    padding: '20px',
    textAlign: 'center' as const,
    color: '#757575',
    fontStyle: 'italic',
  },
  historyTitle: {
    marginTop: '20px',
    paddingTop: '15px',
    borderTop: '1px solid #eee',
    fontSize: '16px',
    fontWeight: 'bold',
    color: '#333',
  },
  historyItem: {
    padding: '12px',
    backgroundColor: '#fff',
    borderRadius: '6px',
    marginBottom: '10px',
    border: '1px solid #e0e0e0',
    cursor: 'pointer',
  },
  historyHeader: {
    display: 'flex',
    justifyContent: 'space-between',
    marginBottom: '8px',
  },
  expandedHistory: {
    marginTop: '10px',
    paddingTop: '10px',
    borderTop: '1px dashed #e0e0e0',
  },
  timeDisplay: {
    fontSize: '11px',
    color: '#666',
  },
  keyInfo: {
    display: 'flex',
    gap: '8px',
    flexWrap: 'wrap' as const,
    marginBottom: '6px',
  },
  infoChip: {
    backgroundColor: '#f1f1f1',
    padding: '2px 8px',
    borderRadius: '12px',
    fontSize: '11px',
  },
  preWrap: {
    whiteSpace: 'pre-wrap' as const,
    fontSize: '12px',
    backgroundColor: '#f5f5f5',
    padding: '8px',
    borderRadius: '4px',
    overflowX: 'auto' as const,
    maxHeight: '100px',
  },
}

function getStateStyle(state: string) {
  if (state === 'complete') return styles.completedTag
  if (state === 'interrupted') return styles.interruptedTag
  if (state === 'draft') return styles.draftTag
  return styles.activeTag
}

const traceHistoryLimit = 5

// TraceInputData component to display input data
function TraceInputData<RelationSchemasT>({
  inputs,
}: {
  inputs?: Record<string, unknown>
}) {
  if (!inputs) return null

  return (
    <div style={styles.section}>
      <div style={styles.sectionTitle}>Input Data:</div>
      <pre style={styles.preWrap}>{JSON.stringify(inputs, null, 2)}</pre>
    </div>
  )
}

// TimeMarkers component to display time markers
function TimeMarkers<RelationSchemasT>({
  lastRequiredSpanOffset,
  completeSpanOffset,
  cpuIdleSpanOffset,
}: {
  lastRequiredSpanOffset?: number
  completeSpanOffset?: number
  cpuIdleSpanOffset?: number
}) {
  if (
    lastRequiredSpanOffset === undefined &&
    completeSpanOffset === undefined &&
    cpuIdleSpanOffset === undefined
  ) {
    return null
  }

  return (
    <div style={styles.section}>
      <div style={styles.sectionTitle}>Time Markers:</div>
      <ul style={{ listStyle: 'none', margin: 0, padding: 0 }}>
        {lastRequiredSpanOffset !== undefined && (
          <li style={styles.listItem}>
            Last Required Span: +{lastRequiredSpanOffset.toFixed(2)}ms
          </li>
        )}
        {completeSpanOffset !== undefined && (
          <li style={styles.listItem}>
            Complete Span: +{completeSpanOffset.toFixed(2)}
            ms
          </li>
        )}
        {cpuIdleSpanOffset !== undefined && (
          <li style={styles.listItem}>
            CPU Idle Span: +{cpuIdleSpanOffset.toFixed(2)}
            ms
          </li>
        )}
      </ul>
    </div>
  )
}

// RequiredSpansList component to display required spans
function RequiredSpansList<RelationSchemasT>({
  requiredSpans,
}: {
  requiredSpans: { name: string; isMatched: boolean }[]
}) {
  return (
    <div style={styles.section}>
      <div style={styles.sectionTitle}>
        Required Spans ({requiredSpans.filter((s) => s.isMatched).length}/
        {requiredSpans.length}):
      </div>
      <div>
        {requiredSpans.map((span, i) => (
          <div
            key={i}
            style={{
              ...styles.requiredSpan,
              ...(span.isMatched ? styles.matched : styles.unmatched),
            }}
          >
            <div>
              <span
                style={{
                  ...styles.matchedIndicator,
                  ...(span.isMatched ? styles.matchedDot : styles.unmatchedDot),
                }}
              />
              {span.name}
            </div>
            <div>{span.isMatched ? 'Matched' : 'Pending'}</div>
          </div>
        ))}
      </div>
    </div>
  )
}

// SingleTraceInfo component to display a trace
function SingleTraceInfo<RelationSchemasT>({
  trace,
  isActive = false,
}: {
  trace: TraceInfo<RelationSchemasT>
  isActive?: boolean
}) {
  return (
    <div style={styles.activeTrace}>
      <div style={styles.section}>
        <div
          style={{
            display: 'flex',
            justifyContent: 'space-between',
            alignItems: 'center',
          }}
        >
          <h3 style={{ margin: '0 0 10px 0' }}>
            {trace.traceName}
            <span
              style={{
                ...styles.statusTag,
                ...getStateStyle(trace.state),
              }}
            >
              {trace.state}
            </span>
          </h3>
          <span style={styles.timeDisplay}>
            Started: {new Date(trace.startTime).toLocaleTimeString()}
          </span>
        </div>

        <div style={styles.keyInfo}>
          <div style={styles.infoChip}>ID: {trace.traceId}</div>
          <div style={styles.infoChip}>Variant: {trace.variant}</div>
          {trace.interruptionReason && (
            <div style={styles.infoChip}>
              Reason: {trace.interruptionReason}
            </div>
          )}
        </div>

        <TraceInputData inputs={trace.inputs} />
      </div>

      <TimeMarkers
        lastRequiredSpanOffset={trace.lastRequiredSpanOffset}
        completeSpanOffset={trace.completeSpanOffset}
        cpuIdleSpanOffset={trace.cpuIdleSpanOffset}
      />

      <RequiredSpansList requiredSpans={trace.requiredSpans} />
    </div>
  )
}

// HistoryTraceItem component to display a trace in history
function HistoryTraceItem<RelationSchemasT>({
  trace,
  isExpanded,
  onToggleExpand,
}: {
  trace: TraceInfo<RelationSchemasT>
  isExpanded: boolean
  onToggleExpand: () => void
}) {
  return (
    <div style={styles.historyItem} onClick={onToggleExpand}>
      <div style={styles.historyHeader}>
        <div>
          <strong>{trace.traceName}</strong>
          <span
            style={{
              ...styles.statusTag,
              ...getStateStyle(trace.state),
            }}
          >
            {trace.state}
          </span>
        </div>
        <span style={styles.timeDisplay}>
          {new Date(trace.timestamp).toLocaleTimeString()}
        </span>
      </div>

      <div style={styles.keyInfo}>
        <div style={styles.infoChip}>Variant: {trace.variant}</div>
        {trace.interruptionReason && (
          <div style={styles.infoChip}>Reason: {trace.interruptionReason}</div>
        )}
        <div style={styles.infoChip}>
          Completed: {trace.requiredSpans.filter((s) => s.isMatched).length}/
          {trace.requiredSpans.length} spans
        </div>
      </div>

      {isExpanded && (
        <div style={styles.expandedHistory}>
          <TraceInputData inputs={trace.inputs} />

          <TimeMarkers
            lastRequiredSpanOffset={trace.lastRequiredSpanOffset}
            completeSpanOffset={trace.completeSpanOffset}
            cpuIdleSpanOffset={trace.cpuIdleSpanOffset}
          />

          <RequiredSpansList requiredSpans={trace.requiredSpans} />
        </div>
      )}
    </div>
  )
}

/**
 * A component that visualizes the current state of the TraceManager and its Traces
 */
export function TraceManagerDebugger<
  RelationSchemasT extends RelationSchemasBase<RelationSchemasT>,
>({ traceManager }: { traceManager: TraceManager<RelationSchemasT> }) {
  const [currentTrace, setCurrentTrace] =
    useState<TraceInfo<RelationSchemasT> | null>(null)
  const [traceHistory, setTraceHistory] = useState<
    TraceInfo<RelationSchemasT>[]
  >([])
  const [expandedHistoryIndex, setExpandedHistoryIndex] = useState<
    number | null
  >(null)

  useEffect(() => {
    // Subscribe to trace-start events
    const startSub = traceManager.when('trace-start').subscribe((event) => {
      const trace = event.traceContext as AllPossibleTraces<RelationSchemasT>

      const traceInfo: TraceInfo<RelationSchemasT> = {
        traceId: trace.input.id,
        traceName: trace.definition.name,
        variant: trace.input.variant as string,
        state: trace.stateMachine.currentState,
        startTime: trace.input.startTime.epoch,
        timestamp: Date.now(),
        inputs: trace.input.relatedTo
          ? { ...trace.input.relatedTo }
          : undefined,
        requiredSpans: trace.definition.requiredSpans.map((matcher, index) => {
          const name = matcher.fromDefinition
            ? JSON.stringify(matcher.fromDefinition)
            : `Matcher #${index}`

          return {
            name,
            isMatched: false,
          }
        }),
      }

      setCurrentTrace(traceInfo)
    })

    // Subscribe to state transition events
    const stateSub = traceManager
      .when('state-transition')
      .subscribe((event) => {
        const trace = event.traceContext as AllPossibleTraces<RelationSchemasT>
        const transition = event.stateTransition

        setCurrentTrace((prevTrace) => {
          if (!prevTrace || prevTrace.traceId !== trace.input.id)
            return prevTrace

          const updatedTrace = {
            ...prevTrace,
            state: transition.transitionToState,
          }

          if ('interruptionReason' in transition) {
            updatedTrace.interruptionReason = transition.interruptionReason
          }

          if (
            'lastRequiredSpanAndAnnotation' in transition &&
            transition.lastRequiredSpanAndAnnotation
          ) {
            updatedTrace.lastRequiredSpanOffset =
              transition.lastRequiredSpanAndAnnotation.annotation.operationRelativeEndTime
          }

          if (
            'completeSpanAndAnnotation' in transition &&
            transition.completeSpanAndAnnotation
          ) {
            updatedTrace.completeSpanOffset =
              transition.completeSpanAndAnnotation.annotation.operationRelativeEndTime
          }

          if (
            'cpuIdleSpanAndAnnotation' in transition &&
            transition.cpuIdleSpanAndAnnotation
          ) {
            updatedTrace.cpuIdleSpanOffset =
              transition.cpuIdleSpanAndAnnotation.annotation.operationRelativeEndTime
          }

          // Terminal states - add to history
          if (isTerminalState(transition.transitionToState)) {
            setTraceHistory((prev) => {
              const newHistory = [updatedTrace, ...prev].slice(
                0,
                traceHistoryLimit,
              )
              return newHistory
            })

            // Return null to clear current trace since it ended
            return null
          }

          return updatedTrace
        })
      })

    // Subscribe to required span seen events
    const spanSeenSub = traceManager
      .when('required-span-seen')
      .subscribe((event) => {
        const trace = event.traceContext as AllPossibleTraces<RelationSchemasT>

        setCurrentTrace((prevTrace) => {
          if (!prevTrace || prevTrace.traceId !== trace.input.id)
            return prevTrace

          // Find which required span was matched by comparing against all matchers
          const updatedRequiredSpans = [...prevTrace.requiredSpans]
          const matchedSpan = event.spanAndAnnotation

          trace.definition.requiredSpans.forEach((matcher, index) => {
            if (
              matcher(matchedSpan, trace) &&
              index < updatedRequiredSpans.length
            ) {
              updatedRequiredSpans[index].isMatched = true
            }
          })

          return {
            ...prevTrace,
            requiredSpans: updatedRequiredSpans,
          }
        })
      })

    return () => {
      startSub.unsubscribe()
      stateSub.unsubscribe()
      spanSeenSub.unsubscribe()
    }
  }, [traceManager])

  return (
    <div style={styles.container}>
      <div style={styles.header}>
        <h2 style={styles.title}>Trace Manager Debugger</h2>
      </div>

      {currentTrace ? (
        <SingleTraceInfo trace={currentTrace} isActive={true} />
      ) : (
        <div style={styles.noTrace}>No active trace running</div>
      )}

      {traceHistory.length > 0 && (
        <>
          <h3 style={styles.historyTitle}>
            Recent Traces ({traceHistory.length})
          </h3>
          {traceHistory.map((trace, index) => (
            <HistoryTraceItem
              key={trace.traceId}
              trace={trace}
              isExpanded={expandedHistoryIndex === index}
              onToggleExpand={() =>
                void setExpandedHistoryIndex(
                  expandedHistoryIndex === index ? null : index,
                )
              }
            />
          ))}
        </>
      )}
    </div>
  )
}
