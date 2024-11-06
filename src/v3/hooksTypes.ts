import type { Attributes } from './spanTypes'
import type { TraceManager } from './traceManager'
import type { ScopeBase } from './types'

export type RenderedOutput = 'null' | 'loading' | 'content' | 'error'

export interface BeaconConfig<ScopeT extends ScopeBase> {
  name: string
  scope: ScopeT
  renderedOutput: RenderedOutput
  isIdle: boolean
  attributes: Attributes
  error?: Error
}

export type UseBeacon<ScopeT extends ScopeBase> = (
  beaconConfig: BeaconConfig<ScopeT>,
) => void

export type GetScopeTFromTraceManager<
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  TraceManagerT extends TraceManager<any>,
> = TraceManagerT extends TraceManager<infer ScopeT> ? ScopeT : never
