// TODO: maybe even a HOC/wrapper instead? this way I could ensure to add a hook at beginning and at the end of the component

import { useEffect, useRef } from 'react'
import { useOnComponentUnmount } from '../ErrorBoundary'
import { VISIBLE_STATE } from './constants'
import { OperationManager } from './operation'
import type { Attributes, InputEvent, OperationDefinition } from './types'

// TODO: make a getUseCaptureRenderBeaconTask, and provide OperationManager there
export const useCaptureRenderBeaconTask = ({
  componentName,
  attributes: attr,
  error,
  visibleState = VISIBLE_STATE.COMPLETE,
  operationManager,
}: {
  componentName: string
  attributes: Record<string, unknown>
  error?: object
  /**
   * what is the state of the UX that the user sees as part of this render?
   * note that if 'error' is provided, the state will be 'error' regardless of this value
   * */
  visibleState?: string
  operationManager: OperationManager
}) => {
  const renderCountRef = useRef(0)
  const attributes: Attributes = {
    visibleState: error ? VISIBLE_STATE.ERROR : visibleState,
    renderCount: renderCountRef.current,
    ...attr,
  }
  renderCountRef.current += 1
  const renderStartTask = {
    entryType: error ? 'component-render-error' : 'component-render-start',
    name: componentName,
    startTime: operationManager.performance.now(),
    duration: 0,
    attributes,
  } satisfies InputEvent

  const nextStateObj = { visibleState, startTime: renderStartTask.startTime }
  const lastStateObjRef = useRef(nextStateObj)
  if (visibleState !== lastStateObjRef.current.visibleState) {
    const previousState = lastStateObjRef.current
    lastStateObjRef.current = nextStateObj
    operationManager.scheduleEventProcessing({
      entryType: 'component-state-change',
      name: componentName,
      startTime: previousState.startTime,
      duration: renderStartTask.startTime - previousState.startTime,
      attributes: {
        previousVisibleState: previousState.visibleState,
        ...attributes,
      },
    } satisfies InputEvent)
  }

  // this will fire when external deps have changed:
  // Note: we cannot use useEffect has we need this code to run during the render
  // const lastExternalDeps = useRef(restartWhenChanged)
  // const externalDepsHaveChanged = restartWhenChanged.some(
  //   (value, i) => value !== lastExternalDeps.current[i],
  // )
  // if (externalDepsHaveChanged) {
  //   lastExternalDeps.current = restartWhenChanged
  //   // Q: how do we best cancel stuff? maybe when the component name changes?
  //   // or maybe it's unnecessary do this since we have component-unmount events
  //   GlobalOperationManager.scheduleEventProcessing({...task, entryType: 'render-cancel'})
  // }

  // not wrapped in useEffect as this is a benchmarking effect
  // and thus must be run during the render phase, every render
  operationManager.scheduleEventProcessing(renderStartTask)

  // this will fire after every render as it does not have any dependencies:
  useEffect(() => {
    // we do not provide any dependencies to this effect
    // because we want the closure to have the matching values
    // from when the effect was created

    operationManager.scheduleEventProcessing({
      entryType: 'component-render',
      name: componentName,
      startTime: renderStartTask.startTime,
      duration: operationManager.performance.now() - renderStartTask.startTime,
      attributes,
    } satisfies InputEvent)
  })

  // capture last component unmount and error boundary errors (if any):
  useOnComponentUnmount(
    (errorBoundaryMetadata) => {
      // an unmount might be used to abort an ongoing operation capture
      operationManager.scheduleEventProcessing({
        entryType: 'component-unmount',
        name: componentName,
        startTime: operationManager.performance.now(),
        duration: 0,
        attributes,
        event: {
          ...(errorBoundaryMetadata
            ? {
                ...errorBoundaryMetadata,
              }
            : {}),
          commonName: componentName,
          status: errorBoundaryMetadata?.error ? 'error' : 'ok',
          kind: 'render',
        },
      } satisfies InputEvent)
    },
    [componentName],
  )

  // simple: capture renders and emit:
  // render start 'mark'
  // render end 'measure'
  // TODO: consider whether we want to emit actual Performance API events or just internally to central manager
}

// records until all required render beacons are settled
// (and until the page is interactive? or maybe that's the central manager's job)
export const useCaptureRenderTask = (
  operationDefinition: OperationDefinition & {
    // the operation will start once 'active' is true (or undefined)
    active?: boolean
    operationManager: OperationManager
  },
) => {
  const { active = true, operationManager, operationName } = operationDefinition

  useEffect(() => {
    if (!active) {
      return undefined
    }
    operationManager.startOperation({
      ...operationDefinition,
      autoRestart: true,
    })
    return () => {
      operationManager.cancelOperation(operationName)
    }
  }, [active])

  // starts an operation when:
  // - 'active' is true,
  // - all requiredToStart timings have been seen
  // all attributes from required tasks is merged into the operation attributes
  // the resulting task will have attributes that explains why it ended:
  // - 'interrupted' if an interruptWhenSeen task was seen
  // - 'timeout' if the timeout was reached
  // - 'error'
  // - 'interactive' if the captureInteractive timeout was reached
  // if another operation of the same name starts,
  // we need to mark the first operation as 'overwritten' or something like that
  // so then it can be filtered out when displaying an aggregate view
}
