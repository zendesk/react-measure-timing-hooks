import type { Attributes } from './spanTypes'
import type { TraceManager } from './traceManager'
import type { ScopeOnASpan } from './types'

export type RenderedOutput = 'null' | 'loading' | 'content' | 'error'

export interface BeaconConfig<AllPossibleScopesT> {
  name: string
  scope: ScopeOnASpan<AllPossibleScopesT>
  renderedOutput: RenderedOutput
  team: string
  isIdle?: boolean
  attributes?: Attributes
  error?: Error
}

export type UseBeacon<ScopeT> = (beaconConfig: BeaconConfig<ScopeT>) => void

export type GetScopeTFromTraceManager<
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  TraceManagerT extends TraceManager<any>,
> = TraceManagerT extends TraceManager<infer ScopeT> ? ScopeT : never
