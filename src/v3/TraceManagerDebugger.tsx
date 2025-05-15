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

const CSS_STYLES = /* language=CSS */ `
.tmdb-debugger-root {
  --tmdb-font-family: system-ui, -apple-system, BlinkMacSystemFont, sans-serif;

  /* Colors - Base */
  --tmdb-color-white: #fff;
  --tmdb-color-black: #000;
  --tmdb-color-text-primary: #333;
  --tmdb-color-text-secondary: #555;
  --tmdb-color-text-tertiary: #616161; /* draft text */
  --tmdb-color-text-muted: #757575; /* noTrace, idChip text */
  --tmdb-color-text-light: #666; /* timeDisplay */
  --tmdb-color-text-error: #c62828; /* Interrupted, error icon */
  --tmdb-color-text-success: #2e7d32; /* Completed */
  --tmdb-color-text-info: #1565c0; /* Active */
  --tmdb-color-text-warning: #e65100; /* Spans group text */

  /* Colors - Backgrounds */
  --tmdb-color-bg-main: #f9f9f9;
  --tmdb-color-bg-content: #fff;
  --tmdb-color-bg-light-gray: #f5f5f5; /* listItem, preWrap, idChip bg, draft bg */
  --tmdb-color-bg-medium-gray: #f8f8f8; /* configChip bg */
  --tmdb-color-bg-dark-gray: #e0e0e0; /* renderStatsValue bg */
  --tmdb-color-bg-handle: #2a2a2a;
  --tmdb-color-bg-handle-hover: #3a3a3a; /* Added for handle hover */

  /* Colors - Borders */
  --tmdb-color-border-light: #ddd;
  --tmdb-color-border-medium: #eee;
  --tmdb-color-border-dark: #e0e0e0; /* activeTrace, noTrace, historyItem, preWrap, idChip, infoChip, renderStatsGroup */
  --tmdb-color-border-input: #e8e8e8; /* configChip */
  --tmdb-color-border-muted: #bdbdbd; /* unmatchedDot */

  /* Colors - Semantic & Accents */
  --tmdb-color-active-primary: #1565c0;
  --tmdb-color-active-primary-hover: #1976d2; /* Added for hover states */
  --tmdb-color-active-bg: #e3f2fd;
  --tmdb-color-active-bg-hover: #bbdefb; /* Added for hover states */
  --tmdb-color-active-border: #bbdefb;
  --tmdb-color-active-border-light: #90caf9;

  --tmdb-color-completed-primary: #2e7d32;
  --tmdb-color-completed-primary-hover: #388e3c; /* Added for hover states */
  --tmdb-color-completed-bg: #e8f5e9;
  --tmdb-color-completed-bg-hover: #c8e6c9; /* Added for hover states */
  --tmdb-color-completed-border: #c8e6c9;

  --tmdb-color-interrupted-primary: #c62828;
  --tmdb-color-interrupted-primary-hover: #d32f2f; /* Added for hover states */
  --tmdb-color-interrupted-bg: #ffebee;
  --tmdb-color-interrupted-bg-hover: #ffcdd2; /* Added for hover states */
  --tmdb-color-interrupted-border: #ffcdd2;

  --tmdb-color-draft-primary: #616161;
  --tmdb-color-draft-primary-hover: #757575; /* Added for hover states */
  --tmdb-color-draft-bg: #f5f5f5;
  --tmdb-color-draft-bg-hover: #e0e0e0; /* Added for hover states */

  --tmdb-color-link-primary: #1976d2;
  --tmdb-color-link-primary-hover: #1e88e5; /* Added for hover states */
  --tmdb-color-button-danger-primary: #f44336;
  --tmdb-color-button-danger-primary-hover: #e53935; /* Added for hover states */

  --tmdb-color-warning-primary: #e65100;
  --tmdb-color-warning-primary-hover: #ef6c00; /* Added for hover states */
  --tmdb-color-warning-bg: #fff3e0;
  --tmdb-color-warning-bg-hover: #ffe0b2; /* Added for hover states */
  --tmdb-color-warning-border: #ffe0b2;

  /* Colors - Timeline */
  --tmdb-timeline-loading-marker: #ff9800;
  --tmdb-timeline-loading-segment-bg: #fff176;
  --tmdb-timeline-data-marker: #1976d2;
  --tmdb-timeline-data-segment-bg: #90caf9;
  --tmdb-timeline-content-marker: #2e7d32;
  --tmdb-timeline-content-segment-bg: #a5d6a7;
  --tmdb-timeline-default-segment-bg: #e0e0e0;
  --tmdb-timeline-start-marker: #757575;


  /* Spacing */
  --tmdb-space-xxs: 2px;
  --tmdb-space-xs: 3px; /* chip vertical padding */
  --tmdb-space-s: 4px;
  --tmdb-space-ms: 5px;
  --tmdb-space-m: 8px;
  --tmdb-space-ml: 10px; /* chip horizontal padding */
  --tmdb-space-l: 12px;
  --tmdb-space-xl: 15px;
  --tmdb-space-xxl: 20px;

  /* Borders */
  --tmdb-border-radius-small: 4px;
  --tmdb-border-radius-medium: 6px;
  --tmdb-border-radius-large: 8px;
  --tmdb-border-radius-xlarge: 10px; /* configChip */
  --tmdb-border-radius-pill: 12px; /* most chips */
  --tmdb-border-radius-circle: 50%;

  /* Font Sizes */
  --tmdb-font-size-xxs: 11px; /* defChip, configChip, idChip */
  --tmdb-font-size-xs: 12px; /* statusTag, buttons, infoChip, timeDisplay, timeline labels */
  --tmdb-font-size-s: 13px; /* listItem, requiredSpan */
  --tmdb-font-size-m: 14px; /* sectionTitle, handleTitle, minimizedButton */
  --tmdb-font-size-l: 15px; /* history item strong title */
  --tmdb-font-size-xl: 16px; /* dismissButton, RenderBeaconTimeline name */
  --tmdb-font-size-xxl: 18px; /* historyTitle, error/wrench icon */
  --tmdb-font-size-xxxl: 20px; /* title */

  /* Font Weights */
  --tmdb-font-weight-normal: 400;
  --tmdb-font-weight-medium: 500;
  --tmdb-font-weight-bold: 700; /* or 'bold' keyword */

  /* Shadows */
  --tmdb-shadow-small: 0 1px 3px rgba(0, 0, 0, 0.05);
  --tmdb-shadow-medium: 0 2px 8px rgba(0, 0, 0, 0.1);
  --tmdb-shadow-large: 0 4px 8px rgba(0, 0, 0, 0.15);
  --tmdb-shadow-xlarge: 0 6px 20px rgba(0, 0, 0, 0.15); /* floating container */
  --tmdb-shadow-button: 0 4px 10px rgba(0, 0, 0, 0.2); /* minimized button */
  --tmdb-shadow-button-hover: 0 6px 14px rgba(0, 0, 0, 0.25); /* hover state for button */

  /* Z-indices */
  --tmdb-z-index-timeline-marker: 0;
  --tmdb-z-index-timeline-bar: 1;
  --tmdb-z-index-timeline-text: 2;
  --tmdb-z-index-floating: 1000;
  --tmdb-z-index-tooltip: 1001;

  /* Timeline specific */
  --tmdb-timeline-bar-height: 25px;
  --tmdb-timeline-text-area-height: 22px;
  --tmdb-timeline-marker-line-width: 2px;
  --tmdb-timeline-padding-between-areas: 2px;

  /* Transitions */
  --tmdb-transition-fast: 0.15s ease;
  --tmdb-transition-medium: 0.2s ease;
  --tmdb-transition-slow: 0.3s ease;

  font-family: var(--tmdb-font-family);
}

.tmdb-container {
  max-width: 800px;
  margin: var(--tmdb-space-xxl) auto;
  padding: var(--tmdb-space-xxl);
  border: 1px solid var(--tmdb-color-border-light);
  border-radius: var(--tmdb-border-radius-large);
  box-shadow: var(--tmdb-shadow-medium);
  background-color: var(--tmdb-color-bg-main);
}

.tmdb-header {
  border-bottom: 1px solid var(--tmdb-color-border-medium);
  padding-bottom: var(--tmdb-space-xl);
  margin-bottom: var(--tmdb-space-xxl);
  display: flex;
  justify-content: space-between;
  align-items: center;
}

.tmdb-title {
  margin: 0;
  font-size: var(--tmdb-font-size-xxxl);
  font-weight: var(--tmdb-font-weight-bold);
  color: var(--tmdb-color-text-primary);
}

/* Active trace container, though not explicitly used with this class name in the original JS */
/* .tmdb-active-trace {
  padding: var(--tmdb-space-xxl);
  background-color: var(--tmdb-color-bg-content);
  border-radius: var(--tmdb-border-radius-large);
  margin-bottom: var(--tmdb-space-xxl);
  border: 1px solid var(--tmdb-color-border-dark);
  box-shadow: var(--tmdb-shadow-small);
} */

.tmdb-section {
  margin-bottom: var(--tmdb-space-xl);
}

.tmdb-section-title {
  font-weight: var(--tmdb-font-weight-bold);
  margin-bottom: var(--tmdb-space-ml);
  font-size: var(--tmdb-font-size-m);
  color: var(--tmdb-color-text-secondary);
}

/* Add hover styles to status tags */
.tmdb-status-tag {
  display: inline-block;
  padding: var(--tmdb-space-s) var(--tmdb-space-ml);
  border-radius: var(--tmdb-border-radius-pill);
  font-size: var(--tmdb-font-size-xs);
  font-weight: var(--tmdb-font-weight-medium);
  margin-left: var(--tmdb-space-ml);
  transition: filter var(--tmdb-transition-fast), transform var(--tmdb-transition-fast);
}
.tmdb-status-tag:hover {
  filter: brightness(0.95);
}
.tmdb-status-tag-active {
  background-color: var(--tmdb-color-active-bg);
  color: var(--tmdb-color-active-primary);
}
.tmdb-status-tag-active:hover {
  background-color: var(--tmdb-color-active-bg-hover);
}
.tmdb-status-tag-completed {
  background-color: var(--tmdb-color-completed-bg);
  color: var(--tmdb-color-completed-primary);
}
.tmdb-status-tag-completed:hover {
  background-color: var(--tmdb-color-completed-bg-hover);
}
.tmdb-status-tag-interrupted {
  background-color: var(--tmdb-color-interrupted-bg);
  color: var(--tmdb-color-interrupted-primary);
}
.tmdb-status-tag-interrupted:hover {
  background-color: var(--tmdb-color-interrupted-bg-hover);
}
.tmdb-status-tag-draft {
  background-color: var(--tmdb-color-draft-bg);
  color: var(--tmdb-color-draft-primary);
}
.tmdb-status-tag-draft:hover {
  background-color: var(--tmdb-color-draft-bg-hover);
}

.tmdb-list-item {
  padding: var(--tmdb-space-ms) var(--tmdb-space-xl);
  background-color: var(--tmdb-color-bg-light-gray);
  border-radius: var(--tmdb-border-radius-medium);
  margin-bottom: var(--tmdb-space-xs);
  font-size: var(--tmdb-font-size-s);
  display: flex;
  justify-content: space-between;
  align-items: center; /* Added for vertical alignment */
}

.tmdb-required-span {
  display: flex;
  justify-content: space-between;
  align-items: center;
  padding: var(--tmdb-space-ml) var(--tmdb-space-xl);
  background-color: var(--tmdb-color-bg-light-gray);
  border-radius: var(--tmdb-border-radius-medium);
  margin-bottom: var(--tmdb-space-m);
  font-size: var(--tmdb-font-size-s);
}
.tmdb-required-span-matched {
  border-left: 4px solid var(--tmdb-color-completed-primary);
}
.tmdb-required-span-unmatched {
  border-left: 4px solid var(--tmdb-color-text-muted);
}

.tmdb-matched-indicator {
  display: inline-block;
  width: var(--tmdb-space-l);
  height: var(--tmdb-space-l);
  border-radius: var(--tmdb-border-radius-circle);
  margin-right: var(--tmdb-space-ml);
}
.tmdb-matched-indicator-matched {
  background-color: var(--tmdb-color-completed-primary);
}
.tmdb-matched-indicator-unmatched {
  background-color: var(--tmdb-color-border-muted);
}

.tmdb-no-trace {
  padding: 30px; /* Kept specific padding */
  text-align: center;
  color: var(--tmdb-color-text-muted);
  font-style: italic;
}

.tmdb-history-title {
  margin-bottom: var(--tmdb-space-ml);
  font-size: var(--tmdb-font-size-xxl);
  font-weight: var(--tmdb-font-weight-bold);
  color: var(--tmdb-color-text-primary);
  display: flex;
  align-items: center;
  gap: var(--tmdb-space-ml);
  justify-content: space-between;
}
.tmdb-history-title-left,
.tmdb-history-title-right {
  display: flex;
  align-items: center;
  gap: var(--tmdb-space-ml);
}

.tmdb-button { /* Base for buttons if commonality increases */
  border: none;
  border-radius: var(--tmdb-border-radius-small);
  padding: var(--tmdb-space-s) var(--tmdb-space-ml);
  font-size: var(--tmdb-font-size-xs);
  cursor: pointer;
  display: inline-flex;
  align-items: center;
  text-decoration: none;
  transition: background-color var(--tmdb-transition-fast),
              box-shadow var(--tmdb-transition-fast),
              transform var(--tmdb-transition-fast);
}
.tmdb-button:hover {
  transform: translateY(-1px);
  box-shadow: 0 2px 5px rgba(0, 0, 0, 0.1);
}
.tmdb-button:active {
  transform: translateY(0);
  box-shadow: 0 1px 2px rgba(0, 0, 0, 0.1);
}
.tmdb-visualizer-link {
  background-color: var(--tmdb-color-link-primary);
  color: var(--tmdb-color-white);
}
.tmdb-visualizer-link:hover {
  background-color: var(--tmdb-color-link-primary-hover);
}
.tmdb-clear-button {
  background-color: var(--tmdb-color-button-danger-primary);
  color: var(--tmdb-color-white);
}
.tmdb-clear-button:hover {
  background-color: var(--tmdb-color-button-danger-primary-hover);
}
.tmdb-download-button {
  background-color: var(--tmdb-color-link-primary);
  color: var(--tmdb-color-white);
  margin-left: var(--tmdb-space-ml);
}
.tmdb-download-button:hover {
  background-color: var(--tmdb-color-link-primary-hover);
}
.tmdb-download-icon {
  font-size: var(--tmdb-font-size-m); /* Approximation */
}


.tmdb-history-item {
  padding: var(--tmdb-space-xl);
  background-color: var(--tmdb-color-bg-content);
  border-radius: var(--tmdb-border-radius-large);
  margin-bottom: var(--tmdb-space-l);
  border: 1px solid var(--tmdb-color-border-dark);
  cursor: pointer;
  box-shadow: var(--tmdb-shadow-small);
  transition: box-shadow var(--tmdb-transition-medium);
  position: relative; /* For positioning the arrow */
}
.tmdb-history-item:hover {
  box-shadow: var(--tmdb-shadow-large);
}

.tmdb-history-header {
  display: flex;
  justify-content: space-between;
  align-items: center;
  margin-bottom: var(--tmdb-space-m);
}

.tmdb-dismiss-button {
  background: none;
  border: none;
  color: var(--tmdb-color-interrupted-primary);
  cursor: pointer;
  font-size: var(--tmdb-font-size-xl);
  padding: var(--tmdb-space-xxs) var(--tmdb-space-m);
  border-radius: var(--tmdb-border-radius-circle);
  display: inline-flex;
  align-items: center;
  justify-content: center;
  width: 24px; /* Specific size */
  height: 24px; /* Specific size */
  transition: background-color var(--tmdb-transition-fast),
              color var(--tmdb-transition-fast),
              transform var(--tmdb-transition-fast);
}
.tmdb-dismiss-button:hover {
  background-color: var(--tmdb-color-interrupted-bg);
  transform: scale(1.1);
}
.tmdb-dismiss-button:active {
  transform: scale(1);
}

.tmdb-expand-arrow {
  position: absolute;
  bottom: 0px;
  left: 50%;
  /* transform: translateX(-50%); // Base transform applied by specific classes */
  width: 24px;
  height: 24px;
  display: flex;
  justify-content: center;
  align-items: center;
  transition: transform var(--tmdb-transition-medium);
  cursor: pointer;
  color: var(--tmdb-color-text-secondary);
}
.tmdb-expand-arrow:hover {
  color: var(--tmdb-color-text-primary);
}
.tmdb-expand-arrow-down {
  transform: translateX(-50%) rotate(0deg);
}
.tmdb-expand-arrow-up {
  transform: translateX(-50%) rotate(180deg);
}

.tmdb-expanded-history {
  margin-top: var(--tmdb-space-xl);
  padding-top: var(--tmdb-space-xl);
  border-top: 1px dashed var(--tmdb-color-border-dark);
}

.tmdb-time-display {
  font-size: var(--tmdb-font-size-xs);
  color: var(--tmdb-color-text-light);
  font-weight: var(--tmdb-font-weight-medium);
}

.tmdb-trace-info-row {
  display: flex;
  gap: var(--tmdb-space-m);
  flex-wrap: wrap;
  margin-bottom: var(--tmdb-space-ml);
  padding: var(--tmdb-space-m) 0;
}

.tmdb-config-info-row {
  display: flex;
  gap: var(--tmdb-space-m);
  flex-wrap: wrap;
  margin-bottom: var(--tmdb-space-xxs);
  font-size: 90%; /* Kept percentage */
}

.tmdb-chip { /* Base for chips */
  padding: var(--tmdb-space-xs) var(--tmdb-space-ml);
  border-radius: var(--tmdb-border-radius-pill);
  font-size: var(--tmdb-font-size-xs);
  border: 1px solid var(--tmdb-color-border-dark);
}
.tmdb-info-chip {
  background-color: #f1f1f1; /* unique, kept */
  color: var(--tmdb-color-text-primary);
}
.tmdb-config-chip {
  background-color: var(--tmdb-color-bg-medium-gray);
  padding: var(--tmdb-space-xxs) var(--tmdb-space-m);
  border-radius: var(--tmdb-border-radius-xlarge);
  font-size: var(--tmdb-font-size-xxs);
  color: var(--tmdb-color-text-secondary);
  border: 1px solid var(--tmdb-color-border-input);
}
.tmdb-id-chip {
  background-color: var(--tmdb-color-bg-light-gray);
  color: var(--tmdb-color-text-muted);
  font-size: var(--tmdb-font-size-xxs);
}

/* Chip Groups (Label + Value pairs) */
.tmdb-chip-group {
  display: inline-flex;
  flex-wrap: nowrap;
  overflow: hidden;
  border-radius: var(--tmdb-border-radius-pill);
  transition: all var(--tmdb-transition-fast);
}
.tmdb-chip-group-label {
  padding: var(--tmdb-space-xs) var(--tmdb-space-m);
  font-size: var(--tmdb-font-size-xs);
}
.tmdb-chip-group-value {
  color: var(--tmdb-color-white);
  padding: var(--tmdb-space-xs) var(--tmdb-space-m);
  font-size: var(--tmdb-font-size-xs);
  font-weight: var(--tmdb-font-weight-medium);
}

.tmdb-variant-group {
  border: 1px solid var(--tmdb-color-completed-border);
  background-color: var(--tmdb-color-completed-bg);
  & .tmdb-chip-group-label {
    color: var(--tmdb-color-completed-primary);
  }
  & .tmdb-chip-group-value {
    background-color: var(--tmdb-color-completed-primary);
  }
}
.tmdb-variant-group:hover {
  background-color: var(--tmdb-color-completed-bg-hover);
  & .tmdb-chip-group-value {
    background-color: var(--tmdb-color-completed-primary-hover);
  }
}

.tmdb-spans-group {
  border: 1px solid var(--tmdb-color-warning-border);
  background-color: var(--tmdb-color-warning-bg);
  & .tmdb-chip-group-label {
    color: var(--tmdb-color-warning-primary);
  }
  & .tmdb-chip-group-value {
    background-color: var(--tmdb-color-warning-primary);
  }
}
.tmdb-spans-group:hover {
  background-color: var(--tmdb-color-warning-bg-hover);
  & .tmdb-chip-group-value {
    background-color: var(--tmdb-color-warning-primary-hover);
  }
}

.tmdb-reason-group {
  border: 1px solid var(--tmdb-color-interrupted-border);
  background-color: var(--tmdb-color-interrupted-bg);
  & .tmdb-chip-group-label {
    color: var(--tmdb-color-interrupted-primary);
  }
  & .tmdb-chip-group-value {
    background-color: var(--tmdb-color-interrupted-primary);
  }
}
.tmdb-reason-group:hover {
  background-color: var(--tmdb-color-interrupted-bg-hover);
  & .tmdb-chip-group-value {
    background-color: var(--tmdb-color-interrupted-primary-hover);
  }
}

.tmdb-related-group {
  border: 1px solid var(--tmdb-color-active-border);
  background-color: var(--tmdb-color-active-bg);
  & .tmdb-chip-group-label { /* relatedLabel */
    color: var(--tmdb-color-active-primary);
  }
  & .tmdb-related-items { /* Container for multiple items */
    background-color: var(--tmdb-color-active-primary);
    display: flex;
    gap: 2px;
    padding: 0 6px;
  }
  & .tmdb-related-item {
    background-color: var(--tmdb-color-active-primary); /* Should be same as relatedItems to blend */
    color: var(--tmdb-color-white);
    padding: var(--tmdb-space-xs) var(--tmdb-space-s);
    font-size: var(--tmdb-font-size-xs);
  }
}
.tmdb-related-group:hover {
  background-color: var(--tmdb-color-active-bg-hover);
  & .tmdb-related-items {
    background-color: var(--tmdb-color-active-primary-hover);
  }
  & .tmdb-related-item {
    background-color: var(--tmdb-color-active-primary-hover);
  }
}


.tmdb-pre-wrap {
  white-space: pre-wrap;
  font-size: var(--tmdb-font-size-xs);
  background-color: var(--tmdb-color-bg-light-gray);
  padding: var(--tmdb-space-l);
  border-radius: var(--tmdb-border-radius-medium);
  overflow-x: auto;
  max-height: 200px;
  border: 1px solid var(--tmdb-color-border-dark);
}

.tmdb-time-marker-value { /* Used within TimeMarkers component */
  font-family: monospace;
  text-align: right;
  display: inline-block;
  width: 80px; /* Specific width */
  font-weight: var(--tmdb-font-weight-medium);
}

.tmdb-floating-container {
  position: fixed;
  /* top, left are dynamic */
  min-width: 600px;
  max-width: 750px;
  width: 100%; /* Or some other logic if needed */
  z-index: var(--tmdb-z-index-floating);
  resize: both;
  overflow: auto;
  max-height: 90vh;
  box-shadow: var(--tmdb-shadow-xlarge);
  /* padding will be 0 for floating container itself */
  background-color: var(--tmdb-color-bg-main); /* Match .tmdb-container */
  border-radius: var(--tmdb-border-radius-large); /* Match .tmdb-container */
}

.tmdb-handle {
  padding: var(--tmdb-space-l) var(--tmdb-space-xl);
  background-color: var(--tmdb-color-bg-handle);
  color: var(--tmdb-color-white);
  cursor: move;
  display: flex;
  justify-content: space-between;
  align-items: center;
  border-top-left-radius: var(--tmdb-border-radius-large);
  border-top-right-radius: var(--tmdb-border-radius-large);
  transition: background-color var(--tmdb-transition-fast);
}
.tmdb-handle:hover {
  background-color: var(--tmdb-color-bg-handle-hover);
}

.tmdb-handle-title {
  margin: 0;
  font-size: var(--tmdb-font-size-m);
  font-weight: var(--tmdb-font-weight-bold);
}

.tmdb-close-button { /* Also used for minimize */
  background: none;
  border: none;
  color: var(--tmdb-color-white);
  cursor: pointer;
  font-size: var(--tmdb-font-size-xxl); /* 18px */
  padding: var(--tmdb-space-xxs) var(--tmdb-space-m);
  border-radius: var(--tmdb-border-radius-circle);
  transition: background-color var(--tmdb-transition-fast), transform var(--tmdb-transition-fast);
}
.tmdb-close-button:hover {
  background-color: rgba(255, 255, 255, 0.1);
  transform: scale(1.1);
}
.tmdb-close-button:active {
  transform: scale(1);
}

.tmdb-minimized-button {
  position: fixed;
  bottom: var(--tmdb-space-xxl);
  right: var(--tmdb-space-xxl);
  background-color: var(--tmdb-color-active-primary);
  color: var(--tmdb-color-white);
  border: none;
  border-radius: var(--tmdb-border-radius-circle);
  width: 74px; /* Specific */
  height: 74px; /* Specific */
  opacity: 0.9;
  display: flex;
  justify-content: center;
  align-items: center;
  cursor: pointer;
  box-shadow: var(--tmdb-shadow-button);
  z-index: var(--tmdb-z-index-floating);
  font-size: var(--tmdb-font-size-m);
  font-weight: var(--tmdb-font-weight-bold);
  transition: opacity var(--tmdb-transition-fast),
              transform var(--tmdb-transition-fast),
              box-shadow var(--tmdb-transition-fast),
              background-color var(--tmdb-transition-fast);
}
.tmdb-minimized-button:hover {
  opacity: 1;
  transform: scale(1.05);
  box-shadow: var(--tmdb-shadow-button-hover);
  background-color: var(--tmdb-color-active-primary-hover);
}
.tmdb-minimized-button:active {
  transform: scale(1);
}

.tmdb-def-chip-container {
  display: flex;
  flex-wrap: wrap;
  gap: var(--tmdb-space-ms);
  align-items: center;
}

.tmdb-def-chip {
  background-color: var(--tmdb-color-active-bg);
  color: var(--tmdb-color-active-primary);
  padding: var(--tmdb-space-xxs) var(--tmdb-space-m);
  border-radius: var(--tmdb-border-radius-xlarge);
  font-size: var(--tmdb-font-size-xxs);
  max-width: 200px;
  text-overflow: ellipsis;
  white-space: nowrap;
  position: relative;
  border: 1px solid var(--tmdb-color-active-border-light);
  transition: background-color var(--tmdb-transition-fast);
}
.tmdb-def-chip:hover {
  background-color: var(--tmdb-color-active-bg-hover);
}
.tmdb-def-chip-value {
  font-weight: var(--tmdb-font-weight-bold);
}
.tmdb-def-chip-hoverable {
  cursor: help;
}
.tmdb-def-chip-hoverable:hover {
  background-color: var(--tmdb-color-active-bg-hover);
}
.tmdb-def-chip-tooltip {
  position: absolute;
  bottom: 100%;
  left: 50%;
  transform: translateX(-50%);
  background-color: rgba(0,0,0,0.8);
  color: var(--tmdb-color-white);
  padding: var(--tmdb-space-ms) var(--tmdb-space-ml);
  border-radius: var(--tmdb-border-radius-small);
  font-size: var(--tmdb-font-size-xxs);
  z-index: var(--tmdb-z-index-tooltip);
  min-width: 200px;
  max-width: 300px;
  word-break: break-word;
  pointer-events: none;
  opacity: 0;
  transition: opacity var(--tmdb-transition-slow), visibility var(--tmdb-transition-slow); /* Added visibility transition */
  visibility: hidden;
}
.tmdb-def-chip-tooltip-visible {
  opacity: 1;
  visibility: visible;
}

.tmdb-span-content { /* In RequiredSpansList */
  display: flex;
  align-items: center;
  flex: 1;
}

/* RenderBeaconTimeline specific classes */
.tmdb-render-beacon-timeline-name {
  font-weight: 600; /* Specific */
  font-size: var(--tmdb-font-size-xl);
  margin-right: var(--tmdb-space-ml);
}
.tmdb-render-stats-group {
  display: inline-flex;
  flex-wrap: nowrap;
  overflow: hidden;
  border-radius: var(--tmdb-border-radius-pill);
  border: 1px solid var(--tmdb-color-border-dark);
  background-color: var(--tmdb-color-bg-light-gray);
  margin-right: var(--tmdb-space-m);
  transition: border-color var(--tmdb-transition-fast);
}
.tmdb-render-stats-group:hover {
  border-color: var(--tmdb-color-active-primary);
}
.tmdb-render-stats-label {
  color: var(--tmdb-color-text-secondary);
  padding: var(--tmdb-space-xs) var(--tmdb-space-m);
  font-size: var(--tmdb-font-size-xs);
}
.tmdb-render-stats-value {
  background-color: var(--tmdb-color-bg-dark-gray);
  color: var(--tmdb-color-text-primary);
  padding: var(--tmdb-space-xs) var(--tmdb-space-m);
  font-size: var(--tmdb-font-size-xs);
  font-weight: var(--tmdb-font-weight-medium);
}

.tmdb-timeline-point-label,
.tmdb-timeline-point-time {
  position: absolute;
  font-size: var(--tmdb-font-size-xxs); /* 11px */
  white-space: nowrap;
  padding: 0 var(--tmdb-space-ms);
}

.tmdb-timeline-bar {
  position: absolute;
  width: 100%;
  height: var(--tmdb-timeline-bar-height);
  border-radius: 3px; /* Specific */
  background: var(--tmdb-timeline-default-segment-bg);
  box-sizing: border-box;
  z-index: var(--tmdb-z-index-timeline-bar);
  display: flex; /* For segments */
}

.tmdb-timeline-segment {
  position: absolute;
  height: 100%;
}

.tmdb-timeline-marker-line {
  position: absolute;
  top: 0;
  width: var(--tmdb-timeline-marker-line-width);
  height: 100%; /* Spans full TOTAL_VIS_CONTENT_HEIGHT */
  z-index: var(--tmdb-z-index-timeline-marker);
}

.tmdb-error-indicator {
  color: var(--tmdb-color-text-error);
  font-size: var(--tmdb-font-size-xxl); /* 18px */
}
.tmdb-definition-modified-indicator {
  color: var(--tmdb-color-link-primary);
  font-size: var(--tmdb-font-size-xxl); /* 18px */
}

.tmdb-computed-span-missing {
  margin-left: var(--tmdb-space-m);
  color: red; /* Kept direct red */
  font-weight: var(--tmdb-font-weight-medium);
}
.tmdb-computed-span-pending,
.tmdb-computed-value-pending {
  margin-left: var(--tmdb-space-m);
  color: var(--tmdb-color-text-muted);
  font-style: italic;
}
.tmdb-computed-value {
  margin-left: var(--tmdb-space-m);
  color: var(--tmdb-color-link-primary);
}
.tmdb-computed-value-na {
  margin-left: var(--tmdb-space-m);
  color: red; /* Kept direct red */
  font-weight: var(--tmdb-font-weight-medium);
}

.tmdb-definition-details-toggle {
  display: flex;
  align-items: center;
  cursor: pointer;
  margin-top: var(--tmdb-space-m);
  font-size: var(--tmdb-font-size-xs);
  color: var(--tmdb-color-text-secondary);
  transition: color var(--tmdb-transition-fast);
  & > span {
    margin-right: var(--tmdb-space-ms);
  }
}
.tmdb-definition-details-toggle:hover {
  color: var(--tmdb-color-text-primary);
  text-decoration: underline;
}

/* Ensure the root class is applied to the main div */
.tmdb-container, .tmdb-floating-container {
  font-family: var(--tmdb-font-family);
}

ul.tmdb-no-style-list {
  list-style: none;
  margin: 0;
  padding: 0;
}

/* For the content within the floating container specifically */
.tmdb-floating-content-wrapper {
  padding: 0 var(--tmdb-space-xl); /* Original padding for non-handle/non-floater parts */
}

/* Add hover styles for clickable list items */
.tmdb-list-item[onClick],
.tmdb-list-item[role="button"],
.tmdb-list-item a,
.tmdb-list-item button {
  cursor: pointer;
  transition: background-color var(--tmdb-transition-fast), transform var(--tmdb-transition-fast);
}
.tmdb-list-item[onClick]:hover,
.tmdb-list-item[role="button"]:hover,
.tmdb-list-item a:hover,
.tmdb-list-item button:hover {
  background-color: var(--tmdb-color-bg-medium-gray);
  transform: translateX(2px);
}
`

function getDynamicStateStyle(state: string) {
  let stateClass: string
  switch (state) {
  case 'complete': {
  stateClass = 'tmdb-status-tag-completed'
  break;
  }
  case 'interrupted': {
  stateClass = 'tmdb-status-tag-interrupted'
  break;
  }
  case 'draft': {
  stateClass = 'tmdb-status-tag-draft'
  // No default
  break;
  }
  default:
  stateClass = 'tmdb-status-tag-active'
  }

  return `tmdb-status-tag ${stateClass}`
}

const TRACE_HISTORY_LIMIT = 15

function getFromRecord<T>(
  record: Record<string, T> | undefined,
  key: string,
): T | undefined {
  return record && Object.hasOwn(record, key) ? record[key] : undefined
}

function TraceAttributes({
  attributes,
}: {
  attributes?: Record<string, unknown>
}) {
  if (!attributes || Object.keys(attributes).length === 0) return null

  return (
    <div className="tmdb-section">
      <div className="tmdb-section-title">Attributes:</div>
      <div className="tmdb-def-chip-container">
        {Object.entries(attributes).map(([key, value]) => (
          // eslint-disable-next-line @typescript-eslint/no-use-before-define
          <DefinitionChip key={key} keyName={key} value={value} />
        ))}
      </div>
    </div>
  )
}

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
    <div className="tmdb-section">
      <div className="tmdb-section-title">Time Markers:</div>
      <ul className="tmdb-no-style-list">
        {lastRequiredSpanOffset !== undefined && (
          <li className="tmdb-list-item">
            <span>First Contentful Render (Last Required Span):</span>
            <span className="tmdb-time-marker-value">
              +{formatMs(lastRequiredSpanOffset)}
            </span>
          </li>
        )}
        {completeSpanOffset !== undefined && (
          <li className="tmdb-list-item">
            <span>Last Contentful Render (Trace Complete):</span>
            <span className="tmdb-time-marker-value">
              +{formatMs(completeSpanOffset)}
            </span>
          </li>
        )}
        {cpuIdleSpanOffset !== undefined && (
          <li className="tmdb-list-item">
            <span>Time To Interactive (CPU Idle Span):</span>
            <span className="tmdb-time-marker-value">
              +{formatMs(cpuIdleSpanOffset)}
            </span>
          </li>
        )}
      </ul>
    </div>
  )
}

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

  const displayValue =
    stringValue.length > MAX_STRING_LENGTH
      ? `${stringValue.slice(0, MAX_STRING_LENGTH)}...`
      : stringValue

  const chipClassName = `tmdb-def-chip ${needsTooltip ? 'tmdb-def-chip-hoverable' : ''}`;
  const tooltipClassName = `tmdb-def-chip-tooltip ${showTooltip ? 'tmdb-def-chip-tooltip-visible' : ''}`;

  return (
    <div
      className={chipClassName}
      onMouseEnter={() => void setShowTooltip(true)}
      onMouseLeave={() => void setShowTooltip(false)}
    >
      {keyName}: <span className="tmdb-def-chip-value">{displayValue}</span>
      {needsTooltip && (
        <div
          className={tooltipClassName}
          // Opacity and visibility are handled by CSS classes now
        >
          {typeof value === 'object'
            ? JSON.stringify(value, null, 2)
            : String(value)}
        </div>
      )}
    </div>
  )
}

// eslint-disable-next-line @typescript-eslint/no-unused-vars
function RequiredSpansList<RelationSchemasT>({
  requiredSpans,
}: {
  requiredSpans: RequiredSpan[]
}) {
  return (
    <div className="tmdb-section">
      <div className="tmdb-section-title">
        Required Spans ({requiredSpans.filter((s) => s.isMatched).length}/
        {requiredSpans.length}):
      </div>
      <div>
        {requiredSpans.map((span, i) => (
          <div
            key={i}
            className={`tmdb-required-span ${span.isMatched ? 'tmdb-required-span-matched' : 'tmdb-required-span-unmatched'}`}
          >
            <div className="tmdb-span-content">
              <span
                className={`tmdb-matched-indicator ${span.isMatched ? 'tmdb-matched-indicator-matched' : 'tmdb-matched-indicator-unmatched'}`}
                title={span.isMatched ? 'Matched' : 'Pending'}
              />
              {span.definition ? (
                <div className="tmdb-def-chip-container">
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

function RenderComputedSpan({ value }: { value: ComputedSpan }) {
  if (!value) return null
  return (
    <span style={{ marginLeft: 'var(--tmdb-space-m)', color: 'var(--tmdb-color-link-primary)' }}>
      start: {value.startOffset.toFixed(2)}ms, duration:{' '}
      {value.duration.toFixed(2)}ms
    </span>
  )
}

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
  const laneLastOccupiedX: Record<number, number> = {}

  for (const currentPoint of sortedPoints) {
    const currentPointLeftPercent = currentPoint.time * currentScale
    for (let l = 0; ; l++) {
      const lastXInLane = laneLastOccupiedX[l]
      if (
        lastXInLane === undefined ||
        currentPointLeftPercent - lastXInLane >= separationPercent
      ) {
        assignments.push({ pointData: currentPoint, lane: l })
        laneLastOccupiedX[l] = currentPointLeftPercent
        break
      }
    }
  }
  return assignments
}

function RenderBeaconTimeline({
  value,
  name,
}: {
  value: ComputedRenderSpan
  name: string
}) {
  if (!value) return null

  const {
    firstRenderTillLoading: loading,
    firstRenderTillData: data,
    firstRenderTillContent: content,
  } = value

  const LABEL_ALIGN_LOW_THRESHOLD = 1
  const LABEL_ALIGN_HIGH_THRESHOLD = 99
  const MARKER_LINE_ALIGN_LOW_THRESHOLD = 0.1
  const MARKER_LINE_ALIGN_HIGH_THRESHOLD = 99.9
  const MIN_SEGMENT_WIDTH_PRODUCT_THRESHOLD = 0.001
  const MIN_TEXT_SEPARATION_PERCENT = 8

  const timePointsForDisplay: { name: string; time: number; color: string }[] =
    []
  timePointsForDisplay.push({ name: 'start', time: 0, color: 'var(--tmdb-timeline-start-marker)' })
  if (typeof loading === 'number')
    timePointsForDisplay.push({
      name: 'loading',
      time: loading,
      color: 'var(--tmdb-timeline-loading-marker)',
    })
  if (typeof data === 'number')
    timePointsForDisplay.push({ name: 'data', time: data, color: 'var(--tmdb-timeline-data-marker)' })
  if (typeof content === 'number')
    timePointsForDisplay.push({
      name: 'content',
      time: content,
      color: 'var(--tmdb-timeline-content-marker)',
    })

  const allRelevantTimes = [0, loading, data, content].filter(
    (t): t is number => typeof t === 'number',
  )
  const maxTime =
    allRelevantTimes.length > 0 ? Math.max(...allRelevantTimes) : 0
  const scale = maxTime > 0 ? 100 / maxTime : 0

  const processedPointsForDisplay = assignLanesToPoints(
    timePointsForDisplay,
    scale,
    MIN_TEXT_SEPARATION_PERCENT,
  )
  const numLanes =
    processedPointsForDisplay.length > 0
      ? Math.max(...processedPointsForDisplay.map((item) => item.lane)) + 1
      : 1

  const TOTAL_LABEL_AREA_HEIGHT = numLanes * Number.parseFloat(getComputedStyle(document.documentElement).getPropertyValue('--tmdb-timeline-text-area-height') || '22')
  const TOTAL_TIME_VALUE_AREA_HEIGHT = numLanes * Number.parseFloat(getComputedStyle(document.documentElement).getPropertyValue('--tmdb-timeline-text-area-height') || '22')
  const PADDING_BETWEEN_AREAS = Number.parseFloat(getComputedStyle(document.documentElement).getPropertyValue('--tmdb-timeline-padding-between-areas') || '2')
  const BAR_HEIGHT_VALUE = Number.parseFloat(getComputedStyle(document.documentElement).getPropertyValue('--tmdb-timeline-bar-height') || '25')


  const TOTAL_VIS_CONTENT_HEIGHT =
    TOTAL_LABEL_AREA_HEIGHT +
    PADDING_BETWEEN_AREAS +
    BAR_HEIGHT_VALUE +
    PADDING_BETWEEN_AREAS +
    TOTAL_TIME_VALUE_AREA_HEIGHT

  const BAR_TOP_OFFSET =
    TOTAL_LABEL_AREA_HEIGHT + PADDING_BETWEEN_AREAS
  const TIME_VALUES_AREA_TOP =
    BAR_TOP_OFFSET + BAR_HEIGHT_VALUE + PADDING_BETWEEN_AREAS

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
        color: 'var(--tmdb-timeline-loading-segment-bg)',
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
        color: 'var(--tmdb-timeline-data-segment-bg)',
        key: 'segment-to-data',
      })
    }
    currentSegmentTime = Math.max(currentSegmentTime, data)
  }
  if (typeof content === 'number' && content > currentSegmentTime) {
    barSegments.push({
      start: currentSegmentTime,
      end: content,
      color: 'var(--tmdb-timeline-content-segment-bg)',
      key: 'segment-to-content',
    })
  }
  if (barSegments.length === 0 && maxTime > 0) {
    let singleSegmentColor = 'var(--tmdb-timeline-default-segment-bg)'
    if (typeof content === 'number' && content === maxTime)
      singleSegmentColor = 'var(--tmdb-timeline-content-segment-bg)'
    else if (typeof data === 'number' && data === maxTime)
      singleSegmentColor = 'var(--tmdb-timeline-data-segment-bg)'
    else if (typeof loading === 'number' && loading === maxTime)
      singleSegmentColor = 'var(--tmdb-timeline-loading-segment-bg)'
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

  const uniqueTimesForLines = [
    ...new Set(timePointsForDisplay.map((p) => p.time)),
  ].sort((a, b) => a - b)

  return (
    <div style={{ width: '100%' }}>
      <div style={{ display: 'flex', alignItems: 'center' }}>
        <div className="tmdb-render-beacon-timeline-name">{name}</div>
        <div className="tmdb-render-stats-group">
          <span className="tmdb-render-stats-label">Renders</span>
          <span className="tmdb-render-stats-value">{value.renderCount}</span>
        </div>
        <div className="tmdb-render-stats-group">
          <span className="tmdb-render-stats-label">Duration</span>
          <span className="tmdb-render-stats-value">
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
        <div
          style={{
            position: 'absolute',
            top: 0,
            width: '100%',
            height: TOTAL_LABEL_AREA_HEIGHT,
            zIndex: Number.parseFloat(getComputedStyle(document.documentElement).getPropertyValue('--tmdb-z-index-timeline-text') || '2'),
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
                  key={`${point.name}-label-${point.time}`}
                  className="tmdb-timeline-point-label"
                  style={{
                    top: currentLane * Number.parseFloat(getComputedStyle(document.documentElement).getPropertyValue('--tmdb-timeline-text-area-height') || '22'),
                    left: `${leftPercent}%`,
                    transform,
                    color: point.color,
                    lineHeight: `var(--tmdb-timeline-text-area-height)`,
                  }}
                >
                  {point.name}
                </div>
              )
            },
          )}
        </div>

        <div
          className="tmdb-timeline-bar"
          style={{
            top: BAR_TOP_OFFSET,
          }}
        >
          {validBarSegments.map((seg) => {
            const segmentWidthPercent = (seg.end - seg.start) * scale
            const segmentLeftPercent = seg.start * scale
            if (segmentWidthPercent <= 0) return null
            return (
              <div
                key={seg.key}
                className="tmdb-timeline-segment"
                style={{
                  left: `${segmentLeftPercent}%`,
                  width: `${segmentWidthPercent}%`,
                  background: seg.color,
                }}
              />
            )
          })}
        </div>

        <div
          style={{
            position: 'absolute',
            top: TIME_VALUES_AREA_TOP,
            width: '100%',
            height: TOTAL_TIME_VALUE_AREA_HEIGHT,
            zIndex: Number.parseFloat(getComputedStyle(document.documentElement).getPropertyValue('--tmdb-z-index-timeline-text') || '2'),
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
                  key={`${point.name}-time-${point.time}`}
                  className="tmdb-timeline-point-time"
                  style={{
                    top: currentLane * Number.parseFloat(getComputedStyle(document.documentElement).getPropertyValue('--tmdb-timeline-text-area-height') || '22'),
                    left: `${leftPercent}%`,
                    transform,
                    color: point.color,
                     lineHeight: `var(--tmdb-timeline-text-area-height)`,
                  }}
                >
                  +{point.time.toFixed(0)}ms
                </div>
              )
            },
          )}
        </div>

        {uniqueTimesForLines.map((timeVal) => {
          const pointConfig =
            timePointsForDisplay.find((p) => p.time === timeVal) ??
            timePointsForDisplay[0]!
          const leftPercent = timeVal * scale
          let lineLeftPositionStyle = `${leftPercent}%`
          let lineTransformStyle = 'translateX(-50%)'
          const markerLineWidth = Number.parseFloat(getComputedStyle(document.documentElement).getPropertyValue('--tmdb-timeline-marker-line-width') || '2')


          if (leftPercent < MARKER_LINE_ALIGN_LOW_THRESHOLD) {
            lineLeftPositionStyle = '0%'
            lineTransformStyle = 'translateX(0)'
          } else if (leftPercent > MARKER_LINE_ALIGN_HIGH_THRESHOLD) {
            lineLeftPositionStyle = `calc(100% - ${markerLineWidth}px)`
            lineTransformStyle = 'translateX(0)'
          }

          return (
            <div
              key={`line-${timeVal}`}
              className="tmdb-timeline-marker-line"
              style={{
                left: lineLeftPositionStyle,
                transform: lineTransformStyle,
                background: pointConfig.color,
              }}
            />
          )
        })}
      </div>
    </div>
  )
}

function RenderComputedRenderBeaconSpans({
  computedRenderBeaconSpans,
}: {
  computedRenderBeaconSpans: Record<string, ComputedRenderSpan>
}) {
  return (
    <div className="tmdb-section">
      <div className="tmdb-section-title">Computed Render Beacon Spans:</div>
      <ul className="tmdb-no-style-list">
        {Object.entries(computedRenderBeaconSpans).map(([name, value]) => (
          <li key={name} className="tmdb-list-item" style={{ display: 'block' }}> {/* Allow block for timeline */}
            <RenderBeaconTimeline value={value} name={name} />
          </li>
        ))}
      </ul>
    </div>
  )
}

function downloadTraceRecording<
  RelationSchemasT extends RelationSchemasBase<RelationSchemasT>,
>(trace: TraceInfo<RelationSchemasT>) {
  if (!trace.traceContext || !trace.finalTransition) {
    return
  }

  try {
    const recording = createTraceRecording(
      trace.traceContext,
      trace.finalTransition,
    )
    const recordingJson = JSON.stringify(recording, null, 2)
    const blob = new Blob([recordingJson], { type: 'application/json' })
    const url = URL.createObjectURL(blob)
    const a = document.createElement('a')
    a.href = url
    a.download = `trace-${trace.traceId}-${trace.traceName}.json`
    document.body.append(a)
    a.click()
    setTimeout(() => {
      a.remove()
      URL.revokeObjectURL(url)
    }, 0)
  } catch (error) {
    // eslint-disable-next-line no-console
    console.error('Failed to generate trace recording:', error)
  }
}

function TraceItem<
  RelationSchemasT extends RelationSchemasBase<RelationSchemasT>,
>({
  trace,
  isExpanded,
  onToggleExpand,
  onDismiss,
  isCurrentTrace = false,
}: {
  trace: TraceInfo<RelationSchemasT>
  isExpanded: boolean
  onToggleExpand: () => void
  onDismiss: () => void
  isCurrentTrace?: boolean
}) {
  const [isDefinitionDetailsExpanded, setIsDefinitionDetailsExpanded] =
    useState(false)

  const canDownloadRecording =
    (trace.state === 'complete' || trace.state === 'interrupted') &&
    !!trace.traceContext &&
    !!trace.finalTransition

  const computedResults = useMemo(() => {
    if (trace.traceContext && trace.finalTransition) {
      return getComputedResults(
        trace.traceContext,
        trace.finalTransition,
      )
    }
    return {}
  }, [trace.traceContext, trace.finalTransition])

  const handleDownloadClick = (e: React.MouseEvent) => {
    e.stopPropagation()
    downloadTraceRecording(trace)
  }

  const handleDismissClick = (e: React.MouseEvent) => {
    e.stopPropagation()
    onDismiss()
  }

  const borderLeftColor = isCurrentTrace
    ? 'var(--tmdb-color-active-primary)'
    : trace.state === 'complete'
    ? 'var(--tmdb-color-completed-primary)'
    : trace.state === 'interrupted'
    ? 'var(--tmdb-color-interrupted-primary)'
    : 'var(--tmdb-color-border-dark)';


  return (
    <div
      className="tmdb-history-item"
      style={{ borderLeft: `3px solid ${borderLeftColor}` }}
    >
      <div className="tmdb-history-header" onClick={onToggleExpand}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 'var(--tmdb-space-m)' }}>
          <strong style={{ fontSize: 'var(--tmdb-font-size-l)' }}>{trace.traceName}</strong>
          <span className={getDynamicStateStyle(trace.state)}>
            {trace.state}
          </span>
          {canDownloadRecording && (
            <button
              className="tmdb-button tmdb-download-button"
              onClick={handleDownloadClick}
              title="Download trace recording as JSON"
            >
              <span className="tmdb-download-icon">🔽 JSON</span>
            </button>
          )}
          {(trace.hasErrorSpan || trace.hasSuppressedErrorSpan) && (
            <span
              className="tmdb-error-indicator"
              title={
                trace.hasSuppressedErrorSpan
                  ? 'Suppressed error span(s) seen'
                  : 'Error span(s) seen'
              }
            >
              ⚠️
            </span>
          )}
          {trace.definitionModifications &&
            trace.definitionModifications.length > 0 && (
              <span
                className="tmdb-definition-modified-indicator"
                title="Definition modified"
              >
                🔧
              </span>
            )}
        </div>
        <div style={{ display: 'flex', alignItems: 'center', gap: 'var(--tmdb-space-m)' }}>
          <span className="tmdb-time-display">
            ({formatMs(trace.liveDuration)})
          </span>
          <div className="tmdb-chip tmdb-id-chip" title="Trace ID">
            {trace.traceId}
          </div>
          <span className="tmdb-time-display">
            {new Date(trace.startTime).toLocaleTimeString()}
          </span>
          <button
            className="tmdb-dismiss-button"
            onClick={handleDismissClick}
            title="Dismiss this trace"
          >
            ✕
          </button>
        </div>
      </div>
      <div className="tmdb-trace-info-row">
        <div className="tmdb-chip-group tmdb-variant-group">
          <span className="tmdb-chip-group-label">Variant</span>
          <span className="tmdb-chip-group-value">{trace.variant}</span>
        </div>

        <div className="tmdb-chip-group tmdb-spans-group">
          <span className="tmdb-chip-group-label">Required</span>
          <span className="tmdb-chip-group-value">
            {trace.requiredSpans.filter((s) => s.isMatched).length}/
            {trace.requiredSpans.length}
          </span>
        </div>

        {trace.relatedTo && Object.keys(trace.relatedTo).length > 0 && (
          <div className="tmdb-chip-group tmdb-related-group">
            <span className="tmdb-chip-group-label">Related</span>
            <div className="tmdb-related-items">
              {Object.entries(trace.relatedTo).map(([key, value]) => (
                <span key={key} className="tmdb-related-item">
                  {key}: {JSON.stringify(value)}
                </span>
              ))}
            </div>
          </div>
        )}

        {trace.interruptionReason && (
          <div className="tmdb-chip-group tmdb-reason-group">
            <span className="tmdb-chip-group-label">Reason</span>
            <span className="tmdb-chip-group-value">{trace.interruptionReason}</span>
          </div>
        )}

        <span className="tmdb-chip tmdb-info-chip">Spans: {trace.totalSpanCount ?? 0}</span>
      </div>
      {isExpanded && (
        <div
          className="tmdb-expanded-history"
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

          {(trace.computedSpans?.length ?? 0) > 0 && (
            <div className="tmdb-section">
              <div className="tmdb-section-title">Computed Spans:</div>
              <ul className="tmdb-no-style-list">
                {(trace.computedSpans ?? []).map((name) => {
                  const value = getFromRecord(
                    computedResults.computedSpans,
                    name,
                  )
                  return (
                    <li key={name} className="tmdb-list-item">
                      {name}
                      {trace.state === 'complete' ||
                      trace.state === 'interrupted' ? (
                        value ? (
                          <RenderComputedSpan value={value} />
                        ) : (
                          <span className="tmdb-computed-span-missing">
                            missing
                          </span>
                        )
                      ) : (
                        <span className="tmdb-computed-span-pending">
                          pending
                        </span>
                      )}
                    </li>
                  )
                })}
              </ul>
            </div>
          )}
          {computedResults.computedRenderBeaconSpans ? (
            <RenderComputedRenderBeaconSpans
              computedRenderBeaconSpans={
                computedResults.computedRenderBeaconSpans
              }
            />
          ) : null}
          {(trace.computedValues?.length ?? 0) > 0 && (
            <div className="tmdb-section">
              <div className="tmdb-section-title">Computed Values:</div>
              <ul className="tmdb-no-style-list">
                {(trace.computedValues ?? []).map((name) => {
                  const value = getFromRecord(
                    computedResults.computedValues,
                    name,
                  )
                  return (
                    <li key={name} className="tmdb-list-item">
                      {name}
                      {trace.state === 'complete' ||
                      trace.state === 'interrupted' ? (
                        value !== undefined ? (
                          <span className="tmdb-computed-value">
                            {String(value)}
                          </span>
                        ) : (
                          <span className="tmdb-computed-value-na">
                            N/A
                          </span>
                        )
                      ) : (
                        <span className="tmdb-computed-value-pending">
                          pending
                        </span>
                      )}
                    </li>
                  )
                })}
              </ul>
            </div>
          )}

          <div
            className="tmdb-definition-details-toggle"
            onClick={(e) => {
              e.stopPropagation()
              setIsDefinitionDetailsExpanded((prev) => !prev)
            }}
          >
            <span>
              {isDefinitionDetailsExpanded ? '−' : '+'}
            </span>
             Definition Details
          </div>
          {isDefinitionDetailsExpanded && (
            <div className="tmdb-section">
              <div className="tmdb-section-title">Configuration:</div>
              <div className="tmdb-config-info-row">
                {(() => {
                  const { timeout, debounce, interactive } = trace.traceContext
                    ? getConfigSummary(trace.traceContext)
                    : {}
                  return (
                    <>
                      {timeout != null && (
                        <span className="tmdb-chip tmdb-config-chip">
                          Timeout: {formatMs(timeout)}
                        </span>
                      )}
                      {debounce != null && (
                        <span className="tmdb-chip tmdb-config-chip">
                          Debounce: {formatMs(debounce)}
                        </span>
                      )}
                      {interactive != null && (
                        <span className="tmdb-chip tmdb-config-chip">
                          Interactive: {formatMs(interactive)}
                        </span>
                      )}
                    </>
                  )
                })()}
              </div>

              {trace.definitionModifications &&
                trace.definitionModifications.length > 0 && (
                  <div>
                    <div className="tmdb-section-title">
                      Definition Modifications:
                    </div>
                    <ul className="tmdb-no-style-list">
                      {trace.definitionModifications.map((mod, i) => (
                        <li key={i} className="tmdb-list-item">
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
      <div
        className={`tmdb-expand-arrow ${isExpanded ? 'tmdb-expand-arrow-up' : 'tmdb-expand-arrow-down'}`}
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

  const removeTraceFromHistory = (traceId: string) => {
    setTraceHistory((prev) => prev.filter((t) => t.traceId !== traceId))
  }

  const [position, setPosition] = useState({ x: 10, y: 10 })
  const isDraggingRef = useRef(false)
  const dragOffsetRef = useRef({ x: 0, y: 0 })
  const [isMinimized, setIsMinimized] = useState(false)
  const containerRef = useRef<HTMLDivElement>(null)

  const handleMouseDown = (e: React.MouseEvent) => {
    if (!containerRef.current) return
    e.preventDefault()
    isDraggingRef.current = true
    dragOffsetRef.current = {
      x: e.clientX - position.x,
      y: e.clientY - position.y,
    }
  }

  const handleMouseMove = (e: MouseEvent) => {
    if (!isDraggingRef.current) return
    e.preventDefault()
    requestAnimationFrame(() => {
      setPosition({
        x: e.clientX - dragOffsetRef.current.x,
        y: e.clientY - dragOffsetRef.current.y,
      })
    })
  }

  const handleMouseUp = (e: MouseEvent) => {
    if (isDraggingRef.current) {
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
    const schedule = (fn: () => void) => void setTimeout(fn, 0)
    const traceEntriesMap = new Map<
      string,
      SpanAndAnnotation<RelationSchemasT>[]
    >()

    const startSub = traceManager.when('trace-start').subscribe((event) => {
      const trace = event.traceContext as AllPossibleTraces<RelationSchemasT>
      const traceId = trace.input.id
      traceEntriesMap.set(traceId, [])
      const traceInfo: TraceInfo<RelationSchemasT> = {
        traceId,
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
    const addSpanSub = traceManager
      .when('add-span-to-recording')
      .subscribe((event) => {
        const trace = event.traceContext
        const traceId = trace.input.id
        if (!traceEntriesMap.has(traceId)) {
          traceEntriesMap.set(traceId, [])
        }
        const entries = traceEntriesMap.get(traceId)!
        entries.push(event.spanAndAnnotation)
        schedule(
          () =>
            void setCurrentTrace((prevTrace) => {
              if (!prevTrace || traceId !== prevTrace.traceId) {
                return prevTrace
              }
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

    const defModSub = traceManager
      .when('definition-modified')
      .subscribe(
        ({ traceContext: trace, modifications: eventModifications }) => {
          schedule(
            () =>
              void setCurrentTrace((prevTrace) => {
                if (!prevTrace || trace.input.id !== prevTrace.traceId) return prevTrace
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

  let content: JSX.Element

  // eslint-disable-next-line unicorn/prefer-ternary
  if (float && isMinimized) {
    content = (
      <div className="tmdb-debugger-root">
        <button
          className="tmdb-minimized-button"
          onClick={() => void setIsMinimized(false)}
        >
          Traces
        </button>
      </div>
    )
  } else {
  content = (
    <>
      {float && (
        <div className="tmdb-handle" onMouseDown={handleMouseDown}>
          <h3 className="tmdb-handle-title">{NAME}</h3>
          <div>
            <button
              className="tmdb-close-button"
              onClick={() => void setIsMinimized(true)}
            >
              −
            </button>
          </div>
        </div>
      )}

      {!float && (
        <div className="tmdb-header">
          <h2 className="tmdb-title">{NAME}</h2>
        </div>
      )}

      {/* Added a wrapper for padding when floating, as tmdb-floating-container itself has padding 0 */}
      <div className={float ? "tmdb-floating-content-wrapper" : ""}>
        {allTraces.length > 0 ? (
          // Removed specific padding here, rely on tmdb-floating-content-wrapper or tmdb-container
          <div>
            <h3 className="tmdb-history-title">
              <div className="tmdb-history-title-left">
                Traces ({allTraces.length})
                <a
                  href="https://zendesk.github.io/retrace/iframe.html?globals=&id=stories-visualizer-viz--operation-visualizer-story&viewMode=story"
                  target="_blank"
                  rel="noopener noreferrer"
                  className="tmdb-button tmdb-visualizer-link"
                >
                  Trace Visualizer
                </a>
              </div>
              <div className="tmdb-history-title-right">
                <button
                  className="tmdb-button tmdb-clear-button"
                  onClick={() => {
                     setCurrentTrace(null); // Clear current trace as well if it's completed/interrupted
                     setTraceHistory([]);
                     setExpandedHistoryIndex(null);
                    }}
                >
                  Clear
                </button>
              </div>
            </h3>
            {allTraces.map((trace, index) => (
              <TraceItem
                key={trace.traceId}
                trace={trace}
                isExpanded={
                  currentTrace?.traceId === trace.traceId ||
                  expandedHistoryIndex === index
                }
                isCurrentTrace={currentTrace?.traceId === trace.traceId}
                onToggleExpand={() =>
                  void setExpandedHistoryIndex(
                    expandedHistoryIndex === index ? null : index,
                  )
                }
                onDismiss={() => {
                  if (currentTrace?.traceId === trace.traceId) setCurrentTrace(null);
                  removeTraceFromHistory(trace.traceId);
                  if (expandedHistoryIndex === index) setExpandedHistoryIndex(null);
                  else if (expandedHistoryIndex !== null && expandedHistoryIndex > index) {
                    setExpandedHistoryIndex(expandedHistoryIndex -1);
                  }
                }}
              />
            ))}
          </div>
        ) : (
          <div className="tmdb-no-trace">
            No traces running or completed
          </div>
        )}
      </div>
    </>
  )

  }

  // wrap
  // eslint-disable-next-line unicorn/prefer-ternary
  if (float) {
    content = (
      <div
        ref={containerRef}
        className="tmdb-floating-container tmdb-debugger-root" // Base styles from CSS
        style={{
          top: `${position.y}px`,
          left: `${position.x}px`,
          // padding: 0, // Explicitly set by tmdb-floating-container or its content wrapper
        }}
      >
        {content}
      </div>
    )
  } else {
    content = (
      <div className="tmdb-container tmdb-debugger-root">{content}</div>
    )
  }


  // Apply root class for CSS variables to take effect
  return <>
    <style>{CSS_STYLES}</style>
    {content}
  </>
}
