import type { ErrorInfo } from 'react'
import type { BeaconConfig } from './hooksTypes'
import type { ScopeOnASpan, SelectScopeByKey, Timestamp } from './types'
import type { KeysOfUnion } from './typeUtils'

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

export interface BaseStartTraceConfig<OriginatedFromT extends string> {
  id?: string
  startTime?: Partial<Timestamp>
  originatedFrom: OriginatedFromT
  /**
   * any attributes that are relevant to the entire trace
   */
  attributes?: Attributes
}

export interface DraftTraceConfig<TracerScopeT, OriginatedFromT extends string>
  extends BaseStartTraceConfig<OriginatedFromT> {
  scope: TracerScopeT | undefined
}

export interface StartTraceConfig<TracerScopeT, OriginatedFromT extends string>
  extends DraftTraceConfig<TracerScopeT, OriginatedFromT> {
  scope: TracerScopeT
}

export interface DraftTraceInput<TracerScopeT, OriginatedFromT extends string>
  extends DraftTraceConfig<TracerScopeT, OriginatedFromT> {
  id: string
  startTime: Timestamp
}

export interface ActiveTraceInput<TracerScopeT, OriginatedFromT extends string>
  extends DraftTraceInput<TracerScopeT, OriginatedFromT> {
  scope: TracerScopeT
}

export interface ActiveTraceConfig<
  TracerScopeKeysT extends KeysOfUnion<AllPossibleScopesT>,
  AllPossibleScopesT,
  OriginatedFromT extends string,
> extends DraftTraceInput<
    SelectScopeByKey<TracerScopeKeysT, AllPossibleScopesT>,
    OriginatedFromT
  > {
  scope: SelectScopeByKey<TracerScopeKeysT, AllPossibleScopesT>
}

// eslint-disable-next-line @typescript-eslint/consistent-indexed-object-style
export interface Attributes {
  [key: string]: unknown
}
export type SpanStatus = 'ok' | 'error'

export interface SpanBase<AllPossibleScopesT> {
  // TODO: allow defining custom spans that extend this SpanBase
  type: SpanType | (string & {})

  /**
   * The common name of the span.
   * If converted from a PerformanceEntry, this is a sanitized version of the name.
   */
  name: string

  startTime: Timestamp

  // for non performance entries, scope is set explicitly in the span, something like ticket id or user id
  // performance entries can derive scope based using `deriveScopeFromPerformanceEntry`
  scope?: ScopeOnASpan<AllPossibleScopesT>

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

export interface ComponentRenderSpan<AllPossibleScopesT>
  extends Omit<SpanBase<AllPossibleScopesT>, 'scope' | 'attributes'>,
    BeaconConfig<AllPossibleScopesT> {
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

export interface ResourceSpan<AllPossibleScopesT>
  extends SpanBase<AllPossibleScopesT> {
  type: 'resource'
  resourceDetails: {
    initiatorType: InitiatorType
    query: Record<string, string | string[]>
    hash: string
  }
}

export interface PerformanceEntrySpan<AllPossibleScopesT>
  extends SpanBase<AllPossibleScopesT> {
  type: Exclude<NativePerformanceEntryType, 'resource'>
}

/**
 * All possible trace entries
 */
export type Span<AllPossibleScopesT> =
  | PerformanceEntrySpan<AllPossibleScopesT>
  | ComponentRenderSpan<AllPossibleScopesT>
  | ResourceSpan<AllPossibleScopesT>
