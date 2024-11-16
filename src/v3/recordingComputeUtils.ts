import type { FinalState } from './ActiveTrace'
import { doesEntryMatchDefinition } from './doesEntryMatchDefinition'
import type { SpanAndAnnotation } from './spanAnnotationTypes'
import type { ActiveTraceConfig } from './spanTypes'
import type {
  CompleteTraceDefinition,
  TraceRecording,
} from './traceRecordingTypes'
import type { ScopeBase } from './types'

interface ComputeRecordingData<ScopeT extends ScopeBase> {
  definition: CompleteTraceDefinition<ScopeT>
  recordedItems: SpanAndAnnotation<ScopeT>[]
  input: ActiveTraceConfig<ScopeT>
}

export function getComputedValues<ScopeT extends ScopeBase>({
  definition: traceDefinition,
  recordedItems,
  input,
}: ComputeRecordingData<ScopeT>): TraceRecording<ScopeT>['computedValues'] {
  const computedValues: TraceRecording<ScopeT>['computedValues'] = {}

  traceDefinition.computedValueDefinitions.forEach((definition) => {
    const { name, matches, computeValueFromMatches } = definition

    const matchingRecordedEntries = recordedItems.filter((spanAndAnnotation) =>
      matches.some((matchCriteria) =>
        doesEntryMatchDefinition(spanAndAnnotation, matchCriteria, input.scope),
      ),
    )

    computedValues[name] = computeValueFromMatches(matchingRecordedEntries)
  })

  return computedValues
}

// IMPLEMENTATION TODO: 1) Handle the case where start span being the operation's start time, 2) Handle the case where end span being the operation's end time
export function getComputedSpans<ScopeT extends ScopeBase>({
  definition: traceDefinition,
  recordedItems,
  input,
}: ComputeRecordingData<ScopeT>): TraceRecording<ScopeT>['computedSpans'] {
  // loop through the computed span definitions, check for entries that match in recorded items. calculate the startoffset and duration
  const computedSpans: TraceRecording<ScopeT>['computedSpans'] = {}

  traceDefinition.computedSpanDefinitions.forEach((definition) => {
    const { startSpan, endSpan, name } = definition
    const matchingStartEntry = recordedItems.find((spanAndAnnotation) =>
      doesEntryMatchDefinition(spanAndAnnotation, startSpan, input.scope),
    )
    const matchingEndEntry = recordedItems.find((spanAndAnnotation) =>
      doesEntryMatchDefinition(spanAndAnnotation, endSpan, input.scope),
    )

    if (matchingStartEntry && matchingEndEntry) {
      const duration =
        matchingEndEntry.span.startTime.now -
        matchingStartEntry.span.startTime.now

      computedSpans[name] = {
        duration,
        // DECISION: After considering which events happen first and which one is defined as the start
        // the start offset is always going to be anchored to the start span.
        // cases:
        // ------S------E (+ computed val)
        // -----E------S (- computed val)
        // computedSpan.startOffset + computedSpan.duration = computedSpan.endOffset
        startOffset:
          matchingStartEntry.span.startTime.now - input.startTime.now,
      }
    }
  })

  return computedSpans
}

// IMPLEMENTATION TODO: Not that useful in its current form
export function getSpanAttributes<ScopeT extends ScopeBase>({
  definition,
  recordedItems,
  input,
}: ComputeRecordingData<ScopeT>): TraceRecording<ScopeT>['spanAttributes'] {
  // loop through recorded items, create a entry based on the name
  const spanAttributes: TraceRecording<ScopeT>['spanAttributes'] = {}

  recordedItems.forEach(({ span }) => {
    const { attributes, name } = span
    const existingAttributes = spanAttributes[name] ?? {}
    spanAttributes[name] = {
      ...existingAttributes,
      ...attributes,
    }
  })

  return spanAttributes
}

// IMPLEMENTATION TODO: implementation of gathering Trace level attributes
export function getAttributes<ScopeT extends ScopeBase>({
  definition,
  recordedItems,
  input,
}: ComputeRecordingData<ScopeT>): TraceRecording<ScopeT>['attributes'] {
  return {}
}

export function createTraceRecording<ScopeT extends ScopeBase>(
  data: ComputeRecordingData<ScopeT>,
  {
    transitionFromState,
    interruptionReason,
    cpuIdleSpanAndAnnotation,
    lastRequiredSpanAndAnnotation,
  }: FinalState<ScopeT>,
): TraceRecording<ScopeT> {
  const { definition, recordedItems, input } = data
  const { id, scope } = input
  const { name } = definition
  const computedSpans = getComputedSpans(data)
  const computedValues = getComputedValues(data)
  const spanAttributes = getSpanAttributes(data)
  const attributes = getAttributes(data)

  const anyErrors = recordedItems.some(({ span }) => span.status === 'error')
  const duration =
    lastRequiredSpanAndAnnotation?.annotation.operationRelativeEndTime ?? null
  return {
    id,
    name,
    scope,
    type: 'operation',
    duration,
    startTillInteractive:
      cpuIdleSpanAndAnnotation?.annotation.operationRelativeEndTime ?? null,
    // last entry until the tti?
    completeTillInteractive: 0,
    // ?: If we have any error entries then should we mark the status as 'error'
    status:
      interruptionReason && transitionFromState !== 'waiting-for-interactive'
        ? 'interrupted'
        : anyErrors
        ? 'error'
        : 'ok',
    computedSpans,
    computedValues,
    attributes,
    spanAttributes,
    interruptionReason,
    entries: recordedItems,
  }
}
