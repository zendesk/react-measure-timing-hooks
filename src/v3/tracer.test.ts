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

interface TestRelationSchema {
  id: StringConstructor
}

describe('Tracer', () => {
  let reportFn: Mock<ReportFn<TestRelationSchema>>
  let generateId: Mock
  let reportErrorFn: Mock

  beforeEach(() => {
    reportFn = jest.fn<ReportFn<TestRelationSchema>>()
    generateId = jest.fn().mockReturnValue('trace-id')
    reportErrorFn = jest.fn()
    jest.useFakeTimers({ now: 0 })
  })

  describe('variants', () => {
    it('uses additional required spans from variant', () => {
      const traceManager = new TraceManager({
        relationSchemas: [{ id: String }],
        reportFn,
        generateId,
        reportErrorFn,
      })

      const tracer = traceManager.createTracer({
        name: 'test.operation',
        type: 'operation',
        relations: ['id'],
        requiredSpans: [{ name: 'base-required' }],
        variants: {
          variant_a: {
            timeout: 1_000,
            additionalRequiredSpans: [{ name: 'extra-required' }],
          },
          variant_b: {
            timeout: 1_000,
          },
        },
      })

      // Start trace with variant_a - should require both spans
      tracer.start({
        relatedTo: { id: '1' },
        variant: 'variant_a',
      })

      // Only see base-required span - should not complete

      // prettier-ignore
      const { spans: firstSpans } = getSpansFromTimeline<TestRelationSchema>`
        Events: ${Render('start', 0)}-----${Render('base-required', 0)}-----${Check}
        Time:   ${0}                      ${50}                            ${100}
      `
      processSpans(firstSpans, traceManager)
      expect(reportFn).not.toHaveBeenCalled()

      // See both required spans - should complete
      // prettier-ignore
      const { spans: secondSpans } = getSpansFromTimeline<TestRelationSchema>`
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
      const traceManager = new TraceManager<TestRelationSchema>({
        relationSchemas: [{ id: String }],
        reportFn,
        generateId,
        reportErrorFn,
      })

      const tracer = traceManager.createTracer({
        name: 'test.operation',
        type: 'operation',
        relations: ['id'],
        requiredSpans: [{ name: 'required' }],
        debounceOnSpans: [{ name: 'base-debounce' }],
        debounceWindow: 100,
        variants: {
          variant_a: {
            timeout: 1_000,
            additionalDebounceOnSpans: [{ name: 'extra-debounce' }],
          },
        },
      })

      tracer.start({
        relatedTo: { id: '1' },
        variant: 'variant_a',
      })

      // prettier-ignore
      const { spans } = getSpansFromTimeline<TestRelationSchema>`
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
      const traceManager = new TraceManager<TestRelationSchema>({
        relationSchemas: [{ id: String }],
        reportFn,
        generateId,
        reportErrorFn,
      })

      const tracer = traceManager.createTracer({
        name: 'test.operation',
        type: 'operation',
        relations: ['id'],
        requiredSpans: [{ name: 'base-required' }],
        variants: {
          variant_a: {
            timeout: 1_000,
            additionalRequiredSpans: [{ name: 'extra-required-a' }],
          },
          variant_b: {
            timeout: 1_000,
            additionalRequiredSpans: [{ name: 'extra-required-b' }],
          },
        },
      })

      // Start trace with variant_a
      tracer.start({
        relatedTo: { id: '1' },
        variant: 'variant_a',
      })

      // Complete variant_a requirements
      // prettier-ignore
      const { spans: variantASpans } = getSpansFromTimeline<TestRelationSchema>`
        Events: ${Render('base-required', 0)}-----${Render('extra-required-a', 0)}
        Time:   ${0}                              ${50}
      `
      processSpans(variantASpans, traceManager)
      expect(reportFn).toHaveBeenCalled()
      expect(reportFn.mock.calls[0]![0].status).toBe('ok')

      reportFn.mockClear()

      // Start new trace with variant_b
      tracer.start({
        relatedTo: { id: '1' },
        variant: 'variant_b',
      })

      // Complete variant_b requirements
      // prettier-ignore
      const { spans: variantBSpans } = getSpansFromTimeline<TestRelationSchema>`
        Events: ${Render('base-required', 0)}-----${Render('extra-required-b', 0)}
        Time:   ${100}                            ${150}
      `
      processSpans(variantBSpans, traceManager)
      expect(reportFn).toHaveBeenCalled()
      expect(reportFn.mock.calls[0]![0].status).toBe('ok')
    })
  })
})
