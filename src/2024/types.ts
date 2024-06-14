import type { AnyPerformanceEntry, PerformanceEntryType } from './globalTypes'

// excludes long_task, since it exists as longtask in the global types
export type RumKinds = 'action' | 'error' | 'resource' | 'vital' // | 'view' | "long_task"
export type SpanKind = TaskSpanKind | 'operation'
export type TaskSpanKind =
  | PerformanceEntryType
  | RumKinds
  | 'render'
  | 'asset'
  | 'iframe'
  | 'resource-ember'
export type PerformanceEntryLike = Omit<PerformanceEntry, 'toJSON'>

export interface SpanMetadata<Kind extends SpanKind> {
  kind: Kind
  metadata?: Record<string, unknown>

  /** auto-generated random UUID, Operation injects into Task metadata */
  operationId: string
  /** operation name used to aggregate the children */
  operationName: string
}

export interface TaskSpanMetadata extends SpanMetadata<TaskSpanKind> {
  internalOrder: number

  /** complete name that should be displayed when previewing the details of the span */
  name: string

  /** string used to aggregate data */
  commonName: string

  /** how many milliseconds after the operation started did this task start */
  operationStartOffset: number

  /** how many milliseconds since the operation started did this task end */
  operationRelativeEndTime: number

  /** if the common name was seen multiple times, which occurrence is this in order */
  occurrence: number
}

export interface OperationSpanMetadata extends SpanMetadata<'operation'> {
  /** measures captured while the operation was ongoing */
  tasks: TaskDataEmbeddedInOperation[]
  includedCommonTaskNames: string[]
}

export interface TaskDataEmbeddedInOperation
  extends Omit<TaskSpanMetadata, 'operationId' | 'operationName'> {
  duration: number
  detail?: Record<string, unknown>
}

export type Span<Metadata extends SpanMetadata<SpanKind>> =
  AnyPerformanceEntry & {
    // duration: number
    // entryType: string
    // name: string
    // startTime: number
    operations: Record<string, Metadata>
  }
/**
 * a Span representing the overall process:
 * starting with a user action event (ex. a click, hover etc.)
 * and ending once the the page settles into the expected user experience
 * (ex. loading the page),
 */
export type Operation = Span<OperationSpanMetadata>

/**
 * a Child Span representing the underlying process that is being tracked
 * e.g. a fetch, rendering a component, computing a value
 */
export type Task = Span<TaskSpanMetadata>
