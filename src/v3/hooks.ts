import { useEffect, useRef } from 'react'
import { useOnComponentUnmount } from '../ErrorBoundary'
import { ensureTimestamp } from './ensureTimestamp'
import type { TraceManager } from './traceManager'
import type {
  BeaconConfig,
  ComponentRenderSpan,
  GetScopeTFromTraceManager,
  ScopeBase,
  Timestamp,
  UseBeacon,
} from './types'

type MakeEntryInput<ScopeT extends ScopeBase> = Omit<
  ComponentRenderSpan<ScopeT>,
  'startTime'
> & { startTime?: Timestamp }

const makeEntry = <ScopeT extends ScopeBase>(
  inp: MakeEntryInput<ScopeT>,
): ComponentRenderSpan<ScopeT> => ({
  ...inp,
  startTime: ensureTimestamp(inp.startTime),
})

/**
 * The job of the beacon:
 * emit component-render-start, component-render, component-unmount entries
 */
export const generateUseBeacon =
  <ScopeT extends ScopeBase>(
    traceManager: TraceManager<ScopeT>,
  ): UseBeacon<ScopeT> =>
    (config: BeaconConfig<GetScopeTFromTraceManager<TraceManager<ScopeT>>>) => {
      const renderCountRef = useRef(0)
      renderCountRef.current += 1

      // TODO: do we need to keep the render count in attributes or does this just become `occurrence` later? How did this work in the previous implementation
      const attributes = {
        ...config.attributes,
        renderCount: renderCountRef.current,
      }

      const status = config.error ? 'error' : 'ok'

      const renderStartTaskEntry: ComponentRenderSpan<ScopeT> = makeEntry({
        ...config,
        type: 'component-render-start',
        duration: 0,
        attributes,
        status,
      })

      traceManager.processSpan(renderStartTaskEntry)

      // Beacon effect for tracking 'component-render'. This will fire after every render as it does not have any dependencies:
      useEffect(() => {
        traceManager.processSpan(
          makeEntry({
            ...config,
            type: 'component-render',
            // TODO: the previous implementation had `operationManager.performance.now()`. Was this different?
            duration: performance.now() - renderStartTaskEntry.startTime.now,
            status,
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
          traceManager.processSpan(unmountEntry)
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
