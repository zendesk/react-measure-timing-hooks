import { getSpanFromPerformanceEntry } from './getSpanFromPerformanceEntry'
import type { NativePerformanceEntryType } from './spanTypes'
import type { TraceManager } from './traceManager'
import type { ScopeBase } from './types'

/**
 * The function creates an instance of PerformanceObserver that integrates with a TraceManager to automatically observe
 * and map specified types of performance entries from the browser's Performance API to trace entries.
 *
 * @template ScopeT - A generic type that extends ScopeBase, allowing for
 *                    flexible scope definitions in the TraceManager.
 *
 * @param {TraceManager<ScopeT>} traceManager - An instance of TraceManager
 *                                               that will handle the processing
 *                                               of mapped performance entries.
 * @param {string[]} entryTypes - An array of strings specifying the types of
 *                                performance entries to observe (e.g.,
 *                                ["resource", "navigation"]).
 *
 * @returns {() => void} A cleanup function that, when called, disconnects the
 *                       PerformanceObserver, stopping the observation of
 *                       performance entries.
 */

export const observePerformanceWithTraceManager = <ScopeT extends ScopeBase>(
  traceManager: TraceManager<ScopeT>,
  entryTypes: NativePerformanceEntryType[],
) => {
  const observer = new PerformanceObserver((entryList) => {
    entryList.getEntries().forEach((entry) => {
      const traceEntry = getSpanFromPerformanceEntry<ScopeT>(entry)
      if (traceEntry !== undefined) {
        // if (entry.entryType === 'longtask') {
        //   console.log('Long task detected:', traceEntry)
        // }
        traceManager.processSpan(traceEntry)
      }
    })
  })

  observer.observe({ entryTypes })

  return () => void observer.disconnect()
}
