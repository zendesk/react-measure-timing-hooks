import type { IGardenTheme } from '@zendeskgarden/react-theming'
import { SpanAnnotation } from '../../v3/spanAnnotationTypes'
import { Span } from '../../v3/spanTypes'
import type { TraceRecording } from '../../v3/traceRecordingTypes'
import type { SupportedSpanTypes } from './constants'

export interface MappedSpanAndAnnotation {
  span: Span<any>
  annotation: SpanAnnotation
  groupName: string
  type: SupportedSpanTypes
}

export type RecordingInputFile = TraceRecording<any, any>

declare module 'styled-components' {
  export interface DefaultTheme extends IGardenTheme {}
}
