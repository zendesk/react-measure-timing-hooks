/* eslint-disable @typescript-eslint/no-explicit-any */
import type { IGardenTheme } from '@zendeskgarden/react-theming'
import type { SpanAnnotation } from '../spanAnnotationTypes'
import type { Attributes, Span, SpanBase } from '../spanTypes'
import type { TraceRecording } from '../traceRecordingTypes'
import type { Timestamp } from '../types'
import type { SupportedSpanTypes } from './constants'

type DistributiveOmit<T, K extends keyof any> = T extends T ? Omit<T, K> : never

// visualizer-specific types
export type MinimalSpanAnnotation = Omit<
  SpanAnnotation,
  'id' | 'occurrence' | 'recordedInState' | 'labels'
> &
  Partial<SpanAnnotation>
export type MinimalSpan = DistributiveOmit<
  Span<any> | SpanBase<any>,
  'startTime' | 'attributes'
> & {
  startTime: Pick<Timestamp, 'now'> & Partial<Timestamp>
  attributes?: Attributes
}

export interface MappedSpanAndAnnotation {
  span: MinimalSpan
  annotation: MinimalSpanAnnotation
  groupName: string
  type: SupportedSpanTypes
}

export type RecordingInputFile = TraceRecording<any, any>

declare module 'styled-components' {
  export interface DefaultTheme extends IGardenTheme {}
}
