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

  it('[need trace recording] tracks operations', () => {
    const traceDefinition: TraceDefinition<TicketIdScope> = {
      name: 'basic-operation',
      type: 'operation',
      requiredScopeKeys: {
        ticketId: 1,
      },
      requiredToEnd: [{
        name: 'end',
        type: 'mark',
      }],
    }

    const tracer = traceManager.createTracer(traceDefinition)
    const startConfig: StartTraceConfig<TicketIdScope> = {
      scope: {
        'ticketId': 1,
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
    jest.advanceTimersByTime(1_000)

    // Simulate end mark
    const span2: Span<TicketIdScope> = {
      type: 'mark',
      name: 'end',
      startTime: ensureTimestamp(),
      duration: 0,
      attributes: {},
    }

    traceManager.processSpan(span2)
    jest.advanceTimersByTime(1)

    // const traceRecording: TraceRecording<TicketIdScope> = {
    //   id: 'test-id',
    //   name: 'ticket.basic-operation',
    //   scope: {},
    //   type: 'operation',
    //   status: 'ok',
    //   duration: 0,
    //   startTillInteractive: null,
    //   completeTillInteractive: null,
    //   attributes: {},
    //   computedSpans: {},
    //   computedValues: {},
    //   spanAttributes: {},
    //   entries: [],
    // }

    // traceManager.activeTrace?.finalize({
    //   transitionFromState: 'recording',
    // })

    // expect(reportFn).toHaveBeenCalledWith(traceRecording)
    expect(reportFn).toHaveBeenCalled();

  })

  it(`[need trace recording] correctly captures the operation's duration`, () => {
    const ticketId = '13024'
    const name = 'ticket.activation'
    const lastEventRelativeEndTime = 1_706.599_999_999_627_5
    const traceDefinition: TraceDefinition<TicketIdScope> = {
      name: 'ticket.activation',
      type: 'operation',
      requiredScopeKeys: [],
      requiredToEnd: [{
        name: 'end',
      }],
      waitUntilInteractive: true,
      timeout: 60_000,
    }

    const tracer = traceManager.createTracer(traceDefinition)
    const startConfig: StartTraceConfig<TicketIdScope> = {
      scope: {
        ticketId: 1
      },
    }

    tracer.start(startConfig)

    const events = [
      { startTime: 0, duration: 100, name: 'start' },
      { startTime: 500, duration: 100, name: 'middle' },
      { startTime: 1_000, duration: 100, name: 'end' },
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
      jest.advanceTimersByTime(Math.max(0, event.startTime + event.duration - performance.now()))
      // jest.advanceTimersByTime(500)
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
        // duration: expect.closeTo(lastEventRelativeEndTime),
      }),
    )
  })

  it('[need trace recording] correctly captures the entire operation when intermediate entries are pushed out-of-order', () => {
    const id = '12345'
    const debounceBy = 1_000
    const traceDefinition: TraceDefinition<TicketIdScope> = {
      name: 'ticket.activation',
      type: 'operation',
      requiredScopeKeys: [],
      requiredToEnd: [{
        name: 'ticket-end'
      }],
    }

    const tracer = traceManager.createTracer(traceDefinition)
    const startConfig: StartTraceConfig<TicketIdScope> = {
      scope: {
        ticketId: 1
      },
    }

    tracer.start(startConfig)

    const entryTimes = [
      { time: 1_000, state: 'start' },
      { time: 2_000, state: 'processing' },
      { time: 2_500, state: 'middle' },
      { time: 1_500, state: 'out-of-order' },
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
        // duration: 3_000
      })
    )
  })

  it('timeouts the whole operation when the timeout is reached', () => {
    const traceDefinition: TraceDefinition<TicketIdScope> = {
      name: 'ticket.timeout-operation',
      type: 'operation',
      requiredScopeKeys: { ticketId: 'test-id' },
      requiredToEnd: [{
        name: 'end'
      }],
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
      name: 'render',
      startTime: ensureTimestamp(),
      duration: 0,
      attributes: {},
    }
    traceManager.processSpan(span2)

    expect(reportFn).toHaveBeenCalled()
    expect(reportFn).toHaveBeenCalledWith(
      expect.objectContaining(
        {
          name: 'ticket.timeout-operation',
          interruptionReason: 'timeout',
          status: 'interrupted',
          type: 'operation'
        }
      ),
    )
  })

  it('interrupts itself when another operation is started', () => {
    const traceDefinition: TraceDefinition<TicketIdScope> = {
      name: 'ticket.interrupt-operation',
      type: 'operation',
      requiredScopeKeys: [],
      requiredToEnd: [{
        name: 'end',
      }],
    }

    const tracer = traceManager.createTracer(traceDefinition)
    const startConfig: StartTraceConfig<TicketIdScope> = {
      scope: {
        ticketId: 1
      },
    }

    tracer.start(startConfig)
    jest.advanceTimersByTime(100)

    tracer.start(startConfig)
    expect(reportFn).toHaveBeenCalledTimes(1)
    jest.advanceTimersByTime(1_000)

    const span: Span<TicketIdScope> = {
      type: 'mark',
      name: 'start',
      startTime: ensureTimestamp(),
      duration: 0,
      attributes: {},
    }
    traceManager.processSpan(span)
    jest.advanceTimersByTime(500)

    const endSpan: Span<TicketIdScope> = {
      type: 'mark',
      name: 'end',
      startTime: ensureTimestamp(),
      duration: 0,
      attributes: {},
    }
    traceManager.processSpan(endSpan)

    expect(reportFn).toHaveBeenCalledTimes(2)
    const reportFnLastCalledWith = reportFn.mock.calls[0][0]; // Get the arguments of the latest call

    expect(reportFnLastCalledWith).toEqual(
      expect.objectContaining(
        {
          name: 'ticket.interrupt-operation',
          interruptionReason: 'another-trace-started',
          status: 'interrupted',
          type: 'operation'
        }
      ),
    )
  })

  it('does NOT stop a trace as long as debounced entries are seen', () => {
    const traceDefinition: TraceDefinition<TicketIdScope> = {
      name: 'ticket.debounce-operation',
      type: 'operation',
      requiredScopeKeys: [],
      requiredToEnd: [{
        name: 'end'
      }],
      debounceOn: [
        {
          type: 'mark',
          name: (name: string) => name.startsWith('debounce')
        },
      ],
      captureInteractive: true,
      debounceDuration: 300,
    }

    const tracer = traceManager.createTracer(traceDefinition)
    const startConfig: StartTraceConfig<TicketIdScope> = {
      scope: {
        ticketId: 1
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
  })

  describe('capturing interactivity', () => {
    it('waits the long task debounce interval before emitting interactive event', () => {
      const debounceLongTasksBy = 500
      const traceDefinition: TraceDefinition<TicketIdScope> = {
        name: 'ticket.operation',
        type: 'operation',
        requiredScopeKeys: [],
        requiredToEnd: [],
        waitUntilInteractive: { timeout: 5_000, debounceLongTasksBy },
      }

      const tracer = traceManager.createTracer(traceDefinition)
      const startConfig: StartTraceConfig<TicketIdScope> = {
        scope: {
          ticketId: 1
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

      expect(reportFn).toHaveBeenCalledTimes(1)

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
        waitUntilInteractive: { timeout: interactiveTimeout, debounceLongTasksBy },
      }

      const tracer = traceManager.createTracer(traceDefinition)
      const startConfig: StartTraceConfig<TicketIdScope> = {
        scope: {
          ticketId: 1
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
      const longTasksCount = Math.ceil(interactiveTimeout / (longTaskEveryMs + longTaskDuration))
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
})

