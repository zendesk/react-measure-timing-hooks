/* eslint-disable no-continue */
import type { SpanAndAnnotation } from './spanAnnotationTypes'
import type { ActiveTraceInput, DraftTraceInput } from './spanTypes'
import type { FinalState } from './Trace'
import type { TraceRecording } from './traceRecordingTypes'
import type { TraceContext } from './types'
import { findLast } from './utils'

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

export function getComputedValues<
  SelectedRelationNameT extends keyof RelationSchemasT,
  RelationSchemasT,
  const VariantsT extends string,
>(
  context: TraceContext<SelectedRelationNameT, RelationSchemasT, VariantsT>,
): TraceRecording<SelectedRelationNameT, RelationSchemasT>['computedValues'] {
  const computedValues: TraceRecording<
    SelectedRelationNameT,
    RelationSchemasT
  >['computedValues'] = {}

  for (const [name, computedValueDefinition] of Object.entries(
    context.definition.computedValueDefinitions,
  )) {
    const { matches, computeValueFromMatches } = computedValueDefinition

    // Initialize arrays to hold matches for each matcher
    const matchingEntriesByMatcher: SpanAndAnnotation<RelationSchemasT>[][] =
      Array.from({ length: matches.length }, () => [])

    // Single pass through recordedItems
    for (const item of context.recordedItems.values()) {
      matches.forEach((doesSpanMatch, index) => {
        if (doesSpanMatch(item, context)) {
          matchingEntriesByMatcher[index]!.push(item)
        }
      })
    }

    const value = computeValueFromMatches(...matchingEntriesByMatcher)
    if (value !== undefined) {
      computedValues[name] = value
    }
  }
  return computedValues
}

const markedComplete = <RelationSchemasT>(
  spanAndAnnotation: SpanAndAnnotation<RelationSchemasT>,
) => spanAndAnnotation.annotation.markedComplete

const markedInteractive = <RelationSchemasT>(
  spanAndAnnotation: SpanAndAnnotation<RelationSchemasT>,
) => spanAndAnnotation.annotation.markedPageInteractive

export function getComputedSpans<
  SelectedRelationNameT extends keyof RelationSchemasT,
  RelationSchemasT,
  const VariantsT extends string,
>(
  context: TraceContext<SelectedRelationNameT, RelationSchemasT, VariantsT>,
): TraceRecording<SelectedRelationNameT, RelationSchemasT>['computedSpans'] {
  // loop through the computed span definitions, check for entries that match in recorded items, then calculate the startOffset and duration
  const computedSpans: TraceRecording<
    SelectedRelationNameT,
    RelationSchemasT
  >['computedSpans'] = {}
  const recordedItemsArray = [...context.recordedItems.values()]

  for (const [name, computedSpanDefinition] of Object.entries(
    context.definition.computedSpanDefinitions,
  )) {
    const { startSpan: startSpanMatcher, endSpan } = computedSpanDefinition

    let matchingStartEntry:
      | SpanAndAnnotation<RelationSchemasT>
      | 'operation-start'
      | undefined =
      typeof startSpanMatcher !== 'function' ? startSpanMatcher : undefined

    if (typeof startSpanMatcher === 'function') {
      let matchingIndex = 0
      let matchingReverseIndex = -recordedItemsArray.length
      // eslint-disable-next-line @typescript-eslint/prefer-for-of
      for (let index = 0; index < recordedItemsArray.length; index++) {
        const spanAndAnnotation = recordedItemsArray[index]!
        if (startSpanMatcher(spanAndAnnotation, context)) {
          if (
            typeof startSpanMatcher.matchingIndex !== 'number' ||
            (startSpanMatcher.matchingIndex >= 0
              ? startSpanMatcher.matchingIndex === matchingIndex
              : startSpanMatcher.matchingIndex === matchingReverseIndex)
          ) {
            // found it!
            matchingStartEntry = spanAndAnnotation
            continue
          } else {
            matchingIndex += 1
            matchingReverseIndex += 1
          }
        }
      }
    }

    const endSpanMatcher =
      endSpan === 'operation-end'
        ? markedComplete
        : endSpan === 'interactive'
        ? markedInteractive
        : endSpan

    // use findLast as a small optimization, as most likely users will want the last instance of a span, so we start from the end
    let matchingEndEntry: SpanAndAnnotation<RelationSchemasT> | undefined

    if (typeof endSpanMatcher === 'function') {
      let matchingIndex = recordedItemsArray.length - 1
      let matchingReverseIndex = -1
      for (let index = recordedItemsArray.length - 1; index >= 0; index--) {
        const spanAndAnnotation = recordedItemsArray[index]!
        if (endSpanMatcher(spanAndAnnotation, context)) {
          if (
            typeof endSpanMatcher.matchingIndex !== 'number' ||
            (endSpanMatcher.matchingIndex >= 0
              ? endSpanMatcher.matchingIndex === matchingIndex
              : endSpanMatcher.matchingIndex === matchingReverseIndex)
          ) {
            // found it!
            matchingEndEntry = spanAndAnnotation
            continue
          } else {
            matchingIndex -= 1
            matchingReverseIndex -= 1
          }
        }
      }
    }

    const matchingStartTime =
      matchingStartEntry === 'operation-start'
        ? context.input.startTime.now
        : matchingStartEntry?.span.startTime.now

    // index  0    1   2   3
    // revei  -4  -3  -2  -1
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
        startOffset: matchingStartTime - context.input.startTime.now,
      }
    }
  }

  return computedSpans
}

function getComputedRenderBeaconSpans<
  SelectedRelationNameT extends keyof RelationSchemasT,
  RelationSchemasT,
  const VariantsT extends string,
>(
  recordedItems: ReadonlySet<SpanAndAnnotation<RelationSchemasT>>,
  input: ActiveTraceInput<RelationSchemasT[SelectedRelationNameT], VariantsT>,
): TraceRecording<
  SelectedRelationNameT,
  RelationSchemasT
>['computedRenderBeaconSpans'] {
  const renderSpansByBeacon = new Map<
    string,
    {
      firstStart: number
      firstContentfulRenderEnd: number | undefined
      firstLoadingEnd: number | undefined
      firstContentStart: number | undefined
      renderCount: number
      sumOfDurations: number
      lastRenderStartTime: number | undefined // Track the last render start time
    }
  >()

  const relatedToKey = Object.keys(input.relatedTo)

  // Group render spans by beacon and compute firstStart and lastEnd
  for (const entry of recordedItems) {
    if (
      entry.span.type !== 'component-render' &&
      entry.span.type !== 'component-render-start'
    ) {
      continue
    }
    const {
      name,
      startTime,
      duration,
      relatedTo: r,
      renderedOutput,
    } = entry.span

    const relatedTo = r as Record<string, unknown> | undefined
    const inputRelatedTo: Record<string, unknown> = input.relatedTo

    const relationMatch = relatedToKey.every(
      (key) =>
        relatedTo?.[key] === undefined ||
        inputRelatedTo[key] === relatedTo[key],
    )
    if (!relationMatch) continue

    const start = startTime.now
    const contentfulRenderEnd =
      entry.span.type === 'component-render' && renderedOutput === 'content'
        ? start + duration
        : undefined

    const spanTimes = renderSpansByBeacon.get(name)

    if (!spanTimes) {
      renderSpansByBeacon.set(name, {
        firstStart: start,
        firstContentfulRenderEnd: contentfulRenderEnd,
        renderCount: entry.span.type === 'component-render' ? 1 : 0,
        sumOfDurations: duration,
        firstContentStart: renderedOutput === 'content' ? start : undefined,
        firstLoadingEnd:
          entry.span.type === 'component-render' && renderedOutput === 'loading'
            ? start + duration
            : undefined,
        lastRenderStartTime:
          entry.span.type === 'component-render-start' ? start : undefined,
      })
    } else {
      spanTimes.firstStart = Math.min(spanTimes.firstStart, start)
      spanTimes.firstContentfulRenderEnd =
        contentfulRenderEnd && spanTimes.firstContentfulRenderEnd
          ? Math.min(spanTimes.firstContentfulRenderEnd, contentfulRenderEnd)
          : contentfulRenderEnd ?? spanTimes.firstContentfulRenderEnd

      if (entry.span.type === 'component-render') {
        spanTimes.renderCount += 1
        // React's concurrent rendering might pause and discard a render,
        // which would mean that an effect scheduled for that render does not execute because the render itself was not committed to the DOM.
        // we want to extend the the render span backwards, to first time that rendering was scheduled as the start time of rendering
        if (spanTimes.lastRenderStartTime !== undefined) {
          spanTimes.sumOfDurations +=
            start + duration - spanTimes.lastRenderStartTime
          spanTimes.lastRenderStartTime = undefined
        } else {
          spanTimes.sumOfDurations += duration
        }
      } else if (entry.span.type === 'component-render-start') {
        spanTimes.lastRenderStartTime = start
      }

      if (
        spanTimes.firstContentStart === undefined &&
        renderedOutput === 'content'
      ) {
        spanTimes.firstContentStart = start
      }
      if (
        spanTimes.firstLoadingEnd === undefined &&
        entry.span.type === 'component-render' &&
        renderedOutput === 'loading'
      ) {
        spanTimes.firstLoadingEnd = start + duration
      }
    }
  }

  const computedRenderBeaconSpans: TraceRecording<
    SelectedRelationNameT,
    RelationSchemasT
  >['computedRenderBeaconSpans'] = {}

  // Calculate duration and startOffset for each beacon
  for (const [beaconName, spanTimes] of renderSpansByBeacon) {
    if (!spanTimes.firstContentfulRenderEnd) continue
    computedRenderBeaconSpans[beaconName] = {
      startOffset: spanTimes.firstStart - input.startTime.now,
      firstRenderTillContent:
        spanTimes.firstContentfulRenderEnd - spanTimes.firstStart,
      firstRenderTillLoading: spanTimes.firstLoadingEnd
        ? spanTimes.firstLoadingEnd - spanTimes.firstStart
        : 0,
      firstRenderTillData: spanTimes.firstContentStart
        ? spanTimes.firstContentStart - spanTimes.firstStart
        : 0,
      renderCount: spanTimes.renderCount,
      sumOfRenderDurations: spanTimes.sumOfDurations,
    }
  }

  return computedRenderBeaconSpans
}

function isActiveTraceInput<
  SelectedRelationNameT extends keyof RelationSchemasT,
  RelationSchemasT,
  const VariantsT extends string,
>(
  input:
    | DraftTraceInput<RelationSchemasT[SelectedRelationNameT], VariantsT>
    | ActiveTraceInput<RelationSchemasT[SelectedRelationNameT], VariantsT>,
): input is ActiveTraceInput<
  RelationSchemasT[SelectedRelationNameT],
  VariantsT
> {
  return Boolean(input.relatedTo)
}

export function createTraceRecording<
  const SelectedRelationNameT extends keyof RelationSchemasT,
  const RelationSchemasT,
  const VariantsT extends string,
>(
  context: TraceContext<SelectedRelationNameT, RelationSchemasT, VariantsT>,
  {
    transitionFromState,
    interruptionReason,
    cpuIdleSpanAndAnnotation,
    completeSpanAndAnnotation,
    lastRequiredSpanAndAnnotation,
  }: FinalState<RelationSchemasT>,
): TraceRecording<SelectedRelationNameT, RelationSchemasT> {
  const { definition, recordedItems, input } = context
  const { id, relatedTo, variant } = input
  const { name } = definition
  // CODE CLEAN UP TODO: let's get this information (wasInterrupted) from up top (in FinalState)
  const wasInterrupted =
    interruptionReason && transitionFromState !== 'waiting-for-interactive'
  const computedSpans = !wasInterrupted ? getComputedSpans(context) : {}
  const computedValues = !wasInterrupted ? getComputedValues(context) : {}
  const computedRenderBeaconSpans =
    !wasInterrupted && isActiveTraceInput(input)
      ? getComputedRenderBeaconSpans(recordedItems, input)
      : {}

  const recordedItemsArray = [...recordedItems.values()]

  const anyNonSuppressedErrors = recordedItemsArray.some(
    (spanAndAnnotation) =>
      spanAndAnnotation.span.status === 'error' &&
      !definition.suppressErrorStatusPropagationOnSpans?.some((doesSpanMatch) =>
        doesSpanMatch(spanAndAnnotation, context),
      ),
  )

  const duration =
    completeSpanAndAnnotation?.annotation.operationRelativeEndTime ?? null
  const startTillInteractive =
    cpuIdleSpanAndAnnotation?.annotation.operationRelativeEndTime ?? null
  const startTillRequirementsMet =
    lastRequiredSpanAndAnnotation?.annotation.operationRelativeEndTime ?? null
  return {
    id,
    name,
    startTime: input.startTime,
    relatedTo,
    type: 'operation',
    duration,
    variant,
    additionalDurations: {
      startTillRequirementsMet,
      startTillInteractive,
      // last entry until the tti?
      completeTillInteractive:
        startTillInteractive && duration
          ? startTillInteractive - duration
          : null,
    },
    // ?: If we have any error entries then should we mark the status as 'error'
    status: wasInterrupted
      ? 'interrupted'
      : anyNonSuppressedErrors
      ? 'error'
      : 'ok',
    computedSpans,
    computedRenderBeaconSpans,
    computedValues,
    attributes: input.attributes ?? {},
    interruptionReason,
    entries: recordedItemsArray,
  }
}
