import { describe, expect, it } from 'vitest'
import * as matchSpan from './matchSpan'
import type { SpanAnnotation } from './spanAnnotationTypes'
import type {
  ActiveTraceInput,
  ComponentRenderSpan,
  SpanBase,
} from './spanTypes'
import type { CompleteTraceDefinition } from './types'

// Mock data for TraceEntryBase
interface TicketScope {
  ticketId: string
}
interface UserScope {
  userId: string
}

const mockScope: TicketScope = {
  ticketId: '123',
}

const mockEntryBase = {
  type: 'element',
  name: 'testEntry',
  startTime: {
    now: Date.now(),
    epoch: Date.now(),
  },
  scope: mockScope,
  attributes: {
    attr1: 'value1',
    attr2: 2,
  },
  duration: 100,
  status: 'ok',
} as const satisfies SpanBase<TicketScope>

const mockPerformanceEntry = {
  ...mockEntryBase,
  performanceEntry: {
    entryType: 'element',
    name: 'testEntry',
    startTime: 0,
    duration: 0,
    toJSON: () => ({}),
    detail: () => ({}),
  },
} as const satisfies SpanBase<TicketScope>

// Mock data for ComponentRenderTraceEntry
const mockComponentEntry: ComponentRenderSpan<TicketScope> = {
  ...mockEntryBase,
  type: 'component-render',
  errorInfo: undefined,
  isIdle: true,
  renderedOutput: 'content',
  renderCount: 1,
}

const mockAnnotation: SpanAnnotation = {
  id: '',
  occurrence: 1,
  operationRelativeEndTime: 0,
  operationRelativeStartTime: 0,
  recordedInState: 'active',
  labels: [],
}

const mockContext = {
  input: {
    id: '123',
    scope: mockScope,
    startTime: {
      now: Date.now(),
      epoch: Date.now(),
    },
    variant: 'origin',
  } satisfies ActiveTraceInput<TicketScope, 'origin'>,
  definition: {
    name: 'test',
    type: 'operation',
    scopes: ['ticketId'] as never,
    requiredSpans: [() => true],
    computedSpanDefinitions: [],
    computedValueDefinitions: [],
    variants: {
      origin: { timeoutDuration: 10_000 },
    },
  } satisfies CompleteTraceDefinition<'ticketId', TicketScope, 'origin'>,
} as const

type MockOrigin = (typeof mockContext)['input']['variant']

// TESTING TODO: ask chatgpt to add 'or' and 'not' tests

describe('matchSpan', () => {
  describe('name', () => {
    it('should return true for a matching entry based on name', () => {
      const matcher = matchSpan.withName<
        keyof TicketScope,
        TicketScope,
        MockOrigin
      >('testEntry')
      const mockSpanAndAnnotation = {
        span: mockEntryBase,
        annotation: mockAnnotation,
      }
      expect(matcher(mockSpanAndAnnotation, mockContext)).toBe(true)
    })

    it('should return true for function matchers for name', () => {
      const matcher = matchSpan.withName<
        keyof TicketScope,
        TicketScope,
        MockOrigin
      >((n: string) => n.startsWith('test'))
      const mockSpanAndAnnotation = {
        span: mockEntryBase,
        annotation: mockAnnotation,
      }
      expect(matcher(mockSpanAndAnnotation, mockContext)).toBe(true)
    })

    it('should return true for regex matchers for name', () => {
      const matcher = matchSpan.withName<
        keyof TicketScope,
        TicketScope,
        MockOrigin
      >(/^test/)
      const mockSpanAndAnnotation = {
        span: mockEntryBase,
        annotation: mockAnnotation,
      }
      expect(matcher(mockSpanAndAnnotation, mockContext)).toBe(true)
    })

    it('should return false for a non-matching span based on name', () => {
      const matcher = matchSpan.withName<
        keyof TicketScope,
        TicketScope,
        MockOrigin
      >('nonMatchingEntry')
      const mockSpanAndAnnotation = {
        span: mockEntryBase,
        annotation: mockAnnotation,
      }
      expect(matcher(mockSpanAndAnnotation, mockContext)).toBe(false)
    })
  })

  describe('performanceEntryName', () => {
    it('should return true for a matching span based on performanceEntryName', () => {
      const matcher = matchSpan.withPerformanceEntryName<
        keyof TicketScope,
        TicketScope,
        MockOrigin
      >('testEntry')
      const mockSpanAndAnnotation = {
        span: mockPerformanceEntry,
        annotation: mockAnnotation,
      }
      expect(matcher(mockSpanAndAnnotation, mockContext)).toBe(true)
    })

    it('should return false for a non-matching performanceEntryName', () => {
      const matcher = matchSpan.withPerformanceEntryName<
        keyof TicketScope,
        TicketScope,
        MockOrigin
      >('nonMatchingEntry')
      const mockSpanAndAnnotation = {
        span: mockPerformanceEntry,
        annotation: mockAnnotation,
      }
      expect(matcher(mockSpanAndAnnotation, mockContext)).toBe(false)
    })
  })

  describe('type', () => {
    describe('for Native Performance Entry', () => {
      it('should return true for matching attributes', () => {
        const matcher = matchSpan.withType<
          keyof TicketScope,
          TicketScope,
          MockOrigin
        >('element')
        const mockSpanAndAnnotation = {
          span: mockEntryBase,
          annotation: mockAnnotation,
        }
        expect(matcher(mockSpanAndAnnotation, mockContext)).toBe(true)
      })

      it('should return false for non-matching attributes', () => {
        const matcher = matchSpan.withType<
          keyof TicketScope,
          TicketScope,
          MockOrigin
        >('component-render')
        const mockSpanAndAnnotation = {
          span: mockEntryBase,
          annotation: mockAnnotation,
        }
        expect(matcher(mockSpanAndAnnotation, mockContext)).toBe(false)
      })
    })

    describe('for ComponentRenderTraceEntry', () => {
      it('should return true for a matching ComponentRenderTraceEntry', () => {
        const matcher = matchSpan.withAllConditions<
          keyof TicketScope,
          TicketScope,
          MockOrigin
        >(
          matchSpan.withType('component-render'),
          matchSpan.withName('testEntry'),
        )
        const mockSpanAndAnnotation = {
          span: mockComponentEntry,
          annotation: mockAnnotation,
        }
        expect(matcher(mockSpanAndAnnotation, mockContext)).toBe(true)
      })

      it('should return false for a non-matching ComponentRenderTraceEntry', () => {
        const matcher = matchSpan.withAllConditions<
          keyof TicketScope,
          TicketScope,
          MockOrigin
        >(
          matchSpan.withType('component-render'),
          matchSpan.withName('nonMatchingEntry'),
        )
        const mockSpanAndAnnotation = {
          span: mockComponentEntry,
          annotation: mockAnnotation,
        }
        expect(matcher(mockSpanAndAnnotation, mockContext)).toBe(false)
      })
    })
  })

  describe('status', () => {
    it('should return true when status does match', () => {
      const matcher = matchSpan.withStatus<
        keyof TicketScope,
        TicketScope,
        MockOrigin
      >('ok')
      const mockSpanAndAnnotation = {
        span: mockEntryBase,
        annotation: mockAnnotation,
      }
      expect(matcher(mockSpanAndAnnotation, mockContext)).toBe(true)
    })

    it('should return false when status does not match', () => {
      const matcher = matchSpan.withStatus<
        keyof TicketScope,
        TicketScope,
        MockOrigin
      >('error')
      const mockSpanAndAnnotation = {
        span: mockEntryBase,
        annotation: mockAnnotation,
      }
      expect(matcher(mockSpanAndAnnotation, mockContext)).toBe(false)
    })
  })

  describe('occurrence', () => {
    it('should return true for occurrence matching', () => {
      const matcher = matchSpan.withAllConditions<
        keyof TicketScope,
        TicketScope,
        MockOrigin
      >(matchSpan.withName('testEntry'), matchSpan.withOccurrence(1))
      const mockSpanAndAnnotation = {
        span: mockEntryBase,
        annotation: mockAnnotation,
      }
      expect(matcher(mockSpanAndAnnotation, mockContext)).toBe(true)
    })

    it('should return false for non-matching occurrence', () => {
      const matcher = matchSpan.withAllConditions<
        keyof TicketScope,
        TicketScope,
        MockOrigin
      >(matchSpan.withName('testEntry'), matchSpan.withOccurrence(2))
      const mockSpanAndAnnotation = {
        span: mockEntryBase,
        annotation: mockAnnotation,
      }
      expect(matcher(mockSpanAndAnnotation, mockContext)).toBe(false)
    })
  })

  describe('attributes', () => {
    it('should return true for matching attributes', () => {
      const matcher = matchSpan.withAttributes<
        keyof TicketScope,
        TicketScope,
        MockOrigin
      >({
        attr1: 'value1',
      })
      const mockSpanAndAnnotation = {
        span: mockEntryBase,
        annotation: mockAnnotation,
      }
      expect(matcher(mockSpanAndAnnotation, mockContext)).toBe(true)
    })

    it('should return false for non-matching attributes', () => {
      const matcher = matchSpan.withAttributes<
        keyof TicketScope,
        TicketScope,
        MockOrigin
      >({
        attr1: 'wrongValue',
      })
      const mockSpanAndAnnotation = {
        span: mockEntryBase,
        annotation: mockAnnotation,
      }
      expect(matcher(mockSpanAndAnnotation, mockContext)).toBe(false)
    })
  })

  describe('scopeKeys', () => {
    it('should return true when scope does match', () => {
      const matcher = matchSpan.withAllConditions<
        'ticketId',
        TicketScope,
        MockOrigin
      >(
        matchSpan.withName('testEntry'),
        matchSpan.withMatchingScopes(['ticketId']),
      )
      const mockSpanAndAnnotation = {
        span: mockEntryBase,
        annotation: mockAnnotation,
      }
      expect(matcher(mockSpanAndAnnotation, mockContext)).toBe(true)
    })

    it('should return false when scope does not match', () => {
      const matcher = matchSpan.withAllConditions<
        'ticketId' | 'userId',
        TicketScope & UserScope,
        MockOrigin
      >(
        matchSpan.withName('testEntry'),
        matchSpan.withMatchingScopes(['ticketId', 'userId']),
      )
      const mockSpanAndAnnotation = {
        span: mockEntryBase,
        annotation: mockAnnotation,
      }
      expect(
        matcher(mockSpanAndAnnotation, {
          ...mockContext,
          input: {
            ...mockContext.input,
            scope: {
              ticketId: '123',
              userId: '123',
            },
          },
        }),
      ).toBe(false)
    })
  })

  describe('isIdle', () => {
    const mockMatcher = matchSpan.withAllConditions<
      keyof TicketScope,
      TicketScope,
      MockOrigin
    >(matchSpan.withName('testEntry'), matchSpan.whenIdle(true))

    it('should return true for isIdle matching', () => {
      const mockSpanAndAnnotation = {
        span: mockComponentEntry,
        annotation: mockAnnotation,
      }
      expect(mockMatcher(mockSpanAndAnnotation, mockContext)).toBe(true)
    })

    it('should return false for non-matching isIdle', () => {
      const mockEntry = { ...mockComponentEntry, isIdle: false }
      const mockSpanAndAnnotation = {
        span: mockEntry,
        annotation: mockAnnotation,
      }
      expect(mockMatcher(mockSpanAndAnnotation, mockContext)).toBe(false)
    })
  })

  describe('combination of conditions', () => {
    it('should return true when all conditions match', () => {
      const matcher = matchSpan.withAllConditions<
        'ticketId',
        TicketScope,
        MockOrigin
      >(
        matchSpan.withName('testEntry'),
        matchSpan.withPerformanceEntryName('testEntry'),
        matchSpan.withAttributes({ attr1: 'value1' }),
        matchSpan.withMatchingScopes(['ticketId']),
        matchSpan.withStatus('ok'),
        matchSpan.withType('element'),
      )
      const mockSpanAndAnnotation = {
        span: mockPerformanceEntry,
        annotation: mockAnnotation,
      }
      expect(matcher(mockSpanAndAnnotation, mockContext)).toBe(true)
    })

    it('should return false when all conditions match but name', () => {
      const matcher = matchSpan.withAllConditions<
        'ticketId',
        TicketScope,
        MockOrigin
      >(
        matchSpan.withName('testEntries'), // does not match
        matchSpan.withPerformanceEntryName('testEntry'),
        matchSpan.withAttributes({ attr1: 'value1' }),
        matchSpan.withMatchingScopes(['ticketId']),
        matchSpan.withStatus('ok'),
        matchSpan.withType('element'),
      )
      const mockSpanAndAnnotation = {
        span: mockPerformanceEntry,
        annotation: mockAnnotation,
      }
      expect(matcher(mockSpanAndAnnotation, mockContext)).toBe(false)
    })
  })
})
