import React, { Suspense, useEffect } from 'react'
import ReactDOM from 'react-dom'
import type { ActionLog } from './ActionLog'
import type { ActionWithStateMetadata } from './types'

let rootInitialized = false
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

const LazyTimingDisplay = React.lazy(() => import('./TimingDisplay'))

const observedTimings: Map<
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  ActionLog<any>,
  ActionWithStateMetadata[]
> = new Map()

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

// eslint-disable-next-line @typescript-eslint/no-explicit-any
export const onActionAddedCallback = (actionLog: ActionLog<any>) => {
  const currActions = actionLog.getActions()
  if (currActions.length > 0) {
    observedTimings.set(actionLog, currActions)
  }
  setTimeout(() => {
    updateObservedTimings()
  })
}

export function useVisualizer({
  targetElementId = DEFAULT_TIMING_ROOT_ELEMENT_ID,
  ...props
}: VisualizerProps = {}) {
  useEffect(() => {
    if (!rootInitialized) {
      rootInitialized = true
      if (!rootEl) {
        rootEl =
          // eslint-disable-next-line unicorn/prefer-query-selector
          (document.getElementById(targetElementId) as HTMLDivElement) ||
          Object.assign(document.createElement('div'), { id: targetElementId })
      }
      if (document.body) {
        document.body.append(rootEl)
        ReactDOM.render(
          <Suspense fallback={null}>
            <LazyTimingDisplay {...props} />
          </Suspense>,
          rootEl,
        )
      }
    }
  }, [])
}
