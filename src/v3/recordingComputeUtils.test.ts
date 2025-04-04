import { describe, expect, it, vitest as jest } from 'vitest'
import { getSpanSummaryAttributes } from './convertToRum'
import {
  createTraceRecording,
  getComputedSpans,
  getComputedValues,
} from './recordingComputeUtils'
import {
  createMockSpanAndAnnotation,
  createTimestamp,
} from './testUtility/createMockFactory'
import type { CompleteTraceDefinition } from './types'

interface AnyRelation {
  global: {}
}

const baseDefinitionFixture: CompleteTraceDefinition<
  'global',
  AnyRelation,
  'origin'
> = {
  name: 'test-trace',
  relationSchemaName: 'global',
  relationSchema: { global: {} },
  requiredSpans: [() => true],
  computedSpanDefinitions: {},
  computedValueDefinitions: {},
  variants: {
    origin: { timeout: 45_000 },
  },
}

describe('recordingComputeUtils', () => {
  describe('error status propagation', () => {
    it('should mark trace as error if any non-suppressed span has error status', () => {
      const recording = createTraceRecording(
        {
          definition: baseDefinitionFixture,
          recordedItems: new Set([
            createMockSpanAndAnnotation(100, {
              status: 'error',
              name: 'error-span',
            }),
            createMockSpanAndAnnotation(200, { status: 'ok', name: 'ok-span' }),
          ]),
          input: {
            id: 'test',
            startTime: createTimestamp(0),
            relatedTo: {},
            variant: 'origin',
          },
          recordedItemsByLabel: {},
        },
        { transitionFromState: 'active' },
      )

      expect(recording.status).toBe('error')
      expect(recording.additionalDurations.startTillInteractive).toBeNull()
      expect(recording.additionalDurations.completeTillInteractive).toBeNull()
      expect(recording.additionalDurations.startTillRequirementsMet).toBeNull()
    })

    it('should not mark trace as error if all error spans are suppressed', () => {
      const recording = createTraceRecording(
        {
          definition: {
            ...baseDefinitionFixture,
            suppressErrorStatusPropagationOnSpans: [
              ({ span }) => span.name === 'suppressed-error-span',
            ],
          },
          recordedItems: new Set([
            createMockSpanAndAnnotation(100, {
              status: 'error',
              name: 'suppressed-error-span',
            }),
            createMockSpanAndAnnotation(200, { status: 'ok', name: 'ok-span' }),
          ]),
          input: {
            id: 'test',
            startTime: createTimestamp(0),
            relatedTo: {},
            variant: 'origin',
          },
          recordedItemsByLabel: {},
        },
        { transitionFromState: 'active' },
      )

      expect(recording.status).toBe('ok')
      expect(recording.additionalDurations.startTillInteractive).toBeNull()
    })

    it('should mark trace as error if any error span is not suppressed', () => {
      const recording = createTraceRecording(
        {
          definition: {
            ...baseDefinitionFixture,
            suppressErrorStatusPropagationOnSpans: [
              ({ span }) => span.name === 'suppressed-error-span',
            ],
          },
          recordedItems: new Set([
            createMockSpanAndAnnotation(100, {
              status: 'error',
              name: 'suppressed-error-span',
            }),
            createMockSpanAndAnnotation(200, {
              status: 'error',
              name: 'non-suppressed-error-span',
            }),
            createMockSpanAndAnnotation(300, { status: 'ok', name: 'ok-span' }),
          ]),
          input: {
            id: 'test',
            startTime: createTimestamp(0),
            relatedTo: {},
            variant: 'origin',
          },
          recordedItemsByLabel: {},
        },
        { transitionFromState: 'active' },
      )

      expect(recording.status).toBe('error')
      expect(recording.additionalDurations.startTillInteractive).toBeNull()
    })

    it('should prioritize interrupted status over error status', () => {
      const recording = createTraceRecording(
        {
          definition: baseDefinitionFixture,
          recordedItems: new Set([
            createMockSpanAndAnnotation(100, {
              status: 'error',
              name: 'error-span',
            }),
          ]),
          input: {
            id: 'test',
            startTime: createTimestamp(0),
            relatedTo: {},
            variant: 'origin',
          },
          recordedItemsByLabel: {},
        },
        {
          transitionFromState: 'active',
          interruptionReason: 'timeout',
        },
      )

      expect(recording.status).toBe('interrupted')
      expect(recording.additionalDurations.startTillInteractive).toBeNull()
    })
  })

  describe('getComputedSpans', () => {
    const baseDefinition: CompleteTraceDefinition<
      'global',
      AnyRelation,
      'origin'
    > = {
      ...baseDefinitionFixture,
      computedSpanDefinitions: {
        'test-computed-span': {
          startSpan: ({ span }) => span.name === 'start-span',
          endSpan: ({ span }) => span.name === 'end-span',
        },
      },
    }

    it('should compute duration and startOffset correctly', () => {
      const result = getComputedSpans({
        definition: baseDefinition,
        recordedItems: new Set([
          createMockSpanAndAnnotation(100, {
            name: 'start-span',
            duration: 50,
          }),
          createMockSpanAndAnnotation(200, {
            name: 'end-span',
            duration: 50,
          }),
        ]),
        input: {
          id: 'test',
          startTime: createTimestamp(0),
          relatedTo: {},
          variant: 'origin',
        },
        recordedItemsByLabel: {},
      })

      expect(result['test-computed-span']).toEqual({
        duration: 150, // (200 + 50) - 100
        startOffset: 100,
      })
    })

    it('should handle operation-start and operation-end special matchers', () => {
      const definition: CompleteTraceDefinition<
        'global',
        AnyRelation,
        'origin'
      > = {
        ...baseDefinition,
        computedSpanDefinitions: {
          'operation-span': {
            startSpan: 'operation-start',
            endSpan: 'operation-end',
          },
        },
      }

      const markedCompleteSpan = createMockSpanAndAnnotation(200, {
        name: 'end-span',
      })
      markedCompleteSpan.annotation.markedComplete = true

      const result = getComputedSpans({
        definition,
        recordedItems: new Set([
          createMockSpanAndAnnotation(100, { name: 'start-span' }),
          markedCompleteSpan,
        ]),
        input: {
          id: 'test',
          startTime: createTimestamp(0),
          // eslint-disable-next-line @typescript-eslint/consistent-type-assertions
          relatedTo: {} as never,
          variant: 'origin',
        },
        recordedItemsByLabel: {},
      })

      expect(result['operation-span']).toBeDefined()
    })
  })

  describe('getComputedValues', () => {
    const baseDefinition: CompleteTraceDefinition<
      'global',
      AnyRelation,
      'origin'
    > = {
      ...baseDefinitionFixture,
      computedValueDefinitions: {
        'error-count': {
          matches: [({ span }) => span.status === 'error'],
          computeValueFromMatches: (matches) => matches.length,
        },
      },
    }

    it('should compute values based on matching spans', () => {
      const result = getComputedValues({
        definition: baseDefinition,
        recordedItems: new Set([
          createMockSpanAndAnnotation(100, { status: 'error' }),
          createMockSpanAndAnnotation(200, { status: 'error' }),
          createMockSpanAndAnnotation(300, { status: 'ok' }),
        ]),
        input: {
          id: 'test',
          startTime: createTimestamp(0),
          // eslint-disable-next-line @typescript-eslint/consistent-type-assertions
          relatedTo: {} as never,
          variant: 'origin',
        },
        recordedItemsByLabel: {},
      })

      expect(result['error-count']).toBe(2)
    })

    it('should handle multiple matches in computeValueFromMatches', () => {
      const definition: CompleteTraceDefinition<
        'global',
        AnyRelation,
        'origin'
      > = {
        ...baseDefinition,
        computedValueDefinitions: {
          'status-counts': {
            matches: [
              ({ span }) => span.status === 'error',
              ({ span }) => span.status === 'ok',
            ],
            computeValueFromMatches: (errors, oks) =>
              errors.length + oks.length,
          },
        },
      }

      const result = getComputedValues({
        definition,
        recordedItems: new Set([
          createMockSpanAndAnnotation(100, { status: 'error' }),
          createMockSpanAndAnnotation(200, { status: 'ok' }),
          createMockSpanAndAnnotation(300, { status: 'error' }),
        ]),
        input: {
          id: 'test',
          startTime: createTimestamp(0),
          // eslint-disable-next-line @typescript-eslint/consistent-type-assertions
          relatedTo: {} as never,
          variant: 'origin',
        },
        recordedItemsByLabel: {},
      })

      expect(result['status-counts']).toEqual(3)
    })
  })

  describe('getSpanSummaryAttributes', () => {
    it('should merge attributes from spans with the same name', () => {
      const result = getSpanSummaryAttributes([
        createMockSpanAndAnnotation(100, {
          name: 'test-span',
          attributes: { first: true },
        }),
        createMockSpanAndAnnotation(200, {
          name: 'test-span',
          attributes: { second: true },
        }),
      ])

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
          definition: baseDefinitionFixture,
          recordedItems: new Set([
            createMockSpanAndAnnotation(100, {
              name: 'test-component',
              type: 'component-render',
              relatedTo: {},
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
                relatedTo: {},
                duration: 50,
                isIdle: true,
                renderCount: 2,
                renderedOutput: 'content',
              },
              { occurrence: 2 },
            ),
          ]),
          input: {
            id: 'test',
            startTime: createTimestamp(0),
            relatedTo: {},
            variant: 'origin',
          },
          recordedItemsByLabel: {},
        },
        { transitionFromState: 'active' },
      )

      expect(recording.computedRenderBeaconSpans['test-component']).toEqual({
        startOffset: 100,
        firstRenderTillContent: 150,
        firstRenderTillLoading: 50,
        firstRenderTillData: 100,
        renderCount: 2,
        sumOfRenderDurations: 100,
      })
    })
  })

  describe('variant property', () => {
    it('should include the variant in the recording', () => {
      const recording = createTraceRecording(
        {
          definition: baseDefinitionFixture,
          recordedItems: new Set([
            createMockSpanAndAnnotation(100, {
              status: 'ok',
              name: 'test-span',
            }),
          ]),
          input: {
            id: 'test',
            startTime: createTimestamp(0),
            relatedTo: {},
            variant: 'origin',
          },
          recordedItemsByLabel: {},
        },
        { transitionFromState: 'active' },
      )

      // Verify the variant is included in the recording
      expect(recording.variant).toBe('origin')
    })
  })
})
