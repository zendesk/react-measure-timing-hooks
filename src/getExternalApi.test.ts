import { ActionLogCache } from './ActionLogCache'
import { generateReport } from './generateReport'
import { getExternalApi } from './getExternalApi'

const garbageCollectMs = 100_000
const debounceMs = 500
const renderTime = 100
const timeoutMs = 45_000

describe('getExternalApi', () => {
  const originalTimeOrigin = performance.timeOrigin
  beforeEach(() => {
    jest.useFakeTimers()
    Object.defineProperty(performance, 'timeOrigin', {
      configurable: true,
      enumerable: true,
      get() {
        return 0
      },
    })
  })
  afterEach(() => {
    jest.useRealTimers()
    Object.defineProperty(performance, 'timeOrigin', {
      configurable: true,
      enumerable: true,
      get() {
        return originalTimeOrigin
      },
    })
  })

  it('sends the report after debounce when no final stages are specified', () => {
    const reportFn = jest.fn()
    const onInternalError = jest.fn()
    const actionLogCache = new ActionLogCache({
      garbageCollectMs,
      debounceMs,
      reportFn,
    })
    const api = getExternalApi({
      actionLogCache,
      idPrefix: 'test',
      placement: 'beacon',
    })

    api.markRenderStart('1')

    const actionLog = api.getActionLogForIdIfExists('1')
    expect(actionLog).toBeDefined()
    // no actions yet cause we didn't mark render end
    expect(actionLog?.getActions()).toHaveLength(0)
    expect(actionLog?.isCapturingData).toBe(true)

    jest.advanceTimersByTime(renderTime)

    api.markRenderEnd('1')
    // start and end render expected:
    expect(actionLog?.getActions()).toHaveLength(2)
    expect(actionLog?.getActions()).toMatchInlineSnapshot(`
      Array [
        Object {
          "entry": Object {},
          "marker": "start",
          "mountedPlacements": Array [
            "beacon",
          ],
          "source": "beacon",
          "timestamp": 0,
          "timingId": "test/1",
          "type": "render",
        },
        Object {
          "entry": Object {},
          "marker": "end",
          "mountedPlacements": Array [
            "beacon",
          ],
          "source": "beacon",
          "timestamp": 100,
          "timingId": "test/1",
          "type": "render",
        },
      ]
    `)

    // not send yet cause we're waiting for debounce
    expect(reportFn).not.toHaveBeenCalled()

    jest.advanceTimersByTime(debounceMs)
    expect(reportFn).toHaveBeenCalledTimes(1)

    jest.advanceTimersByTime(garbageCollectMs)
    api.dispose('1')
    expect(actionLogCache.get('test/1')).toBeUndefined()

    expect(onInternalError).not.toHaveBeenCalled()
  })

  it('sends the report after debounce when a final stage is specified', () => {
    const reportFn = jest.fn()
    const onInternalError = jest.fn()
    const actionLogCache = new ActionLogCache({
      garbageCollectMs,
      debounceMs,
      finalStages: ['ready'],
      reportFn,
    })
    const api = getExternalApi({
      actionLogCache,
      idPrefix: 'test',
      placement: 'beacon',
    })

    api.markRenderStart('1')

    const actionLog = api.getActionLogForIdIfExists('1')
    expect(actionLog).toBeDefined()
    // no actions yet cause we didn't mark render end
    expect(actionLog?.getActions()).toHaveLength(0)
    expect(actionLog?.isCapturingData).toBe(true)

    jest.advanceTimersByTime(renderTime)

    api.markRenderEnd('1')
    // start and end render expected:
    expect(actionLog?.getActions()).toHaveLength(2)

    api.markStage('1', 'ready')

    // not send yet cause we're waiting for debounce
    expect(reportFn).not.toHaveBeenCalled()
    expect(actionLog?.getActions()).toHaveLength(3)
    expect(actionLog?.getActions()[2]).toMatchInlineSnapshot(`
      Object {
        "entry": Object {},
        "marker": "point",
        "metadata": undefined,
        "mountedPlacements": Array [
          "beacon",
        ],
        "source": "beacon",
        "stage": "ready",
        "timestamp": 100,
        "timingId": "test/1",
        "type": "stage-change",
      }
    `)

    jest.advanceTimersByTime(debounceMs)
    expect(reportFn).toHaveBeenCalledTimes(1)
    expect(onInternalError).not.toHaveBeenCalled()
  })

  it('switches stages correctly and without duplication', () => {
    const reportFn = jest.fn()
    const onInternalError = jest.fn()
    const actionLogCache = new ActionLogCache({
      garbageCollectMs,
      debounceMs,
      finalStages: ['ready'],
      reportFn,
    })
    const api1 = getExternalApi({
      actionLogCache,
      idPrefix: 'test',
      placement: 'beacon1',
    })
    const api2 = getExternalApi({
      actionLogCache,
      idPrefix: 'test',
      placement: 'beacon2',
    })

    api1.markStage('1', 'first')
    jest.advanceTimersByTime(renderTime)
    api1.markStage('1', 'first')
    jest.advanceTimersByTime(renderTime)
    api1.markStage('1', 'second')
    jest.advanceTimersByTime(renderTime)
    api2.markStage('1', 'second')
    jest.advanceTimersByTime(renderTime)
    api2.markStage('1', 'ready')

    const actionLog = api1.getActionLogForIdIfExists('1')
    expect(actionLog).toBeDefined()
    expect(actionLog?.isCapturingData).toBe(true)

    // not send yet cause we're waiting for debounce
    expect(reportFn).not.toHaveBeenCalled()
    expect(actionLog?.getActions()).toHaveLength(3)
    expect(actionLog?.getActions()).toMatchInlineSnapshot(`
      Array [
        Object {
          "entry": Object {},
          "marker": "point",
          "metadata": undefined,
          "mountedPlacements": Array [
            "beacon1",
          ],
          "source": "beacon1",
          "stage": "first",
          "timestamp": 0,
          "timingId": "test/1",
          "type": "stage-change",
        },
        Object {
          "entry": Object {},
          "marker": "point",
          "metadata": undefined,
          "mountedPlacements": Array [
            "beacon1",
          ],
          "source": "beacon1",
          "stage": "second",
          "timestamp": 200,
          "timingId": "test/1",
          "type": "stage-change",
        },
        Object {
          "entry": Object {},
          "marker": "point",
          "metadata": undefined,
          "mountedPlacements": Array [
            "beacon1",
            "beacon2",
          ],
          "source": "beacon2",
          "stage": "ready",
          "timestamp": 400,
          "timingId": "test/1",
          "type": "stage-change",
        },
      ]
    `)

    jest.advanceTimersByTime(debounceMs)
    expect(reportFn).toHaveBeenCalledTimes(1)
    expect(onInternalError).not.toHaveBeenCalled()
  })

  it('ignores stages changed before all "waitForBeaconActivation" are active', () => {
    const reportFn = jest.fn()
    const onInternalError = jest.fn()
    const actionLogCache = new ActionLogCache({
      garbageCollectMs,
      debounceMs,
      timeoutMs,
      finalStages: ['ready'],
      waitForBeaconActivation: ['beacon2'],
      minimumExpectedSimultaneousBeacons: 2,
      reportFn,
    })
    const api1 = getExternalApi({
      actionLogCache,
      idPrefix: 'test',
      placement: 'beacon1',
    })
    const api2 = getExternalApi({
      actionLogCache,
      idPrefix: 'test',
      placement: 'beacon2',
    })

    // this will be ignored:
    api1.markStage('1', 'first')
    jest.advanceTimersByTime(renderTime)
    // this will be ignored:
    api1.markStage('1', 'second')
    jest.advanceTimersByTime(renderTime)

    const actionLog = api1.getActionLogForIdIfExists('1')
    expect(actionLog).toBeDefined()
    expect(actionLog?.isCapturingData).toBe(false)

    // this will be the first stage change:
    api2.markStage('1', 'second')
    jest.advanceTimersByTime(renderTime)
    api2.markStage('1', 'ready')

    expect(actionLog?.isCapturingData).toBe(true)

    // not send yet cause we're waiting for debounce
    expect(reportFn).not.toHaveBeenCalled()
    expect(actionLog?.getActions()).toHaveLength(2)
    expect(actionLog?.getActions()).toMatchInlineSnapshot(`
      Array [
        Object {
          "entry": Object {},
          "marker": "point",
          "metadata": undefined,
          "mountedPlacements": Array [
            "beacon1",
            "beacon2",
          ],
          "source": "beacon2",
          "stage": "second",
          "timestamp": 200,
          "timingId": "test/1",
          "type": "stage-change",
        },
        Object {
          "entry": Object {},
          "marker": "point",
          "metadata": undefined,
          "mountedPlacements": Array [
            "beacon1",
            "beacon2",
          ],
          "source": "beacon2",
          "stage": "ready",
          "timestamp": 300,
          "timingId": "test/1",
          "type": "stage-change",
        },
      ]
    `)

    jest.advanceTimersByTime(debounceMs)
    expect(reportFn).toHaveBeenCalledTimes(1)
    expect(onInternalError).not.toHaveBeenCalled()
  })

  it('does not report when minimumExpectedSimultaneousBeacons is not reached within expected time', () => {
    const reportFn = jest.fn()
    const onInternalError = jest.fn()
    const actionLogCache = new ActionLogCache({
      garbageCollectMs,
      debounceMs,
      timeoutMs,
      waitForBeaconActivation: ['beacon1'],
      minimumExpectedSimultaneousBeacons: 2,
      reportFn,
      onInternalError,
    })
    const api1 = getExternalApi({
      actionLogCache,
      idPrefix: 'test',
      placement: 'beacon1',
    })

    api1.markStage('1', 'first')
    jest.advanceTimersByTime(renderTime)
    api1.markStage('1', 'second')
    jest.advanceTimersByTime(renderTime)

    const actionLog = api1.getActionLogForIdIfExists('1')
    expect(actionLog).toBeDefined()
    expect(actionLog?.isCapturingData).toBe(true)

    // not send yet cause we're waiting for debounce
    expect(reportFn).not.toHaveBeenCalled()
    expect(actionLog?.getActions()).toHaveLength(2)

    jest.advanceTimersByTime(debounceMs)
    expect(reportFn).not.toHaveBeenCalled()
    expect(onInternalError).not.toHaveBeenCalled()

    jest.advanceTimersByTime(timeoutMs)
    expect(reportFn).not.toHaveBeenCalled()
    expect(onInternalError).not.toHaveBeenCalled()

    // recover and report after the timeout has passed:
    api1.markStage('1', 'third')
    jest.advanceTimersByTime(renderTime)
    expect(actionLog?.getActions()).toHaveLength(1)
  })

  it('timeouts when final stage is not reached within expected time', () => {
    const reportFn = jest.fn()
    const onInternalError = jest.fn()
    const actionLogCache = new ActionLogCache({
      garbageCollectMs,
      debounceMs,
      timeoutMs,
      finalStages: ['ready'],
      reportFn,
      onInternalError,
    })
    const api1 = getExternalApi({
      actionLogCache,
      idPrefix: 'test',
      placement: 'beacon1',
    })

    api1.markStage('1', 'first')
    // api1.markRenderStart('1')

    const actionLog = api1.getActionLogForIdIfExists('1')
    expect(actionLog).toBeDefined()
    expect(actionLog?.isCapturingData).toBe(true)

    jest.advanceTimersByTime(renderTime)
    expect(reportFn).not.toHaveBeenCalled()
    expect(actionLog?.getActions()).toHaveLength(1)

    jest.advanceTimersByTime(debounceMs)

    expect(reportFn).not.toHaveBeenCalled()
    expect(onInternalError).not.toHaveBeenCalled()
    expect(actionLog?.isCapturingData).toBe(true)

    jest.advanceTimersByTime(timeoutMs)
    // we stopped capturing after timeout
    expect(actionLog?.isCapturingData).toBe(false)
    // and sent out a report with the timeout
    expect(reportFn).toHaveBeenCalledTimes(1)
    expect(onInternalError).not.toHaveBeenCalled()
    expect(actionLog?.getActions()).toHaveLength(0)
    expect(generateReport(reportFn.mock.calls[0][0]).spans)
      .toMatchInlineSnapshot(`
      Array [
        Object {
          "data": Object {
            "dependencyChanges": 0,
            "metadata": Object {},
            "mountedPlacements": Array [
              "beacon1",
            ],
            "previousStage": "first",
            "source": "timeout",
            "stage": "timeout",
            "timeToStage": 45000,
            "timingId": "test/1",
          },
          "description": "first to timeout",
          "endTime": 45000,
          "relativeEndTime": 45000,
          "startTime": 0,
          "type": "stage-change",
        },
      ]
    `)

    reportFn.mockClear()

    // an entirely new marker after the timeout has passed should work too:
    api1.markStage('1', 'ready')
    expect(actionLog?.isCapturingData).toBe(true)
    expect(actionLog?.getActions()).toHaveLength(1)
    expect(actionLog?.getActions()).toMatchInlineSnapshot(`
      Array [
        Object {
          "entry": Object {},
          "marker": "point",
          "metadata": undefined,
          "mountedPlacements": Array [
            "beacon1",
          ],
          "source": "beacon1",
          "stage": "ready",
          "timestamp": 45600,
          "timingId": "test/1",
          "type": "stage-change",
        },
      ]
    `)
    jest.advanceTimersByTime(debounceMs)
    // and sent out a report with the ready state
    expect(reportFn).toHaveBeenCalledTimes(1)
  })
})
