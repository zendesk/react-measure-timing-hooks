import type { ErrorInfo } from 'react'
import type { BeaconConfig } from './hooksTypes'
import type { MapSchemaToTypes, RelationsOnASpan, Timestamp } from './types'

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

export interface BaseStartTraceConfig<VariantsT extends string> {
  id?: string
  startTime?: Partial<Timestamp>
  variant: VariantsT
  /**
   * any attributes that are relevant to the entire trace
   */
  attributes?: Attributes
}

export interface DraftTraceConfig<RelationSchemaT, VariantsT extends string>
  extends BaseStartTraceConfig<VariantsT> {
  relatedTo: MapSchemaToTypes<RelationSchemaT> | undefined
}

export interface StartTraceConfig<RelationSchemaT, VariantsT extends string>
  extends DraftTraceConfig<RelationSchemaT, VariantsT> {
  relatedTo: MapSchemaToTypes<RelationSchemaT>
}

export interface DraftTraceInput<RelationSchemaT, VariantsT extends string>
  extends DraftTraceConfig<RelationSchemaT, VariantsT> {
  id: string
  startTime: Timestamp
}

export interface ActiveTraceInput<RelationSchemaT, VariantsT extends string>
  extends DraftTraceInput<RelationSchemaT, VariantsT> {
  relatedTo: MapSchemaToTypes<RelationSchemaT>
}

export interface ActiveTraceConfig<
  SelectedRelationNameT extends keyof RelationSchemasT,
  RelationSchemasT,
  VariantsT extends string,
> extends DraftTraceInput<RelationSchemasT[SelectedRelationNameT], VariantsT> {
  relatedTo: MapSchemaToTypes<RelationSchemasT[SelectedRelationNameT]>
}

// eslint-disable-next-line @typescript-eslint/consistent-indexed-object-style
export interface Attributes {
  [key: string]: unknown
}
export type SpanStatus = 'ok' | 'error'

export interface SpanBase<RelationSchemasT> {
  // TODO: allow defining custom spans that extend this SpanBase
  type: SpanType | (string & {})

  /**
   * The common name of the span.
   * If converted from a PerformanceEntry, this is a sanitized version of the name.
   */
  name: string

  startTime: Timestamp

  // for non performance entries, relatedTo is set explicitly in the span, something like ticket id or user id
  // performance entries can derive relatedTo based using `deriveScopeFromPerformanceEntry`
  relatedTo?: RelationsOnASpan<RelationSchemasT>

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

export interface ComponentRenderSpan<RelationSchemasT>
  // it would be more correct to use 'relatedTo' from BeaconConfig,
  // but we'd need to solve some type issues
  extends Omit<SpanBase<RelationSchemasT>, 'attributes'>,
    Omit<BeaconConfig<RelationSchemasT>, 'relatedTo'> {
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

export interface ResourceSpan<RelationSchemasT>
  extends SpanBase<RelationSchemasT> {
  type: 'resource'
  resourceDetails: {
    initiatorType: InitiatorType
    query: Record<string, string | string[]>
    hash: string
  }
}

export interface PerformanceEntrySpan<RelationSchemasT>
  extends SpanBase<RelationSchemasT> {
  type: Exclude<NativePerformanceEntryType, 'resource'>
}

/**
 * All possible trace entries
 */
export type Span<RelationSchemasT> =
  | PerformanceEntrySpan<RelationSchemasT>
  | ComponentRenderSpan<RelationSchemasT>
  | ResourceSpan<RelationSchemasT>
