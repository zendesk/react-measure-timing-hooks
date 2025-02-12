import { describe, expect, it } from 'vitest'
import * as matchSpan from './matchSpan'
import type { SpanAnnotation } from './spanAnnotationTypes'
import type {
  ActiveTraceInput,
  ComponentRenderSpan,
  SpanBase,
} from './spanTypes'
import type {
  TicketIdRelationSchema,
  UserIdRelationSchema,
} from './testUtility/fixtures/relationSchemas'
import type { CompleteTraceDefinition, MapSchemaToTypes } from './types'

const mockRelations: MapSchemaToTypes<TicketIdRelationSchema> = {
  ticketId: '123',
}

const mockEntryBase = {
  type: 'element',
  name: 'testEntry',
  startTime: {
    now: Date.now(),
    epoch: Date.now(),
  },
  relatedTo: mockRelations,
  attributes: {
    attr1: 'value1',
    attr2: 2,
  },
  duration: 100,
  status: 'ok',
} as const satisfies SpanBase<TicketIdRelationSchema>

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
} as const satisfies SpanBase<TicketIdRelationSchema>

// Mock data for ComponentRenderTraceEntry
const mockComponentEntry: ComponentRenderSpan<TicketIdRelationSchema> = {
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
    relatedTo: mockRelations,
    startTime: {
      now: Date.now(),
      epoch: Date.now(),
    },
    variant: 'origin',
  } satisfies ActiveTraceInput<TicketIdRelationSchema, 'origin'>,
  definition: {
    name: 'test',
    type: 'operation',
    relations: ['ticketId'] as never,
    requiredSpans: [() => true],
    computedSpanDefinitions: [],
    computedValueDefinitions: [],
    variants: {
      origin: { timeout: 10_000 },
    },
  } satisfies CompleteTraceDefinition<
    ['ticketId'],
    TicketIdRelationSchema,
    'origin'
  >,
} as const

type MockOrigin = (typeof mockContext)['input']['variant']

// TESTING TODO: ask chatgpt to add 'or' and 'not' tests

describe('matchSpan', () => {
  describe('name', () => {
    it('should return true for a matching entry based on name', () => {
      const matcher = matchSpan.withName<
        [keyof TicketIdRelationSchema],
        TicketIdRelationSchema,
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
        [keyof TicketIdRelationSchema],
        TicketIdRelationSchema,
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
        [keyof TicketIdRelationSchema],
        TicketIdRelationSchema,
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
        [keyof TicketIdRelationSchema],
        TicketIdRelationSchema,
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
        [keyof TicketIdRelationSchema],
        TicketIdRelationSchema,
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
        [keyof TicketIdRelationSchema],
        TicketIdRelationSchema,
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
          [keyof TicketIdRelationSchema],
          TicketIdRelationSchema,
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
          [keyof TicketIdRelationSchema],
          TicketIdRelationSchema,
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
          [keyof TicketIdRelationSchema],
          TicketIdRelationSchema,
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
          [keyof TicketIdRelationSchema],
          TicketIdRelationSchema,
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
        [keyof TicketIdRelationSchema],
        TicketIdRelationSchema,
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
        [keyof TicketIdRelationSchema],
        TicketIdRelationSchema,
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
        [keyof TicketIdRelationSchema],
        TicketIdRelationSchema,
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
        [keyof TicketIdRelationSchema],
        TicketIdRelationSchema,
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
        [keyof TicketIdRelationSchema],
        TicketIdRelationSchema,
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
        [keyof TicketIdRelationSchema],
        TicketIdRelationSchema,
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
    it('should return true when relatedTo does match', () => {
      const matcher = matchSpan.withAllConditions<
        [keyof TicketIdRelationSchema],
        TicketIdRelationSchema,
        MockOrigin
      >(
        matchSpan.withName('testEntry'),
        matchSpan.withTraceRelations(['ticketId']),
      )
      const mockSpanAndAnnotation = {
        span: mockEntryBase,
        annotation: mockAnnotation,
      }
      expect(matcher(mockSpanAndAnnotation, mockContext)).toBe(true)
    })

    it('should return false when relatedTo does not match', () => {
      const matcher = matchSpan.withAllConditions<
        [keyof TicketIdRelationSchema] | [keyof UserIdRelationSchema],
        TicketIdRelationSchema | UserIdRelationSchema,
        MockOrigin
      >(
        matchSpan.withName('testEntry'),
        matchSpan.withTraceRelations(['ticketId', 'userId']),
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
            relatedTo: {
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
      [keyof TicketIdRelationSchema],
      TicketIdRelationSchema,
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
        [keyof TicketIdRelationSchema],
        TicketIdRelationSchema,
        MockOrigin
      >(
        matchSpan.withName('testEntry'),
        matchSpan.withPerformanceEntryName('testEntry'),
        matchSpan.withAttributes({ attr1: 'value1' }),
        matchSpan.withTraceRelations(['ticketId']),
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
        [keyof TicketIdRelationSchema],
        TicketIdRelationSchema,
        MockOrigin
      >(
        matchSpan.withName('testEntries'), // does not match
        matchSpan.withPerformanceEntryName('testEntry'),
        matchSpan.withAttributes({ attr1: 'value1' }),
        matchSpan.withTraceRelations(['ticketId']),
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
