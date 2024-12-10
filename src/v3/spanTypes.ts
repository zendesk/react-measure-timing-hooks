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

export interface StartTraceConfig<ScopeT extends Partial<ScopeBase<ScopeT>>> {
  id?: string
  scope: ScopeT
  startTime?: Partial<Timestamp>
  /**
   * any attributes that are relevant to the entire trace
   */
  attributes?: Attributes
}

export type OnEndFn<ScopeT extends Partial<ScopeBase<ScopeT>>> = (
  trace: TraceRecording<ScopeT>,
) => void

export interface ActiveTraceConfig<TracerScopeT>
  extends StartTraceConfig<TracerScopeT> {
  id: string
  startTime: Timestamp
  onEnd: OnEndFn<TracerScopeT>
}

// eslint-disable-next-line @typescript-eslint/consistent-indexed-object-style
export interface Attributes {
  [key: string]: unknown
}
export type SpanStatus = 'ok' | 'error'

export interface SpanBase<ScopeT extends Partial<ScopeBase<ScopeT>>> {
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

export interface ComponentRenderSpan<ScopeT extends Partial<ScopeBase<ScopeT>>>
  extends Omit<SpanBase<ScopeT>, 'scope' | 'attributes'>,
    BeaconConfig<ScopeT> {
  type: ComponentLifecycleSpanType
  isIdle: boolean
  errorInfo?: ErrorInfo
  renderCount: number
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

export interface ResourceSpan<ScopeT extends Partial<ScopeBase<ScopeT>>>
  extends SpanBase<ScopeT> {
  type: 'resource'
  resourceDetails: {
    initiatorType: InitiatorType
    query: Record<string, string | string[]>
    hash: string
  }
}

export interface PerformanceEntrySpan<ScopeT extends Partial<ScopeBase<ScopeT>>>
  extends SpanBase<ScopeT> {
  type: Exclude<NativePerformanceEntryType, 'resource'>
}

/**
 * All possible trace entries
 */
export type Span<ScopeT extends Partial<ScopeBase<ScopeT>>> =
  | PerformanceEntrySpan<ScopeT>
  | ComponentRenderSpan<ScopeT>
  | ResourceSpan<ScopeT>
