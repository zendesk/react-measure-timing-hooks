/* eslint-disable @typescript-eslint/no-explicit-any */
import type { IGardenTheme } from '@zendeskgarden/react-theming'
import { SpanAnnotation } from '../../v3/spanAnnotationTypes'
import { type Attributes, Span, type SpanBase } from '../../v3/spanTypes'
import type { TraceRecording } from '../../v3/traceRecordingTypes'
import type { Timestamp } from '../../v3/types'
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
