import { lazy, Suspense, useEffect } from 'react'
import * as React from 'react'
import * as ReactDOM from 'react-dom/client'
import type { ActionLog } from './ActionLog'
import type { ActionWithStateMetadata } from './types'

let rootEl: HTMLDivElement | null = null

const DEFAULT_TIMING_ROOT_ELEMENT_ID = 'timing__root'

export interface Size {
  width: number
  height: number
}

export interface Position {
  x: number
  y: number
}

export interface VisualizerProps {
  maxRefreshRate?: number
  style?: React.CSSProperties
  targetElementId?: string
  initialPosition?: Position
  initialSize?: Size
  enabled?: boolean
}

export const getTimingDisplayModule = () =>
  import(/* @vite-ignore */ './TimingDisplay')
const LazyTimingDisplay = lazy(getTimingDisplayModule)

const observedTimings: Map<
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  ActionLog<any>,
  ActionWithStateMetadata[]
> = new Map()

export const clearObservedTimings = () => {
  observedTimings.clear()
}

let updateObservedTimings: () => void = () => {
  //
}

export const setObservedTimingsUpdater = (updater: () => void) => {
  updateObservedTimings = updater
}

export const getObservedTimings = () =>
  [...observedTimings].map(([log, actions]) => ({
    id: log.getId(),
    actions: [...actions],
    inactive: log.getActions().length === 0,
  }))

const callback =
  typeof requestIdleCallback === 'undefined' ? setTimeout : requestIdleCallback

let callbackPending: ReturnType<typeof callback> | undefined

// eslint-disable-next-line @typescript-eslint/no-explicit-any
export const onActionAddedCallback = (actionLog: ActionLog<any>) => {
  const currActions = actionLog.getActions()
  if (currActions.length > 0) {
    observedTimings.set(actionLog, currActions)
  }
  if (callbackPending) return
  callbackPending = callback(() => {
    callbackPending = undefined
    updateObservedTimings()
  })
}

export function useVisualizer({
  targetElementId = DEFAULT_TIMING_ROOT_ELEMENT_ID,
  enabled = true,
  ...props
}: VisualizerProps = {}) {
  useEffect(() => {
    if (!rootEl) {
      // eslint-disable-next-line unicorn/prefer-query-selector
      const existingElement = document.getElementById(
        targetElementId,
      ) as HTMLDivElement
      rootEl =
        existingElement ||
        Object.assign(document.createElement('div'), { id: targetElementId })
      if (!existingElement) document.body?.append(rootEl)
    }
    const root = ReactDOM.createRoot(rootEl)
    root.render(
      <Suspense fallback={null}>
        <LazyTimingDisplay {...props} enabled={enabled} />
      </Suspense>,
    )
  }, [enabled])
}
