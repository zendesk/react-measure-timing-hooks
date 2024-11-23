import './test/asciiTimelineSerializer'
import { DEFAULT_CAPTURE_INTERACTIVE_TIME } from '../main'
import { DEFAULT_TIMEOUT_DURATION } from './ActiveTrace'
import { ensureTimestamp } from './ensureTimestamp'
import { createQuietWindowDurationCalculator } from './getDynamicQuietWindowDuration'
import * as matchSpan from './matchSpan'
import type { Span, StartTraceConfig } from './spanTypes'
import { type TicketIdScope, ticketActivationDefinition } from './test/fixtures'
import {
  Check,
  getEventsFromTimeline,
  LongTask,
  Render,
} from './test/makeTimeline'
import processEntries from './test/processEntries'
import { shouldCompleteAndHaveInteractiveTime } from './test/shouldCompleteAndHaveInteractiveTime'
import { shouldNotEndWithInteractiveTimeout } from './test/shouldNotEndWithInteractiveTimeout'
import { shouldNotEndWithInterruption } from './test/shouldNotEndWithInterruption'
import { TraceManager } from './traceManager'
import type { ReportFn, ScopeBase, TraceDefinition } from './types'

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

  it('tracks trace with scope ticketId: 4', () => {
    const traceManager = new TraceManager<TicketIdScope>({
      reportFn,
      generateId,
    })
    const traceDefinition: TraceDefinition<TicketIdScope> = {
      name: 'ticket.scope-operation',
      type: 'operation',
      requiredScopeKeys: [],
      requiredToEnd: [{ name: 'end' }],
    }
    const tracer = traceManager.createTracer(traceDefinition)
    const startConfig: StartTraceConfig<TicketIdScope> = {
      scope: {
        ticketId: '4',
      },
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

    const report: Parameters<ReportFn<TicketIdScope>>[0] =
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
    expect(report.duration).toBe(100)
    expect(report.status).toBe('ok')
    expect(report.interruptionReason).toBeUndefined()
    expect(report.scope).toEqual({ ticketId: '4' })
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
        events    | start                    middle                    end            check
        timeline  | |------------------------|-------------------------|-<⋯ +2000 ⋯>--|
        time (ms) | 0                        50                        100            2100
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
        events    |          shorter-debounce
        events    | start  end                            short-debounce               long-debounce check
        timeline  | |------|-|----------------------------|----------------------------|-<⋯ +600 ⋯>--|
        time (ms) | 0      50                             251                          451           1051
        time (ms) |          51
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
        scope: {},
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
    it('correctly captures trace while waiting the long tasks to settle', () => {
      const traceManager = new TraceManager<ScopeBase>({ reportFn, generateId })
      const traceDefinition: TraceDefinition<ScopeBase> = {
        name: 'ticket.operation',
        type: 'operation',
        requiredScopeKeys: [],
        requiredToEnd: [{ name: 'end' }],
        captureInteractive: true,
      }
      const tracer = traceManager.createTracer(traceDefinition)
      const startConfig: StartTraceConfig<ScopeBase> = {
        scope: {},
      }
      tracer.start(startConfig)

      // prettier-ignore
      const { entries } = getEventsFromTimeline`
      Events: ${Render('start', 0)}-----${Render('end', 0)}-----${LongTask(50)}------<===5s===>---------${Check}
      Time:   ${0}                      ${2_000}                ${2_001}                                ${2_001 + DEFAULT_CAPTURE_INTERACTIVE_TIME}
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
        events    |                task(50)
        events    | start         end                                                              check
        timeline  | |-<⋯ +2000 ⋯>-|[++++++++++++++++++++++++++++++++++++++++++++++++]-<⋯ +4950 ⋯>--|
        time (ms) | 0             2000                                                             7001
        time (ms) |                2001
      `)
      expect(report.name).toBe('ticket.operation')
      expect(report.duration).toBe(2_000)
      expect(report.startTillInteractive).toBe(2_000)
      expect(report.status).toBe('ok')
      expect(report.interruptionReason).toBeUndefined()
    })

    it('completes the trace with waiting-for-interactive-timeout', () => {
      const traceManager = new TraceManager<ScopeBase>({ reportFn, generateId })
      const interactiveTimeout = 5_000
      const traceDefinition: TraceDefinition<ScopeBase> = {
        name: 'ticket.operation',
        type: 'operation',
        requiredScopeKeys: [],
        requiredToEnd: [{ name: 'end' }],
        captureInteractive: { timeout: interactiveTimeout },
      }
      const tracer = traceManager.createTracer(traceDefinition)
      const startConfig: StartTraceConfig<ScopeBase> = {
        scope: {},
      }

      tracer.start(startConfig)

      // prettier-ignore
      const { entries } = getEventsFromTimeline`
      Events: ${Render('start', 0)}-----${Render('end', 0)}-----${LongTask(interactiveTimeout)}
      Time:   ${0}                      ${2_000}                ${2_050}
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
        events    |                task(5000)
        events    | start         end
        timeline  | |-<⋯ +2000 ⋯>-|[++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++]-
        time (ms) | 0             2000
        time (ms) |                2050
      `)
      expect(report.name).toBe('ticket.operation')
      expect(report.duration).toBe(2_000)
      expect(report.interruptionReason).toBe('waiting-for-interactive-timeout')
      expect(report.startTillInteractive).toBeNull()
      expect(report.status).toBe('ok')
    })

    it('completes the trace when interrupted during waiting for capture interactive to finish', () => {
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
        scope: {},
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
        events    |               interrupt
        events    | start        end
        timeline  | |-<⋯ +200 ⋯>-||-
        time (ms) | 0            200
        time (ms) |               201
      `)
      expect(report.name).toBe('ticket.interrupt-during-long-task-operation')
      expect(report.duration).toBe(200)
      expect(report.startTillInteractive).toBeNull()
      expect(report.status).toBe('ok')
      expect(report.interruptionReason).toBe('matched-on-interrupt')
    })

    it('timeouts the trace while deboucing AND the last span is past the timeout duration', () => {
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
      expect(report.startTillInteractive).toBeNull()
      expect(report.status).toBe('interrupted')
      expect(report.interruptionReason).toBe('timeout')
    })

    it('completes the trace when debouncing is done AND is waiting for capture interactive to finish', () => {
      const traceManager = new TraceManager<ScopeBase>({ reportFn, generateId })
      const CUSTOM_CAPTURE_INTERACTIVE_TIMEOUT = 300
      const traceDefinition: TraceDefinition<ScopeBase> = {
        name: 'ticket.debounce-then-interrupted-operation',
        type: 'operation',
        requiredScopeKeys: [],
        requiredToEnd: [{ name: 'end' }],
        debounceOn: [{ name: 'debounce' }],
        captureInteractive: { timeout: CUSTOM_CAPTURE_INTERACTIVE_TIMEOUT },
        debounceDuration: 100,
      }
      const tracer = traceManager.createTracer(traceDefinition)
      const startConfig: StartTraceConfig<ScopeBase> = {
        scope: {},
      }

      // start trace
      tracer.start(startConfig)

      // prettier-ignore
      const { entries } = getEventsFromTimeline`
      Events: ${Render('start', 0)}-----${Render('end', 0)}---------------------${Render('debounce', 100)}------------------${Check}
      Time:   ${0}                      ${DEFAULT_TIMEOUT_DURATION - 500}       ${DEFAULT_TIMEOUT_DURATION - 499}           ${DEFAULT_TIMEOUT_DURATION + 1}
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
        events    |                 debounce(100)
        events    | start          end                                                            check
        timeline  | |-<⋯ +44500 ⋯>-|[++++++++++]--------------------------------------------------|-
        time (ms) | 0              44500                                                          45001
        time (ms) |                 44501
      `)
      expect(report.name).toBe('ticket.debounce-then-interrupted-operation')
      expect(report.duration).toBe(44_500)
      expect(report.startTillInteractive).toBeNull()
      expect(report.status).toBe('ok')
      expect(report.interruptionReason).toBe('timeout')
    })

    it('uses getQuietWindowDuration from capture interactive config', () => {
      const traceManager = new TraceManager<ScopeBase>({ reportFn, generateId })
      const CUSTOM_QUIET_WINDOW_DURATION = 2_000
      const TRACE_DURATION = 1_000
      const getQuietWindowDuration = jest
        .fn()
        .mockReturnValue(CUSTOM_QUIET_WINDOW_DURATION)
      const traceDefinition: TraceDefinition<ScopeBase> = {
        name: 'ticket.operation',
        type: 'operation',
        requiredScopeKeys: [],
        requiredToEnd: [{ name: 'end' }],
        captureInteractive: { timeout: 100, getQuietWindowDuration },
      }
      const tracer = traceManager.createTracer(traceDefinition)
      const startConfig: StartTraceConfig<ScopeBase> = {
        scope: {},
      }

      tracer.start(startConfig)

      // prettier-ignore
      const { entries } = getEventsFromTimeline`
      Events: ${Render('start', 0)}-----${Render('end', 0)}-----${LongTask(5)}------------${LongTask(5)}-----${Check}
      Time:   ${0}                      ${TRACE_DURATION}       ${1_001}                  ${1_050}           ${1_200}
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
        events    |                task(5)
        events    | start         end             task(5)                                          check
        timeline  | |-<⋯ +1000 ⋯>-||--------------|------------------------------------------------|-
        time (ms) | 0             1000            1050                                             1200
        time (ms) |                1001
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
      const traceManager = new TraceManager<ScopeBase>({ reportFn, generateId })
      // const CUSTOM_QUIET_WINDOW_DURATION = 2_000 // 2 seconds
      const TRACE_DURATION = 1_000

      const traceDefinition: TraceDefinition<ScopeBase> = {
        name: 'ticket.operation',
        type: 'operation',
        requiredScopeKeys: [],
        requiredToEnd: [{ name: 'end' }],
        captureInteractive: {
          timeout: 1_000,
          getQuietWindowDuration: createQuietWindowDurationCalculator(),
        },
      }
      const tracer = traceManager.createTracer(traceDefinition)
      const startConfig: StartTraceConfig<ScopeBase> = {
        scope: {},
      }

      tracer.start(startConfig)

      // prettier-ignore
      const { entries } = getEventsFromTimeline`
      Events: ${Render('start', 0)}-----${Render('end', 0)}-----------${LongTask(5)}----------------${LongTask(50)}---${Check}
      Time:   ${0}                      ${TRACE_DURATION}             ${1_001}                      ${1_945}          ${2_001}
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
        events    |                task(5)
        events    | start         end             task(50)                   check
        timeline  | |-<⋯ +1000 ⋯>-|[]-<⋯ +939 ⋯>--[+++++++++++++++++++++++]--|-
        time (ms) | 0             1000            1945                       2001
        time (ms) |                1001
      `)
      expect(report.name).toBe('ticket.operation')
      expect(report.duration).toBe(TRACE_DURATION)
      expect(report.startTillInteractive).toBeNull()
      expect(report.status).toBe('ok')
      expect(report.interruptionReason).toBe('waiting-for-interactive-timeout')
    })

    it('No long tasks after FMP, FirstCPUIdle immediately after FMP + quiet window', () => {
      const traceManager = new TraceManager<ScopeBase>({ reportFn, generateId })
      const traceDefinition: TraceDefinition<ScopeBase> = {
        name: 'ticket.operation',
        type: 'operation',
        requiredScopeKeys: [],
        requiredToEnd: [{ name: 'end' }],
        captureInteractive: true,
      }
      const tracer = traceManager.createTracer(traceDefinition)
      const startConfig: StartTraceConfig<ScopeBase> = {
        scope: {},
      }

      tracer.start(startConfig)

      // prettier-ignore
      const { entries } = getEventsFromTimeline`
      Events: ${Render('start', 0)}-----${Render('end', 0)}----------${LongTask(400)}-----${Check}
      Time:   ${0}                      ${200}                       ${4_600}             ${5_000}
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
        events    | start                 end            task(400)
        timeline  | |---------------------|-<⋯ +4400 ⋯>--[++++++++++++++++++++++++++++++++++++++++++]
        time (ms) | 0                     200            4600
      `)

      expect(report.name).toBe('ticket.operation')
      expect(report.duration).toBe(200)
      expect(report.startTillInteractive).toBe(200)
      expect(report.status).toBe('ok')
      expect(report.interruptionReason).toBeUndefined()
    })

    it('One light cluster after FMP, FirstCPUIdle at FMP', () => {
      const traceManager = new TraceManager<ScopeBase>({ reportFn, generateId })
      const traceDefinition: TraceDefinition<ScopeBase> = {
        name: 'ticket.operation',
        type: 'operation',
        requiredScopeKeys: [],
        requiredToEnd: [{ name: 'end' }],
        captureInteractive: true,
      }
      const tracer = traceManager.createTracer(traceDefinition)
      const startConfig: StartTraceConfig<ScopeBase> = {
        scope: {},
      }

      tracer.start(startConfig)

      // prettier-ignore
      const { entries } = getEventsFromTimeline`
      Events: ${Render('start', 0)}-----${Render('end', 0)}----------${LongTask(50)}------${LongTask(50)}-----${LongTask(50)}---------${Check}
      Time:   ${0}                      ${200}                       ${300}               ${400}              ${450}                  ${3_050}
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
        events    | start                    end          task(50)    task(50)task(50)          check
        timeline  | |------------------------|------------[++++]------[++++]--[++++]-<⋯ +2550 ⋯>|
        time (ms) | 0                        200          300         400     450               3050
      `)

      expect(report.name).toBe('ticket.operation')
      expect(report.duration).toBe(200)
      expect(report.startTillInteractive).toBe(200)
      expect(report.status).toBe('ok')
      expect(report.interruptionReason).toBeUndefined()
    })

    it('One heavy cluster after FMP, FirstCPUIdle after the cluster', () => {
      const traceManager = new TraceManager<ScopeBase>({ reportFn, generateId })
      const traceDefinition: TraceDefinition<ScopeBase> = {
        name: 'ticket.operation',
        type: 'operation',
        requiredScopeKeys: [],
        requiredToEnd: [{ name: 'end' }],
        captureInteractive: true,
      }
      const tracer = traceManager.createTracer(traceDefinition)
      const startConfig: StartTraceConfig<ScopeBase> = {
        scope: {},
      }

      tracer.start(startConfig)

      // prettier-ignore
      const { entries } = getEventsFromTimeline`
      Events: ${Render('start', 0)}-----${Render('end', 0)}--${LongTask(50)}}-${LongTask(200)}-----${LongTask(50)}-----------${Check}
      Time:   ${0}                      ${200}               ${300}           ${400}                ${650}                   ${3_200}
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
        events    | start               end        task(50)  task(200)                task(50)           check
        timeline  | |-------------------|----------[+++]-----[++++++++++++++++++]-----[+++]-<⋯ +2500 ⋯>--|
        time (ms) | 0                   200        300       400                      650                3200
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
      const traceManager = new TraceManager<ScopeBase>({ reportFn, generateId })
      const traceDefinition: TraceDefinition<ScopeBase> = {
        name: 'ticket.operation',
        type: 'operation',
        requiredScopeKeys: [],
        requiredToEnd: [{ name: 'end' }],
        captureInteractive: true,
      }
      const tracer = traceManager.createTracer(traceDefinition)
      const startConfig: StartTraceConfig<ScopeBase> = {
        scope: {},
      }

      tracer.start(startConfig)

      // prettier-ignore
      const { entries } = getEventsFromTimeline`
      Events: ${Render('start', 0)}-----${Render('end', 0)}-----${LongTask(200)}-----${LongTask(200)}-----${LongTask(200)}-----${Check}
      Time:   ${0}                      ${200}                 ${300}              ${900}              ${1500}             ${3800}
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
        events    | start   end  task(200)               task(200)               task(200)             check
        timeline  | |-------|----[++++++]----------------[++++++]----------------[++++++]-<⋯ +2100 ⋯>--|
        time (ms) | 0       200  300                     900                     1500                  3800
      `)

      const lastLongTask = entries.at(-2)!
      const expectedResult = lastLongTask.startTime + lastLongTask.duration

      expect(report.name).toBe('ticket.operation')
      expect(report.duration).toBe(200)
      expect(report.startTillInteractive).toBe(expectedResult)
      expect(report.status).toBe('ok')
      expect(report.interruptionReason).toBeUndefined()
    })

    it('Checking before the quiet window has passed - no long tasks processed, FirstCPUIdle not found', () => {
      const traceManager = new TraceManager<ScopeBase>({ reportFn, generateId })
      const traceDefinition: TraceDefinition<ScopeBase> = {
        name: 'ticket.operation',
        type: 'operation',
        requiredScopeKeys: [],
        requiredToEnd: [{ name: 'end' }],
        captureInteractive: true,
      }
      const tracer = traceManager.createTracer(traceDefinition)
      const startConfig: StartTraceConfig<ScopeBase> = {
        scope: {},
      }

      tracer.start(startConfig)

      // prettier-ignore
      const { entries } = getEventsFromTimeline`
      Events: ${Render('start', 0)}-----${Render('end', 0)}-----${Check}
      Time:   ${0}                      ${200}                  ${2_400}
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
        events    | start                                                             end            check
        timeline  | |-----------------------------------------------------------------|-<⋯ +2200 ⋯>--|
        time (ms) | 0                                                                 200            2400
      `)

      expect(report.name).toBe('ticket.operation')
      expect(report.duration).toBe(200)
      expect(report.startTillInteractive).toBe(200)
      expect(report.status).toBe('ok')
      expect(report.interruptionReason).toBeUndefined()
    })

    it('completes the trace with one heavy cluster followed by two light clusters, value is after 1st heavy cluster', () => {
      const traceManager = new TraceManager<ScopeBase>({ reportFn, generateId })
      const traceDefinition: TraceDefinition<ScopeBase> = {
        name: 'ticket.operation',
        type: 'operation',
        requiredScopeKeys: [],
        requiredToEnd: [{ name: 'end' }],
        captureInteractive: true,
      }
      const tracer = traceManager.createTracer(traceDefinition)
      const startConfig: StartTraceConfig<ScopeBase> = {
        scope: {},
      }

      tracer.start(startConfig)

      // prettier-ignore
      const { entries } = getEventsFromTimeline`
      Events: ${Render('start', 0)}-----${Render('end', 0)}-----${LongTask(200)}-----${LongTask(100)}-----${LongTask(200)}-----${LongTask(200)}-----${Check}
      Time:   ${0}                      ${200}                  ${300}               ${600}               ${1_700}             ${2_900}             ${4_650}
        }           
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
        events    | start     end   task(200)      task(100)          task(200)              task(200)
        timeline  | |---------|-----[++++++++]-----[+++]-<⋯ +1000 ⋯>--[++++++++]-<⋯ +1000 ⋯>-[++++++++]
        time (ms) | 0         200   300            600                1700                   2900
      `)

      const lastHeavyClusterLongTask = entries.at(3)!
      const expectedResult =
        lastHeavyClusterLongTask.startTime + lastHeavyClusterLongTask.duration

      expect(report.name).toBe('ticket.operation')
      expect(report.duration).toBe(200)
      expect(report.startTillInteractive).toBe(expectedResult)
      expect(report.status).toBe('ok')
      expect(report.interruptionReason).toBeUndefined()
    })

    it('completes the trace with continuous heavy clusters', () => {
      const traceManager = new TraceManager<ScopeBase>({ reportFn, generateId })
      const traceDefinition: TraceDefinition<ScopeBase> = {
        name: 'ticket.operation',
        type: 'operation',
        requiredScopeKeys: [],
        requiredToEnd: [{ name: 'end' }],
        captureInteractive: true,
      }
      const tracer = traceManager.createTracer(traceDefinition)
      const startConfig: StartTraceConfig<ScopeBase> = {
        scope: {},
      }

      tracer.start(startConfig)

      // prettier-ignore
      const { entries } = getEventsFromTimeline`
      Events: ${Render('start', 0)}-----${Render('end', 0)}-----${LongTask(300)}-----${LongTask(300)}-----${LongTask(300)}-----${LongTask(300)}-----${LongTask(300)}-----${LongTask(300)}-----${LongTask(300)}-----${LongTask(300)}-----${LongTask(300)}-----${LongTask(300)}-----${LongTask(300)}-----${LongTask(300)}-----${LongTask(300)}-----${LongTask(300)}-----${Check}
      Time:   ${0}                      ${200}                  ${550}               ${900}               ${1_250}             ${1_600}             ${1_950}             ${2_300}             ${2_650}             ${3_000}             ${3_350}             ${3_700}             ${4_050}             ${4_400}             ${4_750}             ${5_100}             ${7_450}
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
        events    |                task(300)   task(300)   task(300)   task(300)
        events    |   end      task(300)   task(300)   task(300)   task(300)   task(300)
        events    | start  task(300)   task(300)   task(300)   task(300)   task(300)            check
        timeline  | |-|----[+]-[+]-[+]-[+]-[+]-[+]-[+]-[+]-[+]-[+]-[+]-[+]-[+]-[+]-<⋯ +2050 ⋯>--|
        time (ms) | 0 200  550 900 1250    1950    2650    3350    4050    4750                 7450
        time (ms) |                    1600    2300    3000    3700    4400    5100
      `)

      expect(report.name).toBe('ticket.operation')
      expect(report.duration).toBe(200)
      // TESTING TODO: Hmm. shouldnt this be undefined?
      // expect(report.startTillInteractive).toBeUndefined()
      expect(report.status).toBe('ok')
      expect(report.interruptionReason).toBeUndefined()
    })

    it('completes the trace with a light cluster followed by a heavy cluster a second later, FirstCPUIdle updated', () => {
      const traceManager = new TraceManager<ScopeBase>({ reportFn, generateId })
      const traceDefinition: TraceDefinition<ScopeBase> = {
        name: 'ticket.operation',
        type: 'operation',
        requiredScopeKeys: [],
        requiredToEnd: [{ name: 'end' }],
        captureInteractive: true,
      }
      const tracer = traceManager.createTracer(traceDefinition)
      const startConfig: StartTraceConfig<ScopeBase> = {
        scope: {},
      }

      tracer.start(startConfig)

      // prettier-ignore
      const { entries } = getEventsFromTimeline`
      Events: ${Render('start', 0)}-----${Render('end', 0)}-----${LongTask(50)}----------${LongTask(50)}----------${LongTask(50)}--------${LongTask(50)}---------${LongTask(200)}-------${LongTask(200)}--------${Check}
      Time:   ${0}                      ${200}                 ${300}                    ${350}                   ${1_450}               ${1_550}                ${1_650}               ${1_900}                ${4_150}
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
        events    |                                            task(200)
        events    |                      task(50)          task(50)
        events    | start      end   task(50)           task(50)            task(200)                check
        timeline  | |----------|-----[]--[]-<⋯ +1050 ⋯>-[]-[]--[+++++++++]--[+++++++++]-<⋯ +2050 ⋯>--|
        time (ms) | 0          200   300 350            1450   1650         1900                     4150
        time (ms) |                                        1550
      `)

      const lastLongTask = entries.at(-2)!
      const expectedResult = lastLongTask.startTime + lastLongTask.duration

      expect(report.name).toBe('ticket.operation')
      expect(report.duration).toBe(200)
      expect(report.startTillInteractive).toBe(expectedResult)
      expect(report.status).toBe('ok')
      expect(report.interruptionReason).toBeUndefined()
    })

    it('completes the trace with a long task overlapping FMP, FirstCPUIdle after the long task', () => {
      const traceManager = new TraceManager<ScopeBase>({ reportFn, generateId })
      const traceDefinition: TraceDefinition<ScopeBase> = {
        name: 'ticket.operation',
        type: 'operation',
        requiredScopeKeys: [],
        requiredToEnd: [{ name: 'end' }],
        captureInteractive: true,
      }
      const tracer = traceManager.createTracer(traceDefinition)
      const startConfig: StartTraceConfig<ScopeBase> = {
        scope: {},
      }

      tracer.start(startConfig)

      // prettier-ignore
      const { entries } = getEventsFromTimeline`
      Events: ${Render('start', 0)}----------${LongTask(110, { start: 150 })}----${Render('end', 0)}-----${Check}
      Time:   ${0}                           ${150}                              ${200}                  ${2_500}
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
        events    |
        events    | start                                task(110)     end                        check
        timeline  | |------------------------------------[+++++++++++++++++++++++++]-<⋯ +2240 ⋯>--|
        timeline  | ---------------------------------------------------|⋯ +2300 ⋯>-----------------
        time (ms) | 0                                    150           200                        2500
      `)

      const lastLongTask = entries.at(-2)!
      const expectedResult = lastLongTask.startTime + lastLongTask.duration

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
      const startConfig: StartTraceConfig<TicketIdScope> = {
        scope,
        startTime: fixtureEntries[0]!.span.startTime,
      }

      tracer.start(startConfig)

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
      }: Parameters<ReportFn<TicketIdScope>>[0] = reportFn.mock.calls[0][0]

      expect(report).toMatchInlineSnapshot(`
        {
          "attributes": {},
          "completeTillInteractive": 0,
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
      const startConfig: StartTraceConfig<TicketIdScope> = {
        scope,
        startTime: {
          ...fixtureEntries[0]!.span.startTime,
          now:
            fixtureEntries[0]!.span.startTime.now -
            fixtureEntries[0]!.annotation.operationRelativeStartTime,
        },
      }

      tracer.start(startConfig)

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
      }: Parameters<ReportFn<TicketIdScope>>[0] = reportFn.mock.calls[0][0]

      expect(report).toMatchInlineSnapshot(`
        {
          "attributes": {},
          "completeTillInteractive": 0,
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
