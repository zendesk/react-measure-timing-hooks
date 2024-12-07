import { useEffect, useRef } from 'react'
import { useOnComponentUnmount } from '../ErrorBoundary'
import { ensureTimestamp } from './ensureTimestamp'
import type {
  BeaconConfig,
  GetScopeTFromTraceManager,
  UseBeacon,
} from './hooksTypes'
import type { ComponentRenderSpan } from './spanTypes'
import type { TraceManager } from './traceManager'
import type { ScopeBase, Timestamp } from './types'

type MakeEntryInput<ScopeT extends Partial<ScopeBase<ScopeT>>> = Omit<
  ComponentRenderSpan<ScopeT>,
  'startTime'
> & { startTime?: Timestamp }

const makeEntry = <ScopeT extends Partial<ScopeBase<ScopeT>>>(
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
  <ScopeT extends Partial<ScopeBase<ScopeT>>>(
    traceManager: TraceManager<ScopeT>,
  ): UseBeacon<ScopeT> =>
  (config: BeaconConfig<GetScopeTFromTraceManager<TraceManager<ScopeT>>>) => {
    const renderCountRef = useRef(0)
    renderCountRef.current += 1

    const { attributes, renderedOutput } = config

    const status = config.error ? 'error' : 'ok'

    // TODO: should isIdle also be true when renderedOutput === 'null'?
    // I'm leaning towards no, but it could be either:
    // either it doesn't make sense to render anything
    // or we don't have the necessary data to render yet
    const isIdle =
      config.isIdle ??
      (renderedOutput === 'content' || renderedOutput === 'error')

    const renderStartTaskEntry: ComponentRenderSpan<ScopeT> = makeEntry({
      ...config,
      type: 'component-render-start',
      duration: 0,
      attributes,
      status,
      renderCount: renderCountRef.current,
      isIdle,
    })

    traceManager.processSpan(renderStartTaskEntry)

    // Beacon effect for tracking 'component-render'. This will fire after every render as it does not have any dependencies:
    useEffect(() => {
      traceManager.processSpan(
        makeEntry({
          ...config,
          type: 'component-render',
          duration: performance.now() - renderStartTaskEntry.startTime.now,
          status,
          attributes,
          renderCount: renderCountRef.current,
          isIdle,
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
          duration: 0,
          status: errorBoundaryMetadata?.error ? 'error' : 'ok',
          renderCount: renderCountRef.current,
          isIdle,
        })
        traceManager.processSpan(unmountEntry)
      },
      [config.name],
    )
  }
