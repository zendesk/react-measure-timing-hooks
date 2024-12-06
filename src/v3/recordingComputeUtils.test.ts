import {
  createTraceRecording,
  getComputedSpans,
  getComputedValues,
  getSpanSummaryAttributes,
} from './recordingComputeUtils'
import type { SpanAndAnnotation, SpanAnnotation } from './spanAnnotationTypes'
import type { Span } from './spanTypes'
import type { CompleteTraceDefinition, ScopeBase, Timestamp } from './types'

describe('recordingComputeUtils', () => {
  const EPOCH_START = 1_000
  const createTimestamp = (now: number): Timestamp => ({
    epoch: EPOCH_START + now,
    now,
  })

  const createAnnotation = (
    span: Span<ScopeBase>,
    traceStartTime: Timestamp,
    partial: Partial<SpanAnnotation> = {},
  ): SpanAnnotation => ({
    id: 'test-id',
    operationRelativeStartTime: span.startTime.now - traceStartTime.now,
    operationRelativeEndTime:
      span.startTime.now + span.duration - traceStartTime.now,
    occurrence: 1,
    recordedInState: 'recording',
    ...partial,
  })

  const createMockSpan = <TSpan extends Span<ScopeBase>>(
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

  const createMockSpanAndAnnotation = <TSpan extends Span<ScopeBase>>(
    startTimeNow: number,
    spanPartial: Partial<TSpan> = {},
    annotationPartial: Partial<SpanAnnotation> = {},
  ): SpanAndAnnotation<ScopeBase> => {
    const span = createMockSpan<TSpan>(startTimeNow, spanPartial)
    return {
      span,
      annotation: createAnnotation(span, createTimestamp(0), annotationPartial),
    }
  }

  const onEnd = jest.fn()

  describe('error status propagation', () => {
    const baseDefinition: CompleteTraceDefinition<ScopeBase> = {
      name: 'test-trace',
      requiredScopeKeys: [],
      requiredToEnd: [() => true],
      computedSpanDefinitions: [],
      computedValueDefinitions: [],
    }

    it('should mark trace as error if any non-suppressed span has error status', () => {
      const recording = createTraceRecording(
        {
          definition: baseDefinition,
          recordedItems: [
            createMockSpanAndAnnotation(100, {
              status: 'error',
              name: 'error-span',
            }),
            createMockSpanAndAnnotation(200, { status: 'ok', name: 'ok-span' }),
          ],
          input: {
            id: 'test',
            startTime: createTimestamp(0),
            scope: {},
            onEnd,
          },
        },
        { transitionFromState: 'recording' },
      )

      expect(recording.status).toBe('error')
    })

    it('should not mark trace as error if all error spans are suppressed', () => {
      const recording = createTraceRecording(
        {
          definition: {
            ...baseDefinition,
            suppressErrorStatusPropagationOn: [
              ({ span }) => span.name === 'suppressed-error-span',
            ],
          },
          recordedItems: [
            createMockSpanAndAnnotation(100, {
              status: 'error',
              name: 'suppressed-error-span',
            }),
            createMockSpanAndAnnotation(200, { status: 'ok', name: 'ok-span' }),
          ],
          input: {
            id: 'test',
            startTime: createTimestamp(0),
            scope: {},
            onEnd,
          },
        },
        { transitionFromState: 'recording' },
      )

      expect(recording.status).toBe('ok')
    })

    it('should mark trace as error if any error span is not suppressed', () => {
      const recording = createTraceRecording(
        {
          definition: {
            ...baseDefinition,
            suppressErrorStatusPropagationOn: [
              ({ span }) => span.name === 'suppressed-error-span',
            ],
          },
          recordedItems: [
            createMockSpanAndAnnotation(100, {
              status: 'error',
              name: 'suppressed-error-span',
            }),
            createMockSpanAndAnnotation(200, {
              status: 'error',
              name: 'non-suppressed-error-span',
            }),
            createMockSpanAndAnnotation(300, { status: 'ok', name: 'ok-span' }),
          ],
          input: {
            id: 'test',
            startTime: createTimestamp(0),
            scope: {},
            onEnd,
          },
        },
        { transitionFromState: 'recording' },
      )

      expect(recording.status).toBe('error')
    })

    it('should prioritize interrupted status over error status', () => {
      const recording = createTraceRecording(
        {
          definition: baseDefinition,
          recordedItems: [
            createMockSpanAndAnnotation(100, {
              status: 'error',
              name: 'error-span',
            }),
          ],
          input: {
            id: 'test',
            startTime: createTimestamp(0),
            scope: {},
            onEnd,
          },
        },
        {
          transitionFromState: 'recording',
          interruptionReason: 'timeout',
        },
      )

      expect(recording.status).toBe('interrupted')
    })
  })

  describe('getComputedSpans', () => {
    const baseDefinition: CompleteTraceDefinition<ScopeBase> = {
      name: 'test-trace',
      requiredScopeKeys: [],
      requiredToEnd: [() => true],
      computedSpanDefinitions: [
        {
          name: 'test-computed-span',
          startSpan: ({ span }) => span.name === 'start-span',
          endSpan: ({ span }) => span.name === 'end-span',
        },
      ],
      computedValueDefinitions: [],
    }

    it('should compute duration and startOffset correctly', () => {
      const result = getComputedSpans({
        definition: baseDefinition,
        recordedItems: [
          createMockSpanAndAnnotation(100, {
            name: 'start-span',
            duration: 50,
          }),
          createMockSpanAndAnnotation(200, {
            name: 'end-span',
            duration: 50,
          }),
        ],
        input: { id: 'test', startTime: createTimestamp(0), scope: {}, onEnd },
      })

      expect(result['test-computed-span']).toEqual({
        duration: 150, // (200 + 50) - 100
        startOffset: 100,
      })
    })

    it('should handle operation-start and operation-end special matchers', () => {
      const definition: CompleteTraceDefinition<ScopeBase> = {
        ...baseDefinition,
        computedSpanDefinitions: [
          {
            name: 'operation-span',
            startSpan: 'operation-start',
            endSpan: 'operation-end',
          },
        ],
      }

      const markedCompleteSpan = createMockSpanAndAnnotation(200, {
        name: 'end-span',
      })
      markedCompleteSpan.annotation.markedComplete = true

      const result = getComputedSpans({
        definition,
        recordedItems: [
          createMockSpanAndAnnotation(100, { name: 'start-span' }),
          markedCompleteSpan,
        ],
        input: { id: 'test', startTime: createTimestamp(0), scope: {}, onEnd },
      })

      expect(result['operation-span']).toBeDefined()
    })
  })

  describe('getComputedValues', () => {
    const baseDefinition: CompleteTraceDefinition<ScopeBase> = {
      name: 'test-trace',
      requiredScopeKeys: [],
      requiredToEnd: [() => true],
      computedSpanDefinitions: [],
      computedValueDefinitions: [
        {
          name: 'error-count',
          matches: [({ span }) => span.status === 'error'],
          computeValueFromMatches: (matches) => matches.length,
        },
      ],
    }

    it('should compute values based on matching spans', () => {
      const result = getComputedValues({
        definition: baseDefinition,
        recordedItems: [
          createMockSpanAndAnnotation(100, { status: 'error' }),
          createMockSpanAndAnnotation(200, { status: 'error' }),
          createMockSpanAndAnnotation(300, { status: 'ok' }),
        ],
        input: { id: 'test', startTime: createTimestamp(0), scope: {}, onEnd },
      })

      expect(result['error-count']).toBe(2)
    })
  })

  describe('getSpanSummaryAttributes', () => {
    it('should merge attributes from spans with the same name', () => {
      const result = getSpanSummaryAttributes({
        definition: {
          name: 'test-trace',
          requiredScopeKeys: [],
          requiredToEnd: [() => true],
          computedSpanDefinitions: [],
          computedValueDefinitions: [],
        },
        recordedItems: [
          createMockSpanAndAnnotation(100, {
            name: 'test-span',
            attributes: { first: true },
          }),
          createMockSpanAndAnnotation(200, {
            name: 'test-span',
            attributes: { second: true },
          }),
        ],
        input: { id: 'test', startTime: createTimestamp(0), scope: {}, onEnd },
      })

      expect(result['test-span']).toEqual({
        first: true,
        second: true,
      })
    })
  })

  describe('computedRenderBeaconSpans', () => {
    it('should compute render beacon metrics correctly', () => {
      const recording = createTraceRecording(
        {
          definition: {
            name: 'test-trace',
            requiredScopeKeys: [],
            requiredToEnd: [() => true],
            computedSpanDefinitions: [],
            computedValueDefinitions: [],
          },
          recordedItems: [
            createMockSpanAndAnnotation(100, {
              name: 'test-component',
              type: 'component-render',
              scope: {},
              duration: 50,
              isIdle: true,
              renderCount: 1,
              renderedOutput: 'loading',
            }),
            createMockSpanAndAnnotation(
              200,
              {
                name: 'test-component',
                type: 'component-render',
                scope: {},
                duration: 50,
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
            scope: {},
            onEnd,
          },
        },
        { transitionFromState: 'recording' },
      )

      expect(recording.computedRenderBeaconSpans['test-component']).toEqual({
        startOffset: 100,
        timeToContent: 150,
        timeToLoading: 50,
        timeToData: 100,
        renderCount: 2,
        sumOfDurations: 100,
      })
    })
  })
})
