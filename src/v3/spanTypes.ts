import type { ErrorInfo } from 'react'
import type { BeaconConfig } from './hooksTypes'
import type { TraceRecording } from './traceRecordingTypes'
import type { ScopeBase, Timestamp } from './types'

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
  | 'taskattribution'
  | 'visibility-state'

export type ComponentLifecycleSpanType =
  | 'component-render-start'
  | 'component-render'
  | 'component-unmount'

export type SpanType = NativePerformanceEntryType | ComponentLifecycleSpanType

export interface StartTraceConfig<ScopeT extends ScopeBase> {
  id?: string
  scope: ScopeT
  startTime?: Partial<Timestamp>
  /**
   * any attributes that should be
   */
  attributes?: Attributes
}

export type OnEndFn<ScopeT extends ScopeBase> = (
  trace: TraceRecording<ScopeT>,
) => void

export interface ActiveTraceConfig<ScopeT extends ScopeBase>
  extends StartTraceConfig<ScopeT> {
  id: string
  startTime: Timestamp
  onEnd: OnEndFn<ScopeT>
}

// eslint-disable-next-line @typescript-eslint/consistent-indexed-object-style
export interface Attributes {
  [key: string]: unknown
}
export type SpanStatus = 'ok' | 'error'

export interface SpanBase<ScopeT extends ScopeBase> {
  type: SpanType

  /**
   * The common name of the span.
   * If converted from a PerformanceEntry, this is a sanitized version of the name.
   */
  name: string

  startTime: Timestamp

  // non performance entries, scope would be coming from outside like ticket id or user id
  // performance entries, there is no scope OR scope is in performance detail
  scope?: ScopeT

  attributes: Attributes

  /**
   * The duration of this span.
   * If this span is just an event (a point in time), this will be 0.
   * On the other hand, spans will have duration > 0.
   */
  duration: number

  /**
   * Status of the span ('error' or 'ok').
   */
  status?: SpanStatus

  /**
   * The original PerformanceEntry from which the Span was created
   */
  performanceEntry?: PerformanceEntry

  /**
   * if status is error, optionally provide the Error object with additional metadata
   */
  error?: Error
}

export interface ComponentRenderSpan<ScopeT extends ScopeBase>
  extends Omit<SpanBase<ScopeT>, 'scope'>,
  BeaconConfig<ScopeT> {
  type: ComponentLifecycleSpanType
  errorInfo?: ErrorInfo
}

export type InitiatorType =
  | 'audio'
  | 'beacon'
  | 'body'
  | 'css'
  | 'early-hint'
  | 'embed'
  | 'fetch'
  | 'frame'
  | 'iframe'
  | 'icon'
  | 'image'
  | 'img'
  | 'input'
  | 'link'
  | 'navigation'
  | 'object'
  | 'ping'
  | 'script'
  | 'track'
  | 'video'
  | 'xmlhttprequest'
  | 'other'

export interface ResourceSpan<ScopeT extends ScopeBase>
  extends SpanBase<ScopeT> {
  resourceDetails: {
    initiatorType: InitiatorType
    query: Record<string, string | string[]>
    hash: string
  }
}
/**
 * All possible trace entries
 */

export type Span<ScopeT extends ScopeBase> =
  | SpanBase<ScopeT>
  | ComponentRenderSpan<ScopeT>
  | ResourceSpan<ScopeT>
/**
 * Criteria for matching performance entries.
 */

export interface SpanMatchCriteria<ScopeT extends ScopeBase> {
  /**
   * The common name of the span to match. Can be a string, RegExp, or function.
   */
  name?: string | RegExp | ((name: string) => boolean)

  /**
   * The PerformanceEntry.name of the entry to match. Can be a string, RegExp, or function.
   */
  performanceEntryName?: string | RegExp | ((name: string) => boolean)

  /**
   * The subset of attributes (metadata) to match against the span.
   */
  attributes?: Attributes

  status?: SpanStatus
  type?: SpanType

  /**
   * A list of scope keys to match against the span.
   */
  scopeKeys?: (keyof ScopeT)[]

  /**
   * The occurrence of the span with the same name within the operation.
   */
  occurrence?: number // FEATURE TODO: add support for fn maching? | ((occurrence: number) => boolean)

  /**
   * only applicable for component-lifecycle entries
   */
  isIdle?: boolean
}
/**
 * Function type for matching performance entries.
 */

export type SpanMatchFunction<ScopeT extends ScopeBase> = (
  span: Span<ScopeT>,
) => boolean
/**
 * Entries can either by matched by a criteria or function
 */

export type SpanMatcher<ScopeT extends ScopeBase> =
  | SpanMatchCriteria<ScopeT>
  | SpanMatchFunction<ScopeT>
