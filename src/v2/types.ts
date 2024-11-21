/* eslint-disable @typescript-eslint/no-redundant-type-constituents */
import type { ErrorMetadata } from '../ErrorBoundary'
import type { VISIBLE_STATE } from './constants'
import type { Operation } from './operation'

export type EventStatus = 'ok' | 'error' | 'partial-error' | 'aborted'

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
  // | 'eventattribution'
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
export interface EventMatchCriteria {
  /**
   * The name of the performance entry to match. Can be a string, RegExp, or function.
   */
  name?: string | RegExp | ((name: string) => boolean)

  /**
   * Attributes (metadata) to match against the performance entry.
   */
  attributes?: Attributes

  /**
   * The type of the performance entry to match.
   */
  type?: NativePerformanceEntryType | InternalPerformanceEntryType
}

/**
 * Function type for matching performance entries.
 */
export type EventMatchFunction = (entry: Event) => boolean

export interface CaptureInteractiveConfig {
  /**
   * How long to wait for the page to be interactive.
   */
  timeout: number
  /**
   * Duration to debounce long events before considering the page interactive.
   */
  debounceLongTasksBy?: number
  /**
   * Ignore long events that are shorter than this duration.
   */
  skipDebounceForLongEventsShorterThan?: number
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
    match: EventMatchCriteria | EventMatchFunction

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
     * Configuration for debouncing the end of the operation when a matching event is seen.
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

    /**
     * Indicates if events matching this tracker should be kept in the operation.
     * Maybe used to filter out events that are not relevant to the operation.
     * @default true
     */
    keep?: boolean
  }[]

  /**
   * Attributes (metadata) for the operation.
   */
  attributes?: Attributes

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
   * Indicates the operation should continue capturing events until interactivity is reached after the operation ends.
   * Provide a boolean or a configuration object.
   */
  waitUntilInteractive?: boolean | CaptureInteractiveConfig

  /**
   * Callback that runs when the operation is completed (either interrupted, via a timeout, or any other case).
   * Note that when running in buffered mode, this will execute only after the buffer is flushed.
   */
  onEnd?: (operation: Operation) => void

  /**
   * A callback that will be called once there are no more required events to end the operation.
   * Useful if you want to emit a performance.measure as soon as possible.
   * Prefer `onEnd` for most other cases.
   * Note that when running in buffered mode, this will execute only after the buffer is flushed.
   */
  onTracked?: (operation: Operation) => void

  /**
   * The start time of the operation in ms elapsed since `Performance.timeOrigin`.
   * Provide if other than the operation start (by default the first `requiredToStart` event, or the time operation instance was created if none).
   */
  startTime?: number

  /**
   * Indicates if only explicitly tracked events should be retained in the operation.
   */
  keepOnlyExplicitlyTrackedEvents?: boolean

  /**
   * Callback that runs when the operation is finalized and the object is being disposed of.
   * Note that when running in buffered mode, this will execute only after the buffer is flushed.
   */
  onDispose?: () => void

  /**
   * Indicates if the operation should be restarted automatically after it ends.
   * This means that onEnd and onDispose may be called multiple times.
   */
  autoRestart?: boolean
}

export interface EventMetadata extends Partial<ErrorMetadata> {
  /**
   * Common name for the event that could be used for grouping similar events.
   */
  commonName: string

  /** may be present to override the value of the parent entry.name */
  name?: string

  // TODO could be a specific string union
  kind: string

  status: EventStatus
}

export type VisibleStates = (typeof VISIBLE_STATE)[keyof typeof VISIBLE_STATE]

export interface Attributes {
  resource?: {
    type?:
      | 'document'
      | 'xhr'
      | 'beacon'
      | 'fetch'
      | 'css'
      | 'js'
      | 'image'
      | 'font'
      | 'media'
      | 'other'
      | 'native'
    method?:
      | 'POST'
      | 'GET'
      | 'HEAD'
      | 'PUT'
      | 'DELETE'
      | 'PATCH'
      | 'TRACE'
      | 'OPTIONS'
      | 'CONNECT'
    status?: number | undefined
  }
  resourceQuery?: Record<string, string | string[]>
  resourceHash?: string

  // renders add this metadata:
  visibleState?: VisibleStates | string
  previousVisibleState?: VisibleStates | string
  renderCount?: number

  [key: string]: unknown
}

export type EventEntryType =
  | NativePerformanceEntryType
  | InternalPerformanceEntryType

export interface InputEvent extends Omit<PerformanceEntryLikeV2, 'entryType'> {
  readonly entryType: EventEntryType
  operations?: Record<string, EventOperationRelation>
  attributes?: Attributes
  event?: EventMetadata
}

export interface Event extends Omit<PerformanceEntryLikeV2, 'entryType'> {
  readonly entryType: EventEntryType
  readonly operations: Record<string, EventOperationRelation>
  readonly attributes: Attributes
  readonly event: EventMetadata
}

/**
 * Metadata for an event.
 */
export interface EventOperationRelation {
  /**
   * The ID of the operation the event belongs to.
   */
  id: string

  /**
   * Internal order of the event within the operation.
   */
  // TODO is this necessary?
  internalOrder: number

  /**
   * Offset from the start of the operation to the start of the event.
   * aka operationStartOffset or operationStartToEventStart
   */
  operationRelativeStartTime: number

  /**
   * Relative end time of the event within the operation.
   */
  operationRelativeEndTime: number
}

export interface PerformanceEntryLikeV2 {
  /** [MDN Reference](https://developer.mozilla.org/docs/Web/API/PerformanceEntry/duration) */
  readonly duration: DOMHighResTimeStamp
  /** [MDN Reference](https://developer.mozilla.org/docs/Web/API/PerformanceEntry/entryType) */
  readonly entryType: string
  /** [MDN Reference](https://developer.mozilla.org/docs/Web/API/PerformanceEntry/name) */
  readonly name: string
  /** [MDN Reference](https://developer.mozilla.org/docs/Web/API/PerformanceEntry/startTime) */
  readonly startTime: DOMHighResTimeStamp

  readonly detail?: unknown
}

// export type PerformanceEntryLike = Omit<PerformanceEntry, 'toJSON'> & {
//   metadata?: Record<string, unknown>
// }

export type ObserveFn = (
  onEntry: (entry: PerformanceEntryLikeV2) => void,
) => () => void

export interface PerformanceApi {
  now: () => number
}

export type EventProcessor = (
  entry: InputEvent | PerformanceEntryLikeV2,
) => Event | undefined

export interface InstanceOptions {
  defaultDebounceTime?: number
  observe?: ObserveFn
  performance?: Partial<PerformanceApi>
  bufferDuration?: number
  preprocessEvent?: EventProcessor
  supportedEntryTypes?: readonly string[]
  requestObserveEntryTypes?: readonly string[]
  expectBlockingTasks?: boolean
}

export type FinalizationReason =
  | 'completed'
  | 'interrupted'
  | 'timeout'
  | 'interactive-timeout'

export type OperationState =
  | 'initial'
  | 'started'
  | 'waiting-for-interactive'
  | FinalizationReason
