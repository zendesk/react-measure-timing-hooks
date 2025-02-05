import { describe, expect, it } from 'vitest'
import { convertTraceToRUM } from './convertToRum'
import { createTraceRecording } from './recordingComputeUtils'
import { SpanAndAnnotation, SpanAnnotation } from './spanAnnotationTypes'
import { ActiveTraceInput, Span } from './spanTypes'
import type { CompleteTraceDefinition, Timestamp } from './types'

describe('convertTraceToRUM', () => {
  const EPOCH_START = 1_000
  const createTimestamp = (now: number): Timestamp => ({
    epoch: EPOCH_START + now,
    now,
  })

  type AnyScope = Record<string, unknown>

  const createAnnotation = (
    span: Span<AnyScope>,
    traceStartTime: Timestamp,
    partial: Partial<SpanAnnotation> = {},
  ): SpanAnnotation => ({
    id: 'test-id',
    operationRelativeStartTime: span.startTime.now - traceStartTime.now,
    operationRelativeEndTime:
      span.startTime.now + span.duration - traceStartTime.now,
    occurrence: 1,
    recordedInState: 'active',
    labels: [],
    ...partial,
  })

  const createMockSpan = <TSpan extends Span<AnyScope>>(
    startTimeNow: number,
    partial: Partial<TSpan>,
  ): TSpan =>
    (partial.type === 'component-render'
      ? {
          name: 'test-component',
          type: 'component-render',
          scope: {},
          startTime: createTimestamp(startTimeNow),
          duration: 100,
          attributes: {},
          isIdle: true,
          renderCount: 1,
          renderedOutput: 'content',
          ...partial,
        }
      : {
          name: 'test-span',
          type: 'mark',
          startTime: createTimestamp(startTimeNow),
          duration: 100,
          attributes: {},
          ...partial,
        }) as TSpan

  const createMockSpanAndAnnotation = <TSpan extends Span<AnyScope>>(
    startTimeNow: number,
    spanPartial: Partial<TSpan> = {},
    annotationPartial: Partial<SpanAnnotation> = {},
  ): SpanAndAnnotation<AnyScope> => {
    const span = createMockSpan<TSpan>(startTimeNow, spanPartial)
    return {
      span,
      annotation: createAnnotation(span, createTimestamp(0), annotationPartial),
    }
  }

  it('should round all numeric values in the trace recording', () => {
    const baseDefinition: CompleteTraceDefinition<never, AnyScope, 'origin'> = {
      name: 'test-trace',
      scopes: [],
      requiredSpans: [() => true],
      computedSpanDefinitions: [],
      computedValueDefinitions: [],
      variantsByOriginatedFrom: {
        origin: { timeoutDuration: 45_000 },
      },
    }

    const input: ActiveTraceInput<{}, 'origin'> = {
      id: 'test',
      startTime: createTimestamp(0),
      scope: {},
      originatedFrom: 'origin',
    }

    const traceRecording = createTraceRecording(
      {
        definition: baseDefinition,
        recordedItems: [
          createMockSpanAndAnnotation(100.545, {
            name: 'test-component',
            type: 'component-render',
            scope: {},
            duration: 50.424,
            isIdle: false,
            renderCount: 1,
            renderedOutput: 'loading',
          }),
          createMockSpanAndAnnotation(
            200.223,
            {
              name: 'test-component',
              type: 'component-render',
              scope: {},
              duration: 50.545,
              isIdle: true,
              renderCount: 2,
              renderedOutput: 'content',
            },
            { occurrence: 2 },
          ),
        ],
        input: {
          id: 'test',
          startTime: createTimestamp(0),
          scope: { ticketId: '74' },
          originatedFrom: 'origin',
        },
      },
      { transitionFromState: 'active' },
    )

    const context = {
      definition: baseDefinition,
      input,
    }

    const result = convertTraceToRUM(traceRecording, context)

    // Check rounded values in embeddedSpans
    const embeddedSpan = result.embeddedSpans['component-render|test-component']
    if (embeddedSpan) {
      expect(Number.isInteger(embeddedSpan.totalDuration)).toBe(true)
      expect(Number.isInteger(embeddedSpan.spans[0]!.startOffset)).toBe(true)
      expect(Number.isInteger(embeddedSpan.spans[0]!.duration)).toBe(true)
      expect(Number.isInteger(embeddedSpan.spans[1]!.startOffset)).toBe(true)
      expect(Number.isInteger(embeddedSpan.spans[1]!.duration)).toBe(true)

      // Check specific rounded values
      expect(embeddedSpan.spans[0]!.startOffset).toBe(101) // 100.545 rounded
      expect(embeddedSpan.spans[0]!.duration).toBe(50) // 50.424 rounded
      expect(embeddedSpan.spans[1]!.startOffset).toBe(200) // 200.223 rounded
      expect(embeddedSpan.spans[1]!.duration).toBe(51) // 50.545 rounded
    }
  })
})
