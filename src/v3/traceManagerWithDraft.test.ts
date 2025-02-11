import './testUtility/asciiTimelineSerializer'
import {
  afterEach,
  beforeEach,
  describe,
  expect,
  it,
  vitest as jest,
} from 'vitest'
import * as matchSpan from './matchSpan'
import { shouldCompleteAndHaveInteractiveTime } from './testUtility/fixtures/shouldCompleteAndHaveInteractiveTime'
import { shouldNotEndWithInteractiveTimeout } from './testUtility/fixtures/shouldNotEndWithInteractiveTimeout'
import {
  ticketActivationDefinition,
  type TicketIdScope,
  UserIdScope,
} from './testUtility/fixtures/ticket.activation'
import { Check, getSpansFromTimeline, Render } from './testUtility/makeTimeline'
import { processSpans } from './testUtility/processSpans'
import { TraceManager } from './traceManager'
import type { ReportFn } from './types'

interface TicketScope {
  ticketId: string
}

describe('TraceManager', () => {
  let reportFn: jest.Mock
  let generateId: jest.Mock
  let reportErrorFn: jest.Mock
  const DEFAULT_COLDBOOT_TIMEOUT_DURATION = 45_000
  jest.useFakeTimers({
    now: 0,
  })

  beforeEach(() => {
    reportFn = jest.fn<ReportFn<TicketScope, TicketScope>>()
    generateId = jest.fn().mockReturnValue('trace-id')
    reportErrorFn = jest.fn()
  })

  afterEach(() => {
    jest.clearAllMocks()
    jest.clearAllTimers()
  })

  it('tracks trace after creating a draft and transitioning to active trace', () => {
    const traceManager = new TraceManager<TicketScope>({
      reportFn,
      generateId,
      reportErrorFn,
    })
    const tracer = traceManager.createTracer({
      name: 'ticket.basic-operation',
      type: 'operation',
      scopes: ['ticketId'],
      requiredSpans: [{ name: 'end' }],
      variants: {
        cold_boot: { timeoutDuration: DEFAULT_COLDBOOT_TIMEOUT_DURATION },
      },
    })
    const traceId = tracer.createDraft({
      variant: 'cold_boot',
    })
    expect(traceId).toBe('trace-id')

    // prettier-ignore
    const { spans } = getSpansFromTimeline<TicketIdScope>`
      Events: ${Render('start', 0)}-----${Render('middle', 0)}-----${Render('end', 0)}---<===+2s===>----${Check}
      Time:   ${0}                      ${50}                      ${100}                               ${2_100}
      `

    processSpans(spans, traceManager)

    tracer.transitionDraftToActive({ scope: { ticketId: '1' } })

    expect(reportFn).toHaveBeenCalled()

    const report: Parameters<ReportFn<TicketScope, TicketScope>>[0] =
      reportFn.mock.calls[0][0]
    expect(
      report.entries.map(
        (spanAndAnnotation) => spanAndAnnotation.span.performanceEntry,
      ),
    ).toMatchInlineSnapshot(`
        events    | start       middle      end
        timeline  | |-<⋯ +50 ⋯>-|-<⋯ +50 ⋯>-|
        time (ms) | 0           50          100
      `)
    expect(report.name).toBe('ticket.basic-operation')
    expect(report.duration).toBe(100)
    expect(report.status).toBe('ok')
    expect(report.interruptionReason).toBeUndefined()
  })

  it('interrupts a basic trace when interruptOn criteria is met in draft mode, trace stops immediately', () => {
    const traceManager = new TraceManager<TicketScope>({
      reportFn,
      generateId,
      reportErrorFn,
    })
    const tracer = traceManager.createTracer({
      name: 'ticket.interrupt-on-basic-operation',
      type: 'operation',
      scopes: [],
      requiredSpans: [matchSpan.withName('end')],
      interruptOn: [matchSpan.withName('interrupt')],
      variants: {
        cold_boot: { timeoutDuration: DEFAULT_COLDBOOT_TIMEOUT_DURATION },
      },
    })
    tracer.createDraft({
      variant: 'cold_boot',
    })

    // prettier-ignore
    const { spans } = getSpansFromTimeline<TicketIdScope>`
      Events: ${Render('start', 0)}-----${Render('interrupt', 0)}-----${Render('end', 0)}
      Time:   ${0}                      ${100}                      ${200}
      `
    processSpans(spans, traceManager)

    expect(reportFn).toHaveBeenCalled()

    const report: Parameters<ReportFn<TicketScope, TicketScope>>[0] =
      reportFn.mock.calls[0][0]

    // there are NO entries in the report because this trace was interrupted before transitioning from draft to active
    expect(report.entries).toHaveLength(0)
    expect(report.name).toBe('ticket.interrupt-on-basic-operation')
    expect(report.duration).toBeNull()
    expect(report.status).toBe('interrupted')
    expect(report.interruptionReason).toBe('matched-on-interrupt')
  })

  it('timeouts when the basic trace when an timeout duration from variant is reached', () => {
    const traceManager = new TraceManager<TicketScope>({
      reportFn,
      generateId,
      reportErrorFn,
    })
    const tracer = traceManager.createTracer({
      name: 'ticket.timeout-operation',
      type: 'operation',
      scopes: ['ticketId'],
      requiredSpans: [{ name: 'timed-out-render' }],
      variants: { cold_boot: { timeoutDuration: 500 } },
    })
    const traceId = tracer.createDraft({
      startTime: { now: 0, epoch: 0 },
      variant: 'cold_boot',
    })
    expect(traceId).toBe('trace-id')

    tracer.transitionDraftToActive({ scope: { ticketId: '1' } })

    // prettier-ignore
    const { spans } = getSpansFromTimeline<TicketIdScope>`
        Events: ${Render('start', 0)}------${Render('timed-out-render', 0)}
        Time:   ${0}                       ${500 + 1}
        `
    processSpans(spans, traceManager)

    expect(reportFn).toHaveBeenCalled()

    const report: Parameters<ReportFn<TicketScope, TicketScope>>[0] =
      reportFn.mock.calls[0][0]

    expect(
      report.entries.map(
        (spanAndAnnotation) => spanAndAnnotation.span.performanceEntry,
      ),
    ).toMatchInlineSnapshot(`
          events    | start
          timeline  | |
          time (ms) | 0
        `)
    expect(report.interruptionReason).toBe('timeout')
    expect(report.duration).toBeNull()

    expect(report.name).toBe('ticket.timeout-operation')
    expect(report.status).toBe('interrupted')

    expect(report.interruptionReason).toBe('timeout')
    expect(report.duration).toBeNull()
  })

  it('reports error when calling `transitionDraftToActive` when a draft trace has not yet been created', () => {
    const traceManager = new TraceManager<TicketScope>({
      reportFn,
      generateId,
      reportErrorFn,
    })

    const tracer = traceManager.createTracer({
      name: 'ticket.basic-operation',
      type: 'operation',
      scopes: [],
      requiredSpans: [{ name: 'end' }],
      variants: {
        cold_boot: { timeoutDuration: DEFAULT_COLDBOOT_TIMEOUT_DURATION },
      },
    })

    tracer.transitionDraftToActive({ scope: { ticketId: '1' } })

    expect(reportErrorFn).toHaveBeenCalledWith(
      expect.objectContaining({
        message: expect.stringContaining(
          'No currently active trace when initializing',
        ),
      }),
    )
  })

  it('reports error when calling `transitionDraftToActive` again after a trace is active', () => {
    const traceManager = new TraceManager<TicketScope>({
      reportFn,
      generateId,
      reportErrorFn,
    })

    const tracer = traceManager.createTracer({
      name: 'ticket.basic-operation',
      type: 'operation',
      scopes: ['ticketId'],
      requiredSpans: [{ name: 'end' }],
      variants: {
        cold_boot: { timeoutDuration: DEFAULT_COLDBOOT_TIMEOUT_DURATION },
      },
    })

    tracer.createDraft({
      variant: 'cold_boot',
    })

    tracer.transitionDraftToActive({ scope: { ticketId: '1' } })
    tracer.transitionDraftToActive({ scope: { ticketId: '2' } })

    expect(reportErrorFn).toHaveBeenCalledWith(
      expect.objectContaining({
        message: expect.stringContaining(
          'trace that has already been initialized',
        ),
      }),
    )
  })

  it('process events in bufffer and does not interrupt trace')
})
