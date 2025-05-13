import React, { useEffect, useMemo, useRef, useState } from 'react'
import {
  formatMatcher,
  formatMs,
  getComputedResults,
  getConfigSummary,
  isSuppressedError,
} from './debugUtils'
import { createTraceRecording } from './recordingComputeUtils'
import type { SpanAndAnnotation } from './spanAnnotationTypes'
import {
  type AllPossibleTraces,
  type FinalTransition,
  isTerminalState,
} from './Trace'
import type { TraceManager } from './TraceManager'
import type { ComputedRenderSpan, ComputedSpan } from './traceRecordingTypes'
import type {
  RelationSchemasBase,
  TraceContext,
  TraceDefinitionModifications,
  TraceInterruptionReason,
} from './types'

// Constants to avoid magic numbers
const MAX_STRING_LENGTH = 20
const LONG_STRING_THRESHOLD = 25
const NAME = 'Retrace Debugger'

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
  liveDuration?: number
  totalSpanCount?: number
  hasErrorSpan?: boolean
  hasSuppressedErrorSpan?: boolean
  definitionModifications?: TraceDefinitionModifications<
    keyof RelationSchemasT,
    RelationSchemasT,
    string
  >[]
  computedSpans?: string[]
  computedValues?: string[]
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
  traceInfoRow: {
    display: 'flex',
    gap: '8px',
    flexWrap: 'wrap' as const,
    marginBottom: '10px',
    padding: '8px 0',
  },
  configInfoRow: {
    display: 'flex',
    gap: '8px',
    flexWrap: 'wrap' as const,
    marginBottom: '2px',
    fontSize: '90%',
  },
  infoChip: {
    backgroundColor: '#f1f1f1',
    padding: '3px 10px',
    borderRadius: '12px',
    fontSize: '12px',
    color: '#333',
    border: '1px solid #e0e0e0',
  },
  configChip: {
    backgroundColor: '#f8f8f8',
    padding: '2px 8px',
    borderRadius: '10px',
    fontSize: '11px',
    color: '#555',
    border: '1px solid #e8e8e8',
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
    minWidth: '600px',
    maxWidth: '750px',
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
  // Render stats chip group
  renderStatsGroup: {
    display: 'inline-flex',
    flexWrap: 'nowrap',
    overflow: 'hidden',
    borderRadius: '12px',
    border: '1px solid #e0e0e0', // Neutral border
    backgroundColor: '#f5f5f5', // Neutral background
    marginRight: '8px', // Add some margin if there are multiple groups
  },
  renderStatsLabel: {
    color: '#555', // Darker grey for label
    padding: '3px 8px',
    fontSize: '12px',
  },
  renderStatsValue: {
    backgroundColor: '#e0e0e0', // Slightly darker background for value
    color: '#333', // Black for value text
    padding: '3px 8px',
    fontSize: '12px',
    fontWeight: '500',
  },
} as const

function getStateStyle(state: string) {
  if (state === 'complete') return styles.completedTag
  if (state === 'interrupted') return styles.interruptedTag
  if (state === 'draft') return styles.draftTag
  return styles.activeTag
}

const TRACE_HISTORY_LIMIT = 15

// Helper to safely get a value from a possibly empty object
function getFromRecord<T>(
  record: Record<string, T> | undefined,
  key: string,
): T | undefined {
  return record && Object.hasOwn(record, key) ? record[key] : undefined
}

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
              +{formatMs(lastRequiredSpanOffset)}
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
              +{formatMs(completeSpanOffset)}
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
              +{formatMs(cpuIdleSpanOffset)}
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

// Helper to render ComputedSpan nicely
function RenderComputedSpan({ value }: { value: ComputedSpan }) {
  if (!value) return null
  return (
    <span style={{ marginLeft: 8, color: '#1976d2' }}>
      start: {value.startOffset.toFixed(2)}ms, duration:{' '}
      {value.duration.toFixed(2)}ms
    </span>
  )
}

// Helper function to assign lanes to points to prevent text overlap
const assignLanesToPoints = (
  pointsToAssign: readonly { name: string; time: number; color: string }[],
  currentScale: number,
  separationPercent: number,
): {
  pointData: { name: string; time: number; color: string }
  lane: number
}[] => {
  if (pointsToAssign.length === 0) return []

  const sortedPoints = [...pointsToAssign].sort((a, b) => a.time - b.time)
  const assignments: {
    pointData: { name: string; time: number; color: string }
    lane: number
  }[] = []
  // For each lane, stores the `leftPercent` of the last point added to it.
  const laneLastOccupiedX: Record<number, number> = {}

  for (const currentPoint of sortedPoints) {
    const currentPointLeftPercent = currentPoint.time * currentScale
    for (let l = 0; ; l++) {
      // Iterate through lanes 0, 1, 2...
      const lastXInLane = laneLastOccupiedX[l]
      if (
        lastXInLane === undefined ||
        currentPointLeftPercent - lastXInLane >= separationPercent
      ) {
        // This point can fit in this lane (or it's a new lane)
        assignments.push({ pointData: currentPoint, lane: l })
        laneLastOccupiedX[l] = currentPointLeftPercent
        break // Move to the next point
      }
    }
  }
  return assignments // This array is sorted by time due to the initial sort.
}

// Visual timeline for ComputedRenderSpan (like the provided sketch)
function RenderBeaconTimeline({
  value,
  name,
}: {
  value: ComputedRenderSpan
  name: string
}) {
  if (!value) return null

  // Extract times (all relative to start)
  const {
    firstRenderTillLoading: loading,
    firstRenderTillData: data,
    firstRenderTillContent: content,
  } = value

  // --- Base Constants ---
  const BAR_HEIGHT = 25
  const TEXT_AREA_HEIGHT = 22 // Height per lane of text
  const MARKER_LINE_WIDTH = 2
  const VERTICAL_PADDING_BETWEEN_AREAS = 2

  // Thresholds for individual label/line alignment (percentages)
  const LABEL_ALIGN_LOW_THRESHOLD = 1
  const LABEL_ALIGN_HIGH_THRESHOLD = 99
  const MARKER_LINE_ALIGN_LOW_THRESHOLD = 0.1
  const MARKER_LINE_ALIGN_HIGH_THRESHOLD = 99.9
  const MIN_SEGMENT_WIDTH_PRODUCT_THRESHOLD = 0.001
  const MIN_TEXT_SEPARATION_PERCENT = 8 // Min horizontal separation (%) for text in the same lane

  // --- Prepare Data for Rendering ---
  const timePointsForDisplay: { name: string; time: number; color: string }[] =
    []
  timePointsForDisplay.push({ name: 'start', time: 0, color: '#757575' })
  if (typeof loading === 'number')
    timePointsForDisplay.push({
      name: 'loading',
      time: loading,
      color: '#ff9800',
    })
  if (typeof data === 'number')
    timePointsForDisplay.push({ name: 'data', time: data, color: '#1976d2' })
  if (typeof content === 'number')
    timePointsForDisplay.push({
      name: 'content',
      time: content,
      color: '#2e7d32',
    })

  const allRelevantTimes = [0, loading, data, content].filter(
    (t): t is number => typeof t === 'number',
  )
  const maxTime =
    allRelevantTimes.length > 0 ? Math.max(...allRelevantTimes) : 0
  const scale = maxTime > 0 ? 100 / maxTime : 0

  // Assign lanes to points
  const processedPointsForDisplay = assignLanesToPoints(
    timePointsForDisplay,
    scale,
    MIN_TEXT_SEPARATION_PERCENT,
  )
  const numLanes =
    processedPointsForDisplay.length > 0
      ? Math.max(...processedPointsForDisplay.map((item) => item.lane)) + 1
      : 1

  // --- Dynamic Height and Offset Calculations based on lanes ---
  const TOTAL_LABEL_AREA_HEIGHT = numLanes * TEXT_AREA_HEIGHT
  const TOTAL_TIME_VALUE_AREA_HEIGHT = numLanes * TEXT_AREA_HEIGHT // Assuming same number of lanes for times

  const TOTAL_VIS_CONTENT_HEIGHT =
    TOTAL_LABEL_AREA_HEIGHT +
    VERTICAL_PADDING_BETWEEN_AREAS +
    BAR_HEIGHT +
    VERTICAL_PADDING_BETWEEN_AREAS +
    TOTAL_TIME_VALUE_AREA_HEIGHT

  const BAR_TOP_OFFSET =
    TOTAL_LABEL_AREA_HEIGHT + VERTICAL_PADDING_BETWEEN_AREAS
  const TIME_VALUES_AREA_TOP =
    BAR_TOP_OFFSET + BAR_HEIGHT + VERTICAL_PADDING_BETWEEN_AREAS

  // Bar Segments (same logic as before)
  const barSegments: {
    start: number
    end: number
    color: string
    key: string
  }[] = []
  let currentSegmentTime = 0
  if (typeof loading === 'number') {
    if (loading > currentSegmentTime) {
      barSegments.push({
        start: currentSegmentTime,
        end: loading,
        color: '#fff176',
        key: 'segment-to-loading',
      })
    }
    currentSegmentTime = Math.max(currentSegmentTime, loading)
  }
  if (typeof data === 'number') {
    if (data > currentSegmentTime) {
      barSegments.push({
        start: currentSegmentTime,
        end: data,
        color: '#90caf9',
        key: 'segment-to-data',
      })
    }
    currentSegmentTime = Math.max(currentSegmentTime, data)
  }
  if (typeof content === 'number' && content > currentSegmentTime) {
    barSegments.push({
      start: currentSegmentTime,
      end: content,
      color: '#a5d6a7',
      key: 'segment-to-content',
    })
  }
  if (barSegments.length === 0 && maxTime > 0) {
    let singleSegmentColor = '#e0e0e0'
    if (typeof content === 'number' && content === maxTime)
      singleSegmentColor = '#a5d6a7'
    else if (typeof data === 'number' && data === maxTime)
      singleSegmentColor = '#90caf9'
    else if (typeof loading === 'number' && loading === maxTime)
      singleSegmentColor = '#fff176'
    barSegments.push({
      start: 0,
      end: maxTime,
      color: singleSegmentColor,
      key: 'single-segment-fallback',
    })
  }
  const validBarSegments = barSegments.filter(
    (seg) =>
      seg.end > seg.start &&
      (seg.end - seg.start) * scale > MIN_SEGMENT_WIDTH_PRODUCT_THRESHOLD,
  )

  // Unique times for vertical lines (based on original, unsorted list for consistency if order mattered)
  const uniqueTimesForLines = [
    ...new Set(timePointsForDisplay.map((p) => p.time)),
  ].sort((a, b) => a - b)

  return (
    <div style={{ width: '100%' }}>
      {/* Render count and sum of render durations */}
      <div style={{ display: 'flex', alignItems: 'center' }}>
        <div style={{ fontWeight: 600, fontSize: 16, marginRight: '10px' }}>
          {name}
        </div>
        <div style={styles.renderStatsGroup}>
          <span style={styles.renderStatsLabel}>Renders</span>
          <span style={styles.renderStatsValue}>{value.renderCount}</span>
        </div>
        <div style={styles.renderStatsGroup}>
          <span style={styles.renderStatsLabel}>Duration</span>
          <span style={styles.renderStatsValue}>
            {value.sumOfRenderDurations.toFixed(0)}ms
          </span>
        </div>
      </div>

      <div
        style={{
          position: 'relative',
          width: '100%',
          height: TOTAL_VIS_CONTENT_HEIGHT,
        }}
      >
        {/* Area for Text Labels (Above Bar) */}
        <div
          style={{
            position: 'absolute',
            top: 0,
            width: '100%',
            height: TOTAL_LABEL_AREA_HEIGHT, // Dynamic height
            zIndex: 2,
          }}
        >
          {processedPointsForDisplay.map(
            ({ pointData: point, lane: currentLane }) => {
              const leftPercent = point.time * scale
              let transform = 'translateX(-50%)'
              if (leftPercent < LABEL_ALIGN_LOW_THRESHOLD)
                transform = 'translateX(0%)'
              else if (leftPercent > LABEL_ALIGN_HIGH_THRESHOLD)
                transform = 'translateX(-100%)'

              return (
                <div
                  key={`${point.name}-label-${point.time}`} // Unique key
                  style={{
                    position: 'absolute',
                    top: currentLane * TEXT_AREA_HEIGHT, // Position based on lane
                    left: `${leftPercent}%`,
                    transform,
                    fontSize: 11,
                    color: point.color,
                    whiteSpace: 'nowrap',
                    lineHeight: `${TEXT_AREA_HEIGHT}px`,
                    padding: '0 5px',
                  }}
                >
                  {point.name}
                </div>
              )
            },
          )}
        </div>

        {/* Timeline Bar */}
        <div
          style={{
            position: 'absolute',
            top: BAR_TOP_OFFSET, // Dynamic offset
            width: '100%',
            height: BAR_HEIGHT,
            borderRadius: 3,
            background: '#e0e0e0',
            boxSizing: 'border-box',
            zIndex: 1,
            display: 'flex',
          }}
        >
          {validBarSegments.map((seg) => {
            const segmentWidthPercent = (seg.end - seg.start) * scale
            const segmentLeftPercent = seg.start * scale
            if (segmentWidthPercent <= 0) return null
            return (
              <div
                key={seg.key}
                style={{
                  position: 'absolute',
                  left: `${segmentLeftPercent}%`,
                  width: `${segmentWidthPercent}%`,
                  height: '100%',
                  background: seg.color,
                }}
              />
            )
          })}
        </div>

        {/* Area for Time Values (Below Bar) */}
        <div
          style={{
            position: 'absolute',
            top: TIME_VALUES_AREA_TOP, // Dynamic offset
            width: '100%',
            height: TOTAL_TIME_VALUE_AREA_HEIGHT, // Dynamic height
            zIndex: 2,
          }}
        >
          {processedPointsForDisplay.map(
            ({ pointData: point, lane: currentLane }) => {
              if (point.name === 'start' && point.time === 0) return null
              const leftPercent = point.time * scale
              let transform = 'translateX(-50%)'
              if (leftPercent < LABEL_ALIGN_LOW_THRESHOLD)
                transform = 'translateX(0%)'
              else if (leftPercent > LABEL_ALIGN_HIGH_THRESHOLD)
                transform = 'translateX(-100%)'

              return (
                <div
                  key={`${point.name}-time-${point.time}`} // Unique key
                  style={{
                    position: 'absolute',
                    top: currentLane * TEXT_AREA_HEIGHT, // Position based on lane
                    left: `${leftPercent}%`,
                    transform,
                    fontSize: 11,
                    color: point.color,
                    whiteSpace: 'nowrap',
                    lineHeight: `${TEXT_AREA_HEIGHT}px`,
                    padding: '0 5px',
                  }}
                >
                  +{point.time.toFixed(0)}ms
                </div>
              )
            },
          )}
        </div>

        {/* Vertical Marker Lines spanning all areas */}
        {uniqueTimesForLines.map((timeVal) => {
          // Find any point config for color, preferably from original list for consistency
          const pointConfig =
            timePointsForDisplay.find((p) => p.time === timeVal) ??
            timePointsForDisplay[0]!
          const leftPercent = timeVal * scale
          let lineLeftPositionStyle = `${leftPercent}%`
          let lineTransformStyle = 'translateX(-50%)'

          if (leftPercent < MARKER_LINE_ALIGN_LOW_THRESHOLD) {
            lineLeftPositionStyle = '0%'
            lineTransformStyle = 'translateX(0)'
          } else if (leftPercent > MARKER_LINE_ALIGN_HIGH_THRESHOLD) {
            lineLeftPositionStyle = `calc(100% - ${MARKER_LINE_WIDTH}px)`
            lineTransformStyle = 'translateX(0)'
          }

          return (
            <div
              key={`line-${timeVal}`}
              style={{
                position: 'absolute',
                left: lineLeftPositionStyle,
                transform: lineTransformStyle,
                top: 0,
                width: MARKER_LINE_WIDTH,
                background: pointConfig.color,
                height: '100%', // Spans full TOTAL_VIS_CONTENT_HEIGHT
                zIndex: 0,
              }}
            />
          )
        })}
      </div>
    </div>
  )
}

// Helper to render ComputedRenderBeaconSpans nicely
function RenderComputedRenderBeaconSpans({
  computedRenderBeaconSpans,
}: {
  computedRenderBeaconSpans: Record<string, ComputedRenderSpan>
}) {
  // if (Object.keys(computedRenderBeaconSpans).length === 0) return null
  return (
    <div style={styles.section}>
      <div style={styles.sectionTitle}>Computed Render Beacon Spans:</div>
      <ul style={{ listStyle: 'none', margin: 0, padding: 0 }}>
        {Object.entries(computedRenderBeaconSpans).map(([name, value]) => (
          <li key={name} style={styles.listItem}>
            <RenderBeaconTimeline value={value} name={name} />
          </li>
        ))}
      </ul>
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
    // eslint-disable-next-line no-console
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
  const [isDefinitionDetailsExpanded, setIsDefinitionDetailsExpanded] =
    useState(false)

  // Determine if we can download a trace recording (only for completed/interrupted traces)
  const canDownloadRecording =
    (trace.state === 'complete' || trace.state === 'interrupted') &&
    !!trace.traceContext &&
    !!trace.finalTransition

  // Memoize computed results for this trace
  const computedResults = useMemo(() => {
    if (trace.traceContext && trace.finalTransition) {
      const results = getComputedResults(
        trace.traceContext,
        trace.finalTransition,
      )
      return results
    }
    return {}
  }, [trace.traceContext, trace.finalTransition])

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
        borderLeftColor: isCurrentTrace
          ? '#1565c0'
          : trace.state === 'complete'
          ? '#2e7d32'
          : trace.state === 'interrupted'
          ? '#c62828'
          : '#e0e0e0',
      }}
      onMouseEnter={() => void setIsHovered(true)}
      onMouseLeave={() => void setIsHovered(false)}
    >
      {/* ROW 1: Title, state, buttons, and IDs */}
      <div style={styles.historyHeader} onClick={onToggleExpand}>
        <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
          <strong style={{ fontSize: '15px' }}>{trace.traceName}</strong>
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
              <span style={styles.downloadIcon}>🔽 JSON</span>
            </button>
          )}
          {/* Error indicator */}
          {(trace.hasErrorSpan || trace.hasSuppressedErrorSpan) && (
            <span
              title={
                trace.hasSuppressedErrorSpan
                  ? 'Suppressed error span(s) seen'
                  : 'Error span(s) seen'
              }
              style={{
                color: '#c62828',
                fontSize: '18px',
              }}
            >
              ⚠️
            </span>
          )}
          {/* Definition modification indicator */}
          {trace.definitionModifications &&
            trace.definitionModifications.length > 0 && (
              <span
                title="Definition modified"
                style={{
                  color: '#1976d2',
                  fontSize: '18px',
                }}
              >
                🔧
              </span>
            )}
        </div>
        <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
          <span style={styles.timeDisplay}>
            ({formatMs(trace.liveDuration)})
          </span>
          <div style={styles.idChip} title="Trace ID">
            {trace.traceId}
          </div>
          <span style={styles.timeDisplay}>
            {new Date(trace.startTime).toLocaleTimeString()}
          </span>
        </div>
      </div>
      {/* ROW 2: Main trace information */}
      <div style={styles.traceInfoRow}>
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

        {/* Span count chip */}
        <span style={styles.infoChip}>Spans: {trace.totalSpanCount ?? 0}</span>
      </div>{' '}
      {isExpanded && (
        <div
          style={styles.expandedHistory}
          onClick={(e) => {
            void e.stopPropagation()
          }}
        >
          <TraceAttributes attributes={trace.attributes} />

          <RequiredSpansList requiredSpans={trace.requiredSpans} />

          <TimeMarkers
            lastRequiredSpanOffset={trace.lastRequiredSpanOffset}
            completeSpanOffset={trace.completeSpanOffset}
            cpuIdleSpanOffset={trace.cpuIdleSpanOffset}
          />

          {/* Computed Spans/Values */}
          <div style={styles.section}>
            <div style={styles.sectionTitle}>Computed Spans:</div>
            <ul style={{ listStyle: 'none', margin: 0, padding: 0 }}>
              {(trace.computedSpans ?? []).map((name) => {
                const value = getFromRecord(computedResults.computedSpans, name)
                return (
                  <li key={name} style={styles.listItem}>
                    {name}
                    {trace.state === 'complete' ||
                    trace.state === 'interrupted' ? (
                      value ? (
                        <RenderComputedSpan value={value} />
                      ) : (
                        <span
                          style={{
                            marginLeft: 8,
                            color: 'red',
                            fontWeight: 500,
                          }}
                        >
                          missing
                        </span>
                      )
                    ) : null}
                  </li>
                )
              })}
            </ul>
          </div>
          {computedResults.computedRenderBeaconSpans ? (
            <RenderComputedRenderBeaconSpans
              computedRenderBeaconSpans={
                computedResults.computedRenderBeaconSpans
              }
            />
          ) : null}
          <div style={styles.section}>
            <div style={styles.sectionTitle}>Computed Values:</div>
            <ul style={{ listStyle: 'none', margin: 0, padding: 0 }}>
              {(trace.computedValues ?? []).map((name) => {
                const value = getFromRecord(
                  computedResults.computedValues,
                  name,
                )
                return (
                  <li key={name} style={styles.listItem}>
                    {name}
                    {trace.state === 'complete' || trace.state === 'interrupted'
                      ? value !== undefined && (
                          <span style={{ marginLeft: 8, color: '#1976d2' }}>
                            {String(value)}
                          </span>
                        )
                      : null}
                  </li>
                )
              })}
            </ul>
          </div>

          {/* ROW 3: Definition details toggle */}
          <div
            style={{
              display: 'flex',
              alignItems: 'center',
              cursor: 'pointer',
              marginTop: '8px',
              fontSize: '12px',
              color: '#555',
            }}
            onClick={(e) => {
              e.stopPropagation()
              setIsDefinitionDetailsExpanded((prev) => !prev)
            }}
          >
            <span style={{ marginRight: '5px' }}>
              {isDefinitionDetailsExpanded ? '−' : '+'} Definition Details
            </span>
          </div>
          {/* Definition modifications details */}
          {isDefinitionDetailsExpanded && (
            <div style={styles.section}>
              {/* Trace configuration information */}
              <div style={styles.sectionTitle}>Configuration:</div>
              <div style={styles.configInfoRow}>
                {(() => {
                  const { timeout, debounce, interactive } = trace.traceContext
                    ? getConfigSummary(trace.traceContext)
                    : {}
                  return (
                    <>
                      {timeout != null && (
                        <span style={styles.configChip}>
                          Timeout: {formatMs(timeout)}
                        </span>
                      )}
                      {debounce != null && (
                        <span style={styles.configChip}>
                          Debounce: {formatMs(debounce)}
                        </span>
                      )}
                      {interactive != null && (
                        <span style={styles.configChip}>
                          Interactive: {formatMs(interactive)}
                        </span>
                      )}
                    </>
                  )
                })()}
              </div>

              {/* Definition modifications list */}
              {trace.definitionModifications &&
                trace.definitionModifications.length > 0 && (
                  <div>
                    <div style={styles.sectionTitle}>
                      Definition Modifications:
                    </div>
                    <ul style={{ listStyle: 'none', margin: 0, padding: 0 }}>
                      {trace.definitionModifications.map((mod, i) => (
                        <li key={i} style={styles.listItem}>
                          {JSON.stringify(mod)}
                        </li>
                      ))}
                    </ul>
                  </div>
                )}
            </div>
          )}
        </div>
      )}
      {/* Expand/collapse arrow indicator */}
      <div
        style={{
          ...styles.expandArrow,
          ...(isExpanded ? styles.expandArrowUp : styles.expandArrowDown),
        }}
        onClick={onToggleExpand}
      >
        ▼
      </div>
    </div>
  )
}

export interface TraceManagerDebuggerProps<
  RelationSchemasT extends RelationSchemasBase<RelationSchemasT>,
> {
  traceManager: TraceManager<RelationSchemasT>
  float?: boolean
  traceHistoryLimit?: number
}

/**
 * A component that visualizes the current state of the TraceManager and its Traces
 */
// eslint-disable-next-line import/no-default-export
export default function TraceManagerDebugger<
  RelationSchemasT extends RelationSchemasBase<RelationSchemasT>,
>({
  traceManager,
  float = false,
  traceHistoryLimit = TRACE_HISTORY_LIMIT,
}: TraceManagerDebuggerProps<RelationSchemasT>) {
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
  const isDraggingRef = useRef(false)
  const dragOffsetRef = useRef({ x: 0, y: 0 })
  const [isMinimized, setIsMinimized] = useState(false)
  const containerRef = useRef<HTMLDivElement>(null)

  const handleMouseDown = (e: React.MouseEvent) => {
    if (!containerRef.current) return

    // Prevent default browser behavior like text selection
    e.preventDefault()

    isDraggingRef.current = true

    // Calculate the offset from cursor to container top-left corner
    dragOffsetRef.current = {
      x: e.clientX - position.x,
      y: e.clientY - position.y,
    }
  }

  const handleMouseMove = (e: MouseEvent) => {
    if (!isDraggingRef.current) return

    // Prevent default behavior during dragging
    e.preventDefault()

    // Calculate new position by subtracting the initial offset
    requestAnimationFrame(() => {
      setPosition({
        x: e.clientX - dragOffsetRef.current.x,
        y: e.clientY - dragOffsetRef.current.y,
      })
    })
  }

  const handleMouseUp = (e: MouseEvent) => {
    if (isDraggingRef.current) {
      // Prevent default only if we were dragging
      e.preventDefault()
    }
    isDraggingRef.current = false
    dragOffsetRef.current = { x: 0, y: 0 }
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
  }, [float])

  useEffect(() => {
    // schedule updates asynchronously so we never call setState mid‐render
    const schedule = (fn: () => void) => void setTimeout(fn, 0)

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
          const name = formatMatcher(matcher, index)

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
          recordedItems: new Set(trace.recordedItems),
        },
        // New fields for live info
        liveDuration: 0,
        totalSpanCount: 0,
        hasErrorSpan: false,
        hasSuppressedErrorSpan: false,
        definitionModifications: [],
        computedSpans: Object.keys(
          trace.definition.computedSpanDefinitions ?? {},
        ),
        computedValues: Object.keys(
          trace.definition.computedValueDefinitions ?? {},
        ),
      }

      schedule(() => void setCurrentTrace(traceInfo))
    })

    // Subscribe to state transition events
    const stateSub = traceManager
      .when('state-transition')
      .subscribe((event) => {
        const trace = event.traceContext as AllPossibleTraces<RelationSchemasT>
        const transition = event.stateTransition

        const partialNewTrace = {
          traceContext: {
            definition: trace.definition,
            input: trace.input,
            recordedItemsByLabel: trace.recordedItemsByLabel,
            recordedItems: new Set(trace.recordedItems),
          },
          state: transition.transitionToState,
          attributes: trace.input.attributes
            ? { ...trace.input.attributes }
            : undefined,
          relatedTo: trace.input.relatedTo
            ? { ...trace.input.relatedTo }
            : undefined,
        } as const

        schedule(
          () =>
            void setCurrentTrace((prevTrace) => {
              if (!prevTrace || prevTrace.traceId !== trace.input.id)
                return prevTrace

              const updatedTrace: TraceInfo<RelationSchemasT> = {
                ...prevTrace,
                ...partialNewTrace,
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
                  updatedTrace.finalTransition =
                    transition as FinalTransition<RelationSchemasT>
                  const newHistory = [updatedTrace, ...prev]
                  return newHistory.slice(0, traceHistoryLimit)
                })
                return null
              }

              return updatedTrace
            }),
        )
      })

    // Subscribe to required span seen events
    const spanSeenSub = traceManager
      .when('required-span-seen')
      .subscribe((event) => {
        const trace = event.traceContext as AllPossibleTraces<RelationSchemasT>

        schedule(
          () =>
            void setCurrentTrace((prevTrace) => {
              if (!prevTrace || prevTrace.traceId !== trace.input.id) {
                return prevTrace
              }
              // Find which required span was matched by comparing against all matchers
              const updatedRequiredSpans = [...prevTrace.requiredSpans]
              const matchedSpan = event.spanAndAnnotation

              trace.definition.requiredSpans.forEach((matcher, index) => {
                if (matcher(matchedSpan, trace)) {
                  updatedRequiredSpans[index] = {
                    ...updatedRequiredSpans[index]!,
                    isMatched: true,
                  }
                }
              })

              return {
                ...prevTrace,
                requiredSpans: updatedRequiredSpans,
              }
            }),
        )
      })

    const entries: SpanAndAnnotation<RelationSchemasT>[] = []

    // Subscribe to add-span-to-recording for live info
    const addSpanSub = traceManager
      .when('add-span-to-recording')
      .subscribe((event) => {
        schedule(
          () =>
            void setCurrentTrace((prevTrace) => {
              if (!prevTrace) return prevTrace
              if (event.traceContext.input.id !== prevTrace.traceId) {
                return prevTrace
              }
              // Calculate live info from traceContext
              const trace = event.traceContext
              entries.push(event.spanAndAnnotation)

              const liveDuration =
                entries.length > 0
                  ? Math.round(
                      Math.max(
                        ...entries.map(
                          (e) => e.span.startTime.epoch + e.span.duration,
                        ),
                      ) - trace.input.startTime.epoch,
                    )
                  : 0
              const totalSpanCount = entries.length
              const hasErrorSpan = entries.some(
                (e) =>
                  e.span.status === 'error' && !isSuppressedError(trace, e),
              )
              const hasSuppressedErrorSpan = entries.some(
                (e) => e.span.status === 'error' && isSuppressedError(trace, e),
              )
              return {
                ...prevTrace,
                liveDuration,
                totalSpanCount,
                hasErrorSpan,
                hasSuppressedErrorSpan,
              }
            }),
        )
      })

    // Subscribe to definition-modified for modification indicator
    const defModSub = traceManager
      .when('definition-modified')
      .subscribe(
        ({ traceContext: trace, modifications: eventModifications }) => {
          schedule(
            () =>
              void setCurrentTrace((prevTrace) => {
                if (!prevTrace) return prevTrace
                if (trace.input.id !== prevTrace.traceId) return prevTrace
                return {
                  ...prevTrace,
                  traceContext: {
                    definition: trace.definition,
                    input: trace.input,
                    recordedItemsByLabel: trace.recordedItemsByLabel,
                    recordedItems: new Set(trace.recordedItems),
                  },
                  definitionModifications: [
                    ...(prevTrace.definitionModifications ?? []),
                    eventModifications,
                  ],
                }
              }),
          )
        },
      )

    return () => {
      startSub.unsubscribe()
      stateSub.unsubscribe()
      spanSeenSub.unsubscribe()
      addSpanSub.unsubscribe()
      defModSub.unsubscribe()
    }
  }, [traceManager, traceHistoryLimit])

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
          <h3 style={styles.handleTitle}>{NAME}</h3>
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
          <h2 style={styles.title}>{NAME}</h2>
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
