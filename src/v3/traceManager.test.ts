import { TicketIdScope } from '../stories/mockComponentsv3/traceManager'
import { ensureTimestamp } from './ensureTimestamp'
import type { Span, StartTraceConfig } from './spanTypes'
import { TraceManager } from './traceManager'
// import type { TraceRecording, TraceRecordingBase } from './traceRecordingTypes'
import type { TraceDefinition } from './types'

describe('TraceManager', () => {
  let traceManager: TraceManager<TicketIdScope>
  let reportFn: jest.Mock
  let generateId: jest.Mock

  jest.useFakeTimers()

  beforeEach(() => {
    reportFn = jest.fn()
    generateId = jest.fn().mockReturnValue('trace-id')
    traceManager = new TraceManager<TicketIdScope>({ reportFn, generateId })
  })

  afterEach(() => {
    jest.clearAllMocks()
    jest.clearAllTimers()
  })

  it('tracks operation', () => {
    const traceDefinition: TraceDefinition<TicketIdScope> = {
      name: 'ticket.basic-operation',
      type: 'operation',
      requiredScopeKeys: ['ticketId'],
      requiredToEnd: [
        {
          name: 'end',
        },
      ],
      debounceOn: [
        {
          name: 'debounce',
        },
      ],
    }

    const tracer = traceManager.createTracer(traceDefinition)
    const startConfig: StartTraceConfig<TicketIdScope> = {
      scope: {
        ticketId: 1,
      },
    }

    const traceId = tracer.start(startConfig)
    expect(traceId).toBe('trace-id')

    // Simulate start mark
    const span1: Span<TicketIdScope> = {
      type: 'mark',
      name: 'start',
      startTime: ensureTimestamp(),
      duration: 0,
      attributes: {},
    }

    traceManager.processSpan(span1)
    jest.advanceTimersByTime(50)

    const span2: Span<TicketIdScope> = {
      type: 'mark',
      name: 'middle',
      startTime: ensureTimestamp(),
      duration: 0,
      attributes: {},
    }

    traceManager.processSpan(span2)
    jest.advanceTimersByTime(50)

    const span3: Span<TicketIdScope> = {
      type: 'mark',
      name: 'end',
      startTime: ensureTimestamp(),
      duration: 0,
      attributes: {},
    }

    traceManager.processSpan(span3)
    jest.advanceTimersByTime(2_000)

    const span4: Span<TicketIdScope> = {
      type: 'mark',
      name: 'post-end-span',
      startTime: ensureTimestamp(),
      duration: 0,
      attributes: {},
    }

    traceManager.processSpan(span4)

    expect(reportFn).toHaveBeenCalled()
    expect(reportFn).toHaveBeenCalledWith(
      expect.objectContaining({
        name: 'ticket.basic-operation',
        duration: 100,
        status: 'ok',
        interruptionReason: undefined,
        entries: [
          expect.objectContaining({
            span: expect.objectContaining({ name: "start" })
          }),
          expect.objectContaining({
            span: expect.objectContaining({ name: "middle" })
          }),
          expect.objectContaining({
            span: expect.objectContaining({ name: "end" })
          })
        ],
      }))
  })

  it('tracks operation with only requiredToEnd defined', () => {
    const traceDefinition: TraceDefinition<TicketIdScope> = {
      name: 'ticket.basic-operation',
      type: 'operation',
      requiredScopeKeys: ['ticketId'],
      requiredToEnd: [
        {
          name: 'end',
        },
      ],
    }

    const tracer = traceManager.createTracer(traceDefinition)
    const startConfig: StartTraceConfig<TicketIdScope> = {
      scope: {
        ticketId: 1,
      },
    }

    const traceId = tracer.start(startConfig)
    expect(traceId).toBe('trace-id')

    // Simulate start mark
    const span1: Span<TicketIdScope> = {
      type: 'mark',
      name: 'start',
      startTime: ensureTimestamp(),
      duration: 0,
      attributes: {},
    }

    traceManager.processSpan(span1)
    jest.advanceTimersByTime(50)

    const span2: Span<TicketIdScope> = {
      type: 'mark',
      name: 'middle',
      startTime: ensureTimestamp(),
      duration: 0,
      attributes: {},
    }

    traceManager.processSpan(span2)
    jest.advanceTimersByTime(50)

    const span3: Span<TicketIdScope> = {
      type: 'mark',
      name: 'end',
      startTime: ensureTimestamp(),
      duration: 0,
      attributes: {},
    }

    traceManager.processSpan(span3)
    jest.advanceTimersByTime(2_000)

    const span4: Span<TicketIdScope> = {
      type: 'mark',
      name: 'post-end-span',
      startTime: ensureTimestamp(),
      duration: 0,
      attributes: {},
    }

    traceManager.processSpan(span4)

    expect(reportFn).toHaveBeenCalled()
    expect(reportFn).toHaveBeenCalledWith(
      expect.objectContaining({
        name: 'ticket.basic-operation',
        duration: 100,
        status: 'ok',
        interruptionReason: undefined,
        entries: [
          expect.objectContaining({
            span: expect.objectContaining({ name: "start" })
          }),
          expect.objectContaining({
            span: expect.objectContaining({ name: "middle" })
          }),
          expect.objectContaining({
            span: expect.objectContaining({ name: "end" })
          })
        ],
      }),
    )
  })

  it('[need to add re-order functionality] correctly captures the entire operation when intermediate entries are pushed out-of-order', () => {
    const id = '12345'
    const debounceBy = 1_000
    const traceDefinition: TraceDefinition<TicketIdScope> = {
      name: 'ticket.activation',
      type: 'operation',
      requiredScopeKeys: [],
      requiredToEnd: [
        {
          name: 'ticket-end',
        },
      ],
      debounceOn: [
        {
          name: 'ticket-debounce',
        },
      ],
    }

    const tracer = traceManager.createTracer(traceDefinition)
    const startConfig: StartTraceConfig<TicketIdScope> = {
      scope: {
        ticketId: 1,
      },
    }

    tracer.start(startConfig)

    const entryTimes = [
      { time: 1_000, state: 'start' },
      { time: 2_000, state: 'processing' },
      { time: 2_500, state: 'middle' },
      { time: 2_400, state: 'out-of-order' },
      { time: 3_000, state: 'end' },
      { time: 3_001, state: 'post-end-span' },
    ] as const

    for (const { time, state } of entryTimes) {
      const span: Span<TicketIdScope> = {
        type: 'mark',
        name: `ticket-${state}`,
        startTime: ensureTimestamp({ now: time }),
        duration: 0,
        attributes: { ticketId: id },
      }
      traceManager.processSpan(span)
      jest.advanceTimersByTime(Math.max(0, time - performance.now()))
    }

    jest.advanceTimersByTime(debounceBy + 1)

    expect(reportFn).toHaveBeenCalledWith(
      expect.objectContaining({
        name: 'ticket.activation',
        duration: 3_000,
        status: 'ok',
        interruptionReason: undefined,
        entries: [
          expect.objectContaining({
            span: expect.objectContaining({ name: "ticket-start" })
          }),
          expect.objectContaining({
            span: expect.objectContaining({ name: "ticket-processing" })
          }),
          expect.objectContaining({
            span: expect.objectContaining({ name: "ticket-middle" })
          }),
          // IMPLEMENTATION TODO: Add reordering functionality ticket-out-of-order should be before ticket-middle
          expect.objectContaining({
            span: expect.objectContaining({ name: "ticket-out-of-order" })
          }),
          expect.objectContaining({
            span: expect.objectContaining({ name: "ticket-end" })
          }),
        ],
      }),
    )
  })

  it('timeouts the whole operation when the timeout is reached', () => {
    const traceDefinition: TraceDefinition<TicketIdScope> = {
      name: 'ticket.timeout-operation',
      type: 'operation',
      requiredScopeKeys: ['ticketId'],
      requiredToEnd: [
        {
          name: 'end',
        },
      ],
      timeoutDuration: 500,
    }

    const tracer = traceManager.createTracer(traceDefinition)
    const startConfig: StartTraceConfig<TicketIdScope> = {
      scope: { ticketId: 1 },
    }

    tracer.start(startConfig)

    // we need to process a span in order to trigger a timeout
    const span1: Span<TicketIdScope> = {
      type: 'mark',
      name: 'start',
      startTime: ensureTimestamp(),
      duration: 0,
      attributes: {},
    }
    traceManager.processSpan(span1)

    jest.advanceTimersByTime(2_001)

    const span2: Span<TicketIdScope> = {
      type: 'mark',
      name: 'timed-out-render',
      startTime: ensureTimestamp(),
      duration: 0,
      attributes: {},
    }
    traceManager.processSpan(span2)

    expect(reportFn).toHaveBeenCalled()
    expect(reportFn).toHaveBeenCalledWith(
      expect.objectContaining({
        name: 'ticket.timeout-operation',
        type: 'operation',
        interruptionReason: 'timeout',
        status: 'interrupted',
        entries: [
          expect.objectContaining({
            span: expect.objectContaining({ name: "start" })
          }),
        ],
      }),
    )
  })

  it('interrupts itself when another operation is started', () => {
    const traceDefinition: TraceDefinition<TicketIdScope> = {
      name: 'ticket.interrupt-operation',
      type: 'operation',
      requiredScopeKeys: [],
      requiredToEnd: [
        {
          name: 'end',
        },
      ],
    }

    const tracer = traceManager.createTracer(traceDefinition)
    const startConfig: StartTraceConfig<TicketIdScope> = {
      scope: {
        ticketId: 1,
      },
    }

    tracer.start(startConfig)

    const span: Span<TicketIdScope> = {
      type: 'mark',
      name: 'start',
      startTime: ensureTimestamp(),
      duration: 0,
      attributes: {},
    }
    traceManager.processSpan(span)
    jest.advanceTimersByTime(500)

    // start another trace
    tracer.start(startConfig)

    expect(reportFn).toHaveBeenCalled()
    expect(reportFn).toHaveBeenCalledWith(
      expect.objectContaining({
        name: 'ticket.interrupt-operation',
        interruptionReason: 'another-trace-started',
        status: 'interrupted',
        type: 'operation',
        entries: [
          expect.objectContaining({
            span: expect.objectContaining({ name: "start" })
          }),
        ],
      }),
    )
  })

  it('does NOT stop a trace as long as debounced entries are seen', () => {
    const traceDefinition: TraceDefinition<TicketIdScope> = {
      name: 'ticket.debounce-operation',
      type: 'operation',
      requiredScopeKeys: [],
      requiredToEnd: [
        {
          name: 'end',
        },
      ],
      debounceOn: [
        {
          type: 'mark',
          name: (name: string) => name.startsWith('debounce'),
        },
      ],
      captureInteractive: true,
      debounceDuration: 300,
    }

    const tracer = traceManager.createTracer(traceDefinition)
    const startConfig: StartTraceConfig<TicketIdScope> = {
      scope: {
        ticketId: 1,
      },
    }

    tracer.start(startConfig)

    const span1: Span<TicketIdScope> = {
      type: 'mark',
      name: 'start',
      startTime: ensureTimestamp(),
      duration: 0,
      attributes: {},
    }

    traceManager.processSpan(span1)
    jest.advanceTimersByTime(50)

    const span2: Span<TicketIdScope> = {
      type: 'mark',
      name: 'end',
      startTime: ensureTimestamp(),
      duration: 0,
      attributes: {},
    }

    traceManager.processSpan(span2)
    jest.advanceTimersByTime(1)

    // Simulate debounce mark
    const span3: Span<TicketIdScope> = {
      type: 'mark',
      name: 'debounce-shorter-than-debounceDuration',
      startTime: ensureTimestamp(),
      duration: 0,
      attributes: {},
    }

    traceManager.processSpan(span3)
    jest.advanceTimersByTime(200)

    expect(reportFn).not.toHaveBeenCalled()

    const span4: Span<TicketIdScope> = {
      type: 'mark',
      name: 'debounce-shorter-than-debounceDuration',
      startTime: ensureTimestamp(),
      duration: 0,
      attributes: {},
    }

    traceManager.processSpan(span4)
    jest.advanceTimersByTime(200)

    expect(reportFn).not.toHaveBeenCalled()

    const span5: Span<TicketIdScope> = {
      type: 'mark',
      name: 'debounce-longer-than-debounceDuration',
      startTime: ensureTimestamp(),
      duration: 0,
      attributes: {},
    }

    traceManager.processSpan(span5)
    jest.advanceTimersByTime(600)

    const span6: Span<TicketIdScope> = {
      type: 'mark',
      name: 'post-end-span',
      startTime: ensureTimestamp(),
      duration: 0,
      attributes: {},
    }
    traceManager.processSpan(span6)

    expect(reportFn).toHaveBeenCalled()
    expect(reportFn).toHaveBeenCalledWith(
      expect.objectContaining({
        name: 'ticket.debounce-operation',
        type: 'operation',
        status: 'ok',
        interruptionReason: undefined,
        duration: 451, // 50 + 1 + 200 + 200
        entries: [
          expect.objectContaining({
            span: expect.objectContaining({ name: "start" })
          }),
          expect.objectContaining({
            span: expect.objectContaining({ name: "end" })
          }),
          expect.objectContaining({
            span: expect.objectContaining({ name: "debounce-shorter-than-debounceDuration" })
          }),
          expect.objectContaining({
            span: expect.objectContaining({ name: "debounce-shorter-than-debounceDuration" })
          }),
          expect.objectContaining({
            span: expect.objectContaining({ name: "debounce-longer-than-debounceDuration" })
          }),
        ],
      }),
    )
  })

  it('interrupts the trace when interruptOn criteria is met', () => {
    const traceDefinition: TraceDefinition<TicketIdScope> = {
      name: 'ticket.interrupt-on-operation',
      type: 'operation',
      requiredScopeKeys: [],
      requiredToEnd: [
        {
          name: 'end',
        },
      ],
      interruptOn: [
        {
          name: 'interrupt',
        },
      ],
    }

    const tracer = traceManager.createTracer(traceDefinition)
    const startConfig: StartTraceConfig<TicketIdScope> = {
      scope: {
        ticketId: 1,
      },
    }

    tracer.start(startConfig)

    const span1: Span<TicketIdScope> = {
      type: 'mark',
      name: 'start',
      startTime: ensureTimestamp(),
      duration: 0,
      attributes: {},
    }

    traceManager.processSpan(span1)
    jest.advanceTimersByTime(100)

    // Simulate interrupt mark
    const span2: Span<TicketIdScope> = {
      type: 'mark',
      name: 'interrupt',
      startTime: ensureTimestamp(),
      duration: 0,
      attributes: {},
    }

    traceManager.processSpan(span2)
    jest.advanceTimersByTime(1)

    expect(reportFn).toHaveBeenCalled()
    expect(reportFn).toHaveBeenCalledWith(
      expect.objectContaining({
        name: 'ticket.interrupt-on-operation',
        interruptionReason: 'matched-on-interrupt',
        status: 'interrupted',
        type: 'operation',
        entries: [
          expect.objectContaining({
            span: expect.objectContaining({ name: "start" })
          }),
          // interrupt span is not included
        ],
      }),
    )
  })

  describe('capturing interactivity', () => {
    it('waits the long task debounce interval before emitting interactive event', () => {
      const debounceLongTasksBy = 500
      const traceDefinition: TraceDefinition<TicketIdScope> = {
        name: 'ticket.operation',
        type: 'operation',
        requiredScopeKeys: [],
        requiredToEnd: [],
        captureInteractive: { timeout: 5_000, debounceLongTasksBy },
      }

      const tracer = traceManager.createTracer(traceDefinition)
      const startConfig: StartTraceConfig<TicketIdScope> = {
        scope: {
          ticketId: 1,
        },
      }

      tracer.start(startConfig)

      const span: Span<TicketIdScope> = {
        type: 'mark',
        name: 'start',
        startTime: ensureTimestamp(),
        duration: 0,
        attributes: {},
      }

      traceManager.processSpan(span)
      jest.advanceTimersByTime(2_000)

      const endSpan: Span<TicketIdScope> = {
        type: 'mark',
        name: 'end',
        startTime: ensureTimestamp(),
        duration: 0,
        attributes: {},
      }

      traceManager.processSpan(endSpan)
      jest.advanceTimersByTime(1)

      expect(reportFn).toHaveBeenCalled()

      jest.advanceTimersByTime(300)
      const longTaskSpan: Span<TicketIdScope> = {
        type: 'longtask',
        name: 'longtask',
        startTime: ensureTimestamp(),
        duration: 100,
        attributes: {},
      }

      traceManager.processSpan(longTaskSpan)
      jest.advanceTimersByTime(300)

      traceManager.processSpan(longTaskSpan)
      jest.advanceTimersByTime(600)

      expect(reportFn).toHaveBeenCalledTimes(2)
    })

    it('timeouts the interactive event if long tasks keep appearing', () => {
      const debounceLongTasksBy = 500
      const interactiveTimeout = 5_000
      const traceDefinition: TraceDefinition<TicketIdScope> = {
        name: 'ticket.timeout-operation',
        type: 'operation',
        requiredScopeKeys: [],
        requiredToEnd: [],
        captureInteractive: {
          timeout: interactiveTimeout,
          debounceLongTasksBy,
        },
      }

      const tracer = traceManager.createTracer(traceDefinition)
      const startConfig: StartTraceConfig<TicketIdScope> = {
        scope: {
          ticketId: 1,
        },
      }

      tracer.start(startConfig)

      const span1: Span<TicketIdScope> = {
        type: 'mark',
        name: 'start',
        startTime: ensureTimestamp(),
        duration: 0,
        attributes: {},
      }

      traceManager.processSpan(span1)
      jest.advanceTimersByTime(2_000)

      const span2: Span<TicketIdScope> = {
        type: 'mark',
        name: 'end',
        startTime: ensureTimestamp(),
        duration: 0,
        attributes: {},
      }

      traceManager.processSpan(span2)

      const longTaskEveryMs = 150
      const longTaskDuration = 200
      const longTasksCount = Math.ceil(
        interactiveTimeout / (longTaskEveryMs + longTaskDuration),
      )
      let remainingLongTasks = longTasksCount

      while (remainingLongTasks--) {
        jest.advanceTimersByTime(longTaskEveryMs + longTaskDuration)
        const longTaskSpan: Span<TicketIdScope> = {
          type: 'longtask',
          name: 'longtask',
          startTime: ensureTimestamp(),
          duration: longTaskDuration,
          attributes: {},
        }
        traceManager.processSpan(longTaskSpan)
      }

      jest.advanceTimersByTime(debounceLongTasksBy)

      expect(reportFn).toHaveBeenCalledTimes(2)
    })
  })

  it(`[needs fixture] correctly captures the operation's duration`, () => {
    const ticketId = '13024'
    const name = 'ticket.activation'
    // const lastEventRelativeEndTime = 1_706.599_999_999_627_5
    const traceDefinition: TraceDefinition<TicketIdScope> = {
      name: 'ticket.activation',
      type: 'operation',
      requiredScopeKeys: [],
      requiredToEnd: [
        {
          name: 'end',
          type: 'mark',
        },
      ],
      captureInteractive: true,
      timeout: 60_000,
    }

    const tracer = traceManager.createTracer(traceDefinition)
    const startConfig: StartTraceConfig<TicketIdScope> = {
      scope: {
        ticketId: 13_024,
      },
    }

    tracer.start(startConfig)

    const events = [
      { startTime: 0, duration: 0, name: 'start' },
      { startTime: 500, duration: 0, name: 'middle' },
      { startTime: 1_000, duration: 0, name: 'end' },
      // { startTime: 1_002, duration: 0, name: 'post-end-span' },
    ]

    for (const event of events) {
      const span: Span<TicketIdScope> = {
        type: 'mark',
        name: event.name,
        startTime: ensureTimestamp({ now: event.startTime }),
        duration: event.duration,
        attributes: { ticketId },
      }
      traceManager.processSpan(span)
      jest.advanceTimersByTime(500)
    }

    // Active Trace ends once the *next* span is processed
    const postEndSpan: Span<TicketIdScope> = {
      type: 'mark',
      name: 'post-end-span',
      startTime: ensureTimestamp(),
      duration: 0,
      attributes: {},
    }
    traceManager.processSpan(postEndSpan)
    jest.advanceTimersByTime(500)

    expect(reportFn).toHaveBeenCalled()
    expect(reportFn).toHaveBeenCalledWith(
      expect.objectContaining({
        name,
        duration: 1_000,
        entries: [
          expect.objectContaining({ name: 'start' }),
          expect.objectContaining({ name: 'middle' }),
          expect.objectContaining({ name: 'end' }),
        ],
      }),
    )
  })
})
