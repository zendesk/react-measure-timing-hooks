import {
  DEFAULT_DEBOUNCE_DURATION,
  DEFAULT_INTERACTIVE_TIMEOUT_DURATION,
} from './constants'
import type { SpanMatcherFn } from './matchSpan'
import { createTraceRecording } from './recordingComputeUtils'
import type { SpanAndAnnotation } from './spanAnnotationTypes'
import type { FinalTransition, OnEnterStatePayload } from './Trace'
import type { TraceRecording } from './traceRecordingTypes'
import type {
  DraftTraceContext,
  RelationSchemasBase,
  TraceContext,
} from './types'

// Helper to check if error is suppressed
export function isSuppressedError<RelationSchemasT>(
  trace: DraftTraceContext<keyof RelationSchemasT, RelationSchemasT, string>,
  spanAndAnnotation: SpanAndAnnotation<RelationSchemasT>,
) {
  return !!trace.definition.suppressErrorStatusPropagationOnSpans?.some((fn) =>
    fn(spanAndAnnotation, trace),
  )
}

// Helper to format ms
export function formatMs(ms?: number): string {
  if (ms == null) return 'n/a'
  if (ms < 1_000) return `${ms.toFixed(0)}ms`
  return `${(ms / 1_000).toFixed(2)}s`
}

// Helper to get config summary from traceContext or definition
export function getConfigSummary<
  SelectedRelationNameT extends keyof RelationSchemasT,
  RelationSchemasT extends RelationSchemasBase<RelationSchemasT>,
  VariantsT extends string,
>(
  traceContext: Pick<
    DraftTraceContext<SelectedRelationNameT, RelationSchemasT, VariantsT>,
    'definition' | 'input'
  >,
) {
  const def = traceContext.definition
  const variant = def.variants[traceContext.input.variant]
  const timeout = variant?.timeout
  const debounce =
    (def.debounceOnSpans ?? []).length > 0
      ? def.debounceWindow ?? DEFAULT_DEBOUNCE_DURATION
      : undefined
  const interactive =
    typeof def.captureInteractive === 'object'
      ? def.captureInteractive.timeout
      : def.captureInteractive
      ? DEFAULT_INTERACTIVE_TIMEOUT_DURATION
      : undefined
  return { timeout, debounce, interactive }
}

// Helper to get computed values/spans for completed/interrupted traces
export function getComputedResults<RelationSchemasT>(
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  traceContext: TraceContext<any, RelationSchemasT, any>,
  finalTransition: FinalTransition<RelationSchemasT>,
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
): Partial<TraceRecording<any, RelationSchemasT>> {
  try {
    const recording = createTraceRecording(traceContext, finalTransition)
    return recording
  } catch {
    return {}
  }
}

/**
 * Extract timing offsets from a transition object
 */
export const extractTimingOffsets = <RelationSchemasT>(
  transition: OnEnterStatePayload<RelationSchemasT>,
) => {
  let lastRequiredSpanOffset: number | undefined
  let completeSpanOffset: number | undefined
  let cpuIdleSpanOffset: number | undefined

  if (
    'lastRequiredSpanAndAnnotation' in transition &&
    transition.lastRequiredSpanAndAnnotation
  ) {
    lastRequiredSpanOffset =
      transition.lastRequiredSpanAndAnnotation.annotation
        .operationRelativeEndTime
  }

  if (
    'completeSpanAndAnnotation' in transition &&
    transition.completeSpanAndAnnotation
  ) {
    completeSpanOffset =
      transition.completeSpanAndAnnotation.annotation.operationRelativeEndTime
  }

  if (
    'cpuIdleSpanAndAnnotation' in transition &&
    transition.cpuIdleSpanAndAnnotation
  ) {
    cpuIdleSpanOffset =
      transition.cpuIdleSpanAndAnnotation.annotation.operationRelativeEndTime
  }

  return { lastRequiredSpanOffset, completeSpanOffset, cpuIdleSpanOffset }
}

/**
 * Formats a SpanMatcherFn into a more readable string representation.
 * This is a basic implementation and can be significantly improved
 * based on the actual structure of `matcher.fromDefinition`.
 *
 * @param matcher The matcher function to format.
 * @param index Optional index for generic naming.
 * @returns A string representation of the matcher.
 */
export function formatMatcher<
  SelectedRelationNameT extends keyof RelationSchemasT,
  RelationSchemasT extends RelationSchemasBase<RelationSchemasT>,
  VariantsT extends string,
>(
  matcher: SpanMatcherFn<SelectedRelationNameT, RelationSchemasT, VariantsT>,
  index?: number,
): string {
  // Check if the matcher has attached definition info
  if (matcher.fromDefinition) {
    // Attempt to create a more descriptive name from the definition
    // This part needs customization based on how 'fromDefinition' is structured.
    // Example: Check for specific properties like 'name', 'type', 'label' etc.
    const def = matcher.fromDefinition
    const parts: string[] = []

    if (typeof def === 'object' && def !== null) {
      // Example: Prioritize 'label' if it exists
      if ('label' in def && typeof def.label === 'string') {
        return `Label: "${def.label}"`
      }
      // Example: Use 'name' if it exists
      if ('name' in def) {
        if (typeof def.name === 'string') {
          parts.push(`Name: "${def.name}"`)
        } else if (def.name instanceof RegExp) {
          parts.push(`Name: /${def.name.source}/${def.name.flags}`)
        }
      }
      // Example: Add type if present
      if ('type' in def && typeof def.type === 'string') {
        parts.push(`Type: ${def.type}`)
      }
      // Add other relevant properties from your definition structure
    }

    if (parts.length > 0) {
      return parts.join(', ')
    }

    // Fallback: Stringify the definition (can be verbose)
    try {
      const defString = JSON.stringify(def)
      // Limit length to avoid overly long strings
      return defString.length > 100
        ? // eslint-disable-next-line no-magic-numbers
          `${defString.slice(0, 97)}...`
        : defString
    } catch {
      // Fallback if stringify fails
      return `Matcher Definition #${index ?? '?'}`
    }
  }

  // Fallback if no definition info is available
  return `Matcher #${index ?? '?'}`
}
