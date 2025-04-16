/**
 * Copyright Zendesk, Inc.
 *
 * Use of this source code is governed under the Apache License, Version 2.0
 * found at http://www.apache.org/licenses/LICENSE-2.0.
 */

export { ActionLog } from './ActionLog'
export type { ActionLogRef } from './ActionLogCache'
export { ActionLogCache } from './ActionLogCache'
export * from './constants'
export type { Report } from './generateReport'
export { generateReport } from './generateReport'
export { generateTimingHooks } from './generateTimingHooks'
export { getExternalApi } from './getExternalApi'
export * from './types'
export { useActionLog } from './useActionLog'
export { useTiming } from './useTiming'
export { useTimingMeasurement } from './useTimingMeasurement'

// utils
export type { DebounceOptionsRef } from './debounce'
export { debounce } from './debounce'
export {
  ReactMeasureErrorBoundary,
  useOnErrorBoundaryDidCatch,
} from './ErrorBoundary'
export { performanceMark, performanceMeasure } from './performanceMark'
export { switchFn } from './switchFn'
export { getCurrentBrowserSupportForNonResponsiveStateDetection } from './utilities'

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
export * from './v3/TraceManagerDebugger'
export type * from './v3/traceRecordingTypes'
export type * from './v3/types'
export type * from './v3/typeUtils'
