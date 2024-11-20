import * as matchSpan from './matchSpan'
import type { SpanAnnotation } from './spanAnnotationTypes'
import type { ComponentRenderSpan, SpanBase } from './spanTypes'
import type { ScopeBase } from './types'

// Mock data for TraceEntryBase
interface TestScopeT extends ScopeBase {
  ticketId: string
}

const mockScope: TestScopeT = {
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
} as const satisfies SpanBase<TestScopeT>

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
} as const satisfies SpanBase<TestScopeT>

// Mock data for ComponentRenderTraceEntry
const mockComponentEntry: ComponentRenderSpan<TestScopeT> = {
  ...mockEntryBase,
  type: 'component-render',
  errorInfo: undefined,
  isIdle: true,
  renderedOutput: 'content',
  renderCount: 1
}

const mockAnnotation: SpanAnnotation = {
  id: '',
  occurrence: 1,
  operationRelativeEndTime: 0,
  operationRelativeStartTime: 0,
  recordedInState: 'recording',
}

// TESTING TODO: ask chatgpt to add 'or' and 'not' tests

describe('doesEntryMatchDefinition', () => {
  describe('name', () => {
    it('should return true for a matching entry based on name', () => {
      const matcher = matchSpan.withName('testEntry')
      const mockSpanAndAnnotation = {
        span: mockEntryBase,
        annotation: mockAnnotation,
      }
      expect(matcher(mockSpanAndAnnotation, mockScope)).toBe(true)
    })

    it('should return true for function matchers for name', () => {
      const matcher = matchSpan.withName((n: string) => n.startsWith('test'))
      const mockSpanAndAnnotation = {
        span: mockEntryBase,
        annotation: mockAnnotation,
      }
      expect(matcher(mockSpanAndAnnotation, mockScope)).toBe(true)
    })

    it('should return true for regex matchers for name', () => {
      const matcher = matchSpan.withName(/^test/)
      const mockSpanAndAnnotation = {
        span: mockEntryBase,
        annotation: mockAnnotation,
      }
      expect(matcher(mockSpanAndAnnotation, mockScope)).toBe(true)
    })

    it('should return false for a non-matching span based on name', () => {
      const matcher = matchSpan.withName('nonMatchingEntry')
      const mockSpanAndAnnotation = {
        span: mockEntryBase,
        annotation: mockAnnotation,
      }
      expect(matcher(mockSpanAndAnnotation, mockScope)).toBe(false)
    })
  })

  describe('performanceEntryName', () => {
    it('should return true for a matching span based on performanceEntryName', () => {
      const matcher = matchSpan.withPerformanceEntryName('testEntry')
      const mockSpanAndAnnotation = {
        span: mockPerformanceEntry,
        annotation: mockAnnotation,
      }
      expect(matcher(mockSpanAndAnnotation, mockScope)).toBe(true)
    })

    it('should return false for a non-matching performanceEntryName', () => {
      const matcher = matchSpan.withPerformanceEntryName('nonMatchingEntry')
      const mockSpanAndAnnotation = {
        span: mockPerformanceEntry,
        annotation: mockAnnotation,
      }
      expect(matcher(mockSpanAndAnnotation, mockScope)).toBe(false)
    })
  })

  describe('type', () => {
    describe('for Native Performance Entry', () => {
      it('should return true for matching attributes', () => {
        const matcher = matchSpan.withType('element')
        const mockSpanAndAnnotation = {
          span: mockEntryBase,
          annotation: mockAnnotation,
        }
        expect(matcher(mockSpanAndAnnotation, mockScope)).toBe(true)
      })

      it('should return false for non-matching attributes', () => {
        const matcher = matchSpan.withType('component-render')
        const mockSpanAndAnnotation = {
          span: mockEntryBase,
          annotation: mockAnnotation,
        }
        expect(matcher(mockSpanAndAnnotation, mockScope)).toBe(false)
      })
    })

    describe('for ComponentRenderTraceEntry', () => {
      it('should return true for a matching ComponentRenderTraceEntry', () => {
        const matcher = matchSpan.withAllConditions(
          matchSpan.withType('component-render'),
          matchSpan.withName('testEntry'),
        )
        const mockSpanAndAnnotation = {
          span: mockComponentEntry,
          annotation: mockAnnotation,
        }
        expect(matcher(mockSpanAndAnnotation, mockScope)).toBe(true)
      })

      it('should return false for a non-matching ComponentRenderTraceEntry', () => {
        const matcher = matchSpan.withAllConditions(
          matchSpan.withType('component-render'),
          matchSpan.withName('nonMatchingEntry'),
        )
        const mockSpanAndAnnotation = {
          span: mockComponentEntry,
          annotation: mockAnnotation,
        }
        expect(matcher(mockSpanAndAnnotation, mockScope)).toBe(false)
      })
    })
  })

  describe('status', () => {
    it('should return true when status does match', () => {
      const matcher = matchSpan.withStatus('ok')
      const mockSpanAndAnnotation = {
        span: mockEntryBase,
        annotation: mockAnnotation,
      }
      expect(matcher(mockSpanAndAnnotation, mockScope)).toBe(true)
    })

    it('should return false when status does not match', () => {
      const matcher = matchSpan.withStatus('error')
      const mockSpanAndAnnotation = {
        span: mockEntryBase,
        annotation: mockAnnotation,
      }
      expect(matcher(mockSpanAndAnnotation, mockScope)).toBe(false)
    })
  })

  describe('occurrence', () => {
    it('should return true for occurrence matching', () => {
      const matcher = matchSpan.withAllConditions(
        matchSpan.withName('testEntry'),
        matchSpan.withOccurrence(1),
      )
      const mockSpanAndAnnotation = {
        span: mockEntryBase,
        annotation: mockAnnotation,
      }
      expect(matcher(mockSpanAndAnnotation, mockScope)).toBe(true)
    })

    it('should return false for non-matching occurrence', () => {
      const matcher = matchSpan.withAllConditions(
        matchSpan.withName('testEntry'),
        matchSpan.withOccurrence(2),
      )
      const mockSpanAndAnnotation = {
        span: mockEntryBase,
        annotation: mockAnnotation,
      }
      expect(matcher(mockSpanAndAnnotation, mockScope)).toBe(false)
    })
  })

  describe('attributes', () => {
    it('should return true for matching attributes', () => {
      const matcher = matchSpan.withAttributes({ attr1: 'value1' })
      const mockSpanAndAnnotation = {
        span: mockEntryBase,
        annotation: mockAnnotation,
      }
      expect(matcher(mockSpanAndAnnotation, mockScope)).toBe(true)
    })

    it('should return false for non-matching attributes', () => {
      const matcher = matchSpan.withAttributes({ attr1: 'wrongValue' })
      const mockSpanAndAnnotation = {
        span: mockEntryBase,
        annotation: mockAnnotation,
      }
      expect(matcher(mockSpanAndAnnotation, mockScope)).toBe(false)
    })
  })

  describe('scopeKeys', () => {
    it('should return true when scope does match', () => {
      const matcher = matchSpan.withAllConditions(
        matchSpan.withName('testEntry'),
        matchSpan.withMatchingScopes(['ticketId']),
      )
      const mockSpanAndAnnotation = {
        span: mockEntryBase,
        annotation: mockAnnotation,
      }
      expect(matcher(mockSpanAndAnnotation, mockScope)).toBe(true)
    })

    it('should return false when scope does not match', () => {
      const scope = {
        ticketId: '123',
        userId: '123',
      }
      const matcher = matchSpan.withAllConditions(
        matchSpan.withName('testEntry'),
        matchSpan.withMatchingScopes(['ticketId', 'userId']),
      )
      const mockSpanAndAnnotation = {
        span: mockEntryBase,
        annotation: mockAnnotation,
      }
      expect(matcher(mockSpanAndAnnotation, scope)).toBe(false)
    })
  })

  describe('isIdle', () => {
    const mockMatcher = matchSpan.withAllConditions(
      matchSpan.withName('testEntry'),
      matchSpan.whenIdle(true),
    )

    it('should return true for isIdle matching', () => {
      const mockSpanAndAnnotation = {
        span: mockComponentEntry,
        annotation: mockAnnotation,
      }
      expect(mockMatcher(mockSpanAndAnnotation, mockScope)).toBe(true)
    })

    it('should return false for non-matching isIdle', () => {
      const mockEntry = { ...mockComponentEntry, isIdle: false }
      const mockSpanAndAnnotation = {
        span: mockEntry,
        annotation: mockAnnotation,
      }
      expect(mockMatcher(mockSpanAndAnnotation, mockScope)).toBe(false)
    })
  })

  describe('combination of conditions', () => {
    it('should return true when all conditions match', () => {
      const matcher = matchSpan.withAllConditions(
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
      expect(matcher(mockSpanAndAnnotation, mockScope)).toBe(true)
    })

    it('should return false when all conditions match but name', () => {
      const matcher = matchSpan.withAllConditions(
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
      expect(matcher(mockSpanAndAnnotation, mockScope)).toBe(false)
    })
  })
})
