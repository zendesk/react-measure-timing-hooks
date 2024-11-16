import type { Attributes, Span, SpanStatus, SpanType } from './spanTypes'
import type { ScopeBase } from './types'

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
