import type { Attributes } from './spanTypes'
import type { TraceManager } from './TraceManager'
import type { RelatedTo } from './types'

export type RenderedOutput = 'null' | 'loading' | 'content' | 'error'

export type BeaconConfig<RelationSchemasT, RequiredAttributesT = {}> = {
  name: string
  relatedTo: RelatedTo<RelationSchemasT>
  renderedOutput: RenderedOutput
  isIdle?: boolean
  error?: Error
} & (keyof RequiredAttributesT extends never
  ? { attributes?: Attributes }
  : { attributes: RequiredAttributesT & Attributes })

export type UseBeacon<ScopeT, RequiredAttributesT> = (
  beaconConfig: BeaconConfig<ScopeT, RequiredAttributesT>,
) => void

export type GetScopeTFromTraceManager<
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  TraceManagerT extends TraceManager<any>,
> = TraceManagerT extends TraceManager<infer ScopeT> ? ScopeT : never
