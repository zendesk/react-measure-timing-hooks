import './testUtility/asciiTimelineSerializer'
import {
  beforeEach,
  describe,
  expect,
  it,
  type Mock,
  vitest as jest,
} from 'vitest'
import { Check, getSpansFromTimeline, Render } from './testUtility/makeTimeline'
import { processSpans } from './testUtility/processSpans'
import { TraceManager } from './traceManager'
import type { ReportFn } from './types'

interface TestScope {
  id: string
}

describe('Tracer', () => {
  let reportFn: Mock<ReportFn<TestScope>>
  let generateId: Mock
  let reportErrorFn: Mock

  beforeEach(() => {
    reportFn = jest.fn<ReportFn<TestScope>>()
    generateId = jest.fn().mockReturnValue('trace-id')
    reportErrorFn = jest.fn()
    jest.useFakeTimers({ now: 0 })
  })

  describe('variants', () => {
    it('uses additional required spans from variant', () => {
      const traceManager = new TraceManager<TestScope>({
        reportFn,
        generateId,
        reportErrorFn,
      })

      const tracer = traceManager.createTracer({
        name: 'test.operation',
        type: 'operation',
        scopes: ['id'],
        requiredSpans: [{ name: 'base-required' }],
        variants: {
          variant_a: {
            timeoutDuration: 1_000,
            additionalRequiredSpans: [{ name: 'extra-required' }],
          },
          variant_b: {
            timeoutDuration: 1_000,
          },
        },
      })

      // Start trace with variant_a - should require both spans
      tracer.start({
        scope: { id: '1' },
        variant: 'variant_a',
      })

      // Only see base-required span - should not complete

      // prettier-ignore
      const { spans: firstSpans } = getSpansFromTimeline<TestScope>`
        Events: ${Render('start', 0)}-----${Render('base-required', 0)}-----${Check}
        Time:   ${0}                      ${50}                            ${100}
      `
      processSpans(firstSpans, traceManager)
      expect(reportFn).not.toHaveBeenCalled()

      // See both required spans - should complete
      // prettier-ignore
      const { spans: secondSpans } = getSpansFromTimeline<TestScope>`
        Events: ${Render('base-required', 0)}-----${Render('extra-required', 0)}
        Time:   ${150}                            ${200}
      `
      processSpans(secondSpans, traceManager)

      expect(reportFn).toHaveBeenCalled()
      const report = reportFn.mock.calls[0]![0]
      expect(report.status).toBe('ok')
      expect(report.duration).toBe(200)
    })

    it('uses additional debounce spans from variant', () => {
      const traceManager = new TraceManager<TestScope>({
        reportFn,
        generateId,
        reportErrorFn,
      })

      const tracer = traceManager.createTracer({
        name: 'test.operation',
        type: 'operation',
        scopes: ['id'],
        requiredSpans: [{ name: 'required' }],
        debounceOn: [{ name: 'base-debounce' }],
        debounceDuration: 100,
        variants: {
          variant_a: {
            timeoutDuration: 1_000,
            additionalDebounceOnSpans: [{ name: 'extra-debounce' }],
          },
        },
      })

      tracer.start({
        scope: { id: '1' },
        variant: 'variant_a',
      })

      // prettier-ignore
      const { spans } = getSpansFromTimeline<TestScope>`
        Events: ${Render('required', 0)}---${Render('base-debounce', 0)}---${Render('extra-debounce', 0)}---${Check}
        Time:   ${0}                       ${50}                           ${100}                           ${250}
      `
      processSpans(spans, traceManager)
      expect(reportFn).toHaveBeenCalled()

      const report = reportFn.mock.calls[0]![0]
      expect(report.status).toBe('ok')
      expect(report.duration).toBe(100)
    })

    it('different variants can have different additional spans', () => {
      const traceManager = new TraceManager<TestScope>({
        reportFn,
        generateId,
        reportErrorFn,
      })

      const tracer = traceManager.createTracer({
        name: 'test.operation',
        type: 'operation',
        scopes: ['id'],
        requiredSpans: [{ name: 'base-required' }],
        variants: {
          variant_a: {
            timeoutDuration: 1_000,
            additionalRequiredSpans: [{ name: 'extra-required-a' }],
          },
          variant_b: {
            timeoutDuration: 1_000,
            additionalRequiredSpans: [{ name: 'extra-required-b' }],
          },
        },
      })

      // Start trace with variant_a
      tracer.start({
        scope: { id: '1' },
        variant: 'variant_a',
      })

      // Complete variant_a requirements
      // prettier-ignore
      const { spans: variantASpans } = getSpansFromTimeline<TestScope>`
        Events: ${Render('base-required', 0)}-----${Render('extra-required-a', 0)}
        Time:   ${0}                              ${50}
      `
      processSpans(variantASpans, traceManager)
      expect(reportFn).toHaveBeenCalled()
      expect(reportFn.mock.calls[0]![0].status).toBe('ok')

      reportFn.mockClear()

      // Start new trace with variant_b
      tracer.start({
        scope: { id: '1' },
        variant: 'variant_b',
      })

      // Complete variant_b requirements
      // prettier-ignore
      const { spans: variantBSpans } = getSpansFromTimeline<TestScope>`
        Events: ${Render('base-required', 0)}-----${Render('extra-required-b', 0)}
        Time:   ${100}                            ${150}
      `
      processSpans(variantBSpans, traceManager)
      expect(reportFn).toHaveBeenCalled()
      expect(reportFn.mock.calls[0]![0].status).toBe('ok')
    })
  })
})
