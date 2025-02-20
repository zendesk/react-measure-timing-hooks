import './testUtility/asciiTimelineSerializer'
import {
  beforeEach,
  describe,
  expect,
  it,
  type Mock,
  vitest as jest,
} from 'vitest'
import * as matchSpan from './matchSpan'
import type { TicketIdRelationSchema } from './testUtility/fixtures/relationSchemas'
import { Check, getSpansFromTimeline, Render } from './testUtility/makeTimeline'
import { processSpans } from './testUtility/processSpans'
import { TraceManager } from './traceManager'
import type { ReportFn } from './types'

describe('Trace Definitions', () => {
  let reportFn: Mock<ReportFn<TicketIdRelationSchema>>
  let generateId: Mock
  let reportErrorFn: Mock
  const DEFAULT_COLDBOOT_TIMEOUT_DURATION = 45_000

  jest.useFakeTimers({
    now: 0,
  })

  beforeEach(() => {
    reportFn = jest.fn<ReportFn<TicketIdRelationSchema>>()
    generateId = jest.fn().mockReturnValue('trace-id')
    reportErrorFn = jest.fn()
  })

  describe('computedSpanDefinitions', () => {
    it('correctly calculates a computed span provided in definition', () => {
      const traceManager = new TraceManager({
        relationSchemas: [{ ticketId: String }],
        reportFn,
        generateId,
        reportErrorFn,
      })

      const computedSpanName = 'render-1-to-3'
      const tracer = traceManager.createTracer({
        name: 'ticket.computed-span-operation',
        type: 'operation',
        relations: [],
        requiredSpans: [{ name: 'end' }],
        variants: {
          cold_boot: { timeout: DEFAULT_COLDBOOT_TIMEOUT_DURATION },
        },
        // Define computed span in the initial definition as a Record
        computedSpanDefinitions: {
          [computedSpanName]: {
            startSpan: matchSpan.withName('render-1'),
            endSpan: matchSpan.withName('render-3'),
          },
        },
      })

      const traceId = tracer.start({
        relatedTo: { ticketId: '1' },
        variant: 'cold_boot',
      })

      expect(traceId).toBe('trace-id')

      // prettier-ignore
      const { spans } = getSpansFromTimeline<TicketIdRelationSchema>`
      Events: ${Render('start', 0)}---${Render('render-1', 50)}----${Render('render-2', 50)}----${Render('render-3', 50)}--------${Render('end', 0)}
      Time:   ${0}                    ${50}                        ${100}                       ${150}                           ${200}
      `

      processSpans(spans, traceManager)
      expect(reportFn).toHaveBeenCalled()

      const report = reportFn.mock.calls[0]![0]
      expect(report.name).toBe('ticket.computed-span-operation')
      expect(report.duration).toBe(200)
      expect(report.status).toBe('ok')
      expect(report.interruptionReason).toBeUndefined()
      expect(report.computedSpans[computedSpanName]?.startOffset).toBe(50)
      expect(report.computedSpans[computedSpanName]?.duration).toBe(150)
    })

    it('correctly calculates multiple computed spans in definition', () => {
      const traceManager = new TraceManager({
        relationSchemas: [{ ticketId: String }],
        reportFn,
        generateId,
        reportErrorFn,
      })

      const tracer = traceManager.createTracer({
        name: 'ticket.multiple-computed-spans',
        type: 'operation',
        relations: [],
        requiredSpans: [{ name: 'end' }],
        variants: {
          cold_boot: { timeout: DEFAULT_COLDBOOT_TIMEOUT_DURATION },
        },
        computedSpanDefinitions: {
          'first-to-second': {
            startSpan: matchSpan.withName('render-1'),
            endSpan: matchSpan.withName('render-2'),
          },
          'second-to-third': {
            startSpan: matchSpan.withName('render-2'),
            endSpan: matchSpan.withName('render-3'),
          },
        },
      })

      tracer.start({
        relatedTo: { ticketId: '1' },
        variant: 'cold_boot',
      })

      // prettier-ignore
      const { spans } = getSpansFromTimeline<TicketIdRelationSchema>`
      Events: ${Render('start', 0)}---${Render('render-1', 50)}----${Render('render-2', 50)}----${Render('render-3', 50)}--------${Render('end', 0)}
      Time:   ${0}                    ${50}                        ${100}                       ${150}                           ${200}
      `

      processSpans(spans, traceManager)
      expect(reportFn).toHaveBeenCalled()

      const report = reportFn.mock.calls[0]![0]
      expect(report.computedSpans['first-to-second']?.startOffset).toBe(50)
      expect(report.computedSpans['first-to-second']?.duration).toBe(100)
      expect(report.computedSpans['second-to-third']?.startOffset).toBe(100)
      expect(report.computedSpans['second-to-third']?.duration).toBe(100)
    })
  })

  describe('computedValueDefinitions', () => {
    it('correctly calculates a computed value provided in definition', () => {
      const traceManager = new TraceManager({
        relationSchemas: [{ ticketId: String }],
        reportFn,
        generateId,
        reportErrorFn,
      })

      const tracer = traceManager.createTracer({
        name: 'ticket.computed-value-operation',
        type: 'operation',
        relations: [],
        requiredSpans: [{ name: 'end' }],
        variants: {
          cold_boot: { timeout: DEFAULT_COLDBOOT_TIMEOUT_DURATION },
        },
        // Define computed value in the initial definition as a Record
        computedValueDefinitions: {
          feature: {
            matches: [{ name: 'feature' }],
            computeValueFromMatches: (feature) => feature.length,
          },
        },
      })

      tracer.start({
        relatedTo: { ticketId: '1' },
        variant: 'cold_boot',
      })

      // prettier-ignore
      const { spans } = getSpansFromTimeline<TicketIdRelationSchema>`
      Events: ${Render('start', 0)}--${Render('feature', 50)}--${Render('feature', 50)}-${Render('end', 0)}
      Time:   ${0}                   ${50}                     ${100}                    ${150}
      `

      processSpans(spans, traceManager)
      expect(reportFn).toHaveBeenCalled()

      const report = reportFn.mock.calls[0]![0]
      expect(report.computedValues).toEqual({
        feature: 2,
      })
    })

    it('correctly calculates multiple computed values with different matchers', () => {
      const traceManager = new TraceManager({
        relationSchemas: [{ ticketId: String }],
        reportFn,
        generateId,
        reportErrorFn,
      })

      const tracer = traceManager.createTracer({
        name: 'ticket.multiple-computed-values',
        type: 'operation',
        relations: [],
        requiredSpans: [{ name: 'end' }],
        variants: {
          cold_boot: { timeout: DEFAULT_COLDBOOT_TIMEOUT_DURATION },
        },
        computedValueDefinitions: {
          'feature-count': {
            matches: [
              matchSpan.withName('feature'),
              matchSpan.withName('feature-2'),
            ],
            computeValueFromMatches: (feature, feature2) =>
              // @ts-expect-error unexpected TS error
              // eslint-disable-next-line @typescript-eslint/restrict-plus-operands
              feature.length + feature2.length,
          },
          'error-count': {
            matches: [matchSpan.withName((name) => name.startsWith('error'))],
            // @ts-expect-error unexpected TS error
            computeValueFromMatches: (errors) => errors.length,
          },
        },
      })

      tracer.start({
        relatedTo: { ticketId: '1' },
        variant: 'cold_boot',
      })

      // prettier-ignore
      const { spans } = getSpansFromTimeline<TicketIdRelationSchema>`
      Events: ${Render('start', 0)}--${Render('feature', 50)}--${Render('error-1', 50)}--${Render('feature', 50)}--${Render('error-2', 50)}--${Render('end', 0)}
      Time:   ${0}                   ${50}                     ${100}                    ${150}                    ${200}                    ${250}
      `

      processSpans(spans, traceManager)
      expect(reportFn).toHaveBeenCalled()

      const report = reportFn.mock.calls[0]![0]
      expect(report.computedValues).toEqual({
        'feature-count': 2,
        'error-count': 2,
      })
    })
  })
})
