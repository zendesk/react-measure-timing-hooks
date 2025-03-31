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
import { type TicketIdRelationSchemasFixture } from './testUtility/fixtures/relationSchemas'
import { Check, getSpansFromTimeline, Render } from './testUtility/makeTimeline'
import { processSpans } from './testUtility/processSpans'
import { TraceManager } from './TraceManager'
import type { AnyPossibleReportFn } from './types'

describe('TraceManager', () => {
  let reportFn: jest.Mock
  let generateId: jest.Mock
  let reportErrorFn: jest.Mock
  let reportWarningFn: jest.Mock

  const DEFAULT_COLDBOOT_TIMEOUT_DURATION = 45_000
  jest.useFakeTimers({
    now: 0,
  })

  beforeEach(() => {
    reportFn = jest.fn<AnyPossibleReportFn<TicketIdRelationSchemasFixture>>()
    generateId = jest.fn().mockReturnValue('trace-id')
    reportErrorFn = jest.fn()
    reportWarningFn = jest.fn()
  })

  afterEach(() => {
    jest.clearAllMocks()
    jest.clearAllTimers()
  })

  it('tracks trace after creating a draft and transitioning to active trace', () => {
    const traceManager = new TraceManager({
      relationSchemas: { ticket: { ticketId: String } },
      reportFn,
      generateId,
      reportErrorFn,
      reportWarningFn,
    })
    const tracer = traceManager.createTracer({
      name: 'ticket.basic-operation',
      type: 'operation',
      relationSchemaName: 'ticket',
      requiredSpans: [{ name: 'end' }],
      variants: {
        cold_boot: { timeout: DEFAULT_COLDBOOT_TIMEOUT_DURATION },
      },
    })
    const traceId = tracer.createDraft({
      variant: 'cold_boot',
    })
    expect(traceId).toBe('trace-id')

    // prettier-ignore
    const { spans } = getSpansFromTimeline<TicketIdRelationSchemasFixture>`
      Events: ${Render('start', 0)}-----${Render('middle', 0)}-----${Render('end', 0)}---<===+2s===>----${Check}
      Time:   ${0}                      ${50}                      ${100}                               ${2_100}
      `

    processSpans(spans, traceManager)

    tracer.transitionDraftToActive({ relatedTo: { ticketId: '1' } })

    expect(reportFn).toHaveBeenCalled()

    const report: Parameters<
      AnyPossibleReportFn<TicketIdRelationSchemasFixture>
    >[0] = reportFn.mock.calls[0][0]
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

  it('interrupts a basic trace when interruptOnSpans criteria is met in draft mode, trace stops immediately', () => {
    const traceManager = new TraceManager({
      relationSchemas: { ticket: { ticketId: String } },
      reportFn,
      generateId,
      reportErrorFn,
      reportWarningFn,
    })
    const tracer = traceManager.createTracer({
      name: 'ticket.interrupt-on-basic-operation',
      type: 'operation',
      relationSchemaName: 'ticket',
      requiredSpans: [matchSpan.withName('end')],
      interruptOnSpans: [matchSpan.withName('interrupt')],
      variants: {
        cold_boot: { timeout: DEFAULT_COLDBOOT_TIMEOUT_DURATION },
      },
    })
    tracer.createDraft({
      variant: 'cold_boot',
    })

    // prettier-ignore
    const { spans } = getSpansFromTimeline<TicketIdRelationSchemasFixture>`
      Events: ${Render('start', 0)}-----${Render('interrupt', 0)}-----${Render('end', 0)}
      Time:   ${0}                      ${100}                      ${200}
      `
    processSpans(spans, traceManager)

    expect(reportFn).toHaveBeenCalled()

    const report: Parameters<
      AnyPossibleReportFn<TicketIdRelationSchemasFixture>
    >[0] = reportFn.mock.calls[0][0]

    // there are NO entries in the report because this trace was interrupted before transitioning from draft to active
    expect(report.entries).toHaveLength(0)
    expect(report.name).toBe('ticket.interrupt-on-basic-operation')
    expect(report.duration).toBeNull()
    expect(report.status).toBe('interrupted')
    expect(report.interruptionReason).toBe('matched-on-interrupt')
  })

  it('timeouts when the basic trace when an timeout duration from variant is reached', () => {
    const traceManager = new TraceManager({
      relationSchemas: { ticket: { ticketId: String } },
      reportFn,
      generateId,
      reportErrorFn,
      reportWarningFn,
    })
    const tracer = traceManager.createTracer({
      name: 'ticket.timeout-operation',
      type: 'operation',
      relationSchemaName: 'ticket',
      requiredSpans: [{ name: 'timed-out-render' }],
      variants: { cold_boot: { timeout: 500 } },
    })
    const traceId = tracer.createDraft({
      startTime: { now: 0, epoch: 0 },
      variant: 'cold_boot',
    })
    expect(traceId).toBe('trace-id')

    tracer.transitionDraftToActive({ relatedTo: { ticketId: '1' } })

    // prettier-ignore
    const { spans } = getSpansFromTimeline<TicketIdRelationSchemasFixture>`
        Events: ${Render('start', 0)}------${Render('timed-out-render', 0)}
        Time:   ${0}                       ${500 + 1}
        `
    processSpans(spans, traceManager)

    expect(reportFn).toHaveBeenCalled()

    const report: Parameters<
      AnyPossibleReportFn<TicketIdRelationSchemasFixture>
    >[0] = reportFn.mock.calls[0][0]

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

  describe('transitionDraftToActive: report errors', () => {
    it('reports warning when calling `transitionDraftToActive` with no reporting opts when a draft trace has not yet been created', () => {
      const traceManager = new TraceManager({
        relationSchemas: { ticket: { ticketId: String } },
        reportFn,
        generateId,
        reportErrorFn,
        reportWarningFn,
      })

      const tracer = traceManager.createTracer({
        name: 'ticket.basic-operation',
        type: 'operation',
        relationSchemaName: 'ticket',
        requiredSpans: [{ name: 'end' }],
        variants: {
          cold_boot: { timeout: DEFAULT_COLDBOOT_TIMEOUT_DURATION },
        },
      })

      tracer.transitionDraftToActive({ relatedTo: { ticketId: '1' } })

      expect(reportWarningFn).toHaveBeenCalledWith(
        expect.objectContaining({
          message: expect.stringContaining(
            'No currently active trace when initializing',
          ),
        }),
        expect.objectContaining({
          definition: expect.any(Object),
        }),
      )
    })

    it('reports error when calling `transitionDraftToActive` when reporting with error when a draft trace has not yet been created', () => {
      const traceManager = new TraceManager({
        relationSchemas: { ticket: { ticketId: String } },
        reportFn,
        generateId,
        reportErrorFn,
        reportWarningFn,
      })

      const tracer = traceManager.createTracer({
        name: 'ticket.basic-operation',
        type: 'operation',
        relationSchemaName: 'ticket',
        requiredSpans: [{ name: 'end' }],
        variants: {
          cold_boot: { timeout: DEFAULT_COLDBOOT_TIMEOUT_DURATION },
        },
      })

      tracer.transitionDraftToActive(
        { relatedTo: { ticketId: '1' } },
        { noDraftPresentBehavior: 'error' },
      )

      expect(reportErrorFn).toHaveBeenCalledWith(
        expect.objectContaining({
          message: expect.stringContaining(
            'No currently active trace when initializing',
          ),
        }),
        expect.objectContaining({
          definition: expect.any(Object),
        }),
      )

      expect(reportWarningFn).not.toHaveBeenCalled()
    })

    it('does NOT report anything when calling `transitionDraftToActive` when not reporting when a draft trace has not yet been created', () => {
      const traceManager = new TraceManager({
        relationSchemas: { ticket: { ticketId: String } },
        reportFn,
        generateId,
        reportErrorFn,
        reportWarningFn,
      })

      const tracer = traceManager.createTracer({
        name: 'ticket.basic-operation',
        type: 'operation',
        relationSchemaName: 'ticket',
        requiredSpans: [{ name: 'end' }],
        variants: {
          cold_boot: { timeout: DEFAULT_COLDBOOT_TIMEOUT_DURATION },
        },
      })

      tracer.transitionDraftToActive(
        { relatedTo: { ticketId: '1' } },
        { noDraftPresentBehavior: 'noop' },
      )

      expect(reportErrorFn).not.toHaveBeenCalled()

      expect(reportWarningFn).not.toHaveBeenCalled()
    })

    it('reports warning when calling `transitionDraftToActive` with no report opts again after a trace is active', () => {
      const traceManager = new TraceManager({
        relationSchemas: { ticket: { ticketId: String } },
        reportFn,
        generateId,
        reportErrorFn,
        reportWarningFn,
      })

      const tracer = traceManager.createTracer({
        name: 'ticket.basic-operation',
        type: 'operation',
        relationSchemaName: 'ticket',
        requiredSpans: [{ name: 'end' }],
        variants: {
          cold_boot: { timeout: DEFAULT_COLDBOOT_TIMEOUT_DURATION },
        },
      })

      tracer.createDraft({
        variant: 'cold_boot',
      })

      tracer.transitionDraftToActive({ relatedTo: { ticketId: '1' } })
      tracer.transitionDraftToActive({ relatedTo: { ticketId: '2' } })

      expect(reportWarningFn).toHaveBeenCalledWith(
        expect.objectContaining({
          message: expect.stringContaining(
            'trace that has already been initialized',
          ),
        }),
        expect.objectContaining({
          definition: expect.any(Object),
        }),
      )
    })
  })

  it('interrupts a draft trace when interrupt() is called with error', () => {
    const traceManager = new TraceManager({
      relationSchemas: { ticket: { ticketId: String } },
      reportFn,
      generateId,
      reportErrorFn,
      reportWarningFn,
    })
    const tracer = traceManager.createTracer({
      name: 'ticket.basic-operation',
      type: 'operation',
      relationSchemaName: 'ticket',
      requiredSpans: [{ name: 'end' }],
      variants: {
        cold_boot: { timeout: DEFAULT_COLDBOOT_TIMEOUT_DURATION },
      },
    })
    tracer.createDraft({
      variant: 'cold_boot',
    })

    // prettier-ignore
    const { spans } = getSpansFromTimeline<TicketIdRelationSchemasFixture>`
      Events: ${Render('start', 0)}-----${Render('middle', 0)}
      Time:   ${0}                      ${50}
    `
    processSpans(spans, traceManager)

    const error = new Error('Test error')
    tracer.interrupt({ error })

    expect(reportFn).toHaveBeenCalled()
    const report = reportFn.mock.calls[0][0]
    expect(report.entries.length).toBe(3) // start, middle, and error mark
    expect(report.status).toBe('interrupted')
    expect(report.interruptionReason).toBe('aborted')
    // Last entry should be the error mark
    expect(report.entries[report.entries.length - 1].span.error).toBe(error)
  })

  it('interrupts a draft trace when interrupt() is called without error', () => {
    const traceManager = new TraceManager({
      relationSchemas: { ticket: { ticketId: String } },
      reportFn,
      generateId,
      reportErrorFn,
      reportWarningFn,
    })
    const tracer = traceManager.createTracer({
      name: 'ticket.basic-operation',
      type: 'operation',
      relationSchemaName: 'ticket',
      requiredSpans: [{ name: 'end' }],
      variants: {
        cold_boot: { timeout: DEFAULT_COLDBOOT_TIMEOUT_DURATION },
      },
    })
    tracer.createDraft({
      variant: 'cold_boot',
    })

    // prettier-ignore
    const { spans } = getSpansFromTimeline<TicketIdRelationSchemasFixture>`
      Events: ${Render('start', 0)}-----${Render('middle', 0)}
      Time:   ${0}                      ${50}
    `
    processSpans(spans, traceManager)

    tracer.interrupt()

    expect(reportFn).toHaveBeenCalled()
    const report = reportFn.mock.calls[0][0]
    expect(report.status).toBe('interrupted')
    expect(report.entries.length).toBe(0)
    expect(report.interruptionReason).toBe('draft-cancelled')
  })

  it('interrupts an active trace when interrupt() is called with error', () => {
    const traceManager = new TraceManager({
      relationSchemas: { ticket: { ticketId: String } },
      reportFn,
      generateId,
      reportErrorFn,
      reportWarningFn,
    })
    const tracer = traceManager.createTracer({
      name: 'ticket.basic-operation',
      type: 'operation',
      relationSchemaName: 'ticket',
      requiredSpans: [{ name: 'end' }],
      variants: {
        cold_boot: { timeout: DEFAULT_COLDBOOT_TIMEOUT_DURATION },
      },
    })
    tracer.createDraft({
      variant: 'cold_boot',
    })
    tracer.transitionDraftToActive({ relatedTo: { ticketId: '1' } })

    // prettier-ignore
    const { spans } = getSpansFromTimeline<TicketIdRelationSchemasFixture>`
      Events: ${Render('start', 0)}-----${Render('middle', 0)}
      Time:   ${0}                      ${50}
    `
    processSpans(spans, traceManager)

    const error = new Error('Test error')
    tracer.interrupt({ error })

    expect(reportFn).toHaveBeenCalled()
    const report = reportFn.mock.calls[0][0]
    expect(report.entries.length).toBe(3) // start, middle, and error mark
    expect(report.status).toBe('interrupted')
    expect(report.interruptionReason).toBe('aborted')
    // Last entry should be the error mark
    expect(report.entries[report.entries.length - 1].span.error).toBe(error)
  })

  it('interrupts an active trace when interrupt() is called without error', () => {
    const traceManager = new TraceManager({
      relationSchemas: { ticket: { ticketId: String } },
      reportFn,
      generateId,
      reportErrorFn,
      reportWarningFn,
    })
    const tracer = traceManager.createTracer({
      name: 'ticket.basic-operation',
      type: 'operation',
      relationSchemaName: 'ticket',
      requiredSpans: [{ name: 'end' }],
      variants: {
        cold_boot: { timeout: DEFAULT_COLDBOOT_TIMEOUT_DURATION },
      },
    })
    tracer.createDraft({
      variant: 'cold_boot',
    })
    tracer.transitionDraftToActive({ relatedTo: { ticketId: '1' } })

    // prettier-ignore
    const { spans } = getSpansFromTimeline<TicketIdRelationSchemasFixture>`
      Events: ${Render('start', 0)}-----${Render('middle', 0)}
      Time:   ${0}                      ${50}
    `
    processSpans(spans, traceManager)

    tracer.interrupt()

    expect(reportFn).toHaveBeenCalled()
    const report = reportFn.mock.calls[0][0]
    expect(report.status).toBe('interrupted')
    expect(report.entries.length).toBe(2) // start, middle
    expect(report.interruptionReason).toBe('aborted')
  })

  it('reports warning when interrupting a non-existent trace', () => {
    const traceManager = new TraceManager({
      relationSchemas: { ticket: { ticketId: String } },
      reportFn,
      generateId,
      reportErrorFn,
      reportWarningFn,
    })
    const tracer = traceManager.createTracer({
      name: 'ticket.basic-operation',
      type: 'operation',
      relationSchemaName: 'ticket',
      requiredSpans: [{ name: 'end' }],
      variants: {
        cold_boot: { timeout: DEFAULT_COLDBOOT_TIMEOUT_DURATION },
      },
    })

    tracer.interrupt({})

    expect(reportWarningFn).toHaveBeenCalledWith(
      expect.objectContaining({
        message: expect.stringContaining(
          'No currently active trace when canceling a draft',
        ),
      }),
      expect.objectContaining({
        definition: expect.any(Object),
      }),
    )
  })
})
