import { sanitizeUrlForTracing } from './sanitizeUrlForTracing'
import {
  type EventEntryType,
  type EventProcessor,
  type EventStatus,
} from './types'

export const defaultEventProcessor: EventProcessor = (entry) => {
  const detail = typeof entry.detail === 'object' && entry.detail
  const metadata =
    'metadata' in entry && typeof entry.metadata === 'object'
      ? detail
        ? { ...detail, ...entry.metadata }
        : entry.metadata
      : {}
  const operations =
    'operations' in entry && typeof entry.operations === 'object'
      ? entry.operations
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
      resource &&
      typeof resource.status_code === 'number' &&
      resource.status_code

    if (resourceType && resourceType !== 'xhr' && resourceType !== 'fetch') {
      kind = 'asset'
    }
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

  return Object.assign(entry, {
    metadata,
    operations,
    entryType: entry.entryType as EventEntryType,
    event: {
      commonName,
      kind,
      status,
    },
  })
}

export const lotusEventProcessor: EventProcessor = (entry) => {
  const processedEntry = defaultEventProcessor(entry)
  const { event, metadata } = processedEntry

  let fullName: string | undefined
  let commonName = event.commonName
  let kind = event.kind
  let occurrenceCountPrefix = ''

  if (
    processedEntry.entryType === 'mark' ||
    processedEntry.entryType === 'measure'
  ) {
    // backwards compatibility with useTiming
    fullName = processedEntry.name.replace('useTiming: ', '')
    commonName = fullName.replaceAll(/\b\/?\d+\b/g, '')
    if (entry.name.endsWith('/render')) {
      kind = 'render'
      const parts = commonName.split('/')
      commonName = parts.slice(-2)[0]!
      const metricId = parts.slice(0, -2).join('/')
      metadata.metricId = metricId
      occurrenceCountPrefix = `${metricId}/`
    }
    if (entry.name.endsWith('/tti') || entry.name.endsWith('/ttr')) {
      const parts = commonName.split('/')
      const metricId = parts.slice(0, -1).join('/')
      commonName = metricId
      metadata.metricId = metricId
    }
    if (entry.entryType === 'measure' && entry.name.includes('-till-')) {
      const parts = commonName.split('/')
      const stageChange = parts.at(-1)!
      const componentName = parts.at(-2)!
      const metricId = parts.slice(0, -2).join('/')
      metadata.metricId = metricId
      metadata.stageChange = stageChange
      metadata.componentName = componentName
      // merge all stage changes under the same commonName as tti and ttr
      commonName = metricId
      fullName = `${metricId}/${stageChange}`
      occurrenceCountPrefix = `${stageChange}/`
    }
    if (entry.name.startsWith('graphql/')) {
      kind = 'resource'
    }
  }

  event.commonName = commonName
  event.kind = kind
  if (fullName) {
    event.name = fullName
  }

  return processedEntry
  // this should happen in RUM (or maybe already does happen?)
  // if ('toJSON' in entry) {
  //   Object.assign(extraMetadata, entry.toJSON())
  // }
}
