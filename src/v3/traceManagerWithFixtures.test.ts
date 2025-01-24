import './testUtility/asciiTimelineSerializer'
import {
  afterEach,
  beforeEach,
  describe,
  expect,
  it,
  vitest as jest,
} from 'vitest'
import { shouldCompleteAndHaveInteractiveTime } from './testUtility/fixtures/shouldCompleteAndHaveInteractiveTime'
import { shouldNotEndWithInteractiveTimeout } from './testUtility/fixtures/shouldNotEndWithInteractiveTimeout'
import {
  type TicketIdScope,
  ticketActivationDefinition,
} from './testUtility/fixtures/ticket.activation'
import { TraceManager } from './traceManager'
import type { ReportFn } from './types'

interface TicketScope {
  ticketId: string
}

describe('TraceManager with Fixtures', () => {
  let reportFn: jest.Mock
  let generateId: jest.Mock

  jest.useFakeTimers({
    now: 0,
  })

  beforeEach(() => {
    reportFn = jest.fn<ReportFn<TicketScope, TicketScope>>()
    generateId = jest.fn().mockReturnValue('trace-id')
  })

  afterEach(() => {
    jest.clearAllMocks()
    jest.clearAllTimers()
  })

  it('should complete with interactive time without interruption', () => {
    const traceManager = new TraceManager<TicketIdScope>({
      reportFn,
      generateId,
    })
    const fixtureEntries = shouldCompleteAndHaveInteractiveTime

    const scopeEntry = fixtureEntries.find((entry) => 'scope' in entry.span)!
    const scope = {
      ticketId: scopeEntry.span.scope!.ticketId!,
    }

    const tracer = traceManager.createTracer(ticketActivationDefinition)
    tracer.start({
      scope,
      startTime: fixtureEntries[0]!.span.startTime,
      originatedFrom: 'cold_boot',
    })

    for (const entry of fixtureEntries) {
      traceManager.processSpan(entry.span)
    }

    expect(reportFn).toHaveBeenCalled()
    const {
      entries,
      ...report
    }: Parameters<ReportFn<TicketIdScope, TicketIdScope>>[0] =
      reportFn.mock.calls[0][0]

    expect(report).toMatchInlineSnapshot(`
      {
        "additionalDurations": {
          "completeTillInteractive": 0,
          "startTillInteractive": 1504.4000000059605,
          "startTillRequirementsMet": 1500.5999999940395,
        },
        "attributes": {},
        "computedRenderBeaconSpans": {
          "ConversationPane": {
            "firstRenderTillContent": 1021.7000000178814,
            "firstRenderTillData": 911.5,
            "firstRenderTillLoading": 134,
            "renderCount": 6,
            "startOffset": 482.69999998807907,
            "sumOfRenderDurations": 695,
          },
          "OmniComposer": {
            "firstRenderTillContent": 343.80000001192093,
            "firstRenderTillData": 127.80000001192093,
            "firstRenderTillLoading": 0,
            "renderCount": 8,
            "startOffset": 689.1999999880791,
            "sumOfRenderDurations": 693.400000050664,
          },
          "OmniLog": {
            "firstRenderTillContent": 1009.2999999970198,
            "firstRenderTillData": 905.8999999910593,
            "firstRenderTillLoading": 112.19999998807907,
            "renderCount": 7,
            "startOffset": 491.29999999701977,
            "sumOfRenderDurations": 580.4000000357628,
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
    expect(report.additionalDurations.startTillInteractive).toBeCloseTo(1_504.4)
  })

  it('should not end with interruption', () => {
    const traceManager = new TraceManager<TicketIdScope>({
      reportFn,
      generateId,
    })
    const fixtureEntries = shouldNotEndWithInteractiveTimeout
    const scopeEntry = fixtureEntries.find((entry) => 'scope' in entry.span)!
    const scope = {
      ticketId: scopeEntry.span.scope!.ticketId!,
    }
    const tracer = traceManager.createTracer(ticketActivationDefinition)
    tracer.start({
      scope,
      startTime: {
        ...fixtureEntries[0]!.span.startTime,
        now:
          fixtureEntries[0]!.span.startTime.now -
          fixtureEntries[0]!.annotation.operationRelativeStartTime,
      },
      originatedFrom: 'cold_boot',
    })

    for (const entry of fixtureEntries) {
      traceManager.processSpan(entry.span)
    }

    expect(reportFn).toHaveBeenCalled()
    const {
      entries,
      ...report
    }: Parameters<ReportFn<TicketIdScope, TicketIdScope>>[0] =
      reportFn.mock.calls[0][0]

    expect(report).toMatchInlineSnapshot(`
      {
        "additionalDurations": {
          "completeTillInteractive": 0,
          "startTillInteractive": 1302.3999999910593,
          "startTillRequirementsMet": 1285.6000000089407,
        },
        "attributes": {},
        "computedRenderBeaconSpans": {
          "ConversationPane": {
            "firstRenderTillContent": 831.2999999821186,
            "firstRenderTillData": 753.5,
            "firstRenderTillLoading": 138.59999999403954,
            "renderCount": 5,
            "startOffset": 459.1000000089407,
            "sumOfRenderDurations": 566.1999999582767,
          },
          "OmniComposer": {
            "firstRenderTillContent": 211.99999998509884,
            "firstRenderTillData": 97.20000000298023,
            "firstRenderTillLoading": 0,
            "renderCount": 8,
            "startOffset": 640.4000000059605,
            "sumOfRenderDurations": 516.9999999701977,
          },
          "OmniLog": {
            "firstRenderTillContent": 815.9000000059605,
            "firstRenderTillData": 746.5,
            "firstRenderTillLoading": 113.2000000178814,
            "renderCount": 9,
            "startOffset": 469.70000000298023,
            "sumOfRenderDurations": 511.80000004172325,
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
    expect(report.additionalDurations.startTillInteractive).toBeCloseTo(1_302.4)
  })
})
