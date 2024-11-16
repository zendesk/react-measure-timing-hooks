import {
  all,
  attributes,
  doesEntryMatchDefinition,
  isIdle,
  name,
  not,
  occurrence,
  performanceEntryName,
  scopeKeys,
  some,
  status,
  type,
} from './doesEntryMatchDefinition'
import type { SpanAnnotation } from './spanAnnotationTypes'
import type { ComponentRenderSpan, Span, SpanBase } from './spanTypes'
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
}

const mockAnnotation: SpanAnnotation = {
  id: '',
  occurrence: 1,
  operationRelativeEndTime: 0,
  operationRelativeStartTime: 0,
  recordedInState: 'recording',
}

describe('doesEntryMatchDefinition', () => {
  describe('name', () => {
    it('should return true for a matching entry based on name', () => {
      const matcher = name('testEntry')
      const mockSpanAndAnnotation = {
        span: mockEntryBase,
        annotation: mockAnnotation,
      }
      expect(
        doesEntryMatchDefinition(mockSpanAndAnnotation, matcher, mockScope),
      ).toBe(true)
    })

    it('should return true for function matchers for name', () => {
      const matcher = name((n: string) => n.startsWith('test'))
      const mockSpanAndAnnotation = {
        span: mockEntryBase,
        annotation: mockAnnotation,
      }
      expect(
        doesEntryMatchDefinition(mockSpanAndAnnotation, matcher, mockScope),
      ).toBe(true)
    })

    it('should return true for regex matchers for name', () => {
      const matcher = name(/^test/)
      const mockSpanAndAnnotation = {
        span: mockEntryBase,
        annotation: mockAnnotation,
      }
      expect(
        doesEntryMatchDefinition(mockSpanAndAnnotation, matcher, mockScope),
      ).toBe(true)
    })

    it('should return false for a non-matching span based on name', () => {
      const matcher = name('nonMatchingEntry')
      const mockSpanAndAnnotation = {
        span: mockEntryBase,
        annotation: mockAnnotation,
      }
      expect(
        doesEntryMatchDefinition(mockSpanAndAnnotation, matcher, mockScope),
      ).toBe(false)
    })
  })

  describe('performanceEntryName', () => {
    it('should return true for a matching span based on performanceEntryName', () => {
      const matcher = performanceEntryName('testEntry')
      const mockSpanAndAnnotation = {
        span: mockPerformanceEntry,
        annotation: mockAnnotation,
      }
      expect(
        doesEntryMatchDefinition(mockSpanAndAnnotation, matcher, mockScope),
      ).toBe(true)
    })

    it('should return false for a non-matching performanceEntryName', () => {
      const matcher = performanceEntryName('nonMatchingEntry')
      const mockSpanAndAnnotation = {
        span: mockPerformanceEntry,
        annotation: mockAnnotation,
      }
      expect(
        doesEntryMatchDefinition(mockSpanAndAnnotation, matcher, mockScope),
      ).toBe(false)
    })
  })

  describe('type', () => {
    describe('for Native Performance Entry', () => {
      it('should return true for matching attributes', () => {
        const matcher = type('element')
        const mockSpanAndAnnotation = {
          span: mockEntryBase,
          annotation: mockAnnotation,
        }
        expect(
          doesEntryMatchDefinition(mockSpanAndAnnotation, matcher, mockScope),
        ).toBe(true)
      })

      it('should return false for non-matching attributes', () => {
        const matcher = type('component-render')
        const mockSpanAndAnnotation = {
          span: mockEntryBase,
          annotation: mockAnnotation,
        }
        expect(
          doesEntryMatchDefinition(mockSpanAndAnnotation, matcher, mockScope),
        ).toBe(false)
      })
    })

    describe('for ComponentRenderTraceEntry', () => {
      it('should return true for a matching ComponentRenderTraceEntry', () => {
        const matcher = all(type('component-render'), name('testEntry'))
        const mockSpanAndAnnotation = {
          span: mockComponentEntry,
          annotation: mockAnnotation,
        }
        expect(
          doesEntryMatchDefinition(mockSpanAndAnnotation, matcher, mockScope),
        ).toBe(true)
      })

      it('should return false for a non-matching ComponentRenderTraceEntry', () => {
        const matcher = all(type('component-render'), name('nonMatchingEntry'))
        const mockSpanAndAnnotation = {
          span: mockComponentEntry,
          annotation: mockAnnotation,
        }
        expect(
          doesEntryMatchDefinition(mockSpanAndAnnotation, matcher, mockScope),
        ).toBe(false)
      })
    })
  })

  describe('status', () => {
    it('should return true when status does match', () => {
      const matcher = status('ok')
      const mockSpanAndAnnotation = {
        span: mockEntryBase,
        annotation: mockAnnotation,
      }
      expect(
        doesEntryMatchDefinition(mockSpanAndAnnotation, matcher, mockScope),
      ).toBe(true)
    })

    it('should return false when status does not match', () => {
      const matcher = status('error')
      const mockSpanAndAnnotation = {
        span: mockEntryBase,
        annotation: mockAnnotation,
      }
      expect(
        doesEntryMatchDefinition(mockSpanAndAnnotation, matcher, mockScope),
      ).toBe(false)
    })
  })

  describe('occurrence', () => {
    it('should return true for occurrence matching', () => {
      const matcher = all(name('testEntry'), occurrence(1))
      const mockSpanAndAnnotation = {
        span: mockEntryBase,
        annotation: mockAnnotation,
      }
      // Assuming occurrence logic is implemented in the function
      expect(
        doesEntryMatchDefinition(mockSpanAndAnnotation, matcher, mockScope),
      ).toBe(true)
    })

    it('should return false for non-matching occurrence', () => {
      const matcher = all(name('testEntry'), occurrence(2))
      const mockSpanAndAnnotation = {
        span: mockEntryBase,
        annotation: mockAnnotation,
      }
      // Assuming occurrence logic is implemented in the function
      expect(
        doesEntryMatchDefinition(mockSpanAndAnnotation, matcher, mockScope),
      ).toBe(false)
    })
  })

  describe('attributes', () => {
    it('should return true for matching attributes', () => {
      const matcher = attributes({ attr1: 'value1' })
      const mockSpanAndAnnotation = {
        span: mockEntryBase,
        annotation: mockAnnotation,
      }
      expect(
        doesEntryMatchDefinition(mockSpanAndAnnotation, matcher, mockScope),
      ).toBe(true)
    })

    it('should return false for non-matching attributes', () => {
      const matcher = attributes({ attr1: 'wrongValue' })
      const mockSpanAndAnnotation = {
        span: mockEntryBase,
        annotation: mockAnnotation,
      }
      expect(
        doesEntryMatchDefinition(mockSpanAndAnnotation, matcher, mockScope),
      ).toBe(false)
    })
  })

  describe('scopeKeys', () => {
    it('should return true when scope does match', () => {
      const matcher = all(name('testEntry'), scopeKeys(['ticketId']))
      const mockSpanAndAnnotation = {
        span: mockEntryBase,
        annotation: mockAnnotation,
      }
      expect(
        doesEntryMatchDefinition(mockSpanAndAnnotation, matcher, mockScope),
      ).toBe(true)
    })

    it('should return false when scope does not match', () => {
      const scope = {
        ticketId: '123',
        userId: '123',
      }
      const matcher = all(name('testEntry'), scopeKeys(['ticketId', 'userId']))
      const mockSpanAndAnnotation = {
        span: mockEntryBase,
        annotation: mockAnnotation,
      }
      expect(
        doesEntryMatchDefinition(mockSpanAndAnnotation, matcher, scope),
      ).toBe(false)
    })
  })

  describe('isIdle', () => {
    const mockMatcher = all(name('testEntry'), isIdle(true))

    it('should return true for isIdle matching', () => {
      const mockSpanAndAnnotation = {
        span: mockComponentEntry,
        annotation: mockAnnotation,
      }
      expect(
        doesEntryMatchDefinition(mockSpanAndAnnotation, mockMatcher, mockScope),
      ).toBe(true)
    })

    it('should return false for non-matching isIdle', () => {
      const mockEntry = { ...mockComponentEntry, isIdle: false }
      const mockSpanAndAnnotation = {
        span: mockEntry,
        annotation: mockAnnotation,
      }
      expect(
        doesEntryMatchDefinition(mockSpanAndAnnotation, mockMatcher, mockScope),
      ).toBe(false)
    })
  })

  describe('combination of conditions', () => {
    it('should return true when all conditions match', () => {
      const matcher = all(
        name('testEntry'),
        performanceEntryName('testEntry'),
        attributes({ attr1: 'value1' }),
        scopeKeys(['ticketId']),
        status('ok'),
        type('element'),
      )
      const mockSpanAndAnnotation = {
        span: mockPerformanceEntry,
        annotation: mockAnnotation,
      }
      expect(
        doesEntryMatchDefinition(mockSpanAndAnnotation, matcher, mockScope),
      ).toBe(true)
    })

    it('should return false when all conditions match but name', () => {
      const matcher = all(
        name('testEntries'), // does not match
        performanceEntryName('testEntry'),
        attributes({ attr1: 'value1' }),
        scopeKeys(['ticketId']),
        status('ok'),
        type('element'),
      )
      const mockSpanAndAnnotation = {
        span: mockPerformanceEntry,
        annotation: mockAnnotation,
      }
      expect(
        doesEntryMatchDefinition(mockSpanAndAnnotation, matcher, mockScope),
      ).toBe(false)
    })
  })
})
