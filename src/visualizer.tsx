/**
 * Copyright Zendesk, Inc.
 *
 * Use of this source code is governed under the Apache License, Version 2.0
 * found at http://www.apache.org/licenses/LICENSE-2.0.
 */

import React, { useEffect, useMemo, useState } from 'react'
import ReactDOM from 'react-dom'
import {
  ChartBar,
  ChartBarProps,
  ChartBullet,
  ChartBulletComparativeWarningMeasure,
  ChartBulletPrimarySegmentedMeasure,
  ChartBulletQualitativeRange,
  ChartThemeColor,
  getBulletTheme,
} from '@patternfly/react-charts'
import { generateReport } from './generateReport'
import { throttle } from './throttle'
import type {
  Action,
  ActionLog,
  ActionWithStateMetadata,
  DependencyChangeAction,
  RenderAction,
  StateMeta,
  UnresponsiveAction,
} from './types'

interface Point {
  readonly type: 'action' | 'idle'
  readonly y0?: number
  readonly y: number
  readonly duration: number
  readonly name: string
  readonly action?: Action
  readonly color?: string
}

const MINIMAL_BLOCK_SIZE_PERCENTAGE = 0.01

const doRound = (n: number | null | undefined) =>
  typeof n === 'number' ? Math.round(n * 1_000) / 1_000 : 0

let rootInitialized = false
let rootEl: HTMLDivElement | null = null

const observedTimings: Map<
  ActionLog<never>,
  ActionWithStateMetadata[]
> = new Map()

interface PersistedActionLog {
  id: string
  actions: ActionWithStateMetadata[]
  inactive: boolean
}

let updateObservedTimings: () => void = () => {
  //
}

export const onActionAddedCallback = (actionLog: ActionLog<never>) => {
  const currActions = actionLog.getActions()
  if (currActions.length > 0) {
    observedTimings.set(actionLog, currActions)
  }
  setTimeout(() => {
    updateObservedTimings()
  })
}

const CustomColorChartBar: React.FunctionComponent<ChartBarProps> = ({
  style,
  ...props
}) => {
  const data = props.data as Point[] | undefined
  const [point] = data ?? []
  return (
    <ChartBar
      {...props}
      style={point?.color ? { data: { fill: point.color } } : style}
    />
  )
}

// padding ensures a minimum size for the bar
const calculateBarPadding = (duration: number, totalDuration: number) =>
  (duration / totalDuration < MINIMAL_BLOCK_SIZE_PERCENTAGE
    ? MINIMAL_BLOCK_SIZE_PERCENTAGE * totalDuration - duration
    : 0) / 2

function getPoints<A extends Action>(
  actions: (A & StateMeta)[],
  startTimestamp: number,
  totalDuration: number,
  markIdle = false,
): Point[] {
  const actionSummary: {
    start: number
    duration: number
    action: A & StateMeta
  }[] = []
  let lastStart: number | undefined = startTimestamp
  actions.forEach((action) => {
    if (
      typeof lastStart === 'number' &&
      (action.marker === 'end' || action.marker === 'point')
    ) {
      actionSummary.push({
        start: lastStart - startTimestamp,
        duration: action.timestamp - lastStart,
        action,
      })
      lastStart = undefined
    }
    if (action.marker === 'start' || action.marker === 'point') {
      lastStart = action.timestamp
    }
  })
  const points = actionSummary.flatMap<Point>((val, index) => {
    // padding ensures a minimum size for the bar
    const padding = calculateBarPadding(val.duration, totalDuration)

    const action = {
      type: 'action',
      y0: val.start - padding,
      y: val.start + val.duration + padding,
      duration: val.duration,
      action: val.action,
      name: val.action.type,
    } as const
    const prevVal = actionSummary[index - 1] ?? {
      start: 0,
      duration: val.start,
    }
    const prevValEnd = prevVal.start + prevVal.duration
    const idleDuration = val.start - prevValEnd
    if (markIdle && idleDuration > 0) {
      return [
        {
          type: 'idle',
          y0: prevValEnd,
          y: val.start,
          duration: idleDuration,
          name: 'idle',
        } as const,
        action,
      ] as const
    }
    return [action] as const
  })
  return points
}

function TimingDisplay() {
  // TODO: add "clear" button to clear all persisted logs
  const [actionLogs, setActionLogs] = useState<PersistedActionLog[]>([])
  updateObservedTimings = useMemo(
    () =>
      throttle(() => {
        setActionLogs(
          [...observedTimings].map(([log, actions]) => ({
            id: log.getId(),
            actions,
            inactive: log.getActions().length === 0,
          })),
        )
      }, 1_000),
    [setActionLogs],
  )

  const theme = getBulletTheme(ChartThemeColor.multiOrdered)

  return (
    <div
      style={{
        position: 'fixed',
        right: 0,
        top: 0,
        height: '300px',
        width: '1000px',
        background: 'aliceblue',
        overflowY: 'auto',
      }}
    >
      {[...actionLogs].reverse().map((actionLog, logIndex) => {
        const { actions } = actionLog
        const report = generateReport({ actions })
        const sources = Object.keys(report.counts)
        const sourceToColor = Object.fromEntries(
          sources.map((source, index) => [
            source,
            theme.group!.colorScale![index % theme.group!.colorScale!.length],
          ]),
        )

        const firstAction = actions.at(0)
        const lastAction = actions.at(-1)
        const firstTimestamp = firstAction?.timestamp ?? 0
        const lastTimestamp = lastAction?.timestamp ?? 0
        const totalTime = lastTimestamp - firstTimestamp
        const stagePoints = Object.values(report.stages).map(
          ({ stage, previousStage, timeToStage, timestamp }) => {
            const padding = calculateBarPadding(timeToStage, totalTime)
            return {
              name: `${previousStage} → ${stage}`,
              duration: timeToStage,
              y: timestamp + padding,
              y0: timestamp - timeToStage - padding,
            }
          },
        )

        const renderActions = actions.filter(
          (action): action is RenderAction & StateMeta =>
            action.type === 'render',
        )

        const unresponsiveActions = actions.filter(
          (action): action is UnresponsiveAction & StateMeta =>
            action.type === 'unresponsive',
        )

        const unresponsivePoints = getPoints(
          unresponsiveActions,
          firstTimestamp,
          totalTime,
        )
        const renderPoints = getPoints(
          renderActions,
          firstTimestamp,
          totalTime,
        ).map((point) => ({
          ...point,
          ...(point.action
            ? {
                name: `render <${point.action.source}>`,
                color: sourceToColor[point.action.source],
              }
            : {}),
        }))

        const dependencyChanges = actions
          .filter(
            (action): action is DependencyChangeAction & StateMeta =>
              action.type === 'dependency-change',
          )
          .flatMap((action, index): Point[] => {
            const y = action.timestamp - firstTimestamp
            if (Number.isNaN(y)) {
              return []
            }
            return [
              {
                y,
                // y0: y,
                type: 'action',
                name: 'dependency-change',
                duration: 0,
                action,
              },
            ]
          })
        console.log({
          actions,
          report,
          dependencyChanges,
          renderPoints,
          unresponsivePoints,
          // stageChangesPoints,
          stagePoints,
        })
        const padding = {
          bottom: 0,
          left: 200, // Adjusted to accommodate labels
          right: 30,
          top: 0,
        }
        const mainBarHeight = 42
        return (
          <div
            // style={{ height: '120px', width: '1000px', marginLeft: 'auto' }}
            key={actionLogs.length - logIndex}
          >
            <ChartBullet
              title={`${actionLog.id}`}
              ariaTitle={`${actionLog.id}`}
              subTitle={`TTI: ${doRound(report.tti)} | TTR: ${doRound(
                report.ttr,
              )}`}
              // ariaDesc="Measure details"
              constrainToVisibleArea
              height={120}
              maxDomain={{ y: doRound(totalTime) }}
              minDomain={{ y: 0 }}
              primarySegmentedMeasureComponent={
                <ChartBulletPrimarySegmentedMeasure
                  measureComponent={<CustomColorChartBar />}
                  padding={{
                    ...padding,
                    top: padding.top + mainBarHeight / 2,
                  }}
                  // themeColor={ChartThemeColor.multiOrdered}
                />
              }
              primarySegmentedMeasureData={
                renderPoints
                // stageChangesPoints
                // [...unresponsivePoints, ...stageChangesPoints]
                // actions.map((action) => ({name: `${action.type}`, y: action.timestamp}))
                // [{ name: 'Measure', y: 60 }]
              }
              comparativeErrorMeasureData={dependencyChanges}
              // comparativeErrorMeasureData={[{ name: 'Measure', y: 1_000 }]}
              comparativeErrorMeasureComponent={
                <ChartBulletComparativeWarningMeasure />
              }
              comparativeWarningMeasureData={unresponsivePoints}
              comparativeWarningMeasureComponent={
                // <ChartBulletComparativeWarningMeasure />
                <ChartBulletPrimarySegmentedMeasure
                  themeColor={ChartThemeColor.gold}
                  barWidth={10}
                  padding={{
                    ...padding,
                    top: padding.top - mainBarHeight / 2,
                    // top:
                    //   getPaddingForSide('top', {}, theme.chart?.padding ?? {}) -
                    //   40,
                    // bottom: getPaddingForSide(
                    //   'bottom',
                    //   {},
                    //   theme.chart?.padding ?? {},
                    // ),
                    // left: getPaddingForSide(
                    //   'left',
                    //   {},
                    //   theme.chart?.padding ?? {},
                    // ),
                    // right: getPaddingForSide(
                    //   'right',
                    //   {},
                    //   theme.chart?.padding ?? {},
                    // ),
                  }}
                />
              }
              // primaryDotMeasureData={stageChanges}
              // primaryDotMeasureData={unresponsivePoints}
              // primaryDotMeasureLegendData={[{ name: 'Measure 1' }, { name: 'Measure 2' }]}
              qualitativeRangeData={
                stagePoints
                // renderPoints
              }
              qualitativeRangeComponent={
                <ChartBulletQualitativeRange
                  // measureComponent={<WrapperChartBar />}
                  themeColor={ChartThemeColor.cyan}
                />
              }
              // themeColor={ChartThemeColor.multiOrdered}
              labels={({ datum }: { datum: Point }) =>
                'duration' in datum
                  ? `${datum.name}: ${doRound(datum.duration)}ms`
                  : datum.name
              }
              // themeColor={ChartThemeColor.default}
              width={1_000}
              padding={padding}
            />
          </div>
        )
      })}
    </div>
  )
}

export function useVisualizer() {
  useEffect(() => {
    if (!rootInitialized) {
      if (!rootEl) {
        rootEl =
          // eslint-disable-next-line unicorn/prefer-query-selector
          (document.getElementById('timing__root') as HTMLDivElement) ||
          Object.assign(document.createElement('div'), { id: 'timing__root' })
        if (document.body) {
          document.body.append(rootEl)
          ReactDOM.render(<TimingDisplay />, rootEl)
        }
      }
      rootInitialized = true
    }
  }, [])
}
