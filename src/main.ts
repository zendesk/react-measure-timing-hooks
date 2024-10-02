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

// visualizer
export {
  getTimingDisplayModule,
  onActionAddedCallback,
  useVisualizer,
} from './lazyVisualizer'

// operation tracking (v2)
export * from './v2/constants'
export * from './v2/defaultEventProcessor'
export * from './v2/element'
export * from './v2/getCommonUrlForTracing'
export * from './v2/hooks'
export * from './v2/operation'
export type * from './v2/types'
