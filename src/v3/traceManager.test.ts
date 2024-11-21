import './test/asciiTimelineSerializer'
import { DEFAULT_TIMEOUT_DURATION } from './ActiveTrace'
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

  // TESTING TODO: add test cases with scope

  it('tracks trace with minimal requirements', () => {
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
    const traceManager = new TraceManager<ScopeBase>({ reportFn, generateId })
    const traceDefinition: TraceDefinition<ScopeBase> = {
      name: 'ticket.computed-span-operation',
      type: 'operation',
      requiredScopeKeys: [],
      requiredToEnd: [{ name: 'end' }],
    }
    const tracer = traceManager.createTracer(traceDefinition)
    const startConfig: StartTraceConfig<ScopeBase> = {
      scope: {},
    }

    const computedSpanName = 'render-1-to-3'
    // Define a computed span
    tracer.defineComputedSpan({
      name: computedSpanName,
      startSpan: matchSpan.withName('render-1'),
      endSpan: matchSpan.withName('render-3'),
    })

    // Start trace
    const traceId = tracer.start(startConfig)
    expect(traceId).toBe('trace-id')

    // prettier-ignore
    const { entries } = getEventsFromTimeline`
    Events: ${Render('start', 0)}---${Render('render-1', 50)}----${Render('render-2', 50)}----${Render('render-3', 50)}--------${Render('end', 0)}
    Time:   ${0}                    ${50}                     ${100}                       ${150}                        ${200}      
    `

    processEntries(entries, traceManager)
    expect(reportFn).toHaveBeenCalled()

    const report: Parameters<ReportFn<ScopeBase>>[0] = reportFn.mock.calls[0][0]
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
    const traceManager = new TraceManager<ScopeBase>({ reportFn, generateId })
    const traceDefinition: TraceDefinition<ScopeBase> = {
      name: 'ticket.computed-value-operation',
      type: 'operation',
      requiredScopeKeys: [],
      requiredToEnd: [{ name: 'end' }],
    }
    const tracer = traceManager.createTracer(traceDefinition)
    const startConfig: StartTraceConfig<ScopeBase> = {
      scope: {},
    }

    // Define a computed value
    tracer.defineComputedValue({
      name: 'feature',
      matches: [matchSpan.withName('feature')],
      computeValueFromMatches: (feature) => feature.length,
    })

    // Start trace
    const traceId = tracer.start(startConfig)
    expect(traceId).toBe('trace-id')

    // prettier-ignore
    const { entries } = getEventsFromTimeline`
    Events: ${Render('start', 0)}--${Render('feature', 50)}--${Render('feature', 50)}-${Render('end', 0)}
    Time:   ${0}                   ${50}                     ${100}                    ${150}
    `

    processEntries(entries, traceManager)
    expect(reportFn).toHaveBeenCalled()
    const report: Parameters<ReportFn<ScopeBase>>[0] = reportFn.mock.calls[0][0]
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

  describe('debounce', () => {
    it('tracks trace when debouncedOn is defined but no debounce events', () => {
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
        const traceManager = new TraceManager<ScopeBase>({
          reportFn,
          generateId,
        })
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
        Time:   ${0}                       ${DEFAULT_TIMEOUT_DURATION + 1}
        `
        processEntries(entries, traceManager)
        expect(reportFn).toHaveBeenCalled()

        const report: Parameters<ReportFn<ScopeBase>>[0] =
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
        expect(report.name).toBe('ticket.timeout-operation')
        expect(report.duration).toBeNull()
        expect(report.status).toBe('interrupted')
        expect(report.interruptionReason).toBe('timeout')
      })

      it('timeouts when the basic trace when a custom timeout duration is reached', () => {
        const traceManager = new TraceManager<ScopeBase>({
          reportFn,
          generateId,
        })
        const CUSTOM_TIMEOUT_DURATION = 500
        const traceDefinition: TraceDefinition<ScopeBase> = {
          name: 'ticket.timeout-operation',
          type: 'operation',
          requiredScopeKeys: [],
          requiredToEnd: [{ name: 'timed-out-render' }],
          timeoutDuration: CUSTOM_TIMEOUT_DURATION,
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
        Time:   ${0}                       ${CUSTOM_TIMEOUT_DURATION + 1}
        `
        processEntries(entries, traceManager)
        expect(reportFn).toHaveBeenCalled()

        const report: Parameters<ReportFn<ScopeBase>>[0] =
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
        expect(report.name).toBe('ticket.timeout-operation')
        expect(report.duration).toBeNull()
        expect(report.status).toBe('interrupted')
        expect(report.interruptionReason).toBe('timeout')
      })

      it('transitions from debouncing to timeout', () => {
        const traceManager = new TraceManager<ScopeBase>({
          reportFn,
          generateId,
        })
        const CUSTOM_TIMEOUT_DURATION = 500
        const traceDefinition: TraceDefinition<ScopeBase> = {
          name: 'ticket.timeout-operation',
          type: 'operation',
          requiredScopeKeys: [],
          requiredToEnd: [{ name: 'end' }],
          debounceOn: [{ name: 'debounce' }],
          timeoutDuration: CUSTOM_TIMEOUT_DURATION,
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
        Events: ${Render('start', 0)}--${Render('end', 0)}--${Render('debounce', 0)}--${Check}}
        Time:   ${0}                   ${50}                ${51}                     ${CUSTOM_TIMEOUT_DURATION + 1}
        `
        processEntries(entries, traceManager)
        expect(reportFn).toHaveBeenCalled()

        const report: Parameters<ReportFn<ScopeBase>>[0] =
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
    // TESTING TODO: checking with debouncing, debounce deadline
    it('correctly captures trace while waiting the long tasks to settle', () => {
      const traceManager = new TraceManager<ScopeBase>({ reportFn, generateId })
      const CUSTOM_CAPTURE_INTERACTIVE_TIMEOUT = 5_000
      const traceDefinition: TraceDefinition<ScopeBase> = {
        name: 'ticket.operation',
        type: 'operation',
        requiredScopeKeys: [],
        requiredToEnd: [{ name: 'end' }],
        captureInteractive: { timeout: CUSTOM_CAPTURE_INTERACTIVE_TIMEOUT },
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
      Time:   ${0}                      ${2_000}                ${2_001}                                ${2_001 + CUSTOM_CAPTURE_INTERACTIVE_TIMEOUT - 5}
      `
      processEntries(entries, traceManager)
      expect(reportFn).toHaveBeenCalled()

      const report: Parameters<ReportFn<ScopeBase>>[0] =
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
      expect(report.status).toBe('ok')
      expect(report.interruptionReason).toBeUndefined()
    })

    it('completes the trace even though it times out when long tasks keep appearing past custom capture interactive window', () => {
      const traceManager = new TraceManager<ScopeBase>({ reportFn, generateId })
      const CUSTOM_CAPTURE_INTERACTIVE_TIMEOUT = 5_000
      const traceDefinition: TraceDefinition<ScopeBase> = {
        name: 'ticket.operation',
        type: 'operation',
        requiredScopeKeys: [],
        requiredToEnd: [{ name: 'end' }],
        captureInteractive: { timeout: CUSTOM_CAPTURE_INTERACTIVE_TIMEOUT },
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
      Time:   ${0}                      ${2_000}                 ${2_001}                            ${2_000 + CUSTOM_CAPTURE_INTERACTIVE_TIMEOUT}            
      `
      processEntries(entries, traceManager)
      expect(reportFn).toHaveBeenCalled()

      const report: Parameters<ReportFn<ScopeBase>>[0] =
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
      expect(report.status).toBe('ok')
      expect(report.interruptionReason).toBe('waiting-for-interactive-timeout')
    })

    it('completes the trace when a trace is interrupted after it has ended AND while waiting for long tasks to settle', () => {
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
      Time:   ${0}                          ${200}                      ${201}                     ${300}            ${5_000}   
      `

      processEntries(entries, traceManager)
      expect(reportFn).toHaveBeenCalled()

      const report: Parameters<ReportFn<ScopeBase>>[0] =
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
      expect(report.status).toBe('ok')
      expect(report.interruptionReason).toBe('matched-on-interrupt')
    })

    it('timeouts the entire trace while trace is waiting for long tasks AND entire trace times out', () => {
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
      Time:   ${0}                      ${50}                   ${100}                        ${DEFAULT_TIMEOUT_DURATION + 100}
      `
      processEntries(entries, traceManager)
      expect(reportFn).toHaveBeenCalled()

      const report: Parameters<ReportFn<ScopeBase>>[0] =
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
      expect(report.duration).toBeNull()
      expect(report.status).toBe('interrupted')
      expect(report.interruptionReason).toBe('timeout')
    })
  })

  // TESTING TODO: add test cases with getQuietWindowDuration
})
