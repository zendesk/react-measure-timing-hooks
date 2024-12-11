import './test/asciiTimelineSerializer'
import { DEFAULT_CAPTURE_INTERACTIVE_TIME } from '../main'
import { DEFAULT_TIMEOUT_DURATION } from './constants'
import { ensureTimestamp } from './ensureTimestamp'
import { createQuietWindowDurationCalculator } from './getDynamicQuietWindowDuration'
import * as matchSpan from './matchSpan'
import type { Span, StartTraceConfig } from './spanTypes'
import {
  type TicketIdScope,
  ticketActivationDefinition,
  UserIdScope,
} from './test/fixtures'
import {
  Check,
  getSpansFromTimeline,
  LongTask,
  Render,
} from './test/makeTimeline'
import processSpans from './test/processSpans'
import { shouldCompleteAndHaveInteractiveTime } from './test/shouldCompleteAndHaveInteractiveTime'
import { shouldNotEndWithInteractiveTimeout } from './test/shouldNotEndWithInteractiveTimeout'
// import { shouldNotEndWithInterruption } from './test/shouldNotEndWithInterruption'
import { TraceManager } from './traceManager'
import type { ReportFn, TraceDefinition } from './types'
import { Ticket } from '../stories/mockComponentsv3/mockTickets'

function processCheckSpan(
  traceManager: TraceManager<TicketIdScope>,
  lastFixtureSpan: Span<TicketIdScope>,
  scope: TicketIdScope,
) {
  traceManager.processSpan({
    name: 'check',
    duration: 0,
    startTime: ensureTimestamp({
      now: lastFixtureSpan.startTime.now + lastFixtureSpan.duration + 10_000,
    }),
    type: 'mark',
    scope,
    attributes: {},
  })
}

const GOOGLES_QUIET_WINDOW_DURATION = 2_000
const GOOGLES_CLUSTER_PADDING = 1_000
const GOOGLES_HEAVY_CLUSTER_THRESHOLD = 250

const cpuIdleProcessorOptions = {
  getQuietWindowDuration: () => GOOGLES_QUIET_WINDOW_DURATION,
  clusterPadding: GOOGLES_CLUSTER_PADDING,
  heavyClusterThreshold: GOOGLES_HEAVY_CLUSTER_THRESHOLD,
}

interface TicketScope {
  ticketId: string
}

describe('TraceManager', () => {
  let reportFn: jest.Mock
  let generateId: jest.Mock

  jest.useFakeTimers({
    now: 0,
  })

  beforeEach(() => {
    reportFn = jest.fn<
      ReturnType<ReportFn<TicketScope, TicketScope>>,
      Parameters<ReportFn<TicketScope, TicketScope>>
    >()
    generateId = jest.fn().mockReturnValue('trace-id')
  })

  afterEach(() => {
    jest.clearAllMocks()
    jest.clearAllTimers()
  })

  it('tracks trace with minimal requirements', () => {
    const traceManager = new TraceManager<TicketScope>({ reportFn, generateId })
    const tracer = traceManager.createTracer({
      name: 'ticket.basic-operation',
      type: 'operation',
      scopes: [],
      requiredToEnd: [{ name: 'end' }],
    })
    const traceId = tracer.start({
      scope: {
        ticketId: '1',
      },
    })
    expect(traceId).toBe('trace-id')

    // prettier-ignore
    const { spans } = getSpansFromTimeline<TicketIdScope>`
    Events: ${Render('start', 0)}-----${Render('middle', 0)}-----${Render('end', 0)}---<===+2s===>----${Check}
    Time:   ${0}                      ${50}                      ${100}                               ${2_100}
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
      events    | start       middle      end
      timeline  | |-<⋯ +50 ⋯>-|-<⋯ +50 ⋯>-|
      time (ms) | 0           50          100
    `)
    expect(report.name).toBe('ticket.basic-operation')
    expect(report.duration).toBe(100)
    expect(report.status).toBe('ok')
    expect(report.interruptionReason).toBeUndefined()
  })

  it('correctly calculates a computed span', () => {
    const traceManager = new TraceManager<TicketScope>({ reportFn, generateId })
    const tracer = traceManager.createTracer({
      name: 'ticket.computed-span-operation',
      type: 'operation',
      scopes: [],
      requiredToEnd: [{ name: 'end' }],
    })
    const traceId = tracer.start({
      scope: {
        ticketId: '1',
      },
    })

    const computedSpanName = 'render-1-to-3'
    // Define a computed span
    tracer.defineComputedSpan({
      name: computedSpanName,
      startSpan: matchSpan.withName('render-1'),
      endSpan: matchSpan.withName('render-3'),
    })

    // Start trace
    expect(traceId).toBe('trace-id')

    // prettier-ignore
    const { spans } = getSpansFromTimeline<TicketIdScope>`
    Events: ${Render('start', 0)}---${Render('render-1', 50)}----${Render('render-2', 50)}----${Render('render-3', 50)}--------${Render('end', 0)}
    Time:   ${0}                    ${50}                     ${100}                       ${150}                        ${200}
    `

    processSpans(spans, traceManager)
    expect(reportFn).toHaveBeenCalled()

    const report: Parameters<ReportFn<TicketScope, TicketScope>>[0] =
      reportFn.mock.calls[0][0]
    expect(report.name).toBe('ticket.computed-span-operation')
    expect(report.duration).toBe(200)
    expect(report.status).toBe('ok')
    expect(report.interruptionReason).toBeUndefined()
    expect(report.computedSpans[computedSpanName]?.startOffset).toBe(50)
    expect(report.computedSpans[computedSpanName]?.duration).toBe(150)
    expect(
      report.entries.map(
        (spanAndAnnotation) => spanAndAnnotation.span.performanceEntry,
      ),
    ).toMatchInlineSnapshot(`
      events    | start       render-1(50)     render-2(50)     render-3(50)   end
      timeline  | |-<⋯ +50 ⋯>-[++++++++++++++]-[++++++++++++++]-[++++++++++++++|
      time (ms) | 0           50               100              150            200
    `)
  })

  it('correctly calculates a computed value', () => {
    const traceManager = new TraceManager<TicketScope>({ reportFn, generateId })
    const tracer = traceManager.createTracer({
      name: 'ticket.computed-value-operation',
      type: 'operation',
      scopes: [],
      requiredToEnd: [{ name: 'end' }],
    })
    const traceId = tracer.start({
      scope: {
        ticketId: '1',
      },
    })

    // Define a computed value
    tracer.defineComputedValue({
      name: 'feature',
      matches: [matchSpan.withName('feature')],
      computeValueFromMatches: (feature) => feature.length,
    })

    // Start trace
    expect(traceId).toBe('trace-id')

    // prettier-ignore
    const { spans } = getSpansFromTimeline<TicketIdScope>`
    Events: ${Render('start', 0)}--${Render('feature', 50)}--${Render('feature', 50)}-${Render('end', 0)}
    Time:   ${0}                   ${50}                     ${100}                    ${150}
    `

    processSpans(spans, traceManager)
    expect(reportFn).toHaveBeenCalled()
    const report: Parameters<ReportFn<TicketScope, TicketScope>>[0] =
      reportFn.mock.calls[0][0]
    expect(report.name).toBe('ticket.computed-value-operation')
    expect(report.duration).toBe(150)
    expect(report.status).toBe('ok')
    expect(report.interruptionReason).toBeUndefined()
    expect(report.computedValues).toEqual({
      feature: 2,
    })

    expect(
      report.entries.map(
        (spanAndAnnotation) => spanAndAnnotation.span.performanceEntry,
      ),
    ).toMatchInlineSnapshot(`
      events    | start       feature(50)              feature(50)             end
      timeline  | |-<⋯ +50 ⋯>-[+++++++++++++++++++++++][+++++++++++++++++++++++|
      time (ms) | 0           50                       100                     150
    `)
  })

  it('when matchScopes is true for two scopes: tracks trace with scope ticketId: 4 and scope userId: 3', () => {
    type AllScopesT = TicketIdScope & UserIdScope
    const traceManager = new TraceManager<AllScopesT>({ reportFn, generateId })
    const tracer = traceManager.createTracer({
      name: 'ticket.scope-operation',
      type: 'operation',
      scopes: ['ticketId'],
      timeoutDuration: 5_000,
      requiredToEnd: [{ name: 'end', matchScopes: true }],
    })
    const scope = {
      ticketId: '4',
      userId: '3',
    }
    const traceId = tracer.start({
      scope,
    })
    expect(traceId).toBe('trace-id')

    // prettier-ignore
    const { spans } = getSpansFromTimeline<AllScopesT>`
    Events: ${Render('start', 0)}-----${Render('middle', 0)}-----${Render('end', 0, { scope })}---<===+6s===>----${Check}
    Time:   ${0}                      ${50}                      ${100}                                          ${6_000}
    `
    processSpans(spans, traceManager)
    expect(reportFn).toHaveBeenCalled()

    const report: Parameters<ReportFn<TicketIdScope, AllScopesT>>[0] =
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
    expect(report.name).toBe('ticket.scope-operation')
    expect(report.interruptionReason).toBeUndefined()
    expect(report.duration).toBe(100)
    expect(report.status).toBe('ok')
    expect(report.scope).toEqual(scope)
  })

  describe('debounce', () => {
    it('tracks trace when debouncedOn is defined but no debounce events', () => {
      const traceManager = new TraceManager<TicketScope>({
        reportFn,
        generateId,
      })
      const tracer = traceManager.createTracer({
        name: 'ticket.operation',
        type: 'operation',
        scopes: [],
        requiredToEnd: [{ name: 'end' }],
        debounceOn: [{ name: 'debounce' }],
      })
      const traceId = tracer.start({
        scope: {
          ticketId: '1',
        },
      })
      expect(traceId).toBe('trace-id')

      // prettier-ignore
      const { spans } = getSpansFromTimeline<TicketIdScope>`
      Events: ${Render('start', 0)}-----${Render('middle', 0)}-----${Render('end', 0)}---<===+2s===>----${Check}
      Time:   ${0}                      ${50}                      ${100}                               ${2_100}
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
        events    | start       middle      end
        timeline  | |-<⋯ +50 ⋯>-|-<⋯ +50 ⋯>-|
        time (ms) | 0           50          100
      `)
      expect(report.name).toBe('ticket.operation')
      expect(report.duration).toBe(100)
      expect(report.status).toBe('ok')
      expect(report.interruptionReason).toBeUndefined()
    })

    it('tracks trace correctly when debounced entries are seen', () => {
      const traceManager = new TraceManager<TicketScope>({
        reportFn,
        generateId,
      })
      const tracer = traceManager.createTracer({
        name: 'ticket.debounce-operation',
        type: 'operation',
        scopes: [],
        requiredToEnd: [matchSpan.withName('end')],
        debounceOn: [matchSpan.withName((n: string) => n.endsWith('debounce'))],
        debounceDuration: 300,
      })
      tracer.start({
        scope: {
          ticketId: '1',
        },
      })

      // prettier-ignore
      const { spans } = getSpansFromTimeline<TicketIdScope>`
      Events: ${Render('start', 0)}-----${Render('end', 0)}-----${Render('shorter-debounce', 0)}-----${Render('short-debounce', 0)}-----${Render('long-debounce', 0)}-----${Check})}
      Time:   ${0}                      ${50}                   ${51}                                ${251}                             ${451}                           u ${1_051}
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
        events    |                                                     shorter-debounce           long-debounce
        events    | start                                             end             short-debounce
        timeline  | |-------------------------------------------------|-|-<⋯ +200 ⋯>--|-<⋯ +200 ⋯>-|
        time (ms) | 0                                                 50              251          451
        time (ms) |                                                     51
      `)
      expect(report.name).toBe('ticket.debounce-operation')
      expect(report.duration).toBe(451) // 50 + 1 + 200 + 200
      expect(report.status).toBe('ok')
      expect(report.interruptionReason).toBeUndefined()
    })
  })

  describe('interrupts', () => {
    it('interrupts a basic trace when interruptOn criteria is met', () => {
      const traceManager = new TraceManager<TicketScope>({
        reportFn,
        generateId,
      })
      const tracer = traceManager.createTracer({
        name: 'ticket.interrupt-on-basic-operation',
        type: 'operation',
        scopes: [],
        requiredToEnd: [matchSpan.withName('end')],
        interruptOn: [matchSpan.withName('interrupt')],
      })
      tracer.start({
        scope: {
          ticketId: '1',
        },
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
      expect(
        report.entries.map(
          (spanAndAnnotation) => spanAndAnnotation.span.performanceEntry,
        ),
      ).toMatchInlineSnapshot(`
        events    | start
        timeline  | |
        time (ms) | 0
      `)
      expect(report.name).toBe('ticket.interrupt-on-basic-operation')
      expect(report.duration).toBeNull()
      expect(report.status).toBe('interrupted')
      expect(report.interruptionReason).toBe('matched-on-interrupt')
    })

    it('interrupts itself when another trace is started', () => {
      const traceManager = new TraceManager<TicketIdScope>({
        reportFn,
        generateId,
      })
      const tracer = traceManager.createTracer({
        name: 'ticket.interrupt-itself-operation',
        type: 'operation',
        scopes: [],
        requiredToEnd: [{ name: 'end' }],
        debounceOn: [{ name: 'debounce' }],
      })
      const traceId = tracer.start({
        scope: {
          ticketId: '1',
        },
      })
      expect(traceId).toBe('trace-id')

      // prettier-ignore
      const { spans } = getSpansFromTimeline<TicketIdScope>`
      Events: ${Render('start', 0)}
      Time:   ${0}
      `
      processSpans(spans, traceManager)

      // Start another operation to interrupt the first one
      const newTraceId = tracer.start({
        scope: {
          ticketId: '1',
        },
      })
      expect(newTraceId).toBe('trace-id')
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

      expect(report.name).toBe('ticket.interrupt-itself-operation')
      expect(report.duration).toBeNull()
      expect(report.status).toBe('interrupted')
      expect(report.interruptionReason).toBe('another-trace-started')
    })

    // TESTING TODO: isIdle (idle-component-no-longer-idle)

    describe('timeout', () => {
      it('timeouts when the basic trace when the default timeout duration is reached', () => {
        const traceManager = new TraceManager<TicketScope>({
          reportFn,
          generateId,
        })
        const tracer = traceManager.createTracer({
          name: 'ticket.timeout-operation',
          type: 'operation',
          scopes: ['ticketId'],
          requiredToEnd: [{ name: 'timed-out-render' }],
          timeoutDuration: 500,
        })
        const traceId = tracer.start({
          startTime: { now: 0, epoch: 0 },
          scope: {
            ticketId: '1',
          },
        })
        expect(traceId).toBe('trace-id')

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

      it('timeouts when the basic trace when a custom timeout duration is reached', () => {
        const traceManager = new TraceManager<TicketScope>({
          reportFn,
          generateId,
        })
        const CUSTOM_TIMEOUT_DURATION = 500
        const tracer = traceManager.createTracer({
          name: 'ticket.timeout-operation',
          type: 'operation',
          scopes: [],
          requiredToEnd: [{ name: 'timed-out-render' }],
          timeoutDuration: CUSTOM_TIMEOUT_DURATION,
        })
        const traceId = tracer.start({
          startTime: { now: 0, epoch: 0 },
          scope: {
            ticketId: '1',
          },
        })
        expect(traceId).toBe('trace-id')

        // prettier-ignore
        const { spans } = getSpansFromTimeline<TicketIdScope>`
        Events: ${Render('start', 0)}------${Render('timed-out-render', 0)}
        Time:   ${0}                       ${CUSTOM_TIMEOUT_DURATION + 1}
        `
        processSpans(spans, traceManager)

        expect(reportFn).toHaveBeenCalled()

        const report: Parameters<ReportFn<TicketScope, TicketScope>>[0] =
          reportFn.mock.calls[0][0]

        expect(report.status).toBe('interrupted')
        expect(report.interruptionReason).toBe('timeout')
        expect(
          report.entries.map(
            (spanAndAnnotation) => spanAndAnnotation.span.performanceEntry,
          ),
        ).toMatchInlineSnapshot(`
          events    | start
          timeline  | |
          time (ms) | 0
        `)
        expect(report.name).toBe('ticket.timeout-operation')
        expect(report.duration).toBeNull()
      })

      it('transitions from debouncing to timeout', () => {
        const traceManager = new TraceManager<TicketScope>({
          reportFn,
          generateId,
        })
        const CUSTOM_TIMEOUT_DURATION = 500
        const tracer = traceManager.createTracer({
          name: 'ticket.timeout-operation',
          type: 'operation',
          scopes: [],
          requiredToEnd: [{ name: 'end' }],
          debounceOn: [{ name: 'debounce' }],
          timeoutDuration: CUSTOM_TIMEOUT_DURATION,
        })
        const traceId = tracer.start({
          startTime: { now: 0, epoch: 0 },
          scope: {
            ticketId: '1',
          },
        })
        expect(traceId).toBe('trace-id')

        // prettier-ignore
        const { spans } = getSpansFromTimeline<TicketIdScope>`
        Events: ${Render('start', 0)}--${Render('end', 0)}--${Render('debounce', 0)}--${Check}}
        Time:   ${0}                   ${50}                ${51}                     ${CUSTOM_TIMEOUT_DURATION + 1}
        `
        processSpans(spans, traceManager)

        expect(reportFn).toHaveBeenCalled()

        const report: Parameters<ReportFn<TicketIdScope, TicketIdScope>>[0] =
          reportFn.mock.calls[0][0]
        expect(
          report.entries.map(
            (spanAndAnnotation) => spanAndAnnotation.span.performanceEntry,
          ),
        ).toMatchInlineSnapshot(`
          events    |              debounce
          events    | start       end
          timeline  | |-<⋯ +50 ⋯>-||-
          time (ms) | 0           50
          time (ms) |              51
        `)
        expect(report.name).toBe('ticket.timeout-operation')
        expect(report.duration).toBeNull()
        expect(report.status).toBe('interrupted')
        expect(report.interruptionReason).toBe('timeout')
      })
    })
  })

  describe('while capturing interactivity (when captureInteractive is defined)', () => {
    it('correctly captures trace while waiting the long tasks to settle', () => {
      const traceManager = new TraceManager<TicketIdScope>({
        reportFn,
        generateId,
      })
      const tracer = traceManager.createTracer({
        name: 'ticket.operation',
        type: 'operation',
        scopes: [],
        requiredToEnd: [{ name: 'end' }],
        captureInteractive: cpuIdleProcessorOptions,
      })
      tracer.start({
        scope: {
          ticketId: '1',
        },
      })

      // prettier-ignore
      const { spans } = getSpansFromTimeline<TicketIdScope>`
      Events: ${Render('start', 0)}-----${Render('end', 0)}-----${LongTask(50)}------<===5s===>---------${Check}
      Time:   ${0}                      ${2_000}                ${2_001}                                ${2_001 + DEFAULT_CAPTURE_INTERACTIVE_TIME}
      `
      processSpans(spans, traceManager)
      expect(reportFn).toHaveBeenCalled()

      const report: Parameters<ReportFn<TicketIdScope, TicketIdScope>>[0] =
        reportFn.mock.calls[0][0]
      expect(
        report.entries.map(
          (spanAndAnnotation) => spanAndAnnotation.span.performanceEntry,
        ),
      ).toMatchInlineSnapshot(`
        events    | start         end
        timeline  | |-<⋯ +2000 ⋯>-|
        time (ms) | 0             2000
      `)
      expect(report.name).toBe('ticket.operation')
      expect(report.duration).toBe(2_000)
      expect(report.startTillInteractive).toBe(2_000)
      expect(report.status).toBe('ok')
      expect(report.interruptionReason).toBeUndefined()
    })

    it('completes the trace with waiting-for-interactive-timeout', () => {
      const traceManager = new TraceManager<TicketIdScope>({
        reportFn,
        generateId,
      })
      const interactiveTimeout = 5_000
      const tracer = traceManager.createTracer({
        name: 'ticket.operation',
        type: 'operation',
        scopes: [],
        requiredToEnd: [{ name: 'end' }],
        captureInteractive: {
          ...cpuIdleProcessorOptions,
          timeout: interactiveTimeout,
        },
      })
      tracer.start({
        scope: {
          ticketId: '1',
        },
      })

      // prettier-ignore
      const { spans } = getSpansFromTimeline<TicketIdScope>`
      Events: ${Render('start', 0)}-----${Render('end', 0)}-----${LongTask(interactiveTimeout)}
      Time:   ${0}                      ${2_000}                ${2_050}
      `
      processSpans(spans, traceManager)
      expect(reportFn).toHaveBeenCalled()

      const report: Parameters<ReportFn<TicketIdScope, TicketIdScope>>[0] =
        reportFn.mock.calls[0][0]
      expect(
        report.entries.map(
          (spanAndAnnotation) => spanAndAnnotation.span.performanceEntry,
        ),
      ).toMatchInlineSnapshot(`
        events    | start         end
        timeline  | |-<⋯ +2000 ⋯>-|
        time (ms) | 0             2000
      `)
      expect(report.name).toBe('ticket.operation')
      expect(report.duration).toBe(2_000)
      expect(report.interruptionReason).toBe('waiting-for-interactive-timeout')
      expect(report.startTillInteractive).toBeNull()
      expect(report.status).toBe('ok')
    })

    it('completes the trace when interrupted during waiting for capture interactive to finish', () => {
      const traceManager = new TraceManager<TicketIdScope>({
        reportFn,
        generateId,
      })
      const tracer = traceManager.createTracer({
        name: 'ticket.interrupt-during-long-task-operation',
        type: 'operation',
        scopes: [],
        requiredToEnd: [matchSpan.withName('end')],
        interruptOn: [matchSpan.withName('interrupt')],
        captureInteractive: cpuIdleProcessorOptions,
      })
      tracer.start({
        scope: {
          ticketId: '1',
        },
      })

      // prettier-ignore
      const { spans } = getSpansFromTimeline<TicketIdScope>`
      Events: ${Render('start', 0)}---------${Render('end', 0)}---------${Render('interrupt', 0)}--${LongTask(100)}--${Check}
      Time:   ${0}                          ${200}                      ${201}                     ${300}            ${5_000}
      `

      processSpans(spans, traceManager)
      expect(reportFn).toHaveBeenCalled()

      const report: Parameters<ReportFn<TicketIdScope, TicketIdScope>>[0] =
        reportFn.mock.calls[0][0]
      expect(
        report.entries.map(
          (spanAndAnnotation) => spanAndAnnotation.span.performanceEntry,
        ),
      ).toMatchInlineSnapshot(`
        events    | start        end
        timeline  | |-<⋯ +200 ⋯>-|
        time (ms) | 0            200
      `)
      expect(report.name).toBe('ticket.interrupt-during-long-task-operation')
      expect(report.duration).toBe(200)
      expect(report.startTillInteractive).toBeNull()
      expect(report.status).toBe('ok')
      expect(report.interruptionReason).toBe('matched-on-interrupt')
    })

    it('timeouts the trace while deboucing AND the last span is past the timeout duration', () => {
      const traceManager = new TraceManager<TicketIdScope>({
        reportFn,
        generateId,
      })
      const tracer = traceManager.createTracer({
        name: 'ticket.debounce-then-interrupted-operation',
        type: 'operation',
        scopes: [],
        requiredToEnd: [{ name: 'end' }],
        debounceOn: [{ name: 'debounce' }],
        captureInteractive: cpuIdleProcessorOptions,
        debounceDuration: 300,
      })
      tracer.start({
        scope: {
          ticketId: '1',
        },
      })

      // prettier-ignore
      const { spans } = getSpansFromTimeline<TicketIdScope>`
      Events: ${Render('start', 0)}-----${Render('end', 0)}-----${Render('debounce', 0)}------${Check}
      Time:   ${0}                      ${50}                   ${100}                        ${DEFAULT_TIMEOUT_DURATION + 100}
      `
      processSpans(spans, traceManager)
      expect(reportFn).toHaveBeenCalled()

      const report: Parameters<ReportFn<TicketIdScope, TicketIdScope>>[0] =
        reportFn.mock.calls[0][0]
      expect(
        report.entries.map(
          (spanAndAnnotation) => spanAndAnnotation.span.performanceEntry,
        ),
      ).toMatchInlineSnapshot(`
          events    | start       end         debounce
          timeline  | |-<⋯ +50 ⋯>-|-<⋯ +50 ⋯>-|
          time (ms) | 0           50          100
        `)
      expect(report.name).toBe('ticket.debounce-then-interrupted-operation')
      expect(report.status).toBe('interrupted')
      expect(report.duration).toBeNull()
      expect(report.interruptionReason).toBe('timeout')
      expect(report.startTillInteractive).toBeNull()
    })

    it('completes the trace when debouncing is done AND is waiting for capture interactive to finish', () => {
      const traceManager = new TraceManager<TicketIdScope>({
        reportFn,
        generateId,
      })
      const CUSTOM_CAPTURE_INTERACTIVE_TIMEOUT = 300
      const tracer = traceManager.createTracer({
        name: 'ticket.debounce-then-interrupted-operation',
        type: 'operation',
        scopes: [],
        requiredToEnd: [{ name: 'end' }],
        debounceOn: [{ name: 'debounce' }],
        captureInteractive: {
          ...cpuIdleProcessorOptions,
          timeout: CUSTOM_CAPTURE_INTERACTIVE_TIMEOUT,
        },
        debounceDuration: 100,
      })
      tracer.start({
        scope: {
          ticketId: '1',
        },
      })

      // prettier-ignore
      const { spans } = getSpansFromTimeline<TicketIdScope>`
      Events: ${Render('start', 0)}-----${Render('end', 0)}---------------------${Render('debounce', 100)}------------------${Check}
      Time:   ${0}                      ${DEFAULT_TIMEOUT_DURATION - 500}       ${DEFAULT_TIMEOUT_DURATION - 499}           ${DEFAULT_TIMEOUT_DURATION + 1}
      `
      processSpans(spans, traceManager)
      expect(reportFn).toHaveBeenCalled()

      const report: Parameters<ReportFn<TicketIdScope, TicketIdScope>>[0] =
        reportFn.mock.calls[0][0]
      expect(
        report.entries.map(
          (spanAndAnnotation) => spanAndAnnotation.span.performanceEntry,
        ),
      ).toMatchInlineSnapshot(`
        events    | start          end
        timeline  | |-<⋯ +44500 ⋯>-|
        time (ms) | 0              44500
      `)
      expect(report.name).toBe('ticket.debounce-then-interrupted-operation')
      expect(report.duration).toBe(44_500)
      expect(report.startTillInteractive).toBeNull()
      expect(report.status).toBe('ok')
      expect(report.interruptionReason).toBe('timeout')
    })

    it('uses getQuietWindowDuration from capture interactive config', () => {
      const traceManager = new TraceManager<TicketIdScope>({
        reportFn,
        generateId,
      })
      const CUSTOM_QUIET_WINDOW_DURATION = 2_000
      const TRACE_DURATION = 1_000
      const getQuietWindowDuration = jest
        .fn()
        .mockReturnValue(CUSTOM_QUIET_WINDOW_DURATION)
      const tracer = traceManager.createTracer({
        name: 'ticket.operation',
        type: 'operation',
        scopes: [],
        requiredToEnd: [{ name: 'end' }],
        captureInteractive: {
          ...cpuIdleProcessorOptions,
          timeout: 100,
          getQuietWindowDuration,
        },
      })
      tracer.start({
        scope: {
          ticketId: '1',
        },
      })

      // prettier-ignore
      const { spans } = getSpansFromTimeline<TicketIdScope>`
      Events: ${Render('start', 0)}-----${Render('end', 0)}-----${LongTask(5)}------------${LongTask(5)}-----${Check}
      Time:   ${0}                      ${TRACE_DURATION}       ${1_001}                  ${1_050}           ${1_200}
      `

      processSpans(spans, traceManager)
      expect(reportFn).toHaveBeenCalled()
      const report: Parameters<ReportFn<TicketIdScope, TicketIdScope>>[0] =
        reportFn.mock.calls[0][0]

      expect(
        report.entries.map(
          (spanAndAnnotation) => spanAndAnnotation.span.performanceEntry,
        ),
      ).toMatchInlineSnapshot(`
        events    | start         end
        timeline  | |-<⋯ +1000 ⋯>-|
        time (ms) | 0             1000
      `)
      expect(report.name).toBe('ticket.operation')
      expect(report.duration).toBe(TRACE_DURATION)
      expect(report.startTillInteractive).toBeNull()
      expect(report.status).toBe('ok')
      expect(report.interruptionReason).toBe('waiting-for-interactive-timeout')
      expect(getQuietWindowDuration).toHaveBeenCalled()
      expect(getQuietWindowDuration).toHaveBeenCalledWith(1_055, TRACE_DURATION)
    })

    it('uses createQuietWindowDurationCalculator for getQuietWindowDuration in capture interactive config', () => {
      const traceManager = new TraceManager<TicketIdScope>({
        reportFn,
        generateId,
      })
      const TRACE_DURATION = 1_000

      const tracer = traceManager.createTracer({
        name: 'ticket.operation',
        type: 'operation',
        scopes: [],
        requiredToEnd: [{ name: 'end' }],
        captureInteractive: {
          ...cpuIdleProcessorOptions,
          timeout: 1_000,
          getQuietWindowDuration: createQuietWindowDurationCalculator(),
        },
      })
      tracer.start({
        scope: {
          ticketId: '1',
        },
      })

      // prettier-ignore
      const { spans } = getSpansFromTimeline<TicketIdScope>`
      Events: ${Render('start', 0)}-----${Render('end', 0)}-----------${LongTask(5)}----------------${LongTask(50)}---${Check}
      Time:   ${0}                      ${TRACE_DURATION}             ${1_001}                      ${1_945}          ${2_001}
      `

      processSpans(spans, traceManager)
      expect(reportFn).toHaveBeenCalled()
      const report: Parameters<ReportFn<TicketIdScope, TicketIdScope>>[0] =
        reportFn.mock.calls[0][0]

      expect(
        report.entries.map(
          (spanAndAnnotation) => spanAndAnnotation.span.performanceEntry,
        ),
      ).toMatchInlineSnapshot(`
        events    | start         end
        timeline  | |-<⋯ +1000 ⋯>-|
        time (ms) | 0             1000
      `)
      expect(report.name).toBe('ticket.operation')
      expect(report.duration).toBe(TRACE_DURATION)
      expect(report.startTillInteractive).toBeNull()
      expect(report.status).toBe('ok')
      expect(report.interruptionReason).toBe('waiting-for-interactive-timeout')
    })

    it('No long tasks after FMP, FirstCPUIdle immediately after FMP + quiet window', () => {
      const traceManager = new TraceManager<TicketIdScope>({
        reportFn,
        generateId,
      })
      const tracer = traceManager.createTracer({
        name: 'ticket.operation',
        type: 'operation',
        scopes: [],
        requiredToEnd: [{ name: 'end' }],
        captureInteractive: cpuIdleProcessorOptions,
      })
      tracer.start({
        scope: {
          ticketId: '1',
        },
      })

      // prettier-ignore
      const { spans } = getSpansFromTimeline<TicketIdScope>`
      Events: ${Render('start', 0)}-----${Render('end', 0)}----------${LongTask(400)}-----${Check}
      Time:   ${0}                      ${200}                       ${4_600}             ${5_000}
      `

      processSpans(spans, traceManager)
      expect(reportFn).toHaveBeenCalled()

      const report: Parameters<ReportFn<TicketIdScope, TicketIdScope>>[0] =
        reportFn.mock.calls[0][0]
      expect(
        report.entries.map(
          (spanAndAnnotation) => spanAndAnnotation.span.performanceEntry,
        ),
      ).toMatchInlineSnapshot(`
        events    | start        end
        timeline  | |-<⋯ +200 ⋯>-|
        time (ms) | 0            200
      `)

      expect(report.name).toBe('ticket.operation')
      expect(report.duration).toBe(200)
      expect(report.startTillInteractive).toBe(200)
      expect(report.status).toBe('ok')
      expect(report.interruptionReason).toBeUndefined()
    })

    it('One light cluster after FMP, FirstCPUIdle at FMP', () => {
      const traceManager = new TraceManager<TicketIdScope>({
        reportFn,
        generateId,
      })
      const tracer = traceManager.createTracer({
        name: 'ticket.operation',
        type: 'operation',
        scopes: [],
        requiredToEnd: [{ name: 'end' }],
        captureInteractive: cpuIdleProcessorOptions,
      })
      tracer.start({
        scope: {
          ticketId: '1',
        },
      })

      // prettier-ignore
      const { spans } = getSpansFromTimeline<TicketIdScope>`
      Events: ${Render('start', 0)}-----${Render('end', 0)}----------${LongTask(50)}------${LongTask(50)}-----${LongTask(50)}---------${Check}
      Time:   ${0}                      ${200}                       ${300}               ${400}              ${450}                  ${3_050}
      `

      processSpans(spans, traceManager)
      expect(reportFn).toHaveBeenCalled()

      const report: Parameters<ReportFn<TicketIdScope, TicketIdScope>>[0] =
        reportFn.mock.calls[0][0]
      expect(
        report.entries.map(
          (spanAndAnnotation) => spanAndAnnotation.span.performanceEntry,
        ),
      ).toMatchInlineSnapshot(`
        events    | start        end
        timeline  | |-<⋯ +200 ⋯>-|
        time (ms) | 0            200
      `)

      expect(report.name).toBe('ticket.operation')
      expect(report.duration).toBe(200)
      expect(report.startTillInteractive).toBe(200)
      expect(report.status).toBe('ok')
      expect(report.interruptionReason).toBeUndefined()
    })

    it('One heavy cluster after FMP, FirstCPUIdle after the cluster', () => {
      const traceManager = new TraceManager<TicketIdScope>({
        reportFn,
        generateId,
      })
      const tracer = traceManager.createTracer({
        name: 'ticket.operation',
        type: 'operation',
        scopes: [],
        requiredToEnd: [{ name: 'end' }],
        captureInteractive: cpuIdleProcessorOptions,
      })
      tracer.start({
        scope: {
          ticketId: '1',
        },
      })

      // prettier-ignore
      const { spans } = getSpansFromTimeline<TicketIdScope>`
      Events: ${Render('start', 0)}-----${Render('end', 0)}--${LongTask(50)}}-${LongTask(200)}-----${LongTask(50)}-----------${Check}
      Time:   ${0}                      ${200}               ${300}           ${400}                ${650}                   ${3_200}
      `

      processSpans(spans, traceManager)
      expect(reportFn).toHaveBeenCalled()

      const report: Parameters<ReportFn<TicketIdScope, TicketIdScope>>[0] =
        reportFn.mock.calls[0][0]
      expect(
        report.entries.map(
          (spanAndAnnotation) => spanAndAnnotation.span.performanceEntry,
        ),
      ).toMatchInlineSnapshot(`
        events    | start        end         task(50)    task(200)                      task(50)
        timeline  | |-<⋯ +200 ⋯>-|-----------[++++]------[+++++++++++++++++++++++]------[++++]-
        time (ms) | 0            200         300         400                            650
      `)

      expect(report.name).toBe('ticket.operation')
      expect(report.duration).toBe(200)
      expect(report.startTillInteractive).toBe(700)
      // TESTING TODO: are we testing enough of first idle time?
      expect(report.completeTillInteractive).toBe(500)
      expect(report.status).toBe('ok')
      expect(report.interruptionReason).toBeUndefined()
    })

    it('Multiple heavy clusters, FirstCPUIdle updated to end of last cluster', () => {
      const traceManager = new TraceManager<TicketIdScope>({
        reportFn,
        generateId,
      })
      const tracer = traceManager.createTracer({
        name: 'ticket.operation',
        type: 'operation',
        scopes: [],
        requiredToEnd: [{ name: 'end' }],
        captureInteractive: cpuIdleProcessorOptions,
      })
      tracer.start({
        scope: {
          ticketId: '1',
        },
      })

      // prettier-ignore
      const { spans } = getSpansFromTimeline<TicketIdScope>`
      Events: ${Render('start', 0)}-----${Render('end', 0)}-----${LongTask(200)}-----${LongTask(200)}-----${LongTask(200)}-----${Check}
      Time:   ${0}                      ${200}                 ${300}              ${900}              ${1_500}             ${3_800}
      `

      processSpans(spans, traceManager)
      expect(reportFn).toHaveBeenCalled()

      const report: Parameters<ReportFn<TicketIdScope, TicketIdScope>>[0] =
        reportFn.mock.calls[0][0]
      expect(
        report.entries.map(
          (spanAndAnnotation) => spanAndAnnotation.span.performanceEntry,
        ),
      ).toMatchInlineSnapshot(`
        events    | start        end    task(200)                 task(200)                task(200)
        timeline  | |------------|------[+++++++++++]-<⋯ +400 ⋯>--[+++++++++++]-<⋯ +400 ⋯>-[+++++++++++]
        time (ms) | 0            200    300                       900                      1500
      `)

      const lastLongTask = spans.at(-2)!
      const expectedResult = lastLongTask.startTime.now + lastLongTask.duration

      expect(report.name).toBe('ticket.operation')
      expect(report.duration).toBe(200)
      expect(report.startTillInteractive).toBe(expectedResult)
      expect(report.status).toBe('ok')
      expect(report.interruptionReason).toBeUndefined()
    })

    it('Checking before the quiet window has passed - no long tasks processed, FirstCPUIdle not found', () => {
      const traceManager = new TraceManager<TicketIdScope>({
        reportFn,
        generateId,
      })
      const tracer = traceManager.createTracer({
        name: 'ticket.operation',
        type: 'operation',
        scopes: [],
        requiredToEnd: [{ name: 'end' }],
        captureInteractive: cpuIdleProcessorOptions,
      })
      tracer.start({
        scope: {
          ticketId: '1',
        },
      })

      // prettier-ignore
      const { spans } = getSpansFromTimeline<TicketIdScope>`
      Events: ${Render('start', 0)}-----${Render('end', 0)}-----${Check}
      Time:   ${0}                      ${200}                  ${2_400}
      `

      processSpans(spans, traceManager)
      expect(reportFn).toHaveBeenCalled()

      const report: Parameters<ReportFn<TicketIdScope, TicketIdScope>>[0] =
        reportFn.mock.calls[0][0]
      expect(
        report.entries.map(
          (spanAndAnnotation) => spanAndAnnotation.span.performanceEntry,
        ),
      ).toMatchInlineSnapshot(`
        events    | start        end
        timeline  | |-<⋯ +200 ⋯>-|
        time (ms) | 0            200
      `)

      expect(report.name).toBe('ticket.operation')
      expect(report.duration).toBe(200)
      expect(report.startTillInteractive).toBe(200)
      expect(report.status).toBe('ok')
      expect(report.interruptionReason).toBeUndefined()
    })

    it('completes the trace with one heavy cluster followed by two light clusters, value is after 1st heavy cluster', () => {
      const traceManager = new TraceManager<TicketIdScope>({
        reportFn,
        generateId,
      })
      const tracer = traceManager.createTracer({
        name: 'ticket.operation',
        type: 'operation',
        scopes: [],
        requiredToEnd: [{ name: 'end' }],
        captureInteractive: cpuIdleProcessorOptions,
      })
      tracer.start({
        scope: {
          ticketId: '1',
        },
      })

      // prettier-ignore
      const { spans } = getSpansFromTimeline<TicketIdScope>`
      Events: ${Render('start', 0)}-----${Render('end', 0)}-----${LongTask(200)}-----${LongTask(100)}-----${LongTask(200)}-----${LongTask(200)}-----${Check}
      Time:   ${0}                      ${200}                  ${300}               ${600}               ${1_700}             ${2_900}             ${4_650}
        }
    `

      processSpans(spans, traceManager)
      expect(reportFn).toHaveBeenCalled()

      const report: Parameters<ReportFn<TicketIdScope, TicketIdScope>>[0] =
        reportFn.mock.calls[0][0]
      expect(
        report.entries.map(
          (spanAndAnnotation) => spanAndAnnotation.span.performanceEntry,
        ),
      ).toMatchInlineSnapshot(`
        events    | start        end         task(200)                            task(100)
        timeline  | |-<⋯ +200 ⋯>-|-----------[+++++++++++++++++++++++]------------[++++++++++]-
        time (ms) | 0            200         300                                  600
      `)

      const lastHeavyClusterLongTask = spans.at(3)!
      const expectedResult =
        lastHeavyClusterLongTask.startTime.now +
        lastHeavyClusterLongTask.duration

      expect(report.name).toBe('ticket.operation')
      expect(report.duration).toBe(200)
      expect(report.startTillInteractive).toBe(expectedResult)
      expect(report.status).toBe('ok')
      expect(report.interruptionReason).toBeUndefined()
    })

    it('completes the trace with continuous heavy clusters', () => {
      const traceManager = new TraceManager<TicketIdScope>({
        reportFn,
        generateId,
      })
      const tracer = traceManager.createTracer({
        name: 'ticket.operation',
        type: 'operation',
        scopes: [],
        requiredToEnd: [{ name: 'end' }],
        captureInteractive: cpuIdleProcessorOptions,
      })
      tracer.start({
        scope: {
          ticketId: '1',
        },
      })

      // prettier-ignore
      const { spans } = getSpansFromTimeline<TicketIdScope>`
      Events: ${Render('start', 0)}-----${Render('end', 0)}-----${LongTask(300)}-----${LongTask(300)}-----${LongTask(300)}-----${LongTask(300)}-----${LongTask(300)}-----${LongTask(300)}-----${LongTask(300)}-----${LongTask(300)}-----${LongTask(300)}-----${LongTask(300)}-----${LongTask(300)}-----${LongTask(300)}-----${LongTask(300)}-----${LongTask(300)}-----${Check}
      Time:   ${0}                      ${200}                  ${550}               ${900}               ${1_250}             ${1_600}             ${1_950}             ${2_300}             ${2_650}             ${3_000}             ${3_350}             ${3_700}             ${4_050}             ${4_400}             ${4_750}             ${5_100}             ${7_450}
      `

      processSpans(spans, traceManager)
      expect(reportFn).toHaveBeenCalled()

      const report: Parameters<ReportFn<TicketIdScope, TicketIdScope>>[0] =
        reportFn.mock.calls[0][0]
      expect(
        report.entries.map(
          (spanAndAnnotation) => spanAndAnnotation.span.performanceEntry,
        ),
      ).toMatchInlineSnapshot(`
        events    |   end        task(300) task(300) task(300) task(300) task(300) task(300) task(300)
        events    | start   task(300) task(300) task(300) task(300) task(300) task(300) task(300)
        timeline  | |-|-----[++]-[++]-[++]-[++]-[++]-[++]-[++]-[++]-[++]-[++]-[++]-[++]-[++]-[++]-
        time (ms) | 0 200   550  900  1250 1600 1950 2300 2650 3000 3350 3700 4050 4400 4750 5100
      `)

      expect(report.name).toBe('ticket.operation')
      expect(report.duration).toBe(200)
      // TESTING TODO: Hmm. shouldnt this be undefined?
      // expect(report.startTillInteractive).toBeUndefined()
      expect(report.status).toBe('ok')
      expect(report.interruptionReason).toBeUndefined()
    })

    it('completes the trace with a light cluster followed by a heavy cluster a second later, FirstCPUIdle updated', () => {
      const traceManager = new TraceManager<TicketIdScope>({
        reportFn,
        generateId,
      })
      const tracer = traceManager.createTracer({
        name: 'ticket.operation',
        type: 'operation',
        scopes: [],
        requiredToEnd: [{ name: 'end' }],
        captureInteractive: cpuIdleProcessorOptions,
      })
      tracer.start({
        scope: {
          ticketId: '1',
        },
      })

      // prettier-ignore
      const { spans } = getSpansFromTimeline<TicketIdScope>`
      Events: ${Render('start', 0)}-----${Render('end', 0)}-----${LongTask(50)}----------${LongTask(50)}----------${LongTask(50)}--------${LongTask(50)}---------${LongTask(200)}-------${LongTask(200)}--------${Check}
      Time:   ${0}                      ${200}                 ${300}                    ${350}                   ${1_450}               ${1_550}                ${1_650}               ${1_900}                ${4_150}
      `

      processSpans(spans, traceManager)
      expect(reportFn).toHaveBeenCalled()

      const report: Parameters<ReportFn<TicketIdScope, TicketIdScope>>[0] =
        reportFn.mock.calls[0][0]
      expect(
        report.entries.map(
          (spanAndAnnotation) => spanAndAnnotation.span.performanceEntry,
        ),
      ).toMatchInlineSnapshot(`
        events    |                          task(50)            task(50)
        events    | start        end    task(50)            task(50)   task(200)       task(200)
        timeline  | |------------|------[+]--[+]-<⋯ +1050 ⋯>[+]--[+]---[+++++++++++]---[+++++++++++]-
        time (ms) | 0            200    300  350            1450 1550  1650            1900
      `)

      const lastLongTask = spans.at(-2)!
      const expectedResult = lastLongTask.startTime.now + lastLongTask.duration

      expect(report.name).toBe('ticket.operation')
      expect(report.duration).toBe(200)
      expect(report.startTillInteractive).toBe(expectedResult)
      expect(report.status).toBe('ok')
      expect(report.interruptionReason).toBeUndefined()
    })

    it('completes the trace with a long task overlapping FMP, FirstCPUIdle after the long task', () => {
      const traceManager = new TraceManager<TicketIdScope>({
        reportFn,
        generateId,
      })
      const tracer = traceManager.createTracer({
        name: 'ticket.operation',
        type: 'operation',
        scopes: [],
        requiredToEnd: [{ name: 'end' }],
        captureInteractive: cpuIdleProcessorOptions,
      })
      tracer.start({
        scope: {
          ticketId: '1',
        },
      })

      // prettier-ignore
      const { spans } = getSpansFromTimeline<TicketIdScope>`
      Events: ${Render('start', 0)}----------${LongTask(110, { start: 150 })}----${Render('end', 0)}-----${Check}
      Time:   ${0}                           ${150}                              ${200}                  ${2_500}
      `

      processSpans(spans, traceManager)
      expect(reportFn).toHaveBeenCalled()

      const report: Parameters<ReportFn<TicketIdScope, TicketIdScope>>[0] =
        reportFn.mock.calls[0][0]
      expect(
        report.entries.map(
          (spanAndAnnotation) => spanAndAnnotation.span.performanceEntry,
        ),
      ).toMatchInlineSnapshot(`
        events    | start        end
        timeline  | |-<⋯ +200 ⋯>-|
        time (ms) | 0            200
      `)

      const lastLongTask = spans.at(-2)!
      const expectedResult = lastLongTask.startTime.now + lastLongTask.duration

      expect(report.name).toBe('ticket.operation')
      expect(report.duration).toBe(200)
      expect(report.startTillInteractive).toBe(expectedResult)
      expect(report.status).toBe('ok')
      expect(report.interruptionReason).toBeUndefined()
    })
  })

  describe('tests using fixtures', () => {
    it('should complete with interactive time without interruption', () => {
      const traceManager = new TraceManager<TicketIdScope>({
        reportFn,
        generateId,
      })
      const fixtureEntries = shouldCompleteAndHaveInteractiveTime
      const scope = fixtureEntries.find((entry) => 'scope' in entry.span)!.span
        .scope!
      const tracer = traceManager.createTracer(ticketActivationDefinition)
      tracer.start({
        scope,
        startTime: fixtureEntries[0]!.span.startTime,
      })

      for (const entry of fixtureEntries) {
        traceManager.processSpan(entry.span)
      }
      const lastFixtureSpan = fixtureEntries.at(-1)!.span
      processCheckSpan(traceManager, lastFixtureSpan, scope)

      expect(reportFn).toHaveBeenCalled()
      const {
        entries,
        spanAttributes,
        ...report
      }: Parameters<ReportFn<TicketIdScope, TicketIdScope>>[0] =
        reportFn.mock.calls[0][0]

      expect(report).toMatchInlineSnapshot(`
        {
          "attributes": {},
          "completeTillInteractive": 0,
          "computedRenderBeaconSpans": {
            "ConversationPane": {
              "renderCount": 6,
              "startOffset": 549.6999999880791,
              "sumOfDurations": 347.5,
              "timeToContent": 954.7000000178814,
              "timeToData": 899.6000000089407,
              "timeToLoading": 67,
            },
            "OmniComposer": {
              "renderCount": 8,
              "startOffset": 812.5,
              "sumOfDurations": 346.60000002384186,
              "timeToContent": 665.8999999910593,
              "timeToData": 112.5,
              "timeToLoading": 0,
            },
            "OmniLog": {
              "renderCount": 7,
              "startOffset": 547.3999999910593,
              "sumOfDurations": 290.2000000178814,
              "timeToContent": 953.2000000029802,
              "timeToData": 901.5,
              "timeToLoading": 56.099999994039536,
            },
          },
          "computedSpans": {},
          "computedValues": {},
          "duration": 1504.4000000059605,
          "id": "trace-id",
          "interruptionReason": undefined,
          "name": "ticket.activation",
          "scope": {
            "ticketId": "74",
          },
          "startTillInteractive": 1504.4000000059605,
          "startTime": {
            "epoch": 1732230167488.4,
            "now": 298438.60000000894,
          },
          "status": "ok",
          "type": "operation",
        }
      `)
      expect(report.duration).toBeCloseTo(1_504.4)
      expect(report.interruptionReason).toBeUndefined()
      expect(report.startTillInteractive).toBeCloseTo(1_504.4)
    })

    it('should not end with interruption', () => {
      const traceManager = new TraceManager<TicketIdScope>({
        reportFn,
        generateId,
      })
      const fixtureEntries = shouldNotEndWithInteractiveTimeout
      const scope = fixtureEntries.find((entry) => 'scope' in entry.span)!.span
        .scope!
      const tracer = traceManager.createTracer(ticketActivationDefinition)
      tracer.start({
        scope,
        startTime: {
          ...fixtureEntries[0]!.span.startTime,
          now:
            fixtureEntries[0]!.span.startTime.now -
            fixtureEntries[0]!.annotation.operationRelativeStartTime,
        },
      })

      for (const entry of fixtureEntries) {
        traceManager.processSpan(entry.span)
      }
      const lastFixtureSpan = fixtureEntries.at(-1)!.span
      processCheckSpan(traceManager, lastFixtureSpan, scope)

      expect(reportFn).toHaveBeenCalled()
      const {
        entries,
        spanAttributes,
        ...report
      }: Parameters<ReportFn<TicketIdScope, TicketIdScope>>[0] =
        reportFn.mock.calls[0][0]

      expect(report).toMatchInlineSnapshot(`
        {
          "attributes": {},
          "completeTillInteractive": 0,
          "computedRenderBeaconSpans": {
            "ConversationPane": {
              "renderCount": 5,
              "startOffset": 528.4000000059605,
              "sumOfDurations": 283.0999999791384,
              "timeToContent": 761.9999999850988,
              "timeToData": 723.0999999940395,
              "timeToLoading": 69.29999999701977,
            },
            "OmniComposer": {
              "renderCount": 8,
              "startOffset": 733.5,
              "sumOfDurations": 258.3999999910593,
              "timeToContent": 541.8000000119209,
              "timeToData": 61.5,
              "timeToLoading": 0,
            },
            "OmniLog": {
              "renderCount": 9,
              "startOffset": 526.3000000119209,
              "sumOfDurations": 255.90000002086163,
              "timeToContent": 776.0999999791384,
              "timeToData": 724.5999999940395,
              "timeToLoading": 56.6000000089407,
            },
          },
          "computedSpans": {},
          "computedValues": {},
          "duration": 1302.3999999910593,
          "id": "trace-id",
          "interruptionReason": undefined,
          "name": "ticket.activation",
          "scope": {
            "ticketId": "74",
          },
          "startTillInteractive": 1302.3999999910593,
          "startTime": {
            "epoch": 1732236012113.3,
            "now": 34982.5,
          },
          "status": "ok",
          "type": "operation",
        }
      `)
      expect(report.duration).toBeCloseTo(1_302.4)
      expect(report.interruptionReason).toBeUndefined()
      expect(report.startTillInteractive).toBeCloseTo(1_302.4)
    })
  })
})
