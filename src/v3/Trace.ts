import type {
  CompleteTraceDefinition,
  EntryMatchCriteria,
  ScopeBase,
  TraceType,
} from './types'

export class Trace<ScopeT extends ScopeBase> {
  /**
   * The ID of the operation.
   */
  readonly id: string

  /**
   * The name of the operation.
   */
  readonly name: string

  readonly type: TraceType

  readonly duration: number

  // readonly scope: ScopeT

  computedSpans: any

  computedValues: any

  constructor(traceDefinition: CompleteTraceDefinition<ScopeT>) {
    this.id = Math.random().toString(36).slice(2)
    this.name = traceDefinition.name

    // this.scope = ?
    this.type = traceDefinition.type
    this.duration = 0

    this.computedSpans = {}
    this.computedValues = {}
  }
}
