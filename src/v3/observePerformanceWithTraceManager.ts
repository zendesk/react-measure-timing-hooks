import { getSpanFromPerformanceEntry } from './getSpanFromPerformanceEntry'
import type { NativePerformanceEntryType } from './spanTypes'
import type { TraceManager } from './traceManager'
import type { ScopeBase } from './types'

export const getBestSupportedEntryTypes = (): NativePerformanceEntryType[] =>
  (PerformanceObserver.supportedEntryTypes.includes('long-animation-frame')
    ? PerformanceObserver.supportedEntryTypes.filter(
        (entryType) => entryType !== 'longtask',
      )
    : PerformanceObserver.supportedEntryTypes) as NativePerformanceEntryType[]

/**
 * The function creates an instance of PerformanceObserver that integrates with a TraceManager to automatically observe
 * and map specified types of performance entries from the browser's Performance API to trace entries.
 * @param traceManager - An instance of TraceManager
 *                       that will handle the processing
 *                       of mapped performance entries.
 * @param entryTypes - An array of strings specifying the types of
 *                     performance entries to observe (e.g.,
 *                     ["resource", "navigation"]).
 *
 * @returns A cleanup function that, when called, disconnects the
 *          PerformanceObserver, stopping the observation of
 *          performance entries.
 */
export const observePerformanceWithTraceManager = <ScopeT extends ScopeBase>(
  traceManager: TraceManager<ScopeT>,
  entryTypes = getBestSupportedEntryTypes(),
) => {
  const observer = new PerformanceObserver((entryList) => {
    entryList.getEntries().forEach((entry) => {
      const traceEntry = getSpanFromPerformanceEntry<ScopeT>(entry)
      if (traceEntry !== undefined) {
        traceManager.processSpan(traceEntry)
      }
    })
  })

  observer.observe({ entryTypes })

  return () => void observer.disconnect()
}
