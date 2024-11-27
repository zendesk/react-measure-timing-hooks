/* eslint-disable no-continue */
import type { FinalState } from './ActiveTrace'
import type { SpanAndAnnotation } from './spanAnnotationTypes'
import type { ActiveTraceConfig } from './spanTypes'
import type { TraceRecording } from './traceRecordingTypes'
import type { CompleteTraceDefinition, ScopeBase } from './types'

/**
 * ### Deriving SLIs and other metrics from a trace
 *
 * ℹ️ It is our recommendation that the primary way of creating duration metrics would be to derive them from data in the trace.
 *
 * Instead of the traditional approach of capturing isolated metrics imperatively in the code,
 * the **trace** model allows us the flexibility to define and compute any number of metrics from the **trace recording**.
 *
 * We can distinguish the following types of metrics:
 *
 * 1. **Duration of a Computed Span** — the time between any two **spans** that appeared in the **trace**. For example:
 *    1. _time between the user’s click on a ticket_ and _everything in the ticket page has fully rendered with content_ (duration of the entire operation)
 *    2. _time between the user’s click on a ticket_ and _the moment the first piece of the ticket UI was displayed_ (duration of a segment of the operation)
 *
 * 2. **Computed Values** — any numerical value derived from the **spans** or their attributes. For example:
 *    1. _The total number of times the log component re-rendered while loading the ticket_
 *    2. _The total number of requests made while loading the ticket_
 *    3. _The total number of iframe apps were initialized while loading the ticket_
 */

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

  for (const definition of traceDefinition.computedValueDefinitions) {
    const { name, matches, computeValueFromMatches } = definition

    const matchingRecordedEntries = recordedItems.filter((spanAndAnnotation) =>
      matches.some((matcher) => matcher(spanAndAnnotation, input.scope)),
    )

    computedValues[name] = computeValueFromMatches(matchingRecordedEntries)
  }

  return computedValues
}

const markedComplete = (spanAndAnnotation: SpanAndAnnotation<ScopeBase>) =>
  spanAndAnnotation.annotation.markedComplete

const markedInteractive = (spanAndAnnotation: SpanAndAnnotation<ScopeBase>) =>
  spanAndAnnotation.annotation.markedInteractive

export function getComputedSpans<ScopeT extends ScopeBase>({
  definition: traceDefinition,
  recordedItems,
  input,
}: ComputeRecordingData<ScopeT>): TraceRecording<ScopeT>['computedSpans'] {
  // loop through the computed span definitions, check for entries that match in recorded items, then calculate the startOffset and duration
  const computedSpans: TraceRecording<ScopeT>['computedSpans'] = {}

  for (const definition of traceDefinition.computedSpanDefinitions) {
    const { startSpan: startSpanMatcher, endSpan, name } = definition

    const matchingStartEntry =
      typeof startSpanMatcher === 'function'
        ? recordedItems.find((spanAndAnnotation) =>
            startSpanMatcher(spanAndAnnotation, input.scope),
          )
        : undefined

    const matchingStartTime = matchingStartEntry
      ? matchingStartEntry.span.startTime.now
      : input.startTime.now

    const endSpanMatcher =
      endSpan === 'operation-end'
        ? markedComplete
        : endSpan === 'interactive'
        ? markedInteractive
        : endSpan

    const matchingEndEntry = recordedItems.findLast((spanAndAnnotation) =>
      endSpanMatcher(spanAndAnnotation, input.scope),
    )

    const matchingEndTime = matchingEndEntry
      ? matchingEndEntry.span.startTime.now + matchingEndEntry.span.duration
      : undefined

    if (
      typeof matchingStartTime === 'number' &&
      typeof matchingEndTime === 'number'
    ) {
      const duration = matchingEndTime - matchingStartTime

      computedSpans[name] = {
        duration,
        // DECISION: After considering which events happen first and which one is defined as the start
        // the start offset is always going to be anchored to the start span.
        // cases:
        // -----S------E (computed val is positive)
        // -----E------S (computed val is negative)
        // this way the `endOffset` can be derived as follows:
        // endOffset = computedSpan.startOffset + computedSpan.duration
        startOffset: matchingStartTime - input.startTime.now,
      }
    }
  }

  return computedSpans
}

export function getSpanSummaryAttributes<ScopeT extends ScopeBase>({
  definition,
  recordedItems,
  input,
}: ComputeRecordingData<ScopeT>): TraceRecording<ScopeT>['spanAttributes'] {
  // loop through recorded items, create a entry based on the name
  const spanAttributes: TraceRecording<ScopeT>['spanAttributes'] = {}

  for (const { span } of recordedItems) {
    const { attributes, name } = span
    const existingAttributes = spanAttributes[name] ?? {}
    if (attributes && Object.keys(attributes).length > 0) {
      spanAttributes[name] = {
        ...existingAttributes,
        ...attributes,
      }
    }
  }

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

function getComputedRenderBeaconSpans<ScopeT extends ScopeBase>(
  recordedItems: SpanAndAnnotation<ScopeT>[],
  input: ActiveTraceConfig<ScopeT>,
): TraceRecording<ScopeT>['computedRenderBeaconSpans'] {
  const renderSpansByBeacon = new Map<
    string,
    {
      firstStart: number
      lastEnd: number | undefined
      lastLoadingEnd: number | undefined
      renderCount: number
      sumOfDurations: number
    }
  >()

  const scopeKeys = Object.keys(input.scope)

  // Group render spans by beacon and compute firstStart and lastEnd
  for (const entry of recordedItems) {
    if (entry.span.type !== 'component-render') continue
    const { name, startTime, duration, scope, renderedOutput } = entry.span
    // accept any span that either matches scope or doesn't share any of the scope values
    const scopeMatch = scopeKeys.every(
      (key) => scope?.[key] === undefined || input.scope[key] === scope[key],
    )
    if (!scopeMatch) continue
    const start = startTime.now
    const contentEnd =
      renderedOutput === 'content' ? start + duration : undefined
    const loadingEnd =
      renderedOutput === 'loading' ? start + duration : undefined

    const spanTimes = renderSpansByBeacon.get(name)

    if (!spanTimes) {
      renderSpansByBeacon.set(name, {
        firstStart: start,
        lastEnd: contentEnd,
        lastLoadingEnd: loadingEnd,
        renderCount: 1,
        sumOfDurations: duration,
      })
    } else {
      spanTimes.firstStart = Math.min(spanTimes.firstStart, start)
      spanTimes.lastEnd =
        contentEnd && spanTimes.lastEnd
          ? Math.max(spanTimes.lastEnd, contentEnd)
          : contentEnd ?? spanTimes.lastEnd
      spanTimes.lastLoadingEnd =
        loadingEnd && spanTimes.lastLoadingEnd
          ? Math.max(spanTimes.lastLoadingEnd, loadingEnd)
          : loadingEnd ?? spanTimes.lastLoadingEnd
      spanTimes.renderCount += 1
      spanTimes.sumOfDurations += duration
    }
  }

  const computedRenderBeaconSpans: TraceRecording<ScopeT>['computedRenderBeaconSpans'] =
    {}

  // Calculate duration and startOffset for each beacon
  for (const [beaconName, spanTimes] of renderSpansByBeacon) {
    if (!spanTimes.lastEnd) continue
    computedRenderBeaconSpans[beaconName] = {
      startOffset: spanTimes.firstStart - input.startTime.now,
      timeToRendered: spanTimes.lastEnd - spanTimes.firstStart,
      timeToData: spanTimes.lastLoadingEnd
        ? spanTimes.lastLoadingEnd - spanTimes.firstStart
        : 0,
      renderCount: spanTimes.renderCount,
      sumOfDurations: spanTimes.sumOfDurations,
    }
  }

  return computedRenderBeaconSpans
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
  // TODO: let's get this information from up top (in FinalState)
  const wasInterrupted =
    interruptionReason && transitionFromState !== 'waiting-for-interactive'
  // TODO: maybe we don't compute spans and values when interrupted
  const computedSpans = getComputedSpans(data)
  const computedValues = getComputedValues(data)
  const spanAttributes = getSpanSummaryAttributes(data)
  const computedRenderBeaconSpans = getComputedRenderBeaconSpans(
    recordedItems,
    input,
  )

  const anyErrors = recordedItems.some(({ span }) => span.status === 'error')
  const duration =
    lastRequiredSpanAndAnnotation?.annotation.operationRelativeEndTime ?? null
  const startTillInteractive =
    cpuIdleSpanAndAnnotation?.annotation.operationRelativeEndTime ?? null
  return {
    id,
    name,
    startTime: input.startTime,
    scope,
    type: 'operation',
    duration,
    startTillInteractive,
    // last entry until the tti?
    completeTillInteractive:
      startTillInteractive && duration ? startTillInteractive - duration : null,
    // ?: If we have any error entries then should we mark the status as 'error'
    status: wasInterrupted ? 'interrupted' : anyErrors ? 'error' : 'ok',
    computedSpans,
    computedRenderBeaconSpans,
    computedValues,
    attributes: input.attributes ?? {},
    spanAttributes,
    interruptionReason,
    entries: recordedItems,
  }
}
