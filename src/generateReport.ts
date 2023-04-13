/**
 * Copyright Zendesk, Inc.
 *
 * Use of this source code is governed under the Apache License, Version 2.0
 * found at http://www.apache.org/licenses/LICENSE-2.0.
 */

import {
  ACTION_TYPE,
  ERROR_STAGES,
  INFORMATIVE_STAGES,
  MARKER,
  OBSERVER_SOURCE,
} from './constants'
import type { ActionWithStateMetadata, Span, StageDescription } from './types'
import { getCurrentBrowserSupportForNonResponsiveStateDetection } from './utilities'

export type ReportFn<Metadata extends Record<string, unknown>> = (
  report: Report,
  metadata: Metadata,
  actions: ActionWithStateMetadata[],
) => void

export interface Report {
  ttr: number | null
  tti: number | null
  timeSpent: Record<string, number>
  counts: Record<string, number>
  stages: Record<string, StageDescription>
  durations: Record<string, number[]>
  id: string
  isFirstLoad: boolean
  lastStage: string
  includedStages: string[]
  hadError: boolean
  handled: boolean
  spans: Span[]
}

export function generateReport({
  actions,
  timingId,
  isFirstLoad = true,
  immediateSendStages = [],
}: {
  readonly actions: readonly ActionWithStateMetadata[]
  readonly timingId?: string
  readonly isFirstLoad?: boolean
  readonly immediateSendStages?: readonly string[]
}): Report {
  const lastStart: Record<string, number> = {}
  let lastRenderEnd: number | null = null
  const timeSpent: Record<string, number> = {}
  let startTime: number | null = null
  let endTime: number | null = null
  let lastDependencyChange: number | null = null
  let dependencyChanges = 0
  const counts: Record<string, number> = {}
  let previousStageTime: number | null = null
  let previousStage: string = INFORMATIVE_STAGES.INITIAL
  let lastStageMarkedAsDependencyChange = false
  const stageDescriptions: StageDescription[] = []
  const durations: Record<string, number[]> = {}
  const hasObserverSupport =
    getCurrentBrowserSupportForNonResponsiveStateDetection()
  const allImmediateSendStages = [
    ...immediateSendStages,
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
    const lastStageTime = previousStageTime ?? startTime
    const timeToStage = action.timestamp - lastStageTime!

    // guard for the case where the initial stage is customized by the initial render
    if (action.timestamp !== startTime) {
      includedStages.add(previousStage)

      stageDescriptions.push({
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

      spans.push({
        type: action.type,
        description: `${previousStage} to ${stage}`,
        startTime: (lastStageTime ?? 0) + performance.timeOrigin,
        endTime: action.timestamp + performance.timeOrigin,
        data: {
          mountedPlacements: action.mountedPlacements,
          timingId: action.timingId,
          source: action.source,
          metadata: action.metadata ?? {},
        },
      })
    }

    includedStages.add(stage)

    lastStageMarkedAsDependencyChange =
      action.type === ACTION_TYPE.DEPENDENCY_CHANGE
    if (!lastStageMarkedAsDependencyChange) {
      previousStage = stage
    }
    // update for next time
    previousStageTime = action.timestamp
    dependencyChanges = 0
  }

  actions.forEach((action, index) => {
    if (index === 0) {
      startTime = action.timestamp
      previousStageTime = action.timestamp
      lastDependencyChange = action.timestamp
    } else {
      endTime = action.timestamp
    }

    // eslint-disable-next-line default-case
    switch (action.marker) {
      case MARKER.START: {
        lastStart[action.source] = action.timestamp
        break
      }
      case MARKER.END: {
        if (action.source !== OBSERVER_SOURCE) lastRenderEnd = action.timestamp

        counts[action.source] = (counts[action.source] ?? 0) + 1
        const sourceDurations = durations[action.source] ?? []
        let { duration } = action.entry

        if (action.timestamp < startTime!) {
          // the special case where the observer is initialized before the first action
          duration -= startTime! - action.timestamp
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
          startTime: performance.timeOrigin + action.timestamp - duration,
          endTime: performance.timeOrigin + action.timestamp,
          data: {
            mountedPlacements: action.mountedPlacements,
            timingId: action.timingId,
            source: action.source,
            metadata: action.metadata ?? {},
          },
        })
        break
      }
      case MARKER.POINT: {
        const stage =
          action.type === ACTION_TYPE.DEPENDENCY_CHANGE
            ? INFORMATIVE_STAGES.DEPENDENCY_CHANGE
            : action.stage

        if (action.type === ACTION_TYPE.DEPENDENCY_CHANGE) {
          dependencyChanges++
          spans.push({
            type: action.type,
            description: 'dependency change',
            startTime: lastDependencyChange! + performance.timeOrigin,
            endTime: action.timestamp + performance.timeOrigin,
            data: {
              mountedPlacements: action.mountedPlacements,
              timingId: action.timingId,
              source: action.source,
              metadata: action.metadata ?? {},
            },
          })
          lastDependencyChange = action.timestamp
        } else {
          markStage({ stage, action })
        }
        break
      }
    }
  })

  if (!lastRenderEnd) lastRenderEnd = 0

  const lastTimedEvent = Math.max(lastRenderEnd, previousStageTime ?? 0)
  const isInCompleteState = Boolean(
    lastAction && lastAction.type !== ACTION_TYPE.STAGE_CHANGE,
  )

  const didImmediateSend = allImmediateSendStages.includes(previousStage)

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
    previousStageTime !== null &&
    previousStage !== INFORMATIVE_STAGES.TIMEOUT
  ) {
    const lastStageToLastRender = lastRenderEnd - previousStageTime
    const lastStageToEnd = endTime - previousStageTime

    spans.push({
      type: 'ttr',
      description: 'render',
      startTime: (startTime as unknown as number) + performance.timeOrigin,
      endTime: lastRenderEnd + performance.timeOrigin,
      data: {
        mountedPlacements: lastAction.mountedPlacements,
        timingId: lastAction.timingId,
      },
    })

    if (hasObserverSupport && isInCompleteState && !didImmediateSend) {
      stageDescriptions.push({
        previousStage,
        stage: INFORMATIVE_STAGES.RENDERED,
        mountedPlacements: lastAction.mountedPlacements,
        timingId: lastAction.timingId,
        timeToStage: lastStageToLastRender,
        previousStageTimestamp: 0,
        timestamp:
          (lastRenderEnd > 0 ? lastRenderEnd : lastAction.timestamp) -
          startTime!,
        dependencyChanges,
      })

      const lastRenderToEndTime = endTime - lastRenderEnd

      stageDescriptions.push({
        previousStage: INFORMATIVE_STAGES.RENDERED,
        stage: INFORMATIVE_STAGES.INTERACTIVE,
        mountedPlacements: lastAction.mountedPlacements,
        timingId: lastAction.timingId,
        timeToStage: lastRenderToEndTime,
        previousStageTimestamp: 0,
        timestamp: lastAction.timestamp - startTime!,
        dependencyChanges: 0,
      })

      spans.push({
        type: 'tti',
        description: 'interactive',
        startTime: (startTime as unknown as number) + performance.timeOrigin,
        endTime: (endTime as unknown as number) + performance.timeOrigin,
        data: {
          mountedPlacements: lastAction.mountedPlacements,
          timingId: lastAction.timingId,
        },
      })
    } else if (lastStageToEnd > 0) {
      stageDescriptions.push({
        previousStage,
        stage: isInCompleteState
          ? INFORMATIVE_STAGES.RENDERED
          : INFORMATIVE_STAGES.INCOMPLETE_RENDER,
        mountedPlacements: lastAction.mountedPlacements,
        timingId: lastAction.timingId,
        timeToStage: lastStageToEnd,
        previousStageTimestamp: 0,
        timestamp: lastAction.timestamp - startTime!,
        dependencyChanges,
      })
    }
  }

  const stages = Object.fromEntries(
    stageDescriptions.map((description, index) => [
      `${index}_${description.previousStage}_until_${description.stage}`,
      description,
    ]),
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
    stages,
    includedStages: [...includedStages],
    handled: isInCompleteState,
    hadError: ERROR_STAGES.includes(previousStage),
    spans,
  }
}
