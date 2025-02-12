import { describe, expect, it } from 'vitest'
import { convertTraceToRUM } from './convertToRum'
import { createTraceRecording } from './recordingComputeUtils'
import { ActiveTraceInput } from './spanTypes'
import {
  AnyScope,
  createMockSpanAndAnnotation,
  createTimestamp,
} from './testUtility/createMockFactory'
import type { CompleteTraceDefinition } from './types'

describe('convertTraceToRUM', () => {
  it('should round all numeric values in the trace recording', () => {
    const definition: CompleteTraceDefinition<never, AnyScope, 'origin'> = {
      name: 'test-trace',
      scopes: [],
      requiredSpans: [() => true],
      computedSpanDefinitions: [],
      computedValueDefinitions: [],
      variants: {
        origin: { timeout: 45_000 },
      },
    }

    const input: ActiveTraceInput<{}, 'origin'> = {
      id: 'test',
      startTime: createTimestamp(0),
      scope: {},
      variant: 'origin',
    }

    const traceRecording = createTraceRecording(
      {
        definition,
        recordedItems: [
          createMockSpanAndAnnotation(100.501, {
            name: 'test-component',
            type: 'component-render',
            scope: {},
            duration: 50.499,
            isIdle: false,
            renderCount: 1,
            renderedOutput: 'loading',
          }),
          createMockSpanAndAnnotation(
            200.001,
            {
              name: 'test-component',
              type: 'component-render',
              scope: {},
              duration: 50.999,
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
          variant: 'origin',
        },
      },
      { transitionFromState: 'active' },
    )

    const context = {
      definition,
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
      expect(embeddedSpan.spans[0]!.startOffset).toBe(101) // 100.501 rounded
      expect(embeddedSpan.spans[0]!.duration).toBe(50) // 50.499 rounded
      expect(embeddedSpan.spans[1]!.startOffset).toBe(200) // 200.001 rounded
      expect(embeddedSpan.spans[1]!.duration).toBe(51) // 50.999 rounded
    }
  })
})
