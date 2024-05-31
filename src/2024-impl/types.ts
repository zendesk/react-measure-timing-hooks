import type { ErrorMetadata } from "../ErrorBoundary"

export type NativePerformanceEntryType =
  | 'element'
  | 'event'
  | 'first-input'
  | 'largest-contentful-paint'
  | 'layout-shift'
  | 'long-animation-frame'
  | 'longtask'
  | 'mark'
  | 'measure'
  | 'navigation'
  | 'paint'
  | 'resource'
  // | 'taskattribution'
  | 'visibility-state'

export type InternalPerformanceEntryType =
  | 'component-render-start'
  | 'component-render-error'
  | 'component-render'
  | 'component-unmount'
  // | 'component-tree-error'
  | 'component-state-change'
  | 'operation-start'
  | 'operation'
  | 'operation-interactive'

/**
 * Criteria for matching performance entries.
 */
export interface EntryMatchCriteria {
  /**
   * The name of the performance entry to match. Can be a string, RegExp, or function.
   */
  name?: string | RegExp | ((name: string) => boolean)

  /**
   * Metadata to match against the performance entry.
   */
  metadata?: Record<string, string | number | boolean>

  /**
   * The type of the performance entry to match.
   */
  type?:
    | NativePerformanceEntryType
    | InternalPerformanceEntryType
}

/**
 * Function type for matching performance entries.
 */
export type EntryMatchFunction = (entry: Task) => boolean

export interface CaptureInteractiveConfig {
  /**
   * How long to wait for the page to be interactive.
   */
  timeout: number
  /**
   * Duration to debounce long tasks before considering the page interactive.
   */
  debounceLongTasksBy?: number
  /**
   * Ignore long tasks that are shorter than this duration.
   */
  skipDebounceForLongTasksShorterThan?: number
}

/**
 * Definition for an operation.
 */
export interface OperationDefinition {
  /**
   * The name of the operation.
   */
  operationName: string

  /**
   * Trackers for matching and handling performance entries.
   */
  track: {
    /**
     * Criteria or function for matching performance entries.
     */
    match: EntryMatchCriteria | EntryMatchFunction

    /**
     * Indicates if this entry is required to start the operation.
     * If none are required, the operation starts immediately upon creation.
     */
    requiredToStart?: boolean

    /**
     * Indicates if this entry is required to end the operation.
     * At least one is required.
     */
    requiredToEnd?: boolean

    /**
     * Configuration for debouncing the end of the operation when this tracker is seen.
     * When true, debounces by the default amount.
     * @default true
     */
    debounceEndWhenSeen?:
      | boolean
      | { debounceBy: number; debounceCountLimit?: number }

    /**
     * Indicates if this tracker should interrupt and finalize the operation immediately.
     * Useful for events like errors.
     */
    interruptWhenSeen?: boolean
  }[]

  /**
   * Metadata for the operation.
   */
  metadata?: Record<string, unknown>

  /**
   * Timeout for the operation in ms, after which it should be finalized.
   * @default 10000
   */
  timeout?: number

  /**
   * Indicates if the operation should interrupt itself when another operation with the same name starts.
   */
  interruptSelf?: boolean

  /**
   * Indicates if a 'measure' event should be emitted when the operation ends.
   */
  captureDone?: boolean

  /**
   * Indicates if a 'measure' event should be emitted when interactivity is reached after the operation ends.
   * Provide a boolean or a configuration object.
   */
  captureInteractive?: boolean | CaptureInteractiveConfig

  /**
   * The start time of the operation in ms elapsed since `Performance.timeOrigin`.
   * Provide if other than the operation start (by default the first `requiredToStart` event, or the time operation instance was created if none).
   */
  startTime?: number

  /**
   * Indicates if only explicitly tracked tasks should be retained in the operation.
   */
  keepOnlyExplicitlyTrackedTasks?: boolean

  /**
   * Callback that runs when the operation is finalized and the object is being disposed of.
   * Note that when running in buffered mode, this will execute only after the buffer is flushed.
   */
  onDispose?: () => void
}

export interface TaskMetadata extends Partial<ErrorMetadata> {

}

export interface Metadata extends Partial<ErrorMetadata> {
  resource?: {
    type: 'fetch' | 'xhr' | string // TODO
  }
  resourceQuery?: Record<string, string | string[]>
  [key: string]: unknown
}

export type TaskEntryType = NativePerformanceEntryType | InternalPerformanceEntryType

/** when present on 'detail' will skip processing */
export const SKIP_PROCESSING = Symbol.for('SKIP_PROCESSING')

export interface InputTask extends Omit<PerformanceEntryLike, 'entryType'> {
  readonly entryType: TaskEntryType
  readonly operations?: Record<string, TaskOperationRelation>
  metadata?: Metadata

  /**
   * Common name for the task that could be used for grouping similar tasks.
   */
  commonName?: string
}

export type Task = Required<Omit<InputTask, 'detail' | typeof SKIP_PROCESSING>>

/**
 * Metadata for a task span.
 */
export interface TaskOperationRelation {
  /**
   * The ID of the operation the task belongs to.
   */
  id: string

  /**
   * The name of the operation the task belongs to.
   */
  name: string

  /**
   * Internal order of the task within the operation.
   */
  // TODO is this necessary?
  internalOrder: number

  /**
   * Offset from the start of the operation to the start of the task.
   * aka operationStartOffset or operationStartToTaskStart
   */
  operationRelativeStartTime: number

  /**
   * Relative end time of the task within the operation.
   */
  operationRelativeEndTime: number
}

export interface PerformanceEntryLike {
  /** [MDN Reference](https://developer.mozilla.org/docs/Web/API/PerformanceEntry/duration) */
  readonly duration: DOMHighResTimeStamp;
  /** [MDN Reference](https://developer.mozilla.org/docs/Web/API/PerformanceEntry/entryType) */
  readonly entryType: string;
  /** [MDN Reference](https://developer.mozilla.org/docs/Web/API/PerformanceEntry/name) */
  readonly name: string;
  /** [MDN Reference](https://developer.mozilla.org/docs/Web/API/PerformanceEntry/startTime) */
  readonly startTime: DOMHighResTimeStamp;

  readonly detail?: unknown
}

// export type PerformanceEntryLike = Omit<PerformanceEntry, 'toJSON'> & {
//   metadata?: Record<string, unknown>
// }

export type ObserveFn = (
  onEntry: (entry: PerformanceEntryLike) => void,
) => () => void

export interface PerformanceApi {
  now: () => number
  measure: (
    name: string,
    options: {
      start: number
      duration: number
      // TODO: strongly type the detail here
      detail: Record<string, unknown>
    },
  ) => void
}

export type TaskProcessor = (entry: InputTask | PerformanceEntryLike) => Task

export interface InstanceOptions {
  defaultDebounceTime?: number
  observe?: ObserveFn
  performance?: Partial<PerformanceApi>
  bufferDuration?: number
  preprocessTask?: TaskProcessor
  supportedEntryTypes?: readonly string[]
}
