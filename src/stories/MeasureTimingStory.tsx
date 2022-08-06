/* eslint-disable no-magic-numbers */
/**
 * Copyright Zendesk, Inc.
 *
 * Use of this source code is governed under the Apache License, Version 2.0
 * found at http://www.apache.org/licenses/LICENSE-2.0.
 */

import React, { useCallback, useEffect, useMemo, useState } from 'react'
import ReactDOM from 'react-dom'
import { ChartBullet, ChartThemeColor } from '@patternfly/react-charts'
import type { Story } from '@storybook/react'
import type { ReportFn } from '../generateReport'
import {
  ActionLog,
  ActionWithStateMetadata,
  generateTimingHooks,
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
  onActionAddedCallback,
}: Omit<IArgs, 'mounted'>) => {
  useStoryTimingInA({
    idSuffix: content,
    isActive,
    reportFn,
    onActionAddedCallback,
  })

  const [progress, setProgress] = useState(0)

  useEffect(() => {
    if (progress >= 100) return
    setTimeout(() => {
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
      {[...actionLogs].reverse().map((actionLog, index) => {
        const { actions } = actionLog
        const firstAction = actions.at(0)
        const lastAction = actions.at(-1)
        const lastTimestamp = lastAction?.timestamp
        const totalTime = lastTimestamp
          ? lastTimestamp - (firstAction?.timestamp ?? lastTimestamp)
          : 0
        return (
          <div
            style={{ height: '120px', width: '1000px', marginLeft: 'auto' }}
            key={actionLogs.length - index}
          >
            <ChartBullet
              title={`${actionLog.id}`}
              ariaTitle={`${actionLog.id}`}
              // subTitle="Measure details"
              // ariaDesc="Measure details"
              constrainToVisibleArea
              height={120}
              maxDomain={{ y: Math.round(totalTime) }}
              minDomain={{ y: 0 }}
              // maxDomain={{ y: Math.round(lastAction?.timestamp ?? 1_000) }}
              // minDomain={{ y: Math.round(firstAction?.timestamp ?? 0) }}
              // primarySegmentedMeasureData={
              //   actions.map((action) => ({name: `${action.type}`, y: action.timestamp}))
              //   // [{ name: 'Measure', y: 60 }]
              // }
              // comparativeWarningMeasureData={[{ name: 'Warning', y: 88 }]}
              // primaryDotMeasureData={[
              //   { name: 'Measure', y: 25 },
              //   { name: 'Measure', y: 60 },
              // ]}
              // primaryDotMeasureLegendData={[{ name: 'Measure 1' }, { name: 'Measure 2' }]}
              qualitativeRangeData={
                actions.map((action, index) => ({
                  name: `${action.type}`,
                  y: action.timestamp - (firstAction?.timestamp ?? 0),
                  // TODO: actually, we should find last of the same TYPE, not just previous action
                  duration:
                    action.timestamp -
                    (actions[index - 1]?.timestamp ?? action.timestamp),
                }))
                // [
                //   { name: 'Range', y: 50 },
                //   { name: 'Range', y: 75 },
                // ]
              }
              labels={({ datum }) => `${datum.name}: ${datum.duration}ms`}
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
    updateObservedTimings()
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
