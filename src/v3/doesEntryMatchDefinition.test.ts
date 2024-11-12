import { doesEntryMatchDefinition } from './doesEntryMatchDefinition'
import type {
  ComponentRenderSpan,
  Span,
  SpanBase,
  SpanMatcher,
} from './spanTypes'
import type { ScopeBase, SpanAnnotation } from './types'

// Mock data for TraceEntryBase
interface TestScopeT extends ScopeBase {
  ticketId: string
}
const mockEntryBase: SpanBase<TestScopeT> = {
  type: 'element',
  name: 'testEntry',
  startTime: {
    now: Date.now(),
    epoch: Date.now(),
  },
  scope: {
    ticketId: '123',
  },
  attributes: {
    attr1: 'value1',
    attr2: 2,
  },
  duration: 100,
  status: 'ok',
}

const mockPerformanceEntry: SpanBase<TestScopeT> = {
  ...mockEntryBase,
  performanceEntry: {
    entryType: 'element',
    name: 'testEntry',
    startTime: 0,
    duration: 0,
    toJSON: () => ({}),
    detail: () => ({}),
  },
}

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
}

describe('doesEntryMatchDefinition', () => {
  describe('name', () => {
    it('should return true for a matching entry based on name', () => {
      const matcher: SpanMatcher<TestScopeT> = { name: 'testEntry' }
      const mockEntryAndAnnotation = {
        span: mockEntryBase,
        annotation: mockAnnotation,
      }
      expect(doesEntryMatchDefinition(mockEntryAndAnnotation, matcher)).toBe(
        true,
      )
    })

    it('should return true for function matchers for name', () => {
      const matcher: SpanMatcher<TestScopeT> = {
        name: (name: string) => name.startsWith('test'),
      }
      const mockEntryAndAnnotation = {
        span: mockEntryBase,
        annotation: mockAnnotation,
      }
      expect(doesEntryMatchDefinition(mockEntryAndAnnotation, matcher)).toBe(
        true,
      )
    })

    it('should return true for regex matchers for name', () => {
      const matcher: SpanMatcher<TestScopeT> = {
        name: /^test/,
      }
      const mockEntryAndAnnotation = {
        span: mockEntryBase,
        annotation: mockAnnotation,
      }
      expect(doesEntryMatchDefinition(mockEntryAndAnnotation, matcher)).toBe(
        true,
      )
    })

    it('should return false for a non-matching span based on name', () => {
      const matcher: SpanMatcher<TestScopeT> = {
        name: 'nonMatchingEntry',
      }
      const mockEntryAndAnnotation = {
        span: mockEntryBase,
        annotation: mockAnnotation,
      }
      expect(doesEntryMatchDefinition(mockEntryAndAnnotation, matcher)).toBe(
        false,
      )
    })
  })

  describe('performanceEntryName', () => {
    it('should return true for a matching span based on performanceEntryName', () => {
      const matcher: SpanMatcher<TestScopeT> = {
        performanceEntryName: 'testEntry',
      }
      const mockEntryAndAnnotation = {
        span: mockPerformanceEntry,
        annotation: mockAnnotation,
      }
      expect(doesEntryMatchDefinition(mockEntryAndAnnotation, matcher)).toBe(
        true,
      )
    })

    it('should return false for a non-matching performanceEntryName', () => {
      const matcher: SpanMatcher<TestScopeT> = {
        performanceEntryName: 'nonMatchingEntry',
      }
      const mockEntryAndAnnotation = {
        span: mockPerformanceEntry,
        annotation: mockAnnotation,
      }
      expect(doesEntryMatchDefinition(mockEntryAndAnnotation, matcher)).toBe(
        false,
      )
    })
  })

  describe('type', () => {
    describe('for Native Performance Entry', () => {
      it('should return true for matching attributes', () => {
        const matcher: SpanMatcher<TestScopeT> = { type: 'element' }
        const mockEntryAndAnnotation = {
          span: mockEntryBase,
          annotation: mockAnnotation,
        }
        expect(doesEntryMatchDefinition(mockEntryAndAnnotation, matcher)).toBe(
          true,
        )
      })

      it('should return false for non-matching attributes', () => {
        const matcher: SpanMatcher<TestScopeT> = {
          type: 'component-render',
        }
        const mockEntryAndAnnotation = {
          span: mockEntryBase,
          annotation: mockAnnotation,
        }
        expect(doesEntryMatchDefinition(mockEntryAndAnnotation, matcher)).toBe(
          false,
        )
      })
    })

    describe('for ComponentRenderTraceEntry', () => {
      it('should return true for a matching ComponentRenderTraceEntry', () => {
        const matcher: SpanMatcher<TestScopeT> = {
          type: 'component-render',
          name: 'testEntry',
        }
        const mockEntryAndAnnotation = {
          span: mockComponentEntry,
          annotation: mockAnnotation,
        }
        expect(doesEntryMatchDefinition(mockEntryAndAnnotation, matcher)).toBe(
          true,
        )
      })

      it('should return false for a non-matching ComponentRenderTraceEntry', () => {
        const matcher: SpanMatcher<TestScopeT> = {
          type: 'component-render',
          name: 'nonMatchingEntry',
        }
        const mockEntryAndAnnotation = {
          span: mockComponentEntry,
          annotation: mockAnnotation,
        }
        expect(doesEntryMatchDefinition(mockEntryAndAnnotation, matcher)).toBe(
          false,
        )
      })
    })
  })

  describe('status', () => {
    it('should return true when status does match', () => {
      const matcher: SpanMatcher<TestScopeT> = { status: 'ok' }
      const mockEntryAndAnnotation = {
        span: mockEntryBase,
        annotation: mockAnnotation,
      }
      expect(doesEntryMatchDefinition(mockEntryAndAnnotation, matcher)).toBe(
        true,
      )
    })

    it('should return false when status does not match', () => {
      const matcher: SpanMatcher<TestScopeT> = { status: 'error' }
      const mockEntryAndAnnotation = {
        span: mockEntryBase,
        annotation: mockAnnotation,
      }
      expect(doesEntryMatchDefinition(mockEntryAndAnnotation, matcher)).toBe(
        false,
      )
    })
  })

  describe('occurrence', () => {
    // TODO: mockEntryBase does not have occurance field. should we comparing to span annotation as well?
    it('should return true for occurrence matching', () => {
      const matcher: SpanMatcher<TestScopeT> = {
        name: 'testEntry',
        occurrence: 1,
      }
      const mockEntryAndAnnotation = {
        span: mockEntryBase,
        annotation: mockAnnotation,
      }
      // Assuming occurrence logic is implemented in the function
      expect(doesEntryMatchDefinition(mockEntryAndAnnotation, matcher)).toBe(
        true,
      )
    })

    it('should return false for non-matching occurrence', () => {
      const matcher: SpanMatcher<TestScopeT> = {
        name: 'testEntry',
        occurrence: 2,
      }
      const mockEntryAndAnnotation = {
        span: mockEntryBase,
        annotation: mockAnnotation,
      }
      // Assuming occurrence logic is implemented in the function
      expect(doesEntryMatchDefinition(mockEntryAndAnnotation, matcher)).toBe(
        false,
      )
    })
  })

  describe('attributes', () => {
    it('should return true for matching attributes', () => {
      const matcher: SpanMatcher<TestScopeT> = {
        attributes: { attr1: 'value1' },
      }
      const mockEntryAndAnnotation = {
        span: mockEntryBase,
        annotation: mockAnnotation,
      }
      expect(doesEntryMatchDefinition(mockEntryAndAnnotation, matcher)).toBe(
        true,
      )
    })

    it('should return false for non-matching attributes', () => {
      const matcher: SpanMatcher<TestScopeT> = {
        attributes: { attr1: 'wrongValue' },
      }
      const mockEntryAndAnnotation = {
        span: mockEntryBase,
        annotation: mockAnnotation,
      }
      expect(doesEntryMatchDefinition(mockEntryAndAnnotation, matcher)).toBe(
        false,
      )
    })
  })

  describe('scope', () => {
    it('should return true when scope does match', () => {
      const matcher: SpanMatcher<TestScopeT> = {
        name: 'testEntry',
        scope: {
          ticketId: '123',
        },
      }
      const mockEntryAndAnnotation = {
        span: mockEntryBase,
        annotation: mockAnnotation,
      }
      expect(doesEntryMatchDefinition(mockEntryAndAnnotation, matcher)).toBe(
        true,
      )
    })

    it('should return false when scope does not match', () => {
      const matcher: SpanMatcher<TestScopeT> = {
        name: 'testEntry',
        scope: {
          ticketId: '123',
          userId: '123',
        },
      }
      const mockEntryAndAnnotation = {
        span: mockEntryBase,
        annotation: mockAnnotation,
      }
      expect(doesEntryMatchDefinition(mockEntryAndAnnotation, matcher)).toBe(
        false,
      )
    })
  })

  describe('isIdle', () => {
    const mockMatcher: SpanMatcher<TestScopeT> = {
      name: 'testEntry',
      isIdle: true,
    }

    it('should return true for isIdle matching', () => {
      const mockEntryAndAnnotation = {
        span: mockComponentEntry,
        annotation: mockAnnotation,
      }
      expect(
        doesEntryMatchDefinition(mockEntryAndAnnotation, mockMatcher),
      ).toBe(true)
    })

    it('should return false for non-matching isIdle', () => {
      const mockEntry = { ...mockComponentEntry, isIdle: false }
      const mockEntryAndAnnotation = {
        span: mockEntry,
        annotation: mockAnnotation,
      }
      expect(
        doesEntryMatchDefinition(mockEntryAndAnnotation, mockMatcher),
      ).toBe(false)
    })
  })

  describe('combination of conditions', () => {
    it('should return true when all conditions match', () => {
      const matcher: SpanMatcher<TestScopeT> = {
        name: 'testEntry',
        performanceEntryName: 'testEntry',
        attributes: { attr1: 'value1' },
        scope: {
          ticketId: '123',
        },
        status: 'ok',
        type: 'element',
      }
      const mockEntryAndAnnotation = {
        span: mockPerformanceEntry,
        annotation: mockAnnotation,
      }
      expect(doesEntryMatchDefinition(mockEntryAndAnnotation, matcher)).toBe(
        true,
      )
    })

    it('should return false when all conditions match but name', () => {
      const matcher: SpanMatcher<TestScopeT> = {
        name: 'testEntries', // does not match
        performanceEntryName: 'testEntry',
        attributes: { attr1: 'value1' },
        scope: {
          ticketId: '123',
        },
        status: 'ok',
        type: 'element',
      }
      const mockEntryAndAnnotation = {
        span: mockPerformanceEntry,
        annotation: mockAnnotation,
      }
      expect(doesEntryMatchDefinition(mockEntryAndAnnotation, matcher)).toBe(
        false,
      )
    })
  })
})
