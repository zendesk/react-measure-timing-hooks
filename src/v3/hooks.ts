import { useEffect, useRef } from 'react'
import { useOnComponentUnmount } from '../ErrorBoundary'
import { ensureTimestamp } from './ensureTimestamp'
import type { BeaconConfig, UseBeacon } from './hooksTypes'
import type { ComponentRenderSpan } from './spanTypes'
import type { TraceManager } from './TraceManager'
import type { RelationSchemaValue, RelationsOnASpan, Timestamp } from './types'

type MakeEntryInput<RelationSchemasT> = Omit<
  ComponentRenderSpan<RelationSchemasT>,
  'startTime'
> & {
  startTime?: Timestamp
}

const makeEntry = <RelationSchemasT>(
  inp: MakeEntryInput<RelationSchemasT>,
): ComponentRenderSpan<RelationSchemasT> => ({
  ...inp,
  startTime: ensureTimestamp(inp.startTime),
})

/**
 * The job of the beacon:
 * emit component-render-start, component-render, component-unmount entries
 */
export const generateUseBeacon =
  <
    RelationSchemasT extends {
      [SchemaNameT in keyof RelationSchemasT]: {
        [K in keyof RelationSchemasT[SchemaNameT]]: RelationSchemaValue
      }
    },
    RequiredAttributesT = {},
  >(
    traceManager: TraceManager<RelationSchemasT>,
  ): UseBeacon<RelationSchemasT, RequiredAttributesT> =>
  (config: BeaconConfig<RelationSchemasT, RequiredAttributesT>) => {
    const renderCountRef = useRef(0)
    renderCountRef.current += 1

    const { attributes, renderedOutput } = config

    const status = config.error ? 'error' : 'ok'

    const isIdle =
      config.isIdle ??
      (renderedOutput === 'content' || renderedOutput === 'error')

    const relatedTo =
      config.relatedTo as unknown as RelationsOnASpan<RelationSchemasT>

    const renderStartTaskEntry = makeEntry<RelationSchemasT>({
      ...config,
      relatedTo,
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
        makeEntry<RelationSchemasT>({
          ...config,
          relatedTo,
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
        const unmountEntry = makeEntry<RelationSchemasT>({
          ...config,
          relatedTo,
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
