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
  type TicketIdScope,
  ticketActivationDefinition,
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

  it('tracks trace with minimal requirements', () => {
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
      variantsByOriginatedFrom: {
        cold_boot: { timeoutDuration: DEFAULT_COLDBOOT_TIMEOUT_DURATION },
      },
    })
    const traceId = tracer.start({
      scope: { ticketId: '1' },
      originatedFrom: 'cold_boot',
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
    const traceManager = new TraceManager<TicketScope>({
      reportFn,
      generateId,
      reportErrorFn,
    })
    const tracer = traceManager.createTracer({
      name: 'ticket.computed-span-operation',
      type: 'operation',
      scopes: [],
      requiredSpans: [{ name: 'end' }],
      variantsByOriginatedFrom: {
        cold_boot: { timeoutDuration: DEFAULT_COLDBOOT_TIMEOUT_DURATION },
      },
    })

    const computedSpanName = 'render-1-to-3'
    // Define a computed span
    tracer.defineComputedSpan({
      name: computedSpanName,
      startSpan: matchSpan.withName('render-1'),
      endSpan: matchSpan.withName('render-3'),
    })

    const traceId = tracer.start({
      scope: { ticketId: '1' },
      originatedFrom: 'cold_boot',
    })

    // Start trace
    expect(traceId).toBe('trace-id')

    // prettier-ignore
    const { spans } = getSpansFromTimeline<TicketIdScope>`
    Events: ${Render('start', 0)}---${Render('render-1', 50)}----${Render('render-2', 50)}----${Render('render-3', 50)}--------${Render('end', 0)}
    Time:   ${0}                    ${50}                        ${100}                       ${150}                           ${200}
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
    const traceManager = new TraceManager<TicketScope>({
      reportFn,
      generateId,
      reportErrorFn,
    })
    const tracer = traceManager.createTracer({
      name: 'ticket.computed-value-operation',
      type: 'operation',
      scopes: [],
      requiredSpans: [{ name: 'end' }],
      variantsByOriginatedFrom: {
        cold_boot: { timeoutDuration: DEFAULT_COLDBOOT_TIMEOUT_DURATION },
      },
    })

    // Define a computed value
    tracer.defineComputedValue({
      name: 'feature',
      matches: [matchSpan.withName('feature')],
      computeValueFromMatches: (feature) => feature.length,
    })

    const traceId = tracer.start({
      scope: { ticketId: '1' },
      originatedFrom: 'cold_boot',
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

  it('correctly calculates computedRenderBeaconSpans, adjusting the render start based on the first render-start', () => {
    const traceManager = new TraceManager<TicketScope>({
      reportFn,
      generateId,
      reportErrorFn,
    })
    const tracer = traceManager.createTracer({
      name: 'ticket.computedRenderBeaconSpans',
      type: 'operation',
      scopes: [],
      requiredSpans: [{ name: 'Component', isIdle: true }],
      variantsByOriginatedFrom: {
        cold_boot: { timeoutDuration: DEFAULT_COLDBOOT_TIMEOUT_DURATION },
      },
    })

    const traceId = tracer.start({
      scope: { ticketId: '1' },
      originatedFrom: 'cold_boot',
    })

    // prettier-ignore
    const { spans } = getSpansFromTimeline<TicketIdScope>`
    Events: ${Render('Component', 0, {type: 'component-render-start'})}--${Render('Component', 50)}--${Render('Component', 50, {renderedOutput: 'content'})}
    Time:   ${0}                                                         ${50}                       ${100}
    `

    processSpans(spans, traceManager)
    jest.runAllTimers()

    expect(reportFn).toHaveBeenCalled()
    const report: Parameters<ReportFn<TicketScope, TicketScope>>[0] =
      reportFn.mock.calls[0][0]

    expect(
      report.entries.map(
        (spanAndAnnotation) => spanAndAnnotation.span.performanceEntry,
      ),
    ).toMatchInlineSnapshot(`
      events    | Component   Component(50)            Component(50)
      timeline  | |-<⋯ +50 ⋯>-[+++++++++++++++++++++++][+++++++++++++++++++++++]
      time (ms) | 0           50                       100
    `)
    expect(report.name).toBe('ticket.computedRenderBeaconSpans')
    expect(report.interruptionReason).toBeUndefined()
    expect(report.status).toBe('ok')
    expect(report.duration).toBe(150)
    expect(report.computedRenderBeaconSpans).toEqual({
      Component: {
        firstRenderTillContent: 150,
        firstRenderTillData: 100,
        firstRenderTillLoading: 100,
        renderCount: 2,
        startOffset: 0,
        sumOfRenderDurations: 150,
      },
    })
  })

  it('when matchScopes is true for two scopes: tracks trace with scope ticketId: 4 and scope userId: 3', () => {
    type AllScopesT = TicketIdScope & UserIdScope
    const traceManager = new TraceManager<AllScopesT>({
      reportFn,
      generateId,
      reportErrorFn,
    })
    const tracer = traceManager.createTracer({
      name: 'ticket.scope-operation',
      type: 'operation',
      scopes: ['ticketId'],
      requiredSpans: [{ name: 'end', matchScopes: true }],
      variantsByOriginatedFrom: {
        cold_boot: { timeoutDuration: DEFAULT_COLDBOOT_TIMEOUT_DURATION },
      },
    })
    const scope = {
      ticketId: '4',
      userId: '3',
    }
    const traceId = tracer.start({
      scope,
      originatedFrom: 'cold_boot',
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
        reportErrorFn,
      })
      const tracer = traceManager.createTracer({
        name: 'ticket.operation',
        type: 'operation',
        scopes: [],
        requiredSpans: [{ name: 'end' }],
        debounceOn: [{ name: 'debounce' }],
        variantsByOriginatedFrom: {
          cold_boot: { timeoutDuration: DEFAULT_COLDBOOT_TIMEOUT_DURATION },
        },
      })
      const traceId = tracer.start({
        scope: {
          ticketId: '1',
        },
        originatedFrom: 'cold_boot',
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
        reportErrorFn,
      })
      const tracer = traceManager.createTracer({
        name: 'ticket.debounce-operation',
        type: 'operation',
        scopes: [],
        requiredSpans: [matchSpan.withName('end')],
        debounceOn: [matchSpan.withName((n: string) => n.endsWith('debounce'))],
        debounceDuration: 300,
        variantsByOriginatedFrom: {
          cold_boot: { timeoutDuration: DEFAULT_COLDBOOT_TIMEOUT_DURATION },
        },
      })
      tracer.start({
        scope: {
          ticketId: '1',
        },
        originatedFrom: 'cold_boot',
      })

      // prettier-ignore
      const { spans } = getSpansFromTimeline<TicketIdScope>`
      Events: ${Render('start', 0)}-----${Render('end', 0)}-----${Render('shorter-debounce', 0)}-----${Render('short-debounce', 0)}-----${Render('long-debounce', 0)}-----${Check})}
      Time:   ${0}                      ${50}                   ${51}                                ${251}                             ${451}                            ${1_051}
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
        reportErrorFn,
      })
      const tracer = traceManager.createTracer({
        name: 'ticket.interrupt-on-basic-operation',
        type: 'operation',
        scopes: [],
        requiredSpans: [matchSpan.withName('end')],
        interruptOn: [matchSpan.withName('interrupt')],
        variantsByOriginatedFrom: {
          cold_boot: { timeoutDuration: DEFAULT_COLDBOOT_TIMEOUT_DURATION },
        },
      })
      tracer.start({
        scope: {
          ticketId: '1',
        },
        originatedFrom: 'cold_boot',
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
        events    | start        interrupt
        timeline  | |-<⋯ +100 ⋯>-|
        time (ms) | 0            100
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
        reportErrorFn,
      })
      const tracer = traceManager.createTracer({
        name: 'ticket.interrupt-itself-operation',
        type: 'operation',
        scopes: [],
        requiredSpans: [{ name: 'end' }],
        debounceOn: [{ name: 'debounce' }],
        variantsByOriginatedFrom: {
          cold_boot: { timeoutDuration: DEFAULT_COLDBOOT_TIMEOUT_DURATION },
        },
      })
      const traceId = tracer.start({
        scope: {
          ticketId: '1',
        },
        originatedFrom: 'cold_boot',
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
        originatedFrom: 'cold_boot',
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

    it('tracks a regression: interrupts a trace when a component is no longer idle', () => {
      const traceManager = new TraceManager<TicketScope>({
        reportFn,
        generateId,
        reportErrorFn,
      })
      const tracer = traceManager.createTracer({
        name: 'ticket.interrupt-on-basic-operation',
        type: 'operation',
<<<<<<< Updated upstream:src/v3/traceManager.test.ts
        scopes: [],
        requiredSpans: [{ name: 'end', isIdle: true }],
        debounceOn: [{ name: 'end' }],
        variantsByOriginatedFrom: {
          cold_boot: { timeoutDuration: DEFAULT_COLDBOOT_TIMEOUT_DURATION },
=======
        relationSchemaName: 'ticket',
        requiredSpans: [{ name: 'component', isIdle: true }],
        debounceOnSpans: [{ name: 'component' }],
        variants: {
          cold_boot: { timeout: DEFAULT_COLDBOOT_TIMEOUT_DURATION },
>>>>>>> Stashed changes:src/v3/TraceManager.test.ts
        },
      })
      tracer.start({
        scope: {
          ticketId: '1',
        },
        originatedFrom: 'cold_boot',
      })

      // prettier-ignore
<<<<<<< Updated upstream:src/v3/traceManager.test.ts
      const { spans } = getSpansFromTimeline<TicketIdScope>`
      Events: ${Render('start', 0)}-----${Render('end', 50, {isIdle: true})}-----${Render('end', 50, {isIdle: false})}
      Time:   ${0}                      ${100}                                   ${200}
=======
      const { spans } = getSpansFromTimeline<TicketIdRelationSchemasFixture>`
      Events: ${Render('start', 0)}-----${Render('component', 50, {isIdle: true})}-----${Render('component', 50, {isIdle: false})}
      Time:   ${0}                      ${100}                                         ${200}
>>>>>>> Stashed changes:src/v3/TraceManager.test.ts
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
        events    | start        component(50)                  component(50)
        timeline  | |-<⋯ +100 ⋯>-[++++++++++++++]---------------[++++++++++++++]-
        time (ms) | 0            100                            200
      `)
      expect(report.name).toBe('ticket.interrupt-on-basic-operation')
      expect(report.interruptionReason).toBe('idle-component-no-longer-idle')

      expect(report.status).toBe('interrupted')
      expect(report.duration).toBeNull()
    })

    describe('timeout', () => {
      it('timeouts when the basic trace when the default timeout duration is reached', () => {
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
          variantsByOriginatedFrom: { cold_boot: { timeoutDuration: 500 } },
        })
        const traceId = tracer.start({
          startTime: { now: 0, epoch: 0 },
          scope: {
            ticketId: '1',
          },
          originatedFrom: 'cold_boot',
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
          reportErrorFn,
        })
        const CUSTOM_TIMEOUT_DURATION = 500
        const tracer = traceManager.createTracer({
          name: 'ticket.timeout-operation',
          type: 'operation',
          scopes: [],
          requiredSpans: [{ name: 'timed-out-render' }],
          variantsByOriginatedFrom: {
            cold_boot: { timeoutDuration: CUSTOM_TIMEOUT_DURATION },
          },
        })
        const traceId = tracer.start({
          startTime: { now: 0, epoch: 0 },
          scope: {
            ticketId: '1',
          },
          originatedFrom: 'cold_boot',
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
          reportErrorFn,
        })
        const CUSTOM_TIMEOUT_DURATION = 500
        const tracer = traceManager.createTracer({
          name: 'ticket.timeout-operation',
          type: 'operation',
          scopes: [],
          requiredSpans: [{ name: 'end' }],
          debounceOn: [{ name: 'debounce' }],
          variantsByOriginatedFrom: {
            cold_boot: { timeoutDuration: CUSTOM_TIMEOUT_DURATION },
          },
        })
        const traceId = tracer.start({
          startTime: { now: 0, epoch: 0 },
          scope: {
            ticketId: '1',
          },
          originatedFrom: 'cold_boot',
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
})
