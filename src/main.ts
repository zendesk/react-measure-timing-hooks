/**
 * Copyright Zendesk, Inc.
 *
 * Use of this source code is governed under the Apache License, Version 2.0
 * found at http://www.apache.org/licenses/LICENSE-2.0.
 */

export { ActionLog } from './actionLog'
export * from './constants'
export type { Report, ReportFn } from './generateReport'
export { generateReport } from './generateReport'
export { generateTimingHooks } from './generateTimingHooks'
export * from './types'
export { getExternalApi, useActionLogRef } from './useActionLogRef'
export { useTiming } from './useTiming'
export { useTimingMeasurement } from './useTimingMeasurement'

// utils
export type { DebounceOptionsRef } from './debounce'
export { debounce } from './debounce'
export { ErrorBoundary, useOnErrorBoundaryDidCatch } from './ErrorBoundary'
export { performanceMark, performanceMeasure } from './performanceMark'
export { switchFn } from './switchFn'
export { getCurrentBrowserSupportForNonResponsiveStateDetection } from './utilities'
