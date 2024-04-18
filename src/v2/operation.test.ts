/* eslint-disable jest/no-conditional-in-test */
import { OperationManager, type Operation } from './operation'
import {
  type OperationDefinition,
  type PerformanceEntryLike,
  type Event,
} from './types'
import { SKIP_PROCESSING } from './constants'

describe('operation tracking', () => {
  // returns mocked time:
  const getTimeNow = () => Date.now()
  const performanceMock = {
    now: jest.fn(getTimeNow),
    measure: jest.fn(),
  }
  const onTracked = (operation: Operation) => {
    performanceMock.measure(
      operation.durationTillInteractive
        ? `${operation.name}-interactive`
        : operation.name,
      {
        start: operation.startTime,
        duration: operation.durationTillInteractive || operation.duration,
        detail: {
          [SKIP_PROCESSING]: true,
          metadata: operation.metadata,
          id: operation.id,
          name: operation.name,
          events: operation.getEvents().map((event) => ({
            name: event.name,
            entryType: event.entryType,
            startTime: event.startTime,
            duration: event.duration,
          })),
          state: operation.state,
          interactive: Boolean(operation.durationTillInteractive),
        },
      },
    )
  }

  let pushEntry: (entry: PerformanceEntryLike) => void = () => {
    //
  }
  const disconnectMock = jest.fn(() => {
    pushEntry = () => {
      //
    }
  })
  const observeMock = jest.fn((onEntry) => {
    pushEntry = onEntry
    return disconnectMock
  })
  const pushEntries = (entries: (PerformanceEntryLike | Event)[]) => {
    entries.forEach(pushEntry)
  }
  beforeEach(() => {
    jest.useFakeTimers({ now: 0 })
  })

  afterEach(() => {
    jest.runAllTimers()
    jest.clearAllMocks()
  })

  describe.each(['unbuffered', 'buffered'] as const)('%s', (observerType) => {
    // describe('with unbuffered observer', () => {
    //   const observerType = 'unbuffered' as 'unbuffered' | 'buffered';
    const bufferDuration = observerType === 'buffered' ? 10_000 : 0
    const PerformanceManager = new OperationManager({
      observe: observeMock,
      performance: performanceMock,
      // buffer the entire operation
      bufferDuration,
      supportedEntryTypes: [
        'element',
        'event',
        'first-input',
        'largest-contentful-paint',
        'layout-shift',
        // 'long-animation-frame',
        'longtask',
        'mark',
        'measure',
        'navigation',
        'paint',
        'resource',
        'visibility-state',
      ],
    })

    it('tracks operations', () => {
      const operationDefinition: OperationDefinition = {
        operationName: 'basic-operation',
        track: [
          {
            match: { name: 'start-mark', type: 'mark' },
            requiredToStart: true,
            debounceEndWhenSeen: false,
          },
          {
            match: { name: 'end-mark', type: 'mark' },
            requiredToEnd: true,
            debounceEndWhenSeen: false,
          },
        ],
        onTracked,
      }

      const operationId = PerformanceManager.startOperation(operationDefinition)

      const operationDelay = 1_000
      // we delay the start until 1000ms
      jest.advanceTimersByTime(operationDelay)

      // Simulate start mark
      pushEntries([
        {
          entryType: 'mark',
          name: 'start-mark',
          startTime: getTimeNow(),
          duration: 0,
        },
      ])
      jest.advanceTimersByTime(1_000)
      // Simulate end mark
      pushEntries([
        {
          entryType: 'mark',
          name: 'end-mark',
          startTime: getTimeNow(),
          duration: 0,
        },
      ])

      jest.advanceTimersByTime(1)

      if (observerType === 'buffered') {
        // fast forward to the end of the buffer
        jest.advanceTimersByTime(
          operationDelay + bufferDuration + 1 - getTimeNow(),
        )
      }

      expect(performanceMock.measure).toHaveBeenCalledWith('basic-operation', {
        start: 1_000,
        duration: 1_000,
        detail: expect.objectContaining({
          state: 'completed',
          events: expect.objectContaining({ length: 2 }),
        }),
      })
    })

    it('does not stop an operation as long as debounced entries are seen', () => {
      const operationDefinition: OperationDefinition = {
        operationName: 'debounce-operation',
        track: [
          {
            match: { name: 'debounce-mark', type: 'mark' },
            requiredToEnd: true,
            debounceEndWhenSeen: { debounceBy: 500 },
          },
        ],
        onTracked,
      }

      const operationId = PerformanceManager.startOperation(operationDefinition)

      // Simulate debounce mark
      pushEntries([
        {
          entryType: 'mark',
          name: 'debounce-mark',
          startTime: getTimeNow(),
          duration: 0,
        },
      ])

      // Advance time less than debounceBy
      jest.advanceTimersByTime(300)

      expect(performanceMock.measure).not.toHaveBeenCalled()

      pushEntries([
        {
          entryType: 'mark',
          name: 'debounce-mark',
          startTime: getTimeNow(),
          duration: 0,
        },
      ])

      // Advance time less than debounceBy
      jest.advanceTimersByTime(300)

      expect(performanceMock.measure).not.toHaveBeenCalled()

      pushEntries([
        {
          entryType: 'mark',
          name: 'debounce-mark',
          startTime: getTimeNow(),
          duration: 0,
        },
      ])

      // Advance time longer than debounceBy should trigger the measure
      jest.advanceTimersByTime(600)

      if (observerType === 'buffered') {
        // buffered observer will only trigger the end once the *next* task is processed
        pushEntries([
          {
            entryType: 'mark',
            name: 'dummy',
            startTime: getTimeNow(),
            duration: 0,
          },
        ])
        // fast forward to the end of the buffer
        jest.advanceTimersByTime(bufferDuration + 1 - getTimeNow())
      }

      expect(performanceMock.measure).toHaveBeenCalledWith(
        'debounce-operation',
        {
          start: 0,
          // we debounced 2 times for 300ms, so the total duration is 600ms
          duration: 300 * 2,
          detail: expect.objectContaining({
            state: 'completed',
            events: expect.objectContaining({ length: 3 }),
          }),
        },
      )
    })

    it('timeouts the whole operation when the timeout is reached', () => {
      const operationDefinition: OperationDefinition = {
        operationName: 'timeout-operation',
        track: [
          {
            match: { name: 'never-to-be-seen-mark', type: 'mark' },
            requiredToEnd: true,
            debounceEndWhenSeen: false,
          },
        ],
        onTracked,
        timeout: 1_000,
      }

      const operationId = PerformanceManager.startOperation(operationDefinition)

      let timeLeftBeforeTimeout = 1_000
      const delayBeforeAnEntry = 700
      // Advance time before the timeout
      jest.advanceTimersByTime(delayBeforeAnEntry)
      timeLeftBeforeTimeout -= delayBeforeAnEntry

      // entries that are unrelated should not affect the timeout:
      pushEntries([
        {
          entryType: 'mark',
          name: 'unrelated',
          startTime: getTimeNow(),
          duration: 0,
        },
      ])

      // advance time beyond the timeout
      jest.advanceTimersByTime(timeLeftBeforeTimeout)

      if (observerType === 'buffered') {
        // buffered observer will only trigger the end once the *next* task is processed after the time has passed
        pushEntries([
          {
            entryType: 'mark',
            name: 'dummy',
            startTime: getTimeNow(),
            duration: 0,
          },
        ])
        // fast forward to the end of the buffer
        jest.advanceTimersByTime(
          bufferDuration + 1 - (getTimeNow() - delayBeforeAnEntry),
        )
      }

      expect(performanceMock.measure).toHaveBeenCalledWith(
        'timeout-operation',
        {
          start: 0,
          duration: 1_000,
          detail: expect.objectContaining({
            state: 'timeout',
            events: expect.objectContaining({ length: 1 }),
          }),
        },
      )
    })

    describe('capturing interactivity', () => {
      it('waits the long task debounce interval before emitting interactive event', () => {
        const debounceLongTasksBy = 500
        const operationDefinition: OperationDefinition = {
          operationName: 'operation',
          track: [
            {
              match: { name: 'start', type: 'mark' },
              requiredToStart: true,
              debounceEndWhenSeen: false,
            },
            {
              match: { name: 'end', type: 'mark' },
              requiredToEnd: true,
              debounceEndWhenSeen: false,
            },
          ],
          onTracked,
          onEnd: onTracked,
          waitUntilInteractive: { timeout: 5_000, debounceLongTasksBy },
        }

        const operationId =
          PerformanceManager.startOperation(operationDefinition)

        const renderDuration = 2_000
        const timeTillLongTask = 300
        const longTaskDuration = 100

        // Simulate start mark
        pushEntries([
          {
            entryType: 'mark',
            name: 'start',
            startTime: getTimeNow(),
            duration: 0,
          },
        ])
        jest.advanceTimersByTime(renderDuration)

        // Simulate end mark
        pushEntries([
          {
            entryType: 'mark',
            name: 'end',
            startTime: getTimeNow(),
            duration: 0,
          },
        ])

        // one tick to emit the measure, as they are scheduled on the next tick
        jest.advanceTimersByTime(1)

        if (observerType === 'unbuffered') {
          // we should have the operation measure with the waiting-for-interactive state
          expect(performanceMock.measure).toHaveBeenCalledTimes(1)
        } else {
          expect(performanceMock.measure).not.toHaveBeenCalled()
        }

        // advance to the first long task (minus the 1ms we previously advanced)
        jest.advanceTimersByTime(timeTillLongTask - 1)
        const timeAtLongTask1 = getTimeNow()
        jest.advanceTimersByTime(longTaskDuration)
        pushEntries([
          {
            entryType: 'longtask',
            name: 'longtask',
            startTime: timeAtLongTask1,
            duration: longTaskDuration,
          },
        ])

        // schedule another long task:
        jest.advanceTimersByTime(timeTillLongTask)
        const timeAtLongTask2 = getTimeNow()
        jest.advanceTimersByTime(longTaskDuration)
        pushEntries([
          {
            entryType: 'longtask',
            name: 'longtask',
            startTime: timeAtLongTask2,
            duration: longTaskDuration,
          },
        ])

        // advance beyond the debounce time:
        jest.advanceTimersByTime(debounceLongTasksBy)

        if (observerType === 'buffered') {
          // buffered observer will only trigger the end once the *next* task is processed
          pushEntries([
            {
              entryType: 'mark',
              name: 'dummy',
              startTime: getTimeNow(),
              duration: 0,
            },
          ])
          // fast forward to the end of the buffer
          jest.advanceTimersByTime(bufferDuration + 1 - getTimeNow())
        }

        expect(performanceMock.measure).toHaveBeenNthCalledWith(
          1,
          'operation',
          {
            start: 0,
            duration: renderDuration,
            detail: expect.objectContaining({
              state: 'waiting-for-interactive',
              events: expect.objectContaining({ length: 2 }),
            }),
          },
        )

        expect(performanceMock.measure).toHaveBeenNthCalledWith(
          2,
          'operation-interactive',
          {
            start: 0,
            // interactive state is after render and after the last debounced long task
            duration:
              renderDuration + (timeTillLongTask + longTaskDuration) * 2,
            detail: expect.objectContaining({
              interactive: true,
              state: 'completed',
              events: expect.objectContaining({ length: 4 }),
            }),
          },
        )
      })

      it('timeouts the interactive event if long tasks keep appearing', () => {
        const debounceLongTasksBy = 500
        const interactiveTimeout = 5_000
        const operationDefinition: OperationDefinition = {
          operationName: 'operation',
          track: [
            {
              match: { name: 'start', type: 'mark' },
              requiredToStart: true,
              debounceEndWhenSeen: false,
            },
            {
              match: { name: 'end', type: 'mark' },
              requiredToEnd: true,
              debounceEndWhenSeen: false,
            },
          ],
          onTracked,
          onEnd: onTracked,
          waitUntilInteractive: {
            timeout: interactiveTimeout,
            debounceLongTasksBy,
          },
        }

        const operationId =
          PerformanceManager.startOperation(operationDefinition)

        const renderDuration = 2_000
        const longTaskEveryMs = 150
        const longTaskDuration = 200

        // Simulate start mark
        pushEntries([
          {
            entryType: 'mark',
            name: 'start',
            startTime: getTimeNow(),
            duration: 0,
          },
        ])
        jest.advanceTimersByTime(renderDuration)

        // Simulate end mark
        pushEntries([
          {
            entryType: 'mark',
            name: 'end',
            startTime: getTimeNow(),
            duration: 0,
          },
        ])

        const longTasksCount = Math.ceil(
          interactiveTimeout / (longTaskEveryMs + longTaskDuration),
        )
        let remainingLongTasks = longTasksCount

        while (remainingLongTasks--) {
          jest.advanceTimersByTime(longTaskEveryMs + longTaskDuration)
          pushEntries([
            {
              entryType: 'longtask',
              name: 'longtask',
              startTime: getTimeNow() - longTaskDuration,
              duration: longTaskDuration,
            },
          ])
        }

        // advance beyond the debounce time:
        jest.advanceTimersByTime(debounceLongTasksBy)

        if (observerType === 'buffered') {
          // fast forward to the end of the buffer
          jest.advanceTimersByTime(bufferDuration + 1 - getTimeNow())
        }

        expect(performanceMock.measure).toHaveBeenNthCalledWith(
          1,
          'operation',
          {
            start: 0,
            duration: renderDuration,
            detail: expect.objectContaining({
              state: 'waiting-for-interactive',
              events: expect.objectContaining({
                length: 2,
              }),
            }),
          },
        )

        expect(performanceMock.measure).toHaveBeenNthCalledWith(
          2,
          'operation-interactive',
          {
            start: 0,
            duration: renderDuration + interactiveTimeout,
            detail: expect.objectContaining({
              interactive: true,
              state: 'interactive-timeout',
              events: expect.objectContaining({
                length: 2 + longTasksCount - 1,
              }),
            }),
          },
        )
      })
    })

    it('interrupts itself when another operation of the same name is started and interruptSelf is true', () => {
      const operationDefinition: OperationDefinition = {
        operationName: 'interrupt-operation',
        track: [
          {
            match: { name: 'start', type: 'mark' },
            requiredToStart: true,
            debounceEndWhenSeen: false,
          },
          {
            match: { name: 'end', type: 'mark' },
            requiredToEnd: true,
            debounceEndWhenSeen: false,
          },
        ],
        onTracked,
        interruptSelf: true,
      }

      const operationId1 =
        PerformanceManager.startOperation(operationDefinition)

      const interruptAfter = 100
      const durationOf2nd = 500
      const delayToStart2nd = 1_000

      // Simulate start mark
      pushEntries([
        {
          entryType: 'mark',
          name: 'start',
          startTime: getTimeNow(),
          duration: 0,
        },
      ])
      jest.advanceTimersByTime(interruptAfter)

      const operationId2 =
        PerformanceManager.startOperation(operationDefinition)
      jest.advanceTimersByTime(delayToStart2nd)
      pushEntries([
        {
          entryType: 'mark',
          name: 'start',
          startTime: getTimeNow(),
          duration: 0,
        },
      ])
      jest.advanceTimersByTime(durationOf2nd)
      pushEntries([
        {
          entryType: 'mark',
          name: 'end',
          startTime: getTimeNow(),
          duration: 0,
        },
      ])
      // one tick to emit the measures, as they are scheduled on the next tick
      jest.advanceTimersByTime(1)

      if (observerType === 'buffered') {
        // fast forward to the end of the buffer
        jest.advanceTimersByTime(bufferDuration + 1 - getTimeNow())
      }

      expect(performanceMock.measure).toHaveBeenCalledTimes(2)
      // regardless of the configuration, the next operation should interrupt and end the previous operation
      expect(performanceMock.measure).toHaveBeenNthCalledWith(
        1,
        'interrupt-operation',
        {
          start: 0,
          duration: interruptAfter,
          detail: expect.objectContaining({
            id: operationId1,
            state: 'interrupted',
            events: expect.objectContaining({ length: 1 }),
          }),
        },
      )

      expect(performanceMock.measure).toHaveBeenNthCalledWith(
        2,
        'interrupt-operation',
        {
          start: delayToStart2nd + interruptAfter,
          duration: durationOf2nd,
          detail: expect.objectContaining({
            id: operationId2,
            state: 'completed',
            events: expect.objectContaining({ length: 2 }),
          }),
        },
      )
    })

    it('captures multiple operations simultaneously', () => {
      const operationDefinition1: OperationDefinition = {
        operationName: 'operation-1',
        track: [
          {
            match: { name: 'start-1', type: 'mark' },
            requiredToStart: true,
            debounceEndWhenSeen: false,
          },
          {
            match: { name: 'end-1', type: 'mark' },
            requiredToEnd: true,
            debounceEndWhenSeen: false,
          },
        ],
        onTracked,
      }

      const operationDefinition2: OperationDefinition = {
        operationName: 'operation-2',
        track: [
          {
            match: { name: 'start-2', type: 'mark' },
            requiredToStart: true,
            debounceEndWhenSeen: false,
          },
          {
            match: { name: 'end-2', type: 'mark' },
            requiredToEnd: true,
            debounceEndWhenSeen: false,
          },
        ],
        onTracked,
      }

      const operationId1 =
        PerformanceManager.startOperation(operationDefinition1)
      const operationId2 =
        PerformanceManager.startOperation(operationDefinition2)

      const op1StartAt = getTimeNow()
      const op2StartAfter = 300
      const op1EndAfter = 400
      const op2EndAfter = 500
      const op2StartAt = op1StartAt + op2StartAfter

      // Simulate marks for both operations
      pushEntries([
        {
          entryType: 'mark',
          name: 'start-1',
          startTime: getTimeNow(),
          duration: 0,
        },
      ])

      jest.advanceTimersByTime(op2StartAfter)
      pushEntries([
        {
          entryType: 'mark',
          name: 'start-2',
          startTime: getTimeNow(),
          duration: 0,
        },
      ])

      jest.advanceTimersByTime(op1EndAfter)
      pushEntries([
        {
          entryType: 'mark',
          name: 'end-1',
          startTime: getTimeNow(),
          duration: 0,
        },
      ])

      jest.advanceTimersByTime(op2EndAfter)
      pushEntries([
        {
          entryType: 'mark',
          name: 'end-2',
          startTime: getTimeNow(),
          duration: 0,
        },
      ])

      // one tick to emit the measures, as they are scheduled on the next tick
      jest.advanceTimersByTime(1)

      if (observerType === 'buffered') {
        // fast forward to the end of the buffer
        jest.advanceTimersByTime(bufferDuration + 1 - getTimeNow())
      }

      expect(performanceMock.measure).toHaveBeenNthCalledWith(
        1,
        'operation-1',
        {
          start: op1StartAt,
          duration: op2StartAfter + op1EndAfter,
          detail: expect.objectContaining({
            id: operationId1,
            state: 'completed',
            events: expect.objectContaining({ length: 3 }),
          }),
        },
      )

      expect(performanceMock.measure).toHaveBeenNthCalledWith(
        2,
        'operation-2',
        {
          start: op2StartAt,
          duration: op1EndAfter + op2EndAfter,
          detail: expect.objectContaining({
            id: operationId2,
            state: 'completed',
            events: expect.objectContaining({ length: 4 }),
          }),
        },
      )
    })

    it('correctly captures the entire operation when intermediate entries are pushed out-of-order', () => {
      const id = '12345'
      const debounceBy = 1000
      const operationDefinition: OperationDefinition = {
        operationName: 'ticket-activation',
        track: [
          {
            match: { name: 'ticket-start' },
            requiredToStart: true,
          },
          {
            match: { metadata: { ticketId: id } },
            debounceEndWhenSeen: { debounceBy },
          },
          {
            match: { name: 'ticket-complete' },
            requiredToEnd: true,
          },
        ],
        onTracked,
      }

      const operationId = PerformanceManager.startOperation(operationDefinition)

      const entryTimes = [
        { time: 1000, state: 'start' },
        { time: 2000, state: 'processing' },
        { time: 2500, state: 'middle' },
        { time: 1500, state: 'out-of-order' },
        { time: 3000, state: 'complete' },
      ] as const

      // Simulate entries being pushed in out-of-order
      for (const { time, state } of entryTimes) {
        pushEntries([
          {
            entryType: 'mark',
            name: `ticket-${state}`,
            startTime: time,
            duration: 0,
            metadata: { ticketId: id },
          },
        ])
        jest.advanceTimersByTime(Math.max(0, time - getTimeNow()))
      }

      jest.advanceTimersByTime(debounceBy + 1)

      if (observerType === 'buffered') {
        // buffered observer will only trigger the end once the *next* task is processed
        pushEntries([
          {
            entryType: 'mark',
            name: 'dummy',
            startTime: getTimeNow(),
            duration: 0,
          },
        ])
        // fast forward to the end of the buffer
        jest.advanceTimersByTime(bufferDuration + 1 - getTimeNow())
      }

      expect(performanceMock.measure).toHaveBeenCalledWith(
        'ticket-activation',
        {
          start: entryTimes[0].time,
          duration: entryTimes[4].time - entryTimes[0].time,
          detail: expect.objectContaining({
            state: 'completed',
            events: expect.objectContaining({ length: entryTimes.length }),
          }),
        },
      )
    })

    if (observerType === 'unbuffered') return

    it('correctly captures the entire operation when start/end entries are pushed out-of-order', () => {
      const operationDefinition: OperationDefinition = {
        operationName: 'out-of-order-operation',
        track: [
          {
            match: { name: 'start-mark', type: 'mark' },
            requiredToStart: true,
            debounceEndWhenSeen: false,
          },
          {
            match: { name: 'end-mark', type: 'mark' },
            requiredToEnd: true,
            debounceEndWhenSeen: false,
          },
        ],
        onTracked,
      }

      const operationId = PerformanceManager.startOperation(operationDefinition)

      const startTime = 1000
      const endTime = 2000

      // Simulate end mark first
      pushEntries([
        {
          entryType: 'mark',
          name: 'end-mark',
          startTime: endTime,
          duration: 0,
        },
      ])

      // Advance time to start mark
      jest.advanceTimersByTime(startTime)

      // Simulate start mark after end mark
      pushEntries([
        {
          entryType: 'mark',
          name: 'start-mark',
          startTime: startTime,
          duration: 0,
        },
      ])

      // Advance time to process the measures
      jest.advanceTimersByTime(1)

      if (observerType === 'buffered') {
        // fast forward to the end of the buffer
        jest.advanceTimersByTime(bufferDuration + 1 - getTimeNow())
      }

      expect(performanceMock.measure).toHaveBeenCalledWith(
        'out-of-order-operation',
        {
          start: startTime,
          duration: endTime - startTime,
          detail: expect.objectContaining({
            state: 'completed',
            events: expect.objectContaining({ length: 2 }),
          }),
        },
      )
    })
  })
})
