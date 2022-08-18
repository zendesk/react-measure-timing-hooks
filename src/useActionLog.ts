/**
 * Copyright Zendesk, Inc.
 *
 * Use of this source code is governed under the Apache License, Version 2.0
 * found at http://www.apache.org/licenses/LICENSE-2.0.
 */

import { useMemo } from 'react'
import type { ActionLog } from './ActionLog'
import type { UseActionLogOptions } from './types'

export const useActionLog = <
  CustomMetadata extends Record<string, unknown> = Record<string, unknown>,
>({
  id,
  actionLogCache,
  garbageCollectMs,
  ...actionLogOptions
}: UseActionLogOptions<CustomMetadata>): ActionLog<CustomMetadata> => {
  // reuse ActionLog of the same ID:
  const getCurrentActionLog = useMemo(
    () => actionLogCache.makeGetOrCreateFn(id),
    // we do not want to change the instance when the ID or options change,
    // rather, we do the opposite - we update the cache to also reflect the new ID below
    // hence this eslint rule is silenced on purpose
    [],
  )

  const currentActionLog = getCurrentActionLog(id)
  currentActionLog.updateStaticOptions(actionLogOptions)

  return currentActionLog
}
