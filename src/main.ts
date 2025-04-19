/**
 * Copyright Zendesk, Inc.
 *
 * Use of this source code is governed under the Apache License, Version 2.0
 * found at http://www.apache.org/licenses/LICENSE-2.0.
 */

export { ActionLog } from './v1/ActionLog'
export type { ActionLogRef } from './v1/ActionLogCache'
export { ActionLogCache } from './v1/ActionLogCache'
export * from './v1/constants'
export type { Report } from './v1/generateReport'
export { generateReport } from './v1/generateReport'
export { generateTimingHooks } from './v1/generateTimingHooks'
export { getExternalApi } from './v1/getExternalApi'
export * from './v1/types'
export { useActionLog } from './v1/useActionLog'
export { useTiming } from './v1/useTiming'
export { useTimingMeasurement } from './v1/useTimingMeasurement'

// utils
export {
  ReactMeasureErrorBoundary,
  useOnErrorBoundaryDidCatch,
} from './ErrorBoundary'
export type { DebounceOptionsRef } from './v1/debounce'
export { debounce } from './v1/debounce'
export { performanceMark, performanceMeasure } from './v1/performanceMark'
export { switchFn } from './v1/switchFn'
export { getCurrentBrowserSupportForNonResponsiveStateDetection } from './v1/utilities'

// v3
export * from './v3/constants'
export * from './v3/convertToRum'
export * from './v3/defaultDeduplicationStrategy'
export * from './v3/ensureTimestamp'
export * from './v3/firstCPUIdle'
export * from './v3/getCommonUrlForTracing'
export * from './v3/getDynamicQuietWindowDuration'
export * from './v3/getSpanFromPerformanceEntry'
export * from './v3/hooks'
export type * from './v3/hooksTypes'
export * from './v3/Tracer'
// eslint-disable-next-line import/first, import/newline-after-import
import * as match from './v3/matchSpan'
export { match }
export * from './v3/ConsoleTraceLogger'
export type * from './v3/debugTypes'
export type {
  NameMatcher,
  SpanMatch,
  SpanMatchDefinition,
  SpanMatcherFn,
  SpanMatcherTags,
} from './v3/matchSpan'
export * from './v3/observePerformanceWithTraceManager'
export * from './v3/recordingComputeUtils'
export type * from './v3/spanAnnotationTypes'
export type * from './v3/spanTypes'
export * from './v3/TraceManager'
export * from './v3/TraceManagerDebuggerLazy'
export type * from './v3/traceRecordingTypes'
export type * from './v3/types'
export type * from './v3/typeUtils'
