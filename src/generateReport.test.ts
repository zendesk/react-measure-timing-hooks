/**
 * Copyright Zendesk, Inc.
 *
 * Use of this source code is governed under the Apache License, Version 2.0
 * found at http://www.apache.org/licenses/LICENSE-2.0.
 */

import { DEFAULT_LOADING_STAGES, DEFAULT_STAGES } from './constants'
import {
  actionsFixture,
  id,
  mountedPlacements,
} from './fixtures/actionsFixture'
import type { Report } from './generateReport'
import { generateReport } from './generateReport'

jest.mock('./utilities', () => ({
  ...jest.requireActual<typeof import('./utilities')>('./utilities'),
  getCurrentBrowserSupportForNonResponsiveStateDetection: jest.fn(() => true),
}))

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
      flushReason: 'test',
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
      loadingStagesDuration: timeIncrement,
      spans: [
        {
          type: 'render',
          description: '<beacon> (1)',
          startTime: 100,
          endTime: 200,
          relativeEndTime: 100,
          data: {
            ...data,
            source: 'beacon',
            metadata: {},
            stage: 'loading',
          },
        },
        {
          type: 'render',
          description: '<beacon> (2)',
          startTime: 200,
          endTime: 300,
          relativeEndTime: 200,
          data: {
            ...data,
            source: 'beacon',
            metadata: {},
            stage: 'ready',
          },
        },
        {
          type: 'unresponsive',
          description: 'unresponsive',
          startTime: 600,
          endTime: 900,
          relativeEndTime: 800,
          data: {
            ...data,
            source: 'observer',
            metadata: {},
            stage: 'ready',
          },
        },
        {
          type: 'stage-change',
          description: 'loading to ready',
          startTime: 100,
          endTime: 200,
          relativeEndTime: 100,
          data: {
            ...data,
            source: 'beacon',
            metadata: {},
            previousStage: 'loading',
            stage: 'ready',
            timeToStage: 100,
            dependencyChanges: 0,
          },
        },
        {
          type: 'ttr',
          description: 'render',
          startTime: 100,
          endTime: 300,
          relativeEndTime: 200,
          data: {
            ...data,
            previousStage: 'ready',
            stage: 'rendered',
            timeToStage: 100,
            dependencyChanges: 0,
          },
        },
        {
          type: 'tti',
          description: 'interactive',
          startTime: 100,
          endTime: 900,
          relativeEndTime: 800,
          data: {
            ...data,
            previousStage: 'rendered',
            stage: 'interactive',
            timeToStage: 600,
            dependencyChanges: 0,
          },
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
      immediateSendReportStages: [],
      loadingStages: DEFAULT_LOADING_STAGES,
      metadata: {},
      finalStages: [],
      flushReason: 'test',
      maximumActiveBeaconsCount: 1,
      minimumExpectedSimultaneousBeacons: 1,
      measures: {},
    })

    expect(report).toStrictEqual(expectedReport)
  })
})
