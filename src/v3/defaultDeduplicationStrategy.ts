import { getPerformanceEntryHash } from './getPerformanceEntryHash'
import type { SpanAndAnnotation } from './spanAnnotationTypes'
import type { Span } from './spanTypes'
import type { SpanDeduplicationStrategy } from './types'

export function createDefaultPerformanceEntryDeduplicationStrategy<
  AllPossibleScopesT,
>(): SpanDeduplicationStrategy<AllPossibleScopesT> {
  let processedPerformanceEntries = new WeakMap<
    PerformanceEntry,
    SpanAndAnnotation<AllPossibleScopesT>
  >()
  const processedPerformanceEntriesByHash = new Map<
    string,
    SpanAndAnnotation<AllPossibleScopesT>
  >()

  return {
    findDuplicate(
      span: Span<AllPossibleScopesT>,
    ): SpanAndAnnotation<AllPossibleScopesT> | undefined {
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
      span: Span<AllPossibleScopesT>,
      spanAndAnnotation: SpanAndAnnotation<AllPossibleScopesT>,
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
      existingSpan: Span<AllPossibleScopesT>,
      newSpan: Span<AllPossibleScopesT>,
    ): Span<AllPossibleScopesT> {
      // Default behavior: use the new span
      return newSpan
    },
  }
}
