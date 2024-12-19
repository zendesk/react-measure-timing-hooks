import { SpanAnnotation } from '../../v3/spanAnnotationTypes'
import { Span } from '../../v3/spanTypes'

export interface MappedSpanAndAnnotation {
  span: Span<any>
  annotation: SpanAnnotation
  commonName: string
  kind: string
  metadata?: Record<string, any>
}
