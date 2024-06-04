import { sanitizeUrlForTracing } from './sanitizeUrlForTracing'
import {
  type Event,
  type EventProcessor,
  type EventStatus,
  type InputEvent,
} from './types'

export const defaultEventProcessor: EventProcessor = (entry): Event => {
  const detail = typeof entry.detail === 'object' && entry.detail
  const metadata =
    'metadata' in entry && typeof entry.metadata === 'object'
      ? detail
        ? { ...detail, ...entry.metadata }
        : entry.metadata
      : {}
  let kind = entry.entryType
  let commonName = entry.name
  let status: EventStatus = 'ok'

  if (entry.entryType === 'resource') {
    const { commonUrl, query } = sanitizeUrlForTracing(entry.name)
    commonName = commonUrl
    metadata.resourceQuery = query

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

  const inputEvent = entry as InputEvent
  if (!('operations' in entry) || typeof entry.operations !== 'object') {
    inputEvent.operations = {}
  }
  inputEvent.metadata = metadata
  inputEvent.event = { commonName, kind, status }

  return inputEvent as Event
}
