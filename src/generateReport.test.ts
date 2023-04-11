/**
 * Copyright Zendesk, Inc.
 *
 * Use of this source code is governed under the Apache License, Version 2.0
 * found at http://www.apache.org/licenses/LICENSE-2.0.
 */

import { DEFAULT_STAGES, INFORMATIVE_STAGES } from './constants'
import type { Report } from './generateReport'
import { generateReport } from './generateReport'
import type { ActionWithStateMetadata } from './types'

jest.mock('./utilities', () => ({
  ...jest.requireActual<typeof import('./utilities')>('./utilities'),
  getCurrentBrowserSupportForNonResponsiveStateDetection: jest.fn(() => true),
}))

const id = 'test'
const mountedPlacements = ['beacon']

const actionsFixture: ActionWithStateMetadata[] = [
  {
    type: 'stage-change',
    marker: 'point',
    timestamp: 100,
    stage: 'loading',
    source: 'beacon',
    mountedPlacements,
    timingId: id,
    entry: {
      duration: 100,
      startTime: 0,
      entryType: 'mark',
      name: id,
      toJSON: () => ({}),
    },
  } as const,
  {
    type: 'render',
    source: 'beacon',
    marker: 'start',
    timestamp: 100,
    mountedPlacements,
    timingId: id,
    entry: {
      duration: 0,
      startTime: 0,
      entryType: 'mark',
      name: id,
      toJSON: () => ({}),
    },
  } as const,
  {
    type: 'render',
    source: 'beacon',
    marker: 'end',
    timestamp: 200,
    mountedPlacements,
    timingId: id,
    entry: {
      duration: 100,
      startTime: 100,
      entryType: 'mark',
      name: id,
      toJSON: () => ({}),
    },
  } as const,
  {
    type: 'stage-change',
    marker: 'point',
    timestamp: 200,
    stage: 'ready',
    source: 'beacon',
    mountedPlacements,
    timingId: id,
    entry: {
      duration: 100,
      startTime: 100,
      entryType: 'mark',
      name: id,
      toJSON: () => ({}),
    },
  } as const,
  {
    type: 'render',
    source: 'beacon',
    marker: 'start',
    timestamp: 200,
    mountedPlacements,
    timingId: id,
    entry: {
      duration: 0,
      startTime: 200,
      entryType: 'mark',
      name: id,
      toJSON: () => ({}),
    },
  } as const,
  {
    type: 'render',
    source: 'beacon',
    marker: 'end',
    timestamp: 300,
    mountedPlacements,
    timingId: id,
    entry: {
      duration: 100,
      startTime: 200,
      entryType: 'mark',
      name: id,
      toJSON: () => ({}),
    },
  } as const,
  {
    type: 'unresponsive',
    source: 'observer',
    marker: 'start',
    timestamp: 400,
    mountedPlacements,
    timingId: id,
    entry: {
      duration: 0,
      startTime: 300,
      entryType: 'mark',
      name: id,
      toJSON: () => ({}),
    },
  } as const,
  {
    type: 'unresponsive',
    source: 'observer',
    marker: 'end',
    timestamp: 900,
    mountedPlacements,
    timingId: id,
    entry: {
      duration: 300,
      startTime: 600,
      entryType: 'mark',
      name: id,
      toJSON: () => ({}),
    },
  } as const,
]

describe('generateReport', () => {
  const originalTimeOrigin = performance.timeOrigin
  beforeEach(() => {
    Object.defineProperty(performance, 'timeOrigin', {
      configurable: true,
      enumerable: true,
      get() {
        return 0
      },
    })
  })
  afterEach(() => {
    Object.defineProperty(performance, 'timeOrigin', {
      configurable: true,
      enumerable: true,
      get() {
        return originalTimeOrigin
      },
    })
  })

  it('correctly generates a report', () => {
    const expectedBeaconRenderCount = 2
    const timeIncrement = 100
    const isFirstLoad = true
    const ttr = timeIncrement * expectedBeaconRenderCount
    const noLagDuration = 200
    const lagDuration = 300
    const tti = ttr + timeIncrement + noLagDuration + lagDuration
    const data = { mountedPlacements, timingId: 'test' }
    const expectedReport: Report = {
      id,
      isFirstLoad,
      tti,
      ttr,
      lastStage: DEFAULT_STAGES.READY,
      counts: {
        beacon: expectedBeaconRenderCount,
        observer: 1,
      },
      durations: {
        beacon: [timeIncrement, timeIncrement],
        observer: [lagDuration],
      },
      timeSpent: {
        beacon: ttr,
        observer: lagDuration,
      },
      stages: {
        [`0_${DEFAULT_STAGES.LOADING}_until_${DEFAULT_STAGES.READY}`]: {
          previousStageTimestamp: 0,
          timeToStage: timeIncrement,
          previousStage: DEFAULT_STAGES.LOADING,
          stage: DEFAULT_STAGES.READY,
          timingId: id,
          mountedPlacements,
          timestamp: timeIncrement,
        },
        [`1_${DEFAULT_STAGES.READY}_until_${INFORMATIVE_STAGES.RENDERED}`]: {
          previousStageTimestamp: 0,
          timeToStage: timeIncrement,
          previousStage: DEFAULT_STAGES.READY,
          stage: INFORMATIVE_STAGES.RENDERED,
          timingId: id,
          mountedPlacements,
          timestamp: timeIncrement * 2,
        },
        [`2_${INFORMATIVE_STAGES.RENDERED}_until_${INFORMATIVE_STAGES.INTERACTIVE}`]:
          {
            previousStageTimestamp: 0,
            timeToStage: timeIncrement + noLagDuration + lagDuration,
            previousStage: INFORMATIVE_STAGES.RENDERED,
            stage: INFORMATIVE_STAGES.INTERACTIVE,
            timingId: id,
            mountedPlacements,
            timestamp: timeIncrement * 3 + noLagDuration + lagDuration,
          },
      },
      spans: [
        {
          type: 'render',
          description: '<beacon> (1)',
          startTime: 100,
          endTime: 200,
          data: {
            ...data,
            source: 'beacon',
            metadata: {},
          },
        },
        {
          type: 'stage-change',
          description: 'loading to ready',
          startTime: 100,
          endTime: 200,
          data: {
            ...data,
            source: 'beacon',
            metadata: {},
          },
        },
        {
          type: 'render',
          description: '<beacon> (2)',
          startTime: 200,
          endTime: 300,
          data: {
            ...data,
            source: 'beacon',
            metadata: {},
          },
        },
        {
          type: 'unresponsive',
          description: 'unresponsive',
          startTime: 600,
          endTime: 900,
          data: {
            ...data,
            source: 'observer',
            metadata: {},
          },
        },
        {
          type: 'ttr',
          description: 'render',
          startTime: 100,
          endTime: 300,
          data,
        },
        {
          type: 'tti',
          description: 'interactive',
          startTime: 100,
          endTime: 900,
          data,
        },
      ],
      includedStages: [DEFAULT_STAGES.LOADING, DEFAULT_STAGES.READY],
      hadError: false,
      handled: true,
    }

    const report = generateReport({
      actions: actionsFixture,
      timingId: id,
      isFirstLoad,
      immediateSendStages: [],
    })

    expect(report).toStrictEqual(expectedReport)
  })
})
