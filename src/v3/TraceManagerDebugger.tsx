import React, { useEffect, useRef, useState } from 'react'
import { createTraceRecording } from './recordingComputeUtils'
import {
  type AllPossibleTraces,
  type FinalTransition,
  isTerminalState,
} from './Trace'
import type { TraceManager } from './TraceManager'
import type {
  RelationSchemasBase,
  TraceContext,
  TraceInterruptionReason,
} from './types'

// Constants to avoid magic numbers
const MAX_STRING_LENGTH = 20
const LONG_STRING_THRESHOLD = 25

interface RequiredSpan {
  name: string
  isMatched: boolean
  definition?: Record<string, unknown>
}

interface TraceInfo<RelationSchemasT> {
  traceId: string
  traceName: string
  variant: string
  state: string
  requiredSpans: RequiredSpan[]
  attributes?: Record<string, unknown>
  lastRequiredSpanOffset?: number
  completeSpanOffset?: number
  cpuIdleSpanOffset?: number
  interruptionReason?: TraceInterruptionReason
  startTime: number
  relatedTo?: Record<string, unknown>
  // Store the trace context to be able to generate trace recordings later
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  traceContext?: TraceContext<any, RelationSchemasT, any>
  finalTransition?: FinalTransition<RelationSchemasT>
}

const styles = {
  container: {
    fontFamily: 'system-ui, -apple-system, BlinkMacSystemFont, sans-serif',
    maxWidth: '800px',
    margin: '20px auto',
    padding: '20px',
    border: '1px solid #ddd',
    borderRadius: '8px',
    boxShadow: '0 2px 8px rgba(0, 0, 0, 0.1)',
    backgroundColor: '#f9f9f9',
  },
  header: {
    borderBottom: '1px solid #eee',
    paddingBottom: '15px',
    marginBottom: '20px',
    display: 'flex',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  title: {
    margin: '0',
    fontSize: '20px',
    fontWeight: 'bold',
    color: '#333',
  },
  activeTrace: {
    padding: '20px',
    backgroundColor: '#fff',
    borderRadius: '8px',
    marginBottom: '20px',
    border: '1px solid #e0e0e0',
    boxShadow: '0 1px 3px rgba(0, 0, 0, 0.05)',
  },
  section: {
    marginBottom: '15px',
  },
  sectionTitle: {
    fontWeight: 'bold',
    marginBottom: '10px',
    fontSize: '14px',
    color: '#555',
  },
  statusTag: {
    display: 'inline-block',
    padding: '4px 10px',
    borderRadius: '12px',
    fontSize: '12px',
    fontWeight: '500',
    marginLeft: '10px',
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
    padding: '5px 15px',
    backgroundColor: '#f5f5f5',
    borderRadius: '6px',
    marginBottom: '3px',
    fontSize: '13px',
    display: 'flex',
    justifyContent: 'space-between',
  },
  requiredSpan: {
    display: 'flex',
    justifyContent: 'space-between',
    alignItems: 'center',
    padding: '10px 15px',
    backgroundColor: '#f5f5f5',
    borderRadius: '6px',
    marginBottom: '8px',
    fontSize: '13px',
  },
  matched: {
    borderLeft: '4px solid #2e7d32',
  },
  unmatched: {
    borderLeft: '4px solid #757575',
  },
  matchedIndicator: {
    display: 'inline-block',
    width: '12px',
    height: '12px',
    borderRadius: '50%',
    marginRight: '10px',
  },
  matchedDot: {
    backgroundColor: '#2e7d32',
  },
  unmatchedDot: {
    backgroundColor: '#bdbdbd',
  },
  noTrace: {
    padding: '30px',
    textAlign: 'center' as const,
    color: '#757575',
    fontStyle: 'italic',
    backgroundColor: '#fff',
    borderRadius: '8px',
    border: '1px solid #e0e0e0',
  },
  historyTitle: {
    paddingTop: '20px',
    marginBottom: '10px',
    borderTop: '1px solid #eee',
    fontSize: '18px',
    fontWeight: 'bold',
    color: '#333',
    display: 'flex',
    alignItems: 'center',
    gap: '10px',
  },
  visualizerLink: {
    backgroundColor: '#1976d2',
    color: 'white',
    border: 'none',
    borderRadius: '4px',
    padding: '4px 10px',
    fontSize: '12px',
    cursor: 'pointer',
    textDecoration: 'none',
    display: 'inline-flex',
    alignItems: 'center',
  },
  historyItem: {
    padding: '15px',
    backgroundColor: '#fff',
    borderRadius: '8px',
    marginBottom: '12px',
    border: '1px solid #e0e0e0',
    cursor: 'pointer',
    boxShadow: '0 1px 3px rgba(0, 0, 0, 0.05)',
    transition: 'box-shadow 0.2s ease',
    position: 'relative', // For positioning the arrow
  },
  historyItemHover: {
    boxShadow: '0 4px 8px rgba(0, 0, 0, 0.15)',
  },
  historyHeader: {
    display: 'flex',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: '8px',
  },
  expandArrow: {
    position: 'absolute',
    bottom: '0px',
    left: '50%',
    transform: 'translateX(-50%)',
    width: '24px',
    height: '24px',
    display: 'flex',
    justifyContent: 'center',
    alignItems: 'center',
    transition: 'transform 0.2s ease',
  },
  expandArrowDown: {
    transform: 'translateX(-50%) rotate(0deg)',
  },
  expandArrowUp: {
    transform: 'translateX(-50%) rotate(180deg)',
  },
  expandedHistory: {
    marginTop: '15px',
    paddingTop: '15px',
    borderTop: '1px dashed #e0e0e0',
  },
  timeDisplay: {
    fontSize: '12px',
    color: '#666',
    fontWeight: '500',
  },
  keyInfo: {
    display: 'flex',
    gap: '8px',
    flexWrap: 'wrap' as const,
    marginBottom: '10px',
  },
  infoChip: {
    backgroundColor: '#f1f1f1',
    padding: '3px 10px',
    borderRadius: '12px',
    fontSize: '12px',
    color: '#333',
    border: '1px solid #e0e0e0',
  },
  idChip: {
    backgroundColor: '#f5f5f5',
    color: '#757575',
    padding: '3px 10px',
    borderRadius: '12px',
    fontSize: '11px',
    border: '1px solid #e0e0e0',
  },
  variantChip: {
    backgroundColor: '#e8f5e9',
    color: '#2e7d32',
    padding: '3px 10px',
    borderRadius: '12px',
    fontSize: '12px',
    border: '1px solid #c8e6c9',
    fontWeight: '500',
  },
  reasonChip: {
    backgroundColor: '#ffebee',
    color: '#c62828',
    padding: '3px 10px',
    borderRadius: '12px',
    fontSize: '12px',
    border: '1px solid #ffcdd2',
    fontWeight: '500',
  },
  relatedChip: {
    backgroundColor: '#e3f2fd',
    color: '#1565c0',
    padding: '3px 10px',
    borderRadius: '12px',
    fontSize: '12px',
    border: '1px solid #bbdefb',
  },
  relatedGroup: {
    display: 'inline-flex',
    flexWrap: 'nowrap',
    overflow: 'hidden',
    borderRadius: '12px',
    border: '1px solid #bbdefb',
    backgroundColor: '#e3f2fd',
  },
  relatedLabel: {
    color: '#1565c0',
    padding: '3px 8px',
    fontSize: '12px',
  },
  relatedItems: {
    backgroundColor: '#1565c0',
    display: 'flex',
    gap: '2px',
    padding: '0 6px',
  },
  relatedItem: {
    backgroundColor: '#1565c0',
    color: 'white',
    padding: '3px 4px',
    fontSize: '12px',
  },
  // Variant chip group
  variantGroup: {
    display: 'inline-flex',
    flexWrap: 'nowrap',
    overflow: 'hidden',
    borderRadius: '12px',
    border: '1px solid #c8e6c9',
    backgroundColor: '#e8f5e9',
  },
  variantLabel: {
    color: '#2e7d32',
    padding: '3px 8px',
    fontSize: '12px',
  },
  variantValue: {
    backgroundColor: '#2e7d32',
    color: 'white',
    padding: '3px 8px',
    fontSize: '12px',
    fontWeight: '500',
  },
  // Required spans chip group
  spansGroup: {
    display: 'inline-flex',
    flexWrap: 'nowrap',
    overflow: 'hidden',
    borderRadius: '12px',
    border: '1px solid #ffe0b2',
    backgroundColor: '#fff3e0',
  },
  spansLabel: {
    color: '#e65100',
    padding: '3px 8px',
    fontSize: '12px',
  },
  spansValue: {
    backgroundColor: '#e65100',
    color: 'white',
    padding: '3px 8px',
    fontSize: '12px',
    fontWeight: '500',
  },
  // Interruption reason chip group
  reasonGroup: {
    display: 'inline-flex',
    flexWrap: 'nowrap',
    overflow: 'hidden',
    borderRadius: '12px',
    border: '1px solid #ffcdd2',
    backgroundColor: '#ffebee',
  },
  reasonLabel: {
    color: '#c62828',
    padding: '3px 8px',
    fontSize: '12px',
  },
  reasonValue: {
    backgroundColor: '#c62828',
    color: 'white',
    padding: '3px 8px',
    fontSize: '12px',
    fontWeight: '500',
  },
  spansChip: {
    backgroundColor: '#fff3e0',
    color: '#e65100',
    padding: '3px 10px',
    borderRadius: '12px',
    fontSize: '12px',
    border: '1px solid #ffe0b2',
    fontWeight: '500',
  },
  preWrap: {
    whiteSpace: 'pre-wrap' as const,
    fontSize: '12px',
    backgroundColor: '#f5f5f5',
    padding: '12px',
    borderRadius: '6px',
    overflowX: 'auto' as const,
    maxHeight: '200px',
    border: '1px solid #e0e0e0',
  },
  timeMarkerValue: {
    fontFamily: 'monospace',
    textAlign: 'right',
    display: 'inline-block',
    width: '80px',
    fontWeight: '500',
  },
  floatingContainer: {
    position: 'fixed' as const,
    top: '10px',
    right: '10px',
    maxWidth: '650px',
    width: '100%',
    zIndex: 1_000,
    resize: 'both' as const,
    overflow: 'auto' as const,
    maxHeight: '90vh',
    boxShadow: '0 6px 20px rgba(0, 0, 0, 0.15)',
  },
  handle: {
    padding: '12px 15px',
    backgroundColor: '#2a2a2a',
    color: 'white',
    cursor: 'move',
    display: 'flex',
    justifyContent: 'space-between',
    alignItems: 'center',
    borderTopLeftRadius: '8px',
    borderTopRightRadius: '8px',
  },
  handleTitle: {
    margin: 0,
    fontSize: '14px',
    fontWeight: 'bold' as const,
  },
  closeButton: {
    background: 'none',
    border: 'none',
    color: 'white',
    cursor: 'pointer',
    fontSize: '18px',
    padding: '2px 8px',
  },
  minimizedButton: {
    position: 'fixed' as const,
    bottom: '20px',
    right: '20px',
    backgroundColor: '#1565c0',
    color: 'white',
    border: 'none',
    borderRadius: '50%',
    width: '74px',
    height: '74px',
    opacity: 0.9,
    display: 'flex',
    justifyContent: 'center',
    alignItems: 'center',
    cursor: 'pointer',
    boxShadow: '0 4px 10px rgba(0, 0, 0, 0.2)',
    zIndex: 1_000,
    fontSize: '14px',
    fontWeight: 'bold',
  },
  defChipContainer: {
    display: 'flex',
    flexWrap: 'wrap' as const,
    gap: '5px',
    alignItems: 'center',
  },
  defChip: {
    backgroundColor: '#e3f2fd',
    color: '#1565c0',
    padding: '2px 8px',
    borderRadius: '10px',
    fontSize: '11px',
    maxWidth: '200px',
    textOverflow: 'ellipsis',
    whiteSpace: 'nowrap' as const,
    position: 'relative' as const,
    border: '1px solid #90caf9',
  },
  defChipValue: {
    fontWeight: 'bold' as const,
  },
  defChipTooltip: {
    position: 'absolute' as const,
    bottom: '100%',
    left: '50%',
    transform: 'translateX(-50%)',
    backgroundColor: 'rgba(0,0,0,0.8)',
    color: '#fff',
    padding: '5px 10px',
    borderRadius: '4px',
    fontSize: '11px',
    // eslint-disable-next-line no-magic-numbers
    zIndex: 1_001 as const,
    minWidth: '200px',
    maxWidth: '300px',
    wordBreak: 'break-word' as const,
    pointerEvents: 'none' as const,
    opacity: 0,
    transition: 'opacity 0.3s ease',
    visibility: 'hidden' as const,
  },
  defChipHoverable: {
    cursor: 'help',
  },
  defChipHoverVisible: {
    opacity: 1,
    visibility: 'visible' as const,
  },
  spanContent: {
    display: 'flex',
    alignItems: 'center',
    flex: 1,
  },
  downloadButton: {
    backgroundColor: '#1976d2',
    color: 'white',
    border: 'none',
    borderRadius: '4px',
    padding: '4px 10px',
    fontSize: '12px',
    cursor: 'pointer',
    alignItems: 'center',
    marginLeft: '10px',
  },
  downloadIcon: {
    fontSize: '14px',
  },
} as const

function getStateStyle(state: string) {
  if (state === 'complete') return styles.completedTag
  if (state === 'interrupted') return styles.interruptedTag
  if (state === 'draft') return styles.draftTag
  return styles.activeTag
}

const TRACE_HISTORY_LIMIT = 15

// TraceAttributes component to display attributes as chips
function TraceAttributes({
  attributes,
}: {
  attributes?: Record<string, unknown>
}) {
  if (!attributes || Object.keys(attributes).length === 0) return null

  return (
    <div style={styles.section}>
      <div style={styles.sectionTitle}>Attributes:</div>
      <div style={styles.defChipContainer}>
        {Object.entries(attributes).map(([key, value]) => (
          // eslint-disable-next-line @typescript-eslint/no-use-before-define
          <DefinitionChip key={key} keyName={key} value={value} />
        ))}
      </div>
    </div>
  )
}

// TimeMarkers component to display time markers
// eslint-disable-next-line @typescript-eslint/no-unused-vars
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
            <span style={{ display: 'inline-block' }}>Last Required Span:</span>
            <span
              style={{
                fontFamily: 'monospace',
                textAlign: 'right',
                display: 'inline-block',
                width: '80px',
                fontWeight: '500',
              }}
            >
              +{lastRequiredSpanOffset.toFixed(2)}ms
            </span>
          </li>
        )}
        {completeSpanOffset !== undefined && (
          <li style={styles.listItem}>
            <span style={{ display: 'inline-block' }}>Complete Span:</span>
            <span
              style={{
                fontFamily: 'monospace',
                textAlign: 'right',
                display: 'inline-block',
                width: '80px',
                fontWeight: '500',
              }}
            >
              +{completeSpanOffset.toFixed(2)}ms
            </span>
          </li>
        )}
        {cpuIdleSpanOffset !== undefined && (
          <li style={styles.listItem}>
            <span style={{ display: 'inline-block' }}>CPU Idle Span:</span>
            <span
              style={{
                fontFamily: 'monospace',
                textAlign: 'right',
                display: 'inline-block',
                width: '80px',
                fontWeight: '500',
              }}
            >
              +{cpuIdleSpanOffset.toFixed(2)}ms
            </span>
          </li>
        )}
      </ul>
    </div>
  )
}

// DefinitionChip component for displaying matcher definition key/value pairs
function DefinitionChip({
  keyName,
  value,
}: {
  keyName: string
  value: unknown
}) {
  const [showTooltip, setShowTooltip] = useState(false)
  const valueIsComplex =
    value !== null &&
    (typeof value === 'object' ||
      (typeof value === 'string' && value.length > LONG_STRING_THRESHOLD))
  const stringValue =
    typeof value === 'object' ? JSON.stringify(value) : String(value)
  const needsTooltip =
    valueIsComplex || keyName.length + stringValue.length > MAX_STRING_LENGTH

  // Create truncated display value
  const displayValue =
    stringValue.length > MAX_STRING_LENGTH
      ? `${stringValue.slice(0, MAX_STRING_LENGTH)}...`
      : stringValue

  return (
    <div
      style={{
        ...styles.defChip,
        ...(needsTooltip ? styles.defChipHoverable : {}),
      }}
      onMouseEnter={() => void setShowTooltip(true)}
      onMouseLeave={() => void setShowTooltip(false)}
    >
      {keyName}: <span style={styles.defChipValue}>{displayValue}</span>
      {needsTooltip && (
        <div
          style={{
            ...styles.defChipTooltip,
            opacity: showTooltip ? 1 : 0,
            visibility: showTooltip ? 'visible' : 'hidden',
          }}
        >
          {typeof value === 'object'
            ? JSON.stringify(value, null, 2)
            : String(value)}
        </div>
      )}
    </div>
  )
}

// No longer needed - will directly use definition property

// RequiredSpansList component to display required spans
// eslint-disable-next-line @typescript-eslint/no-unused-vars
function RequiredSpansList<RelationSchemasT>({
  requiredSpans,
}: {
  requiredSpans: RequiredSpan[]
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
            <div style={styles.spanContent}>
              <span
                style={{
                  ...styles.matchedIndicator,
                  ...(span.isMatched ? styles.matchedDot : styles.unmatchedDot),
                }}
                title={span.isMatched ? 'Matched' : 'Pending'}
              />
              {span.definition ? (
                <div style={styles.defChipContainer}>
                  {Object.entries(span.definition).map(([key, value]) => (
                    <DefinitionChip key={key} keyName={key} value={value} />
                  ))}
                </div>
              ) : (
                span.name
              )}
            </div>
          </div>
        ))}
      </div>
    </div>
  )
}

// Function to download trace recording as a JSON file
function downloadTraceRecording<
  RelationSchemasT extends RelationSchemasBase<RelationSchemasT>,
>(trace: TraceInfo<RelationSchemasT>) {
  if (!trace.traceContext || !trace.finalTransition) {
    return
  }

  try {
    // Generate the trace recording
    const recording = createTraceRecording(
      trace.traceContext,
      trace.finalTransition,
    )

    // Create a blob with the JSON data
    const recordingJson = JSON.stringify(recording, null, 2)
    const blob = new Blob([recordingJson], { type: 'application/json' })

    // Create download link
    const url = URL.createObjectURL(blob)
    const a = document.createElement('a')
    a.href = url
    a.download = `trace-${trace.traceId}-${trace.traceName}.json`
    document.body.append(a)
    a.click()

    // Clean up
    setTimeout(() => {
      a.remove()
      URL.revokeObjectURL(url)
    }, 0)
  } catch (error) {
    console.error('Failed to generate trace recording:', error)
  }
}

// TraceItem component to display a trace (used for both active and history traces)
function TraceItem<
  RelationSchemasT extends RelationSchemasBase<RelationSchemasT>,
>({
  trace,
  isExpanded,
  onToggleExpand,
  isCurrentTrace = false,
}: {
  trace: TraceInfo<RelationSchemasT>
  isExpanded: boolean
  onToggleExpand: () => void
  isCurrentTrace?: boolean
}) {
  const [isHovered, setIsHovered] = useState(false)

  // Determine if we can download a trace recording (only for completed/interrupted traces)
  const canDownloadRecording =
    (trace.state === 'complete' || trace.state === 'interrupted') &&
    !!trace.traceContext &&
    !!trace.finalTransition

  // Handle download button click without triggering the expand/collapse
  const handleDownloadClick = (e: React.MouseEvent) => {
    e.stopPropagation()
    downloadTraceRecording(trace)
  }

  return (
    <div
      style={{
        ...styles.historyItem,
        ...(isHovered ? styles.historyItemHover : {}),
        borderLeft: '3px solid',
        borderLeftColor: isCurrentTrace ? '#1565c0' : 'transparent',
      }}
      onClick={onToggleExpand}
      onMouseEnter={() => void setIsHovered(true)}
      onMouseLeave={() => void setIsHovered(false)}
    >
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
          {canDownloadRecording && (
            <button
              style={styles.downloadButton}
              onClick={handleDownloadClick}
              title="Download trace recording as JSON"
            >
              <span style={styles.downloadIcon}>⬇</span>
            </button>
          )}
        </div>
        <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
          <div style={styles.idChip} title="Trace ID">
            {trace.traceId}
          </div>
          <span style={styles.timeDisplay}>
            {new Date(trace.startTime).toLocaleTimeString()}
          </span>
        </div>
      </div>

      <div style={styles.keyInfo}>
        {/* Variant in chip group */}
        <div style={styles.variantGroup}>
          <span style={styles.variantLabel}>Variant</span>
          <span style={styles.variantValue}>{trace.variant}</span>
        </div>

        {/* Required spans in chip group */}
        <div style={styles.spansGroup}>
          <span style={styles.spansLabel}>Required</span>
          <span style={styles.spansValue}>
            {trace.requiredSpans.filter((s) => s.isMatched).length}/
            {trace.requiredSpans.length}
          </span>
        </div>

        {/* Group related items together */}
        {trace.relatedTo && Object.keys(trace.relatedTo).length > 0 && (
          <div style={styles.relatedGroup}>
            <span style={styles.relatedLabel}>Related</span>
            <div style={styles.relatedItems}>
              {Object.entries(trace.relatedTo).map(([key, value]) => (
                <span key={key} style={styles.relatedItem}>
                  {key}: {JSON.stringify(value)}
                </span>
              ))}
            </div>
          </div>
        )}

        {/* Interruption reason in chip group */}
        {trace.interruptionReason && (
          <div style={styles.reasonGroup}>
            <span style={styles.reasonLabel}>Reason</span>
            <span style={styles.reasonValue}>{trace.interruptionReason}</span>
          </div>
        )}
      </div>

      {isExpanded && (
        <div style={styles.expandedHistory}>
          <TraceAttributes attributes={trace.attributes} />

          <RequiredSpansList requiredSpans={trace.requiredSpans} />

          <TimeMarkers
            lastRequiredSpanOffset={trace.lastRequiredSpanOffset}
            completeSpanOffset={trace.completeSpanOffset}
            cpuIdleSpanOffset={trace.cpuIdleSpanOffset}
          />
        </div>
      )}

      {/* Expand/collapse arrow indicator */}
      <div
        style={{
          ...styles.expandArrow,
          ...(isExpanded ? styles.expandArrowUp : styles.expandArrowDown),
        }}
      >
        ▼
      </div>
    </div>
  )
}

/**
 * A component that visualizes the current state of the TraceManager and its Traces
 */
export function TraceManagerDebugger<
  RelationSchemasT extends RelationSchemasBase<RelationSchemasT>,
>({
  traceManager,
  float = false,
  traceHistoryLimit = TRACE_HISTORY_LIMIT,
}: {
  traceManager: TraceManager<RelationSchemasT>
  float?: boolean
  traceHistoryLimit?: number
}) {
  const [currentTrace, setCurrentTrace] =
    useState<TraceInfo<RelationSchemasT> | null>(null)
  const [traceHistory, setTraceHistory] = useState<
    TraceInfo<RelationSchemasT>[]
  >([])
  const [expandedHistoryIndex, setExpandedHistoryIndex] = useState<
    number | null
  >(0)

  // For floating panel functionality
  const [position, setPosition] = useState({ x: 10, y: 10 })
  const [isDragging, setIsDragging] = useState(false)
  const [dragOffset, setDragOffset] = useState({ x: 0, y: 0 })
  const [isMinimized, setIsMinimized] = useState(false)
  const containerRef = useRef<HTMLDivElement>(null)

  const handleMouseDown = (e: React.MouseEvent) => {
    if (!containerRef.current) return

    // Prevent default browser behavior like text selection
    e.preventDefault()

    setIsDragging(true)

    // Calculate the offset from cursor to container top-left corner
    setDragOffset({
      x: e.clientX - position.x,
      y: e.clientY - position.y,
    })
  }

  const handleMouseMove = (e: MouseEvent) => {
    if (!isDragging) return

    // Prevent default behavior during dragging
    e.preventDefault()

    // Calculate new position by subtracting the initial offset
    requestAnimationFrame(() => {
      setPosition({
        x: e.clientX - dragOffset.x,
        y: e.clientY - dragOffset.y,
      })
    })
  }

  const handleMouseUp = (e: MouseEvent) => {
    if (isDragging) {
      // Prevent default only if we were dragging
      e.preventDefault()
    }
    setIsDragging(false)
  }

  useEffect(() => {
    if (float) {
      window.addEventListener('mousemove', handleMouseMove)
      window.addEventListener('mouseup', handleMouseUp)

      return () => {
        window.removeEventListener('mousemove', handleMouseMove)
        window.removeEventListener('mouseup', handleMouseUp)
      }
    }
    return undefined
  }, [float, isDragging, dragOffset])

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
        attributes: trace.input.attributes
          ? { ...trace.input.attributes }
          : undefined,
        relatedTo: trace.input.relatedTo
          ? { ...trace.input.relatedTo }
          : undefined,
        requiredSpans: trace.definition.requiredSpans.map((matcher, index) => {
          const name = `Matcher #${index}`

          return {
            name,
            isMatched: false,
            definition:
              (matcher.fromDefinition as Record<string, unknown>) ?? undefined,
          }
        }),
        traceContext: {
          definition: trace.definition,
          input: trace.input,
          recordedItemsByLabel: trace.recordedItemsByLabel,
          recordedItems: trace.recordedItems,
        },
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
            attributes: trace.input.attributes
              ? { ...trace.input.attributes }
              : undefined,
            relatedTo: trace.input.relatedTo
              ? { ...trace.input.relatedTo }
              : undefined,
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
            // Store the final transition data for trace recording generation
            updatedTrace.finalTransition =
              transition as FinalTransition<RelationSchemasT>

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
              updatedRequiredSpans[index]!.isMatched = true
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

  const allTraces = currentTrace
    ? [currentTrace, ...traceHistory]
    : traceHistory

  if (float && isMinimized) {
    return (
      <button
        style={styles.minimizedButton}
        onClick={() => void setIsMinimized(false)}
      >
        Traces
      </button>
    )
  }

  const content = (
    <>
      {float && (
        <div style={styles.handle} onMouseDown={handleMouseDown}>
          <h3 style={styles.handleTitle}>Trace Manager Debugger</h3>
          <div>
            <button
              style={styles.closeButton}
              onClick={() => void setIsMinimized(true)}
            >
              −
            </button>
          </div>
        </div>
      )}

      {!float && (
        <div style={styles.header}>
          <h2 style={styles.title}>Trace Manager Debugger</h2>
        </div>
      )}

      {allTraces.length > 0 ? (
        <div style={{ padding: '0 15px' }}>
          <h3 style={styles.historyTitle}>
            Traces ({allTraces.length})
            <a
              href="https://zendesk.github.io/react-measure-timing-hooks/iframe.html?globals=&id=stories-visualizer-viz--operation-visualizer-story&viewMode=story"
              target="_blank"
              rel="noopener noreferrer"
              style={styles.visualizerLink}
            >
              Trace Visualizer
            </a>
          </h3>
          {allTraces.map((trace, index) => (
            <TraceItem
              key={trace.traceId}
              trace={trace}
              isExpanded={
                // Auto-expand current trace or selected history trace
                currentTrace?.traceId === trace.traceId ||
                expandedHistoryIndex === index
              }
              isCurrentTrace={currentTrace?.traceId === trace.traceId}
              onToggleExpand={() =>
                void setExpandedHistoryIndex(
                  expandedHistoryIndex === index ? null : index,
                )
              }
            />
          ))}
        </div>
      ) : (
        <div style={styles.noTrace}>No traces running or completed</div>
      )}
    </>
  )

  if (float) {
    return (
      <div
        ref={containerRef}
        style={{
          ...styles.container,
          ...styles.floatingContainer,
          top: `${position.y}px`,
          left: `${position.x}px`,
          padding: 0,
        }}
      >
        {content}
      </div>
    )
  }

  return <div style={styles.container}>{content}</div>
}
