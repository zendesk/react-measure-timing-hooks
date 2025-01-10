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
import type { ScopeValue, Timestamp } from './types'

type MakeEntryInput<AllPossibleScopesT> = Omit<
  ComponentRenderSpan<AllPossibleScopesT>,
  'startTime' | 'team'
> & {
  startTime?: Timestamp
}

const makeEntry = <AllPossibleScopesT>(
  inp: MakeEntryInput<AllPossibleScopesT>,
): ComponentRenderSpan<AllPossibleScopesT> => ({
  ...inp,
  startTime: ensureTimestamp(inp.startTime),
})

/**
 * The job of the beacon:
 * emit component-render-start, component-render, component-unmount entries
 */
export const generateUseBeacon =
  <AllPossibleScopesT extends { [K in keyof AllPossibleScopesT]: ScopeValue }>(
    traceManager: TraceManager<AllPossibleScopesT>,
  ): UseBeacon<AllPossibleScopesT> =>
  (
    config: BeaconConfig<
      GetScopeTFromTraceManager<TraceManager<AllPossibleScopesT>>
    >,
  ) => {
    const renderCountRef = useRef(0)
    renderCountRef.current += 1

    // For ease of use we accept `team` as a separate field in the config, but we need to merge it into the attributes
    const { attributes: _attributes, team, ...remainingConfig } = config
    const attributes = { ..._attributes, team }

    const status = config.error ? 'error' : 'ok'

    const isIdle =
      config.isIdle ??
      (config.renderedOutput === 'content' || config.renderedOutput === 'error')

    const renderStartTaskEntry: ComponentRenderSpan<AllPossibleScopesT> =
      makeEntry({
        ...remainingConfig,
        type: 'component-render-start',
        duration: 0,
        attributes,
        status,
        renderCount: renderCountRef.current,
        isIdle,
      })

    traceManager.processSpan(renderStartTaskEntry)

    const renderStartRef = useRef<Timestamp | undefined>()
    renderStartRef.current = renderStartTaskEntry.startTime

    // Beacon effect for tracking 'component-render'. This will fire after every render as it does not have any dependencies:
    useEffect(() => {
      traceManager.processSpan(
        makeEntry({
          ...remainingConfig,
          startTime: renderStartRef.current!,
          type: 'component-render',
          duration: performance.now() - renderStartRef.current!.now,
          status,
          attributes,
          renderCount: renderCountRef.current,
          isIdle,
        }),
      )
      renderStartRef.current = undefined
    })

    // Beacon effect for tracking 'component-unmount' entries
    useOnComponentUnmount(
      (errorBoundaryMetadata) => {
        const unmountEntry = makeEntry({
          ...remainingConfig,
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
