import type { SpanAndAnnotation } from './spanAnnotationTypes'
import type { ScopeBase } from './types'

export interface SpanMatcherTags {
  isIdle?: boolean
}

/**
 * Function type for matching performance entries.
 */
export type SpanMatcher<ScopeT extends ScopeBase> = ((
  spanAndAnnotation: SpanAndAnnotation<ScopeT>,
  scope: ScopeT,
) => boolean) &
  SpanMatcherTags
