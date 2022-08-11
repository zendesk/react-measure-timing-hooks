/* eslint-disable no-magic-numbers */
/**
 * Copyright Zendesk, Inc.
 *
 * Use of this source code is governed under the Apache License, Version 2.0
 * found at http://www.apache.org/licenses/LICENSE-2.0.
 */

import React, { useCallback, useEffect, useMemo, useState } from 'react'
import ReactDOM from 'react-dom'
import {
  ChartBar,
  ChartBarProps,
  ChartBullet,
  ChartBulletComparativeWarningMeasure,
  ChartBulletPrimarySegmentedMeasure,
  ChartBulletPrimarySegmentedMeasureProps,
  ChartBulletQualitativeRange,
  ChartThemeColor,
  getBulletTheme,
  getPaddingForSide,
} from '@patternfly/react-charts'
import type { Story } from '@storybook/react'
import { generateReport, ReportFn } from '../generateReport'
import {
  Action,
  ActionLog,
  ActionWithStateMetadata,
  DEFAULT_STAGES,
  DependencyChangeAction,
  generateTimingHooks,
  RenderAction,
  SpanAction,
  StageChangeAction,
  StateMeta,
  UnresponsiveAction,
} from '../main'
import { throttle } from '../throttle'

const { useStoryTimingInA } = generateTimingHooks(
  {
    idPrefix: 'story',
    name: 'Story',
  },
  'A',
)

interface IArgs {
  text: string
  content: 'immediately' | 'takes-a-while'
  dependency: 'one' | 'two'
  mounted: boolean
  isActive: boolean
  reportFn: ReportFn<Record<string, unknown>>
  log: (...args: any[]) => void
  onActionAddedCallback: (actionLog: ActionLog<never>) => void
}

const Hook = ({
  content,
  reportFn,
  isActive,
  onActionAddedCallback,
}: Omit<IArgs, 'mounted'>) => {
  useStoryTimingInA({
    idSuffix: content,
    isActive,
    reportFn,
    onActionAddedCallback,
  })

  return <div>Rendering immediately</div>
}

const TakesAWhile = ({
  content,
  reportFn,
  isActive,
  dependency,
  onActionAddedCallback,
}: Omit<IArgs, 'mounted'>) => {
  const [progress, setProgress] = useState(0)
  const [stage, setStage] = useState('initial')

  useStoryTimingInA(
    {
      idSuffix: content,
      isActive,
      reportFn,
      onActionAddedCallback,
      shouldResetOnDependencyChangeFn: () => false,
      stage,
    },
    [dependency],
  )

  useEffect(() => {
    if (progress >= 100) {
      setStage(DEFAULT_STAGES.READY)
      return
    }
    setTimeout(() => {
      setStage(DEFAULT_STAGES.LOADING)
      setProgress((prev) => prev + 10)
    }, 300)
  }, [progress])

  return <div>Simulating something that loads for a while... {progress}%</div>
}

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

const WrapperChartBar: React.FunctionComponent<ChartBarProps> = (props) => (
  // console.log('props', props)
  // return <ChartBar {...props} />
  <ChartBar
    {...props}
    // data={props.data?.map((data) =>
    //   data.type === 'idle' ? { ...data, _color: 'white' } : data,
    // )}
    style={
      props.data[0]?.type === 'idle' ? { data: { fill: 'white' } } : props.style
    }
  />
)

function getPoints<A extends Action>(
  actions: (A & StateMeta)[],
  startTimestamp: number,
  totalDuration: number,
  markIdle = false,
) {
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
  const points = actionSummary.flatMap((val, index) => {
    // padding ensures a minimum size for the bar
    const padding =
      (val.duration / totalDuration < 0.01
        ? 0.01 * totalDuration - val.duration
        : 0) / 2

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
const doRound = (n: number) => Math.round(n * 1_000) / 1_000

function TimingDisplay() {
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
        const firstAction = actions.at(0)
        const lastAction = actions.at(-1)
        const firstTimestamp = firstAction?.timestamp ?? 0
        const lastTimestamp = lastAction?.timestamp ?? 0
        const totalTime = lastTimestamp - firstTimestamp
        const stagePoints = Object.values(report.stages).map(
          ({ stage, previousStage, timeToStage, timestamp }) => ({
            name: `${previousStage} → ${stage}`,
            duration: timeToStage,
            y: timestamp,
            y0: timestamp - timeToStage,
          }),
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
        const renderPoints = getPoints(renderActions, firstTimestamp, totalTime)

        // const stageChanges = actions.filter(
        //   (action): action is StageChangeAction & StateMeta =>
        //     action.type === 'stage-change',
        // )
        // const stageChangesPoints = getPoints(
        //   stageChanges,
        //   firstTimestamp,
        //   totalTime,
        //   true,
        // ).map((point, index, points) => ({
        //   ...point,
        //   name: 'action' in point ? point.action.stage : 'initial',
        // }))
        // .map((action, index) => {
        //   const y = action.timestamp - firstTimestamp
        //   return [
        //     {
        //       y,
        //       type: 'stage-change',
        //       name: action.stage,
        //     },
        //   ]
        // })
        const theme = getBulletTheme(ChartThemeColor.default)
        const dependencyChanges = actions
          .filter(
            (action): action is DependencyChangeAction & StateMeta =>
              action.type === 'dependency-change',
          )
          .flatMap((action, index) => {
            const y = action.timestamp - firstTimestamp
            if (Number.isNaN(y)) {
              console.log('action wtf', action)
              return []
            }
            return [
              {
                y,
                // y0: y,
                type: 'dependency-change',
                name: 'dependency-change',
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
        return (
          <div
            style={{ height: '120px', width: '1000px', marginLeft: 'auto' }}
            key={actionLogs.length - logIndex}
          >
            <ChartBullet
              title={`${actionLog.id}`}
              ariaTitle={`${actionLog.id}`}
              // subTitle="Measure details"
              // ariaDesc="Measure details"
              constrainToVisibleArea
              height={120}
              maxDomain={{ y: doRound(totalTime) }}
              minDomain={{ y: 0 }}
              primarySegmentedMeasureComponent={
                <ChartBulletPrimarySegmentedMeasure
                  measureComponent={<WrapperChartBar />}
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
                    top:
                      getPaddingForSide('top', {}, theme.chart?.padding ?? {}) -
                      40,
                    bottom: getPaddingForSide(
                      'bottom',
                      {},
                      theme.chart?.padding ?? {},
                    ),
                    left: getPaddingForSide(
                      'left',
                      {},
                      theme.chart?.padding ?? {},
                    ),
                    right: getPaddingForSide(
                      'right',
                      {},
                      theme.chart?.padding ?? {},
                    ),
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
              // qualitativeRangeComponent={
              //   <ChartBulletQualitativeRange
              //     measureComponent={<WrapperChartBar />}
              //   />
              // }
              labels={({ datum }) =>
                'duration' in datum
                  ? `${datum.name}: ${doRound(datum.duration)}ms`
                  : datum.name
              }
              // themeColor={ChartThemeColor.default}
              width={600}
            />
          </div>
        )
      })}
    </div>
  )
}

function useRenderRoot() {
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

export const MeasureTimingStory: Story<IArgs> = ({
  mounted,
  ...props
}: Omit<IArgs, 'onActionAddedCallback'>) => {
  const { content, log: doLog } = props

  useRenderRoot()

  // const setActionLogsThrottled = useCallback(throttle(setActionLogs, 100), [
  //   setActionLogs,
  // ])

  const onActionAddedCallback = (actionLog: ActionLog<never>) => {
    const currActions = actionLog.getActions()
    if (currActions.length > 0) {
      observedTimings.set(actionLog, currActions)
    }
    setTimeout(() => {
      updateObservedTimings()
    })
    // doLog('run')
  }
  const renderProps = { ...props, onActionAddedCallback }
  const render =
    content === 'immediately' ? (
      <Hook {...renderProps} />
    ) : (
      <TakesAWhile {...renderProps} />
    )

  return (
    <>{mounted ? render : <div>Nothing to show, element unmounted.</div>}</>
  )
}
