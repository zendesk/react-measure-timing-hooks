import { getCommonUrlForTracing } from './getCommonUrlForTracing'
import {
  type Event,
  type EventProcessor,
  type EventStatus,
  type InputEvent,
} from './types'

export const defaultEventProcessor: EventProcessor = (
  entry,
): Event | undefined => {
  if (entry.entryType === 'mark' && entry.name.startsWith('--')) {
    // react in dev mode hundreds of these marks, ignore them
    return undefined
  }

  const detail = typeof entry.detail === 'object' && entry.detail
  const existingMetadata =
    'metadata' in entry && typeof entry.metadata === 'object'
      ? entry.metadata
      : {}
  const metadata = detail
    ? { ...detail, ...existingMetadata }
    : existingMetadata

  const inputEvent = entry as InputEvent

  inputEvent.metadata = metadata

  if (!('operations' in entry) || typeof entry.operations !== 'object') {
    inputEvent.operations = {}
  }

  if (typeof inputEvent.event === 'object') {
    // the event might have been prepopulated, in which case we don't want to overwrite it
    return inputEvent as Event
  }

  let kind = entry.entryType
  let commonName = entry.name
  let status: EventStatus = 'ok'

  if (entry.entryType === 'resource' || entry.entryType === 'navigation') {
    const { commonUrl, query, hash } = getCommonUrlForTracing(entry.name)
    commonName = commonUrl
    metadata.resourceQuery = query
    metadata.resourceHash = hash

    if (entry.entryType === 'resource') {
      const resource =
        metadata.resource &&
        typeof metadata.resource === 'object' &&
        metadata.resource
      const resourceType =
        resource && typeof resource.type === 'string' && resource.type
      const statusCode =
        resource && typeof resource.status === 'number' && resource.status

      if (resourceType && resourceType !== 'xhr' && resourceType !== 'fetch') {
        kind = 'asset'
      }
      // eslint-disable-next-line no-magic-numbers
      if (statusCode && statusCode >= 400) {
        status = 'error'
      }
      const resourceTiming = entry as PerformanceResourceTiming
      if (resourceTiming.initiatorType === 'iframe') {
        kind = 'iframe'
      }
    }
  } else if (entry.entryType !== 'mark' && entry.entryType !== 'measure') {
    commonName = `${entry.entryType}${
      entry.name &&
      entry.name !== 'unknown' &&
      entry.name.length > 0 &&
      entry.entryType !== entry.name
        ? `/${entry.name}`
        : ''
    }`
  }

  inputEvent.event = { commonName, kind, status }

  return inputEvent as Event
}
