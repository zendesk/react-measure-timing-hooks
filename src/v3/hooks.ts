import { useEffect, useRef } from 'react'
import { useOnComponentUnmount } from '../ErrorBoundary'
import type {
  BeaconConfig,
  ComponentRenderEntryInput,
  GetScopeTFromTraceManager,
  ITraceManager,
  ScopeBase,
  UseBeacon,
} from './types'

type MakeEntryInput<ScopeT extends ScopeBase> = Omit<
  ComponentRenderEntryInput<ScopeT>,
  'startTime'
>
const makeEntry = <ScopeT extends ScopeBase>(
  inp: MakeEntryInput<ScopeT>,
): ComponentRenderEntryInput<ScopeT> => ({
  ...inp,
  startTime: {
    epoch: Date.now(),
    now: performance.now(),
  },
})
/*
  The job of the beacon:
  * emit component-render-start, component-render, component-unmount entries
  *
*/

export const generateUseBeacon =
  <T extends ScopeBase>(traceManager: ITraceManager<T>): UseBeacon<T> =>
  (config: BeaconConfig<GetScopeTFromTraceManager<ITraceManager<T>>>) => {
    const renderCountRef = useRef(0)
    renderCountRef.current += 1

    // TODO: do we need to keep the render count in attributes or does this just become `occurrence` later? How did this work in the previous implementation
    const attributes = {
      ...config.attributes,
      renderCount: renderCountRef.current,
    }

    const renderStartTask: ComponentRenderEntryInput<T> = makeEntry({
      ...config,
      type: 'component-render-start',
      duration: 0,
      attributes,
      status: 'ok', // TODO: how are we determining error here? We probably need to have an error prop
    })

    traceManager.processEntry(renderStartTask)

    // Beacon effect for tracking 'component-render'. This will fire after every render as it does not have any dependencies:
    useEffect(() => {
      traceManager.processEntry(
        makeEntry({
          ...config,
          type: 'component-render',
          // TODO: the previous implemntation had `operationManager.performance.now()`. Was this different?
          duration: performance.now() - renderStartTask.startTime.now,
          status: 'ok',
          attributes,
        }),
      )
    })

    // Beacon effect for tracking 'component-unmount' entries
    useOnComponentUnmount(
      (errorBoundaryMetadata) => {
        const unmountEntry = makeEntry({
          ...config,
          type: 'component-unmount',
          attributes,
          error: errorBoundaryMetadata?.error,
          errorInfo: errorBoundaryMetadata?.errorInfo,
          duration: 0, // TODO: is 0 duration correct?
          status: errorBoundaryMetadata?.error ? 'error' : 'ok',
        })
        traceManager.processEntry(unmountEntry)
      },
      [config.name],
    )
  }

// Just for example and type checking
// const tracingManager = new TraceManager({
//   reportFn: () => {},
//   embeddedEntryTypes: [],
// })
// const tracingBeacon = generateUseBeacon(tracingManager)
