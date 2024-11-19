import './test/asciiTimelineSerializer'
import * as matchSpan from './matchSpan'
import type { StartTraceConfig } from './spanTypes'
import {
  Check,
  getEventsFromTimeline,
  LongTask,
  Render,
} from './test/makeTimeline'
import processEntries from './test/processEntries'
import { TraceManager } from './traceManager'
import type { ReportFn, ScopeBase, TraceDefinition } from './types'

describe('TraceManager', () => {
  let reportFn: jest.Mock
  let generateId: jest.Mock

  jest.useFakeTimers()

  beforeEach(() => {
    reportFn = jest.fn<
      ReturnType<ReportFn<ScopeBase>>,
      Parameters<ReportFn<ScopeBase>>
    >()
    generateId = jest.fn().mockReturnValue('trace-id')
  })

  afterEach(() => {
    jest.clearAllMocks()
    jest.clearAllTimers()
  })

  // TESTING TODO: check with scope

  it('tracks operation with minimal requirements', () => {
    const traceManager = new TraceManager<ScopeBase>({ reportFn, generateId })
    const traceDefinition: TraceDefinition<ScopeBase> = {
      name: 'ticket.basic-operation',
      type: 'operation',
      requiredScopeKeys: [],
      requiredToEnd: [{ name: 'end' }],
    }
    const tracer = traceManager.createTracer(traceDefinition)
    const startConfig: StartTraceConfig<ScopeBase> = {
      scope: {},
    }

    // start trace
    const traceId = tracer.start(startConfig)
    expect(traceId).toBe('trace-id')

    // prettier-ignore
    const { entries } = getEventsFromTimeline`
    Events: ${Render('start', 0)}-----${Render('middle', 0)}-----${Render('end', 0)}---<===+2s===>----${Check}
    Time:   ${0}                      ${50}                      ${100}                               ${2_100}
    `

    processEntries(entries, traceManager)
    expect(reportFn).toHaveBeenCalled()

    const report: Parameters<ReportFn<ScopeBase>>[0] = reportFn.mock.calls[0][0]
    expect(report.name).toBe('ticket.basic-operation')
    expect(report.duration).toBe(100)
    expect(report.status).toBe('ok')
    expect(report.interruptionReason).toBeUndefined()

    expect(
      report.entries.map(
        (spanAndAnnotation) => spanAndAnnotation.span.performanceEntry,
      ),
    ).toMatchInlineSnapshot(`
      events    | start       middle      end
      timeline  | |-<⋯ +50 ⋯>-|-<⋯ +50 ⋯>-|
      time (ms) | 0           50          100
    `)
  })

  describe('debounce', () => {
    it('tracks operation when debouncedOn is defined but no debounce events', () => {
      const traceManager = new TraceManager<ScopeBase>({ reportFn, generateId })
      const traceDefinition: TraceDefinition<ScopeBase> = {
        name: 'ticket.operation',
        type: 'operation',
        requiredScopeKeys: [],
        requiredToEnd: [{ name: 'end' }],
        debounceOn: [{ name: 'debounce' }],
      }

      const tracer = traceManager.createTracer(traceDefinition)
      const startConfig: StartTraceConfig<ScopeBase> = {
        scope: {},
      }

      // start trace
      const traceId = tracer.start(startConfig)
      expect(traceId).toBe('trace-id')

      // prettier-ignore
      const { entries } = getEventsFromTimeline`
      Events: ${Render('start', 0)}-----${Render('middle', 0)}-----${Render('end', 0)}---<===+2s===>----${Check}
      Time:   ${0}                      ${50}                      ${100}                               ${2_100}
      `
      processEntries(entries, traceManager)
      expect(reportFn).toHaveBeenCalled()

      const report: Parameters<ReportFn<ScopeBase>>[0] =
        reportFn.mock.calls[0][0]
      expect(report.name).toBe('ticket.operation')
      expect(report.duration).toBe(100)
      expect(report.status).toBe('ok')
      expect(report.interruptionReason).toBeUndefined()

      expect(
        report.entries.map(
          (spanAndAnnotation) => spanAndAnnotation.span.performanceEntry,
        ),
      ).toMatchInlineSnapshot(`
        events    | start       middle      end
        timeline  | |-<⋯ +50 ⋯>-|-<⋯ +50 ⋯>-|
        time (ms) | 0           50          100
      `)
    })

    it('tracks operation correctly when debounced entries are seen', () => {
      const traceManager = new TraceManager<ScopeBase>({ reportFn, generateId })
      const traceDefinition: TraceDefinition<ScopeBase> = {
        name: 'ticket.debounce-operation',
        type: 'operation',
        requiredScopeKeys: [],
        requiredToEnd: [matchSpan.withName('end')],
        debounceOn: [matchSpan.withName((n: string) => n.endsWith('debounce'))],
        debounceDuration: 300,
      }
      const tracer = traceManager.createTracer(traceDefinition)
      const startConfig: StartTraceConfig<ScopeBase> = {
        scope: {
          ticketId: 1,
        },
      }

      // start trace
      tracer.start(startConfig)

      // prettier-ignore
      const { entries } = getEventsFromTimeline`
      Events: ${Render('start', 0)}-----${Render('end', 0)}-----${Render('shorter-debounce', 0)}-----${Render('short-debounce', 0)}-----${Render('long-debounce', 0)}-----${Check})}
      Time:   ${0}                      ${50}                   ${51}                                ${251}                             ${451}                           u ${1_051}
      `
      processEntries(entries, traceManager)

      expect(reportFn).toHaveBeenCalled()

      const report: Parameters<ReportFn<ScopeBase>>[0] =
        reportFn.mock.calls[0][0]
      expect(report.name).toBe('ticket.debounce-operation')
      expect(report.duration).toBe(451) // 50 + 1 + 200 + 200
      expect(report.status).toBe('ok')
      expect(report.interruptionReason).toBeUndefined()

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
    })

    // TESTING TODO: isIdle (idle-component-no-longer-idle)
  })

  describe('interrupts', () => {
    it('interrupts a basic trace when interruptOn criteria is met', () => {
      const traceManager = new TraceManager<ScopeBase>({ reportFn, generateId })
      const traceDefinition: TraceDefinition<ScopeBase> = {
        name: 'ticket.interrupt-on-basic-operation',
        type: 'operation',
        requiredScopeKeys: [],
        requiredToEnd: [matchSpan.withName('end')],
        interruptOn: [matchSpan.withName('interrupt')],
      }
      const tracer = traceManager.createTracer(traceDefinition)
      const startConfig: StartTraceConfig<ScopeBase> = {
        scope: {
          ticketId: 1,
        },
      }

      // start trace
      tracer.start(startConfig)

      // prettier-ignore
      const { entries } = getEventsFromTimeline`
      Events: ${Render('start', 0)}-----${Render('interrupt', 0)}-----${Render('end', 0)}
      Time:   ${0}                      ${100}                      ${200}
      `

      processEntries(entries, traceManager)

      expect(reportFn).toHaveBeenCalled()

      const report: Parameters<ReportFn<ScopeBase>>[0] =
        reportFn.mock.calls[0][0]
      expect(report.name).toBe('ticket.interrupt-on-basic-operation')
      expect(report.duration).toBeNull()
      expect(report.status).toBe('interrupted')
      expect(report.interruptionReason).toBe('matched-on-interrupt')

      expect(
        report.entries.map(
          (spanAndAnnotation) => spanAndAnnotation.span.performanceEntry,
        ),
      ).toMatchInlineSnapshot(`
        events    | start
        timeline  | |
        time (ms) | 0
      `)
    })

    it('interrupts itself when another operation is started', () => {
      const traceManager = new TraceManager<ScopeBase>({ reportFn, generateId })
      const traceDefinition: TraceDefinition<ScopeBase> = {
        name: 'ticket.interrupt-itself-operation',
        type: 'operation',
        requiredScopeKeys: [],
        requiredToEnd: [{ name: 'end' }],
        debounceOn: [{ name: 'debounce' }],
      }
      const tracer = traceManager.createTracer(traceDefinition)
      const startConfig: StartTraceConfig<ScopeBase> = {
        scope: {},
      }

      // start trace
      const traceId = tracer.start(startConfig)
      expect(traceId).toBe('trace-id')

      // prettier-ignore
      const { entries } = getEventsFromTimeline`
      Events: ${Render('start', 0)}
      Time:   ${0}                 
      `
      processEntries(entries, traceManager)

      // Start another operation to interrupt the first one
      const newTraceId = tracer.start(startConfig)
      expect(newTraceId).toBe('trace-id')

      expect(reportFn).toHaveBeenCalled()

      const report: Parameters<ReportFn<ScopeBase>>[0] =
        reportFn.mock.calls[0][0]
      expect(report.name).toBe('ticket.interrupt-itself-operation')
      expect(report.duration).toBeNull()
      expect(report.status).toBe('interrupted')
      expect(report.interruptionReason).toBe('another-trace-started')

      expect(
        report.entries.map(
          (spanAndAnnotation) => spanAndAnnotation.span.performanceEntry,
        ),
      ).toMatchInlineSnapshot(`
        events    | start
        timeline  | |
        time (ms) | 0
      `)
    })

    describe('timeout', () => {
      it('timeouts when the basic operation when the timeout is reached', () => {
        const traceManager = new TraceManager<ScopeBase>({ reportFn, generateId })
        const traceDefinition: TraceDefinition<ScopeBase> = {
          name: 'ticket.timeout-operation',
          type: 'operation',
          requiredScopeKeys: [],
          requiredToEnd: [{ name: 'timed-out-render' }],
          timeoutDuration: 500,
        }
        const tracer = traceManager.createTracer(traceDefinition)
        const startConfig: StartTraceConfig<ScopeBase> = {
          scope: {},
        }

        // start trace
        const traceId = tracer.start(startConfig)
        expect(traceId).toBe('trace-id')

        // prettier-ignore
        const { entries } = getEventsFromTimeline`
        Events: ${Render('start', 0)}------${Render('timed-out-render', 0)}
        Time:   ${0}                       ${500 + 1}
        `
        processEntries(entries, traceManager)
        expect(reportFn).toHaveBeenCalled()

        const report: Parameters<ReportFn<ScopeBase>>[0] =
          reportFn.mock.calls[0][0]
        expect(report.name).toBe('ticket.timeout-operation')
        expect(report.duration).toBeNull()
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
      })

      it('timeouts when an operation is debouncing but has timed out', () => {
        const traceManager = new TraceManager<ScopeBase>({ reportFn, generateId })
        const traceDefinition: TraceDefinition<ScopeBase> = {
          name: 'ticket.debounce-then-interrupted-operation',
          type: 'operation',
          requiredScopeKeys: [],
          requiredToEnd: [{ name: 'end' }],
          debounceOn: [{ name: 'debounce' }],
          captureInteractive: true,
          debounceDuration: 300,
        }
        const tracer = traceManager.createTracer(traceDefinition)
        const startConfig: StartTraceConfig<ScopeBase> = {
          scope: {},
        }

        // start trace
        tracer.start(startConfig)

        // prettier-ignore
        const { entries } = getEventsFromTimeline`
        Events: ${Render('start', 0)}-----${Render('end', 0)}-----${Render('debounce', 0)}------${Check}
        Time:   ${0}                      ${50}                   ${100}                        ${100 + 10_000 + 1}
        `

        processEntries(entries, traceManager)

        expect(reportFn).toHaveBeenCalled()

        const report: Parameters<ReportFn<ScopeBase>>[0] =
          reportFn.mock.calls[0][0]
        expect(report.name).toBe('ticket.debounce-then-interrupted-operation')
        expect(report.duration).toBe(100)
        expect(report.status).toBe('ok')
        expect(report.interruptionReason).toBe('waiting-for-interactive-timeout')

        expect(
          report.entries.map(
            (spanAndAnnotation) => spanAndAnnotation.span.performanceEntry,
          ),
        ).toMatchInlineSnapshot(`
          events    | start       end         debounce
          timeline  | |-<⋯ +50 ⋯>-|-<⋯ +50 ⋯>-|
          time (ms) | 0           50          100
        `)
      })
    })
  })

  describe('capturing interactivity (when captureInteractive is defined)', () => {
    it('correctly captures duration while waiting the long tasks to settle', () => {
      const traceManager = new TraceManager<ScopeBase>({ reportFn, generateId })
      const traceDefinition: TraceDefinition<ScopeBase> = {
        name: 'ticket.operation',
        type: 'operation',
        requiredScopeKeys: [],
        requiredToEnd: [{ name: 'end' }],
        captureInteractive: { timeout: 5_000 },
      }
      const tracer = traceManager.createTracer(traceDefinition)
      const startConfig: StartTraceConfig<ScopeBase> = {
        scope: {
          ticketId: 1,
        },
      }

      tracer.start(startConfig)

      // prettier-ignore
      const { entries } = getEventsFromTimeline`
      Events: ${Render('start', 0)}-----${Render('end', 0)}-----${LongTask(50)}------<===5s===>---------${Check}
      Time:   ${0}                      ${2_000}                ${2_001}                                ${2_001 + 5_000 - 5}
      `
      processEntries(entries, traceManager)

      expect(reportFn).toHaveBeenCalled()

      const report: Parameters<ReportFn<ScopeBase>>[0] =
        reportFn.mock.calls[0][0]
      expect(report.name).toBe('ticket.operation')
      expect(report.duration).toBe(2_000)
      expect(report.status).toBe('ok')
      expect(report.interruptionReason).toBeUndefined()

      expect(
        report.entries.map(
          (spanAndAnnotation) => spanAndAnnotation.span.performanceEntry,
        ),
      ).toMatchInlineSnapshot(`
        events    | start         end
        timeline  | |-<⋯ +2000 ⋯>-|
        time (ms) | 0             2000
      `)
    })

    it('timeouts if long tasks keep appearing', () => {
      const traceManager = new TraceManager<ScopeBase>({ reportFn, generateId })
      const traceDefinition: TraceDefinition<ScopeBase> = {
        name: 'ticket.operation',
        type: 'operation',
        requiredScopeKeys: [],
        requiredToEnd: [{ name: 'end' }],
        captureInteractive: { timeout: 5_000 },
      }
      const tracer = traceManager.createTracer(traceDefinition)
      const startConfig: StartTraceConfig<ScopeBase> = {
        scope: {
          ticketId: 1,
        },
      }

      tracer.start(startConfig)

      // prettier-ignore
      const { entries } = getEventsFromTimeline`
      Events: ${Render('start', 0)}-----${Render('end', 0)}-----${LongTask(49)}------<===5s===>------${LongTask(50)}
      Time:   ${0}                      ${2_000}                 ${2_001}                            ${2_000 + 5_000}            
      `
      processEntries(entries, traceManager)

      expect(reportFn).toHaveBeenCalled()

      const report: Parameters<ReportFn<ScopeBase>>[0] =
        reportFn.mock.calls[0][0]
      expect(report.name).toBe('ticket.operation')
      expect(report.duration).toBe(2_000)
      expect(report.status).toBe('ok')
      expect(report.interruptionReason).toBe('waiting-for-interactive-timeout')

      expect(
        report.entries.map(
          (spanAndAnnotation) => spanAndAnnotation.span.performanceEntry,
        ),
      ).toMatchInlineSnapshot(`
        events    | start         end
        timeline  | |-<⋯ +2000 ⋯>-|
        time (ms) | 0             2000
      `)
    })

    it('completes the trace when a trace is interrupted while waiting for long tasks to settle', () => {
      const traceManager = new TraceManager<ScopeBase>({ reportFn, generateId })
      const traceDefinition: TraceDefinition<ScopeBase> = {
        name: 'ticket.interrupt-during-long-task-operation',
        type: 'operation',
        requiredScopeKeys: [],
        requiredToEnd: [matchSpan.withName('end')],
        interruptOn: [matchSpan.withName('interrupt')],
        captureInteractive: true,
      }
      const tracer = traceManager.createTracer(traceDefinition)
      const startConfig: StartTraceConfig<ScopeBase> = {
        scope: {
          ticketId: 1,
        },
      }

      // start trace
      tracer.start(startConfig)

      // prettier-ignore
      const { entries } = getEventsFromTimeline`
      Events: ${Render('start', 0)}---------${Render('end', 0)}---------${Render('interrupt', 0)}--${LongTask(100)}--${Check}
      Time:   ${0}                          ${200}                      ${201}                      ${300}        ${5_000}   
      `

      processEntries(entries, traceManager)

      expect(reportFn).toHaveBeenCalled()

      const report: Parameters<ReportFn<ScopeBase>>[0] =
        reportFn.mock.calls[0][0]
      expect(report.name).toBe('ticket.interrupt-during-long-task-operation')
      expect(report.status).toBe('ok')
      expect(report.interruptionReason).toBe('matched-on-interrupt')

      expect(
        report.entries.map(
          (spanAndAnnotation) => spanAndAnnotation.span.performanceEntry,
        ),
      ).toMatchInlineSnapshot(`
        events    | start        end
        timeline  | |-<⋯ +200 ⋯>-|
        time (ms) | 0            200
      `)
    })
  })
})
