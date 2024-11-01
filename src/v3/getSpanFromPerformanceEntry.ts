import { getCommonUrlForTracing } from "../main";
import { ensureTimestamp } from "./ensureTimestamp";
import { Attributes, SpanType, InitiatorType, ScopeBase, Timestamp, Span } from "./types"

/**
 * Maps Performance Entry to Trace Entry
 * @param inputEntry - The performance entry event.
 * @returns {Span} The span.
 */
export function getSpanFromPerformanceEntry<ScopeT extends ScopeBase>(
  inputEntry: PerformanceEntry,
): Span<ScopeT> | undefined {

  // react in dev mode generates hundreds of these marks, ignore them
  if (inputEntry.entryType === 'mark' && inputEntry.name.startsWith('--')) {
    return undefined
  }

  const attributes =
    'details' in inputEntry && typeof inputEntry.detail === 'object' && inputEntry.details !== null
      ? inputEntry.details as Attributes
      : {}

  const type = inputEntry.entryType as SpanType;
  let { name } = inputEntry;

  if (inputEntry.entryType === 'resource' || inputEntry.entryType === 'navigation') {
    const { commonUrl, query, hash } = getCommonUrlForTracing(inputEntry.name)
    name = commonUrl

    // write a function in lotus to extract from datadog's SDK rather than hardcoding the implementation
    if (inputEntry.entryType === 'resource') {
      const resourceTiming = inputEntry as PerformanceResourceTiming

      return {
        type,
        name,
        startTime: ensureTimestamp({ now: inputEntry.startTime }),
        attributes,
        duration: inputEntry.duration,
        // status,
        performanceEntry: inputEntry,
        resourceDetails: {
          initiatorType: resourceTiming.initiatorType as InitiatorType,
          query,
          hash
        }
      }
    }
  } else if (inputEntry.entryType !== 'mark' && inputEntry.entryType !== 'measure') {
    name = `${inputEntry.entryType}${inputEntry.name &&
      inputEntry.name !== 'unknown' &&
      inputEntry.name.length > 0 &&
      inputEntry.entryType !== inputEntry.name
      ? `/${inputEntry.name}`
      : ''
      }`
  }

  const timestamp: Partial<Timestamp> = {
    now: inputEntry.startTime
  }

  const traceEntry: Span<ScopeT> = {
    type,
    name,
    startTime: ensureTimestamp(timestamp),
    attributes,
    duration: inputEntry.duration,
    // status,
    performanceEntry: inputEntry,
  }

  return traceEntry
}