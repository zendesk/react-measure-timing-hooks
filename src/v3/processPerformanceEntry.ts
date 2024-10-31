import { getCommonUrlForTracing } from "../main";
import { ensureTimestamp } from "./ensureTimestamp";
import { Attributes, EntryType, ScopeBase, Timestamp, TraceEntry, TraceEntryStatus } from "./types"

/**
 * Maps Performance Entry to Trace Entry
 * @param inputEntry - The performance entry event.
 * @returns {TraceEntry} The trace entry.
 */
export function processPerformanceEntry<ScopeT extends ScopeBase>(
  inputEntry: PerformanceEntry,
): TraceEntry<ScopeT> | undefined {

  // react in dev mode generates hundreds of these marks, ignore them
  if (inputEntry.entryType === 'mark') {
    return undefined
  }

  const detail =
    'details' in inputEntry && typeof inputEntry.detail === 'object' && inputEntry.details !== null
      ? inputEntry.details
      : {}

  const existingAttributes =
    'attributes' in inputEntry && typeof inputEntry.attributes === 'object' && inputEntry.attributes !== null
      ? inputEntry.attributes
      : {};

  const attributes: Attributes = {
    ...detail,
    ...existingAttributes,
  };

  let type = inputEntry.entryType as EntryType;
  let { name } = inputEntry;
  let status: TraceEntryStatus = 'ok';

  if (inputEntry.entryType === 'resource' || inputEntry.entryType === 'navigation') {
    const { commonUrl, query, hash } = getCommonUrlForTracing(inputEntry.name)
    name = commonUrl
    attributes.resourceQuery = query
    attributes.resourceHash = hash

    if (inputEntry.entryType === 'resource') {
      const resource =
        attributes.resource &&
        typeof attributes.resource === 'object' &&
        attributes.resource
      const resourceType =
        resource && typeof resource.type === 'string' && resource.type
      const statusCode =
        resource && typeof resource.status === 'number' && resource.status

      // eslint-disable-next-line no-magic-numbers
      if (statusCode && statusCode >= 400) {
        status = 'error'
      }

      if (resourceType && resourceType !== 'xhr' && resourceType !== 'fetch') {
        type = 'asset'
      }

      const resourceTiming = inputEntry as PerformanceResourceTiming
      if (resourceTiming.initiatorType === 'iframe') {
        type = 'iframe'
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

  // TODO: figure out how to get scope
  // eslint-disable-next-line @typescript-eslint/consistent-type-assertions
  const scope: ScopeT = {} as ScopeT
  const traceEntry: TraceEntry<ScopeT> = {
    type,
    name,
    startTime: ensureTimestamp(timestamp),
    attributes,
    scope,
    duration: inputEntry.duration,
    status,
    performanceEntry: inputEntry,
  }

  return traceEntry
}