import { SpanAnnotation } from '../../v3/spanAnnotationTypes'
import { Span } from '../../v3/spanTypes'
import type { SupportedSpanTypes } from './constants'

export interface MappedSpanAndAnnotation {
  span: Span<any>
  annotation: SpanAnnotation
  groupName: string
  type: SupportedSpanTypes
}
