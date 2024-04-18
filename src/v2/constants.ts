import type { OperationState, CaptureInteractiveConfig } from './types'

export const VISIBLE_STATE = {
  /** showing a pending state, like a spinner, a skeleton, or empty */
  LOADING: 'loading',
  /** fully functional component */
  COMPLETE: 'complete',
  /** displaying an error state */
  ERROR: 'error',
  /** somewhat functional component with a partial error state */
  COMPLETE_WITH_ERROR: 'complete-with-error',
} as const

export const DEFAULT_CAPTURE_INTERACTIVE: Required<CaptureInteractiveConfig> = {
  timeout: 5_000,
  debounceLongTasksBy: 500,
  skipDebounceForLongEventsShorterThan: 0,
}
export const DEFAULT_GLOBAL_OPERATION_TIMEOUT = 10_000
export const OPERATION_START_ENTRY_TYPE = 'operation-start'
export const OPERATION_ENTRY_TYPE = 'operation'
export const OPERATION_INTERACTIVE_ENTRY_TYPE = 'operation-interactive'
export const DEFAULT_DEBOUNCE_TIME = 1_000
export const FINAL_STATES: OperationState[] = [
  'completed',
  'interrupted',
  'timeout',
  'interactive-timeout',
]

// TODO: polyfill lack of support for visibility-state with https://developer.mozilla.org/en-US/docs/Web/API/Page_Visibility_API
export const DEFAULT_OBSERVED_ENTRY_TYPES = [
  'mark',
  'measure',
  'resource',
  'element',
  'visibility-state',
]

// see https://developer.chrome.com/docs/web-platform/long-animation-frames
export const BLOCKING_TASK_ENTRY_TYPES: readonly [string, string] = [
  'long-animation-frame',
  'longtask',
] /** when present on 'detail' of a performance measure/mark, it will ignore that event */

/** when present on 'detail' of a performance measure/mark, it will ignore that event */
export const SKIP_PROCESSING = Symbol.for('SKIP_PROCESSING')
