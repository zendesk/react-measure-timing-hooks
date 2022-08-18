/* eslint-disable no-magic-numbers */
/**
 * Copyright Zendesk, Inc.
 *
 * Use of this source code is governed under the Apache License, Version 2.0
 * found at http://www.apache.org/licenses/LICENSE-2.0.
 */

import { useEffect, useState } from 'react'
import * as React from 'react'
import type { Story } from '@storybook/react'
import type { ReportFn } from '../generateReport'
import { onActionAddedCallback, useVisualizer } from '../lazyVisualizer'
import { DEFAULT_STAGES, generateTimingHooks } from '../main'

const { useStoryTimingInA, useStoryTimingInB } = generateTimingHooks(
  {
    idPrefix: 'story',
    name: 'Story',
    onActionAddedCallback,
    minimumExpectedSimultaneousBeacons: 1,
  },
  'A',
  'B',
)

interface IArgs {
  text: string
  content: 'immediately' | 'takes-a-while'
  dependency: 'one' | 'two'
  mounted: boolean
  isActive: boolean
  reportFn: ReportFn<Record<string, unknown>>
  log: (...args: any[]) => void
  visualizer: boolean
}

const RenderImmediately = ({
  content,
  reportFn,
  isActive,
}: Omit<IArgs, 'mounted'>) => {
  useStoryTimingInA({
    idSuffix: content,
    isActive,
    reportFn,
  })

  return <div>Rendering immediately</div>
}

const TakesAWhileB = ({
  setStage,
}: {
  setStage: React.Dispatch<React.SetStateAction<string>>
}) => {
  const [progress, setProgress] = useState(0)

  useStoryTimingInB({
    idSuffix: 'takes-a-while',
  })

  useEffect(() => {
    if (progress >= 100) {
      setStage(DEFAULT_STAGES.READY)
      return
    }
    setTimeout(() => {
      setProgress((prev) => prev + 25)
    }, 200)
  }, [progress])

  return <div>Something else that loads for a while... {progress}%</div>
}

const TakesAWhile = ({
  reportFn,
  isActive,
  dependency,
}: Omit<IArgs, 'mounted'>) => {
  const [progress, setProgress] = useState(0)
  const [stage, setStage] = useState('initial')

  useStoryTimingInA(
    {
      idSuffix: 'takes-a-while',
      isActive,
      reportFn,
      shouldResetOnDependencyChangeFn: () => false,
      stage,
    },
    [dependency],
  )

  useEffect(() => {
    if (progress >= 100) {
      return
    }
    setTimeout(() => {
      setStage(DEFAULT_STAGES.LOADING)
      setProgress((prev) => prev + 10)
    }, 300)
  }, [progress])

  return (
    <>
      <div>Simulating something that loads for a while... {progress}%</div>
      {progress > 80 && <TakesAWhileB setStage={setStage} />}
    </>
  )
}

export const MeasureTimingStory: Story<IArgs> = ({
  mounted,
  ...props
}: IArgs) => {
  const { content, visualizer } = props

  useVisualizer({ enabled: visualizer })

  const renderProps = { ...props }
  const render =
    content === 'immediately' ? (
      <RenderImmediately {...renderProps} />
    ) : (
      <TakesAWhile {...renderProps} />
    )

  return (
    <>{mounted ? render : <div>Nothing to show, element unmounted.</div>}</>
  )
}
