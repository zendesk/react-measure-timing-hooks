import { getPerformanceEntryHash } from './getPerformanceEntryHash'
import type { SpanAndAnnotation } from './spanAnnotationTypes'
import type { Span } from './spanTypes'
import type { ScopeBase, SpanDeduplicationStrategy } from './types'

export function createDefaultPerformanceEntryDeduplicationStrategy<
  ScopeT extends ScopeBase,
>(): SpanDeduplicationStrategy<ScopeT> {
  let processedPerformanceEntries = new WeakMap<
    PerformanceEntry,
    SpanAndAnnotation<ScopeT>
  >()
  const processedPerformanceEntriesByHash = new Map<
    string,
    SpanAndAnnotation<ScopeT>
  >()

  return {
    findDuplicate(span: Span<ScopeT>): SpanAndAnnotation<ScopeT> | undefined {
      if (!span.performanceEntry) {
        return undefined
      }

      const existing = processedPerformanceEntries.get(span.performanceEntry)
      if (existing) {
        return existing
      }

      if (span.performanceEntry.entryType === 'resource') {
        const hash = getPerformanceEntryHash(span.performanceEntry)
        return processedPerformanceEntriesByHash.get(hash)
      }

      return undefined
    },

    recordSpan(
      span: Span<ScopeT>,
      spanAndAnnotation: SpanAndAnnotation<ScopeT>,
    ): void {
      if (!span.performanceEntry) {
        return
      }

      processedPerformanceEntries.set(span.performanceEntry, spanAndAnnotation)

      if (span.performanceEntry.entryType === 'resource') {
        const hash = getPerformanceEntryHash(span.performanceEntry)
        processedPerformanceEntriesByHash.set(hash, spanAndAnnotation)
      }
    },

    reset(): void {
      processedPerformanceEntries = new WeakMap()
      processedPerformanceEntriesByHash.clear()
    },

    selectPreferredSpan(
      existingSpan: Span<ScopeT>,
      newSpan: Span<ScopeT>,
    ): Span<ScopeT> {
      // Default behavior: use the new span
      return newSpan
    },
  }
}
