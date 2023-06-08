/**
 * Copyright Zendesk, Inc.
 *
 * Use of this source code is governed under the Apache License, Version 2.0
 * found at http://www.apache.org/licenses/LICENSE-2.0.
 */

import {
  ACTION_TYPE,
  DEFAULT_LOADING_STAGES,
  ERROR_STAGES,
  INFORMATIVE_STAGES,
  MARKER,
  OBSERVER_SOURCE,
} from './constants'
import type {
  ActionWithStateMetadata,
  ReportArguments,
  Span,
  StageDescription,
} from './types'
import { getCurrentBrowserSupportForNonResponsiveStateDetection } from './utilities'

export interface Report {
  id: string
  ttr: number | null
  /** TTI will not be present in browsers that do not support tracking long tasks */
  tti: number | null
  timeSpent: Record<string, number>
  counts: Record<string, number>
  durations: Record<string, number[]>
  isFirstLoad: boolean
  lastStage: string
  includedStages: string[]
  hadError: boolean
  handled: boolean
  spans: Span[]
  loadingStagesDuration: number
  flushReason: string
}

export function generateReport<CustomMetadata extends Record<string, unknown>>({
  actions,
  timingId,
  isFirstLoad = true,
  immediateSendReportStages = [],
  loadingStages = DEFAULT_LOADING_STAGES,
  flushReason = 'auto',
}: ReportArguments<CustomMetadata>): Report {
  const lastStart: Record<string, number> = {}
  let lastRenderEnd: number | null = null
  const timeSpent: Record<string, number> = {}
  let startTime: number | null = null
  let endTime: number | null = null
  let lastDependencyChange: number | null = null
  let dependencyChanges = 0
  const counts: Record<string, number> = {}
  let previousStageEndTime: number | null = null
  let previousStage: string = INFORMATIVE_STAGES.INITIAL
  const stageDescriptions: StageDescription[] = []
  const durations: Record<string, number[]> = {}
  const hasObserverSupport =
    getCurrentBrowserSupportForNonResponsiveStateDetection()
  const allImmediateSendReportStages = [
    ...immediateSendReportStages,
    INFORMATIVE_STAGES.TIMEOUT,
  ]
  const lastAction = [...actions].reverse()[0]
  const includedStages = new Set<string>()
  const spans: Span[] = []

  const markStage = ({
    stage,
    action,
  }: {
    stage: string
    action: ActionWithStateMetadata
  }) => {
    // guard for the case where the initial stage is customized by the initial render
    if (action.timestamp !== startTime) {
      includedStages.add(previousStage)

      const lastStageTime = previousStageEndTime ?? startTime
      const timeToStage = action.timestamp - lastStageTime!

      const lastStageDescription =
        stageDescriptions[stageDescriptions.length - 1]
      if (stage === previousStage && lastStageDescription) {
        // since we're still in the same stage (possibly set by a different source this time),
        // we just update previous stage description:
        lastStageDescription.timeToStage = timeToStage
        lastStageDescription.timestamp = action.timestamp - startTime!
        lastStageDescription.metadata = Object.assign(
          lastStageDescription.metadata ?? {},
          action.metadata,
        )
        lastStageDescription.mountedPlacements = action.mountedPlacements
        lastStageDescription.timingId = action.timingId
        lastStageDescription.dependencyChanges = dependencyChanges
      } else if (stage !== previousStage) {
        stageDescriptions.push({
          type: action.type,
          source: action.source,
          previousStage,
          stage,
          timeToStage,
          previousStageTimestamp: (lastStageTime ?? 0) - startTime!,
          timestamp: action.timestamp - startTime!,
          ...(action.metadata
            ? {
                metadata: action.metadata,
              }
            : {}),
          mountedPlacements: action.mountedPlacements,
          timingId: action.timingId,
          dependencyChanges,
        })
      }
    }

    if (stage !== previousStage) {
      // update for next time
      previousStageEndTime = action.timestamp
      dependencyChanges = 0
    }

    includedStages.add(stage)
    previousStage = stage
  }

  actions.forEach((action, index) => {
    if (index === 0) {
      startTime = action.timestamp
      previousStageEndTime = action.timestamp
      lastDependencyChange = action.timestamp
    } else {
      endTime = action.timestamp
    }

    // eslint-disable-next-line default-case
    switch (action.marker) {
      case MARKER.START: {
        // action's start time should never be before overall start time
        lastStart[action.source] = Math.max(action.timestamp, startTime ?? 0)
        break
      }
      case MARKER.END: {
        if (action.source !== OBSERVER_SOURCE) lastRenderEnd = action.timestamp

        counts[action.source] = (counts[action.source] ?? 0) + 1
        const sourceDurations = durations[action.source] ?? []
        let { duration } = action.entry
        const actionStartTime = action.timestamp - duration

        if (actionStartTime < startTime!) {
          // correct for the special case where the observer is initialized before the first action
          duration -= startTime! - actionStartTime
        }

        sourceDurations.push(duration)
        durations[action.source] = sourceDurations
        timeSpent[action.source] = (timeSpent[action.source] ?? 0) + duration

        spans.push({
          type: action.type,
          description:
            action.type === ACTION_TYPE.UNRESPONSIVE
              ? 'unresponsive'
              : `<${action.source}> (${sourceDurations.length})`,
          startTime: action.timestamp - duration,
          endTime: action.timestamp,
          relativeEndTime: action.timestamp - (startTime ?? 0),
          data: {
            mountedPlacements: action.mountedPlacements,
            timingId: action.timingId,
            source: action.source,
            metadata: action.metadata ?? {},
            stage: previousStage,
          },
        })
        break
      }
      case MARKER.POINT: {
        if (action.type === ACTION_TYPE.DEPENDENCY_CHANGE) {
          dependencyChanges++
          spans.push({
            type: action.type,
            description: 'dependency change',
            startTime: lastDependencyChange!,
            endTime: action.timestamp,
            relativeEndTime: action.timestamp - (startTime ?? 0),
            data: {
              mountedPlacements: action.mountedPlacements,
              timingId: action.timingId,
              source: action.source,
              metadata: action.metadata ?? {},
              stage: previousStage,
            },
          })
          lastDependencyChange = action.timestamp
        } else {
          markStage({ stage: action.stage, action })
        }
        break
      }
    }
  })

  if (!lastRenderEnd) lastRenderEnd = 0

  const lastTimedEvent = Math.max(lastRenderEnd, previousStageEndTime ?? 0)
  const isInCompleteState = Boolean(
    lastAction && lastAction.type !== ACTION_TYPE.STAGE_CHANGE,
  )

  const didImmediateSend = allImmediateSendReportStages.includes(previousStage)

  spans.push(
    ...stageDescriptions.map(
      ({
        type,
        previousStage: pStage,
        stage,
        previousStageTimestamp,
        timestamp,
        timeToStage,
        ...data
      }): Span => ({
        type,
        description: `${pStage} to ${stage}`,
        startTime: startTime! + previousStageTimestamp,
        endTime: startTime! + timestamp,
        relativeEndTime: timestamp,
        data: {
          stage,
          previousStage: pStage,
          timeToStage,
          mountedPlacements: data.mountedPlacements,
          timingId: data.timingId,
          source: data.source,
          metadata: data.metadata ?? {},
          dependencyChanges: data.dependencyChanges,
        },
      }),
    ),
  )

  const tti =
    startTime !== null &&
    endTime !== null &&
    hasObserverSupport &&
    isInCompleteState &&
    !didImmediateSend
      ? endTime - startTime
      : null

  const ttr =
    startTime !== null && previousStage !== INFORMATIVE_STAGES.TIMEOUT
      ? lastTimedEvent - startTime
      : null

  if (
    lastAction &&
    endTime !== null &&
    previousStageEndTime !== null &&
    previousStage !== INFORMATIVE_STAGES.TIMEOUT
  ) {
    const lastStageToLastRender = lastRenderEnd - previousStageEndTime
    const lastStageToEnd = endTime - previousStageEndTime

    spans.push({
      type: 'ttr',
      description: 'render',
      startTime: startTime as unknown as number,
      endTime: lastRenderEnd,
      relativeEndTime: lastRenderEnd - (startTime ?? 0),
      data: {
        mountedPlacements: lastAction.mountedPlacements,
        timingId: lastAction.timingId,
        stage: isInCompleteState
          ? INFORMATIVE_STAGES.RENDERED
          : INFORMATIVE_STAGES.INCOMPLETE_RENDER,
        previousStage,
        timeToStage: lastStageToLastRender,
        dependencyChanges,
      },
    })

    if (hasObserverSupport && isInCompleteState && !didImmediateSend) {
      const lastRenderToEndTime = endTime - lastRenderEnd

      spans.push({
        type: 'tti',
        description: 'interactive',
        startTime: startTime as unknown as number,
        endTime: endTime as unknown as number,
        relativeEndTime: (endTime as unknown as number) - (startTime ?? 0),
        data: {
          stage: INFORMATIVE_STAGES.INTERACTIVE,
          previousStage: INFORMATIVE_STAGES.RENDERED,
          timeToStage: lastRenderToEndTime,
          mountedPlacements: lastAction.mountedPlacements,
          timingId: lastAction.timingId,
          dependencyChanges: 0,
        },
      })
    } else if (lastStageToEnd > lastStageToLastRender) {
      const difference = lastStageToEnd - lastStageToLastRender
      spans.push({
        type: 'render',
        description: 'incomplete render',
        startTime: lastRenderEnd,
        endTime: lastRenderEnd + difference,
        relativeEndTime: lastRenderEnd + difference,
        data: {
          stage: INFORMATIVE_STAGES.INCOMPLETE_RENDER,
          previousStage: isInCompleteState
            ? INFORMATIVE_STAGES.RENDERED
            : INFORMATIVE_STAGES.INCOMPLETE_RENDER,
          timeToStage: difference,
          mountedPlacements: lastAction.mountedPlacements,
          timingId: lastAction.timingId,
          dependencyChanges: 0,
        },
      })
    }
  }

  const loadingStagesSpans = Object.values(spans).filter(
    ({ data: { previousStage: pStage } }) =>
      pStage && loadingStages.includes(pStage),
  )
  const loadingStagesDuration = loadingStagesSpans.reduce(
    (total, { data: { timeToStage = 0 } }) => total + timeToStage,
    0,
  )

  return {
    id: timingId ?? lastAction?.timingId ?? 'unknown',
    tti,
    ttr,
    isFirstLoad,
    lastStage: previousStage,
    timeSpent,
    counts,
    durations,
    includedStages: [...includedStages],
    handled: isInCompleteState,
    hadError: ERROR_STAGES.includes(previousStage),
    loadingStagesDuration,
    spans,
    flushReason,
  }
}
