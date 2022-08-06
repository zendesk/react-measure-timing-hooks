/**
 * Copyright Zendesk, Inc.
 *
 * Use of this source code is governed under the Apache License, Version 2.0
 * found at http://www.apache.org/licenses/LICENSE-2.0.
 */

import type { DependencyList } from 'react'
import type { UseTimingHookConfiguration } from './types'
import { useActionLog } from './useActionLog'
import { useTimingMeasurement } from './useTimingMeasurement'

export const useTiming = <
  CustomMetadata extends Record<string, unknown> = never,
>(
  options: UseTimingHookConfiguration<CustomMetadata>,
  restartWhenChanged: DependencyList = [],
): void => {
  const actionLog = useActionLog<CustomMetadata>(options)

  if (options.metadata) {
    actionLog.customMetadataBySource.set(options.placement, options.metadata)
  }

  useTimingMeasurement({ ...options, actionLog }, restartWhenChanged)
}
